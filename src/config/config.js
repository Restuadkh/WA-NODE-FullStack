require("dotenv").config();
const path = require("path");

const bool = (value, fallback = false) =>
  value === undefined || value === "" ? fallback : String(value).toLowerCase() === "true";

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
    browser: [
      process.env.CLIENT_PLATFORM || "Whatsapp MD",
      process.env.CLIENT_BROWSER || "Chrome",
      process.env.CLIENT_VERSION || "4.0.0",
    ],
    markMessagesRead: bool(process.env.MARK_MESSAGES_READ),
    defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE ?? "62",
  },

  gatewayApi: {
    protect: bool(process.env.PROTECT_ROUTES),
    token: process.env.TOKEN || "",
  },

  webhook: {
    url: process.env.WEBHOOK_URL || "",
    events: list(process.env.WEBHOOK_ALLOWED_EVENTS, ["all"]),
  },
};
