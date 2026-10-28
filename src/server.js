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
const { ensureMediaSchema, ensureDeviceWebhookSchema, ensureJobClaimColumns } = require("./api/services/dbSchema");
const manager = require("./api/whatsapp/manager");
const queueService = require("./api/services/queueService");

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
    // Kolom webhook per device (v2.3).
    await ensureDeviceWebhookSchema({
      tolerant: true,
      log: (m) => logger.debug(m),
      warn: (m) => logger.warn(m),
    });
    // Kolom klaim antrean (v2.5).
    await ensureJobClaimColumns({
      tolerant: true,
      log: (m) => logger.debug(m),
      warn: (m) => logger.warn(m),
    });
    // Pasang index v2.1 bila bisa. Pada DB lama yang berisi duplikat ini hanya memberi peringatan
    // (server tetap jalan); rapikan dengan: npm run db:upgrade
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

  // Worker antrean berjalan di proses yang sama (wajib single process, sama seperti instance WA).
  await queueService.start();

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
    await queueService.stop();
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
