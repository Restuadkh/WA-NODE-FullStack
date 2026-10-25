const EventEmitter = require("events");
const QRCode = require("qrcode");
const pino = require("pino");
const {
  default: makeWASocket,
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} = require("@whiskeysockets/baileys");
const config = require("../../config/config");
const logger = require("../services/logger");
const { loadAuthState, removeAuthState } = require("./authStore");
const { phoneFromJid } = require("./jid");

// Log internal Baileys sangat berisik; tampilkan warn ke atas saja.
const baileysLogger = pino({ level: process.env.BAILEYS_LOG_LEVEL || "silent" });

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

// Versi WhatsApp diambil sekali lalu dipakai bersama SEMUA instance. Sebelumnya setiap sesi
// memanggil fetchLatestBaileysVersion() sendiri; saat banyak sesi dipulihkan/terhubung ulang,
// permintaan yang menumpuk membuat proses lambat dan reconnect sesi lain ikut tertunda.
let versionCache = { at: 0, version: null };
let versionPromise = null;
const VERSION_TTL_MS = 6 * 60 * 60 * 1000;

async function resolveVersion() {
  if (versionCache.version && Date.now() - versionCache.at < VERSION_TTL_MS) {
    return versionCache.version;
  }
  // Satu permintaan versi untuk semua sesi yang start bersamaan.
  versionPromise ??= Promise.race([
    fetchLatestBaileysVersion(),
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
  ])
    .then((latest) => {
      versionCache = { at: Date.now(), version: latest.version };
      return latest.version;
    })
    .finally(() => {
      versionPromise = null;
    });
  return versionPromise;
}

/**
 * Satu koneksi WhatsApp (Baileys).
 *
 * Event:
 *   "status"         ({ status, phone })      pending_qr | connected | disconnected | logged_out
 *   "message"        (waMessage)              pesan baru (type "notify")
 *   "message.update" (updates[])              perubahan status pesan (delivered/read)
 */
class WhatsAppInstance extends EventEmitter {
  constructor({ key, phoneNumber }) {
    super();
    this.key = key;
    this.phoneNumber = phoneNumber ? String(phoneNumber).replace(/\D/g, "") : undefined;

    this.sock = null;
    this.authState = null;
    this.status = "disconnected";
    this.phone = null;
    this.qr = null; // data URL PNG
    this.pairingCode = null;

    this.stopped = false;
    this.starting = null;
    this.generation = 0; // mencegah timer/generation lama menutup socket yang baru
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.pairingRequested = false;
    this.groupNames = new Map();
  }

  get online() {
    return this.status === "connected" && !!this.sock;
  }

  // ---------------------------------------------------------------- lifecycle

  start() {
    this.stopped = false;
    if (!config.whatsapp.enabled) return Promise.resolve(this);

    // Jangan membuat socket ganda untuk satu instance. Pemanggilan berulang (polling QR,
    // reconnect, restore) memakai proses yang sedang berjalan / socket yang sudah ada.
    if (this.starting) return this.starting;
    if (this.sock) return Promise.resolve(this);

    const generation = ++this.generation;
    this.starting = this._connect(generation)
      .catch((err) => {
        if (this.stopped || generation !== this.generation) return;
        logger.error({ err, key: this.key }, "Gagal memulai instance");
        this._closeSocket();
        this._setStatus("disconnected");
        // Kegagalan saat membuka socket (bukan logout) tetap dijadwalkan ulang.
        this._scheduleReconnect(undefined, generation);
      })
      .finally(() => {
        if (generation === this.generation) this.starting = null;
      })
      .then(() => this);
    return this.starting;
  }

  // Hentikan tanpa logout (dipakai saat server shutdown). Sesi tetap tersimpan.
  async stop() {
    this.stopped = true;
    this.generation++;
    this.starting = null;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this._closeSocket();
  }

  // Logout dari WhatsApp dan hapus kredensial
  async logout() {
    this.stopped = true;
    this.generation++;
    this.starting = null;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const sock = this.sock;
    if (sock) {
      try {
        await sock.logout();
      } catch (err) {
        logger.warn({ err: err.message, key: this.key }, "Logout WhatsApp gagal, sesi lokal tetap dihapus");
      }
      this._closeSocket();
    }
    await removeAuthState(this.key);
    this._setStatus("logged_out");
  }

  async _connect(generation) {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;

    const { state, saveCreds } = await loadAuthState(this.key);
    this.authState = state;

    const options = {
      auth: state,
      // Pairing code hanya diterima WhatsApp untuk profil browser yang dikenal, jadi dikunci
      // ke Chrome/Ubuntu (variabel CLIENT_* lama sudah dihapus karena tidak pernah dipakai).
      browser: Browsers.ubuntu("Chrome"),
      logger: baileysLogger,
      printQRInTerminal: false,
      defaultQueryTimeoutMs: 60_000,
      markOnlineOnConnect: false,
      syncFullHistory: false,
    };
    try {
      options.version = await resolveVersion();
    } catch (err) {
      logger.warn({ err: err.message }, "Tidak bisa mengambil versi WA terbaru, memakai versi bawaan Baileys");
    }

    // stop()/logout() dipanggil selama menunggu auth/versi
    if (this.stopped || generation !== this.generation) return;

    this.pairingRequested = false;
    const sock = makeWASocket(options);
    this.sock = sock;

    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", (update) => {
      this._onConnection(sock, update).catch((err) =>
        logger.error({ err, key: this.key }, "Error saat memproses connection.update"),
      );
    });
    sock.ev.on("messages.upsert", ({ type, messages }) => {
      if (type !== "notify") return; // pesan kita sendiri disimpan langsung oleh messageService
      if (config.whatsapp.markMessagesRead) this._markRead(messages); // Tandai pesan sebagai dibaca jika diatur dalam konfigurasi
      for (const msg of messages) this.emit("message", msg); // Emit event untuk setiap pesan baru
    });
    sock.ev.on("messages.update", (updates) => this.emit("message.update", updates));

    if (!state.creds.registered) this._setStatus("pending_qr");
  }

  async _onConnection(sock, { connection, lastDisconnect, qr }) {
    if (sock !== this.sock) return; // event dari socket lama

    if (qr && !this.authState.creds.registered) await this._onQr(sock, qr);

    if (connection === "open") {
      this.reconnectAttempts = 0;
      this.qr = null;
      this.pairingCode = null;
      this.phone = phoneFromJid(sock.user?.id);
      this._setStatus("connected");
    } else if (connection === "close") {
      await this._onClose(lastDisconnect?.error);
    }
  }

  async _onQr(sock, qr) {
    if (this.phoneNumber) {
      // Mode pairing code (tanpa scan QR). WhatsApp mengirim event QR berulang (~20 detik);
      // kode hanya diminta SEKALI per socket supaya tidak berganti saat pengguna mengetik
      // dan tidak memicu rate limit.
      if (this.pairingRequested) return;
      this.pairingRequested = true;
      try {
        this.pairingCode = await sock.requestPairingCode(this.phoneNumber);
        logger.info({ key: this.key }, "Pairing code dibuat");
      } catch (err) {
        logger.warn({ err: err.message, key: this.key }, "Pairing code gagal, beralih ke QR");
        this.phoneNumber = undefined;
      }
      if (this.pairingCode) return this._setStatus("pending_qr");
    }
    this.qr = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
    this._setStatus("pending_qr");
  }

  async _onClose(error) {
    const code = error?.output?.statusCode;
    this._closeSocket();
    this.qr = null;
    this.pairingCode = null;

    if (this.stopped) return;

    if (code === DisconnectReason.loggedOut) {
      await removeAuthState(this.key);
      this.reconnectAttempts = 0;
      this._setStatus("logged_out");
      return;
    }

    this._setStatus("disconnected");

    // Sesi yang sama dibuka di tempat lain: jangan berebut dan memutus sesi lain terus-menerus.
    // Pengguna harus logout/tautkan ulang secara sadar.
    if (code === DisconnectReason.connectionReplaced) {
      logger.warn({ key: this.key }, "Sesi digantikan koneksi WhatsApp lain; reconnect otomatis dihentikan");
      return;
    }

    // QR kedaluwarsa / pairing batal: tunggu aksi pengguna (belum terdaftar).
    const registered = !!this.authState?.creds?.registered;
    if (!registered) return;

    // Setelah scan QR, WhatsApp meminta koneksi diulang (normal)
    if (code === DisconnectReason.restartRequired) {
      this._scheduleReconnect(0);
      return;
    }

    this._scheduleReconnect();
  }

  /**
   * Jadwalkan reconnect untuk instance INI saja. Timer terpisah per instance, sehingga
   * reconnect satu sesi tidak pernah menyentuh socket sesi lain.
   * `generation` mencegah timer lama (mis. setelah stop/logout) menghidupkan socket baru.
   */
  _scheduleReconnect(delayMs, generation = this.generation) {
    if (this.stopped) return;

    const { reconnectBaseDelayMs, reconnectMaxDelayMs, reconnectMaxAttempts } = config.whatsapp;
    this.reconnectAttempts += 1;

    if (reconnectMaxAttempts > 0 && this.reconnectAttempts > reconnectMaxAttempts) {
      logger.error(
        { key: this.key, attempts: this.reconnectAttempts },
        "Batas percobaan reconnect tercapai, instance berhenti mencoba",
      );
      return;
    }

    const exponential = Math.min(
      reconnectMaxDelayMs,
      reconnectBaseDelayMs * 2 ** Math.min(this.reconnectAttempts - 1, 10),
    );
    // Jitter kecil mencegah semua sesi reconnect pada milidetik yang sama.
    const delay =
      delayMs === 0 ? 0 : delayMs != null ? delayMs : Math.round(exponential * (0.85 + Math.random() * 0.3));

    clearTimeout(this.reconnectTimer);
    logger.info(
      { key: this.key, delayMs: delay, attempt: this.reconnectAttempts },
      "Menjadwalkan koneksi ulang",
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.stopped || generation !== this.generation || this.sock) return;
      this.start();
    }, delay);
  }

  _closeSocket() {
    const sock = this.sock;
    this.sock = null;
    if (!sock) return;
    try {
      sock.ev.removeAllListeners();
      sock.end(undefined);
    } catch {
      /* socket sudah tertutup */
    }
  }

  _setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.emit("status", { status, phone: this.phone });
  }

  _markRead(messages) {
    const keys = messages.filter((m) => !m.key.fromMe && m.key.id).map((m) => m.key);
    if (keys.length) this.sock?.readMessages(keys).catch(() => {});
  }

  // ---------------------------------------------------------------- media

  // Unduh media dari pesan masuk (gambar, video, stiker, audio, dokumen).
  async downloadMedia(msg) {
    const sock = this._ensureOnline();
    return downloadMediaMessage(msg, "buffer", {}, {
      logger: baileysLogger,
      reuploadRequest: sock.updateMediaMessage.bind(sock),
    });
  }

  // ---------------------------------------------------------------- sending

  _ensureOnline() {
    if (!this.online) throw httpError("Device belum terhubung ke WhatsApp", 409);
    return this.sock;
  }

  async isOnWhatsApp(jid) {
    const [result] = (await this._ensureOnline().onWhatsApp(jid)) || [];
    return !!result?.exists;
  }

  sendText(jid, text) {
    return this._ensureOnline().sendMessage(jid, { text });
  }

  /**
   * Kirim media. `type`: image | video | audio | sticker | document.
   * Opsi: { ptt (audio voice note), seconds, width, height, gifPlayback }
   */
  sendMedia(jid, { buffer, mimetype, filename, seconds, width, height }, type, caption = "", opts = {}) {
    const content = {};
    if (type === "sticker") {
      content.sticker = buffer;
    } else if (type === "audio") {
      content.audio = buffer;
      content.mimetype = mimetype || "audio/ogg; codecs=opus";
      content.ptt = opts.ptt ?? true;
      if (seconds) content.seconds = Number(seconds);
    } else if (type === "document") {
      content.document = buffer;
      content.mimetype = mimetype || "application/octet-stream";
      content.fileName = filename || "file";
      if (caption) content.caption = caption;
    } else {
      // image / video
      content[type] = buffer;
      content.mimetype = mimetype || (type === "image" ? "image/jpeg" : "video/mp4");
      if (caption) content.caption = caption;
      if (filename) content.fileName = filename;
      if (type === "video") {
        if (seconds) content.seconds = Number(seconds);
        if (opts.gifPlayback) content.gifPlayback = true;
      }
      if (width) content.width = Number(width);
      if (height) content.height = Number(height);
    }
    return this._ensureOnline().sendMessage(jid, content);
  }

  // Nama grup (di-cache) untuk ditampilkan di inbox
  async groupName(jid) {
    if (this.groupNames.has(jid)) return this.groupNames.get(jid);
    try {
      const meta = await this._ensureOnline().groupMetadata(jid);
      this.groupNames.set(jid, meta.subject);
      return meta.subject;
    } catch {
      return null;
    }
  }

  info() {
    return {
      key: this.key,
      status: this.status,
      phone: this.phone,
      has_qr: !!this.qr,
      has_pairing_code: !!this.pairingCode,
    };
  }
}

module.exports = { WhatsAppInstance };
