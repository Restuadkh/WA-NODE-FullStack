const http = require("http");
const config = require("./config/config");
const { validateConfig } = require("./config/validate");
const logger = require("./api/services/logger");

// Konfigurasi tidak valid (mis. JWT_SECRET kosong/pendek) = jangan start sama sekali.
const { errors, warnings } = validateConfig(config);
warnings.forEach((w) => logger.warn(w));
if (errors.length) {
  errors.forEach((e) => logger.fatal(e));
  process.exit(1);
}

const sequelize = require("./config/database");
require("./api/models");
const app = require("./app");
const { initRealtime } = require("./api/services/realtime");
const { ensureIndexes } = require("./api/services/dbIndexes");
const { ensureMediaSchema, ensureDeviceWebhookSchema } = require("./api/services/dbSchema");
const manager = require("./api/whatsapp/manager");

async function main() {
  logger.info(`Mode ${config.env}`);
  await sequelize.authenticate();
  logger.info("Database terhubung");
  // Hanya membuat tabel yang belum ada; tidak mengubah/menghapus data.
  if (config.db.autoSync) {
    await sequelize.sync();
    // Patch kolom media + ENUM sticker pada tabel `messages` lama (tidak menghapus data).
    await ensureMediaSchema({
      tolerant: true,
      log: (m) => logger.debug(m),
      warn: (m) => logger.warn(m),
    });
    // Kolom webhook per device.
    await ensureDeviceWebhookSchema({
      tolerant: true,
      log: (m) => logger.debug(m),
      warn: (m) => logger.warn(m),
    });
    await ensureIndexes({
      tolerant: true,
      log: (m) => logger.debug(m),
      warn: (m) => logger.warn(m),
    });
  }

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
  // Log detail (stack + cause) lalu TETAP HIDUP — sebelumnya process.exit(1) membuat
  // PM2 merestart service dan sesi WhatsApp terputus setiap ada error liar.
  logger.fatal({ err, stack: err?.stack, cause: err?.cause?.message }, "Uncaught exception (proses tetap berjalan)");
  // Tulis juga ke stderr sebagai cadangan bila logger bermasalah.
  console.error("UNCAUGHT EXCEPTION:", err?.stack || err);
});

main().catch((err) => {
  logger.fatal({ err }, "Server gagal start");
  process.exit(1);
});
