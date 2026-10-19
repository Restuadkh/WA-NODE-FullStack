const http = require("http");
const crypto = require("crypto");
const config = require("./config/config");
const logger = require("./api/services/logger");

// if (!config.jwt.secret || config.jwt.secret.length < 16) {
//   config.jwt.secret = crypto.randomBytes(48).toString("hex");
//   logger.warn("JWT_SECRET belum valid; secret acak dibuat otomatis untuk sesi ini.");
// }

const sequelize = require("./config/database");
require("./api/models");
const app = require("./app");
const { initRealtime } = require("./api/services/realtime");
const manager = require("./api/whatsapp/manager");

async function main() {
  await sequelize.authenticate();
  logger.info("Database terhubung");
  // Hanya membuat tabel yang belum ada; tidak mengubah/menghapus data
  if (config.db.autoSync) await sequelize.sync();

  const server = http.createServer(app);
  initRealtime(server); // socket.io harus dipasang di server yang sama dengan yang listen

  await new Promise((resolve) => server.listen(config.port, resolve));
  logger.info(`Server berjalan di port ${config.port}`);

  if (config.whatsapp.restoreOnStartup) {
    manager
      .restoreAll()
      .catch((err) => logger.error({ err }, "Gagal memulihkan sesi WhatsApp"));
  }

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    logger.info(`${signal} diterima, menutup server...`);
    server.close();
    await manager.stopAll();
    await sequelize.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

process.on("unhandledRejection", (err) => logger.error({ err }, "Unhandled promise rejection"));
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception");
  process.exit(1); // PM2 akan menjalankan ulang
});

main().catch((err) => {
  logger.fatal({ err }, "Server gagal start");
  process.exit(1);
});
