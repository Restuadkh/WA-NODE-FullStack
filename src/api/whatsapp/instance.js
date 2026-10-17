const EventEmitter = require("events");
const QRCode = require("qrcode");
const pino = require("pino");
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const config = require("../../config/config");
const logger = require("../services/logger");
const { loadAuthState, removeAuthState } = require("./authStore");
const { phoneFromJid } = require("./jid");

const MAX_RECONNECT_ATTEMPTS = 10;

// Log internal Baileys sangat berisik; tampilkan warn ke atas saja.
const baileysLogger = pino({ level: process.env.BAILEYS_LOG_LEVEL || "warn" });

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

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
    this.retries = 0;
    this.reconnectTimer = null;
    this.pairingRequested = false;
    this.groupNames = new Map();
  }

  get online() {
    return this.status === "connected" && !!this.sock;
  }

  // ---------------------------------------------------------------- lifecycle

  start() {
    this.stopped = false;
    if (!config.whatsapp.enabled || this.sock) return Promise.resolve(this);
    this.starting ??= this._connect()
      .catch((err) => {
        logger.error({ err, key: this.key }, "Gagal memulai instance");
        this._setStatus("disconnected");
      })
      .finally(() => {
        this.starting = null;
      })
      .then(() => this);
    return this.starting;
  }

  // Hentikan tanpa logout (dipakai saat server shutdown). Sesi tetap tersimpan.
  async stop() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    this._closeSocket();
  }

  // Logout dari WhatsApp dan hapus kredensial
  async logout() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
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

  async _connect() {
    clearTimeout(this.reconnectTimer);
    const { state, saveCreds } = await loadAuthState(this.key);
    this.authState = state;

    const options = {
      auth: state,
      browser: config.whatsapp.browser,
      logger: baileysLogger,
      printQRInTerminal: false,
      defaultQueryTimeoutMs: 60_000,
      markOnlineOnConnect: false,
      syncFullHistory: false,
    };
    try {
      const latest = await Promise.race([
        fetchLatestBaileysVersion(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
      ]);
      options.version = latest.version;
    } catch (err) {
      logger.warn({ err: err.message }, "Tidak bisa mengambil versi WA terbaru, memakai versi bawaan Baileys");
    }

    if (this.stopped) return; // stop() dipanggil saat menunggu

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
      if (config.whatsapp.markMessagesRead) this._markRead(messages);
      for (const msg of messages) this.emit("message", msg);
    });
    sock.ev.on("messages.update", (updates) => this.emit("message.update", updates));

    if (!state.creds.registered) this._setStatus("pending_qr");
  }

  async _onConnection(sock, { connection, lastDisconnect, qr }) {
    if (sock !== this.sock) return; // event dari socket lama

    if (qr && !this.authState.creds.registered) await this._onQr(sock, qr);

    if (connection === "open") {
      this.retries = 0;
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
      // Mode pairing code (tanpa scan QR)
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
      this._setStatus("logged_out");
      return;
    }
    // Setelah scan QR, WhatsApp meminta koneksi diulang (normal)
    if (code === DisconnectReason.restartRequired) {
      this._scheduleReconnect(0);
      return;
    }
    this._setStatus("disconnected");

    // QR kedaluwarsa / pairing batal / sesi dipakai di tempat lain: tunggu aksi pengguna
    const registered = !!this.authState?.creds?.registered;
    if (!registered || code === DisconnectReason.connectionReplaced) return;

    if (++this.retries > MAX_RECONNECT_ATTEMPTS) {
      logger.error({ key: this.key, code }, "Gagal tersambung berulang kali, berhenti mencoba");
      return;
    }
    this._scheduleReconnect(Math.min(30_000, 1000 * 2 ** this.retries));
  }

  _scheduleReconnect(delayMs) {
    clearTimeout(this.reconnectTimer);
    logger.info({ key: this.key, delayMs }, "Menjadwalkan koneksi ulang");
    this.reconnectTimer = setTimeout(() => this.start(), delayMs);
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

  sendMedia(jid, { buffer, mimetype, filename }, type, caption = "") {
    const content = { [type]: buffer, mimetype, fileName: filename };
    if (type === "image" || type === "video") content.caption = caption;
    if (type === "audio") content.ptt = true;
    return this._ensureOnline().sendMessage(jid, content);
  }

  sendMediaUrl(jid, url, type, mimetype, caption = "") {
    const content = { [type]: { url }, mimetype };
    if (type === "image" || type === "video") content.caption = caption;
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
