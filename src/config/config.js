require("dotenv").config({ quiet: true });
const path = require("path");

const bool = (value, fallback = false) =>
  value === undefined || value === "" ? fallback : String(value).toLowerCase() === "true";

const int = (value, fallback) => {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const list = (value, fallback = []) =>
  value ? String(value).split(",").map((s) => s.trim()).filter(Boolean) : fallback;

const env = process.env.NODE_ENV || "development";

// Kompatibel dengan konfigurasi lama: MYSQL_ENABLED=true berarti kredensial WA disimpan di MySQL.
const authStore =
  process.env.AUTH_STORE || (bool(process.env.MYSQL_ENABLED) ? "mysql" : "file");

module.exports = {
  env,
  isProduction: env === "production",
  port: Number(process.env.PORT) || 3000,
  logLevel: process.env.LOG_LEVEL || "info",
  corsOrigin: list(process.env.CORS_ORIGIN).length ? list(process.env.CORS_ORIGIN) : "*",
  trustProxy: process.env.TRUST_PROXY || "loopback",

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || "8h",
  },

  db: {
    dialect: process.env.DB_DIALECT || "mysql", // "sqlite" hanya untuk development/test
    storage: process.env.DB_STORAGE || ":memory:",
    host: process.env.MYSQL_HOST || "localhost",
    port: Number(process.env.MYSQL_PORT) || 3306,
    name: process.env.MYSQL_DATABASE || "whatsapp_api",
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    autoSync: bool(process.env.DB_AUTO_SYNC, true),
  },

  whatsapp: {
    // false = jalankan API/dashboard tanpa membuka koneksi WhatsApp (development / test)
    enabled: bool(process.env.WHATSAPP_ENABLED, true),
    authStore, // "file" | "mysql"
    authDir: process.env.AUTH_DIR || path.join(__dirname, "../auth"),
    restoreOnStartup: bool(process.env.RESTORE_SESSIONS_ON_START_UP, true),
    markMessagesRead: bool(process.env.MARK_MESSAGES_READ),
    defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE ?? "62",
    // Penjadwalan koneksi ulang per instance. 0 = percobaan tanpa batas.
    reconnectBaseDelayMs: int(process.env.WA_RECONNECT_BASE_MS, 1000),
    reconnectMaxDelayMs: int(process.env.WA_RECONNECT_MAX_MS, 5 * 60 * 1000),
    reconnectMaxAttempts: int(process.env.WA_RECONNECT_MAX_ATTEMPTS, 0),
    // Sesi start dari endpoint QR / tombol Tautkan: retry otomatis dibatasi N percobaan
    // (0 = perilaku lama, tanpa batas). Setelah N gagal, berhenti sampai dicoba lagi.
    qrStartMaxAttempts: int(process.env.DEVICE_QR_START_ATTEMPTS, 3),
  },

  gatewayApi: {
    protect: bool(process.env.PROTECT_ROUTES),
    token: process.env.TOKEN || "",
    // true = key juga boleh lewat ?key= (lama). false = wajib header X-Api-Key.
    allowQueryKey: bool(process.env.GATEWAY_ALLOW_QUERY_KEY, true),
    // Batas request per menit per IP untuk /api/message/* (0 = tanpa batas)
    rateLimitPerMinute: int(process.env.GATEWAY_RATE_LIMIT_PER_MINUTE, 120),
  },

  // Unduhan media dari URL (endpoint /api/message/mediaurl)
  media: {
    maxBytes: int(process.env.MEDIA_URL_MAX_MB, 25) * 1024 * 1024,
    timeoutMs: int(process.env.MEDIA_URL_TIMEOUT_MS, 15000),
    // Kosong = semua host publik boleh. Isi bila ingin membatasi (host persis atau subdomain).
    allowedHosts: list(process.env.MEDIA_URL_ALLOWED_HOSTS),
    // Penyimpanan media masuk/keluar (gambar, video, stiker, audio, dokumen)
    dir: process.env.MEDIA_DIR || path.join(__dirname, "../media"),
    // Batas ukuran media yang diunduh dari pesan masuk WhatsApp
    maxIncomingBytes: int(process.env.MEDIA_MAX_MB, 25) * 1024 * 1024,
    // Rahasia tanda tangan URL media. Default memakai JWT_SECRET.
    tokenSecret: process.env.MEDIA_TOKEN_SECRET || process.env.JWT_SECRET || "",
    // Masa berlaku URL media (jam). URL diperbarui otomatis setiap kali inbox dibuka.
    urlExpiryMs: int(process.env.MEDIA_URL_EXPIRY_HOURS, 168) * 60 * 60 * 1000,
  },

  autoReply: {
    // Batas balasan otomatis per device per menit (0 = tanpa batas). Mengurangi risiko nomor diblokir.
    maxPerMinute: int(process.env.AUTOREPLY_MAX_PER_MINUTE, 20),
  },

  // Antrean pesan keluar (outbox) untuk pengiriman massal yang lebih aman.
  // Semua batas dihitung per device. 0 = tanpa batas.
  queue: {
    enabled: bool(process.env.QUEUE_ENABLED, true),
    pollMs: int(process.env.QUEUE_POLL_MS, 1000),
    // Jeda acak antar pesan dari antrean (ms).
    minDelayMs: int(process.env.QUEUE_MIN_DELAY_MS, 8000),
    maxDelayMs: int(process.env.QUEUE_MAX_DELAY_MS, 25000),
    // Kuota rolling 1 jam / 24 jam. Menghitung SEMUA pesan keluar device,
    // termasuk balasan manual dan auto-reply.
    hourlyLimit: int(process.env.QUEUE_HOURLY_LIMIT, 60),
    dailyLimit: int(process.env.QUEUE_DAILY_LIMIT, 200),
    maxAttempts: int(process.env.QUEUE_MAX_ATTEMPTS, 3),
    retryBaseMs: int(process.env.QUEUE_RETRY_BASE_MS, 30000),
    retryMaxMs: int(process.env.QUEUE_RETRY_MAX_MS, 15 * 60 * 1000),
    batchMax: int(process.env.QUEUE_BATCH_MAX, 100),
    // Jam kirim lokal, mis. "8-21". Kosong / "0-24" = sepanjang hari.
    activeHours: String(process.env.QUEUE_ACTIVE_HOURS ?? "").trim(),
    timezone: process.env.QUEUE_TIMEZONE || "Asia/Jakarta",
    // Simulasi "sedang mengetik" sebelum kirim (menambah jeda, lebih natural).
    typing: bool(process.env.QUEUE_TYPING, false),
    typingMaxMs: int(process.env.QUEUE_TYPING_MAX_MS, 4000),
  },

  webhook: {
    url: process.env.WEBHOOK_URL || "",
    events: list(process.env.WEBHOOK_ALLOWED_EVENTS, ["all"]),
    // Bila diisi, body webhook ditandatangani HMAC-SHA256 (header X-Signature: sha256=<hex>)
    secret: process.env.WEBHOOK_SECRET || "",
    // true = sertakan instance_key di payload (perilaku lama, TIDAK disarankan)
    includeKey: bool(process.env.WEBHOOK_INCLUDE_KEY),
    // Batas waktu request webhook (ms). Integrasi harus membalas 2xx secepat mungkin.
    timeoutMs: int(process.env.WEBHOOK_TIMEOUT_MS, 5000),
  },
};
