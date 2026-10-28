// Upgrade database LAMA ke skema v2.4 (aman dijalankan berulang):
//   npm run db:upgrade                 -> lengkapi kolom media/webhook, buat tabel antrean, hapus duplikat, pasang index
//   npm run db:upgrade -- --dry-run    -> hanya menampilkan perubahan yang akan dilakukan
//
// SANGAT disarankan backup database dulu (mysqldump), karena script ini MENGHAPUS baris duplikat:
//   message_jobs: tabel antrean pesan keluar dibuat bila belum ada
//   messages  : kolom media_* ditambahkan + ENUM type mendapat "sticker"
//   devices   : kolom webhook_url + webhook_secret (webhook per device)
//   numbers   : unik (device_id, lid_user)      -> baris TERBARU dipertahankan
//   messages  : unik (chat_id, wa_message_id)   -> baris TERLAMA dipertahankan
//   messages  : index biasa (chat_id, created_at) untuk riwayat chat
// Definisi index ada di src/api/services/dbIndexes.js, kolom media di src/api/services/dbSchema.js.
const sequelize = require("../config/database");
require("../api/models");
const { ensureIndexes } = require("../api/services/dbIndexes");
const { ensureMediaSchema, ensureDeviceWebhookSchema, ensureJobClaimColumns } = require("../api/services/dbSchema");

async function run({ dryRun = false, log = console.log } = {}) {
  await sequelize.authenticate();
  if (!dryRun) await sequelize.sync(); // buat tabel yang belum ada (tidak mengubah yang sudah ada)
  await ensureMediaSchema({ dryRun, log });
  await ensureDeviceWebhookSchema({ dryRun, log });
  await ensureJobClaimColumns({ dryRun, log });
  await ensureIndexes({ dedupe: true, dryRun, log });
  log(dryRun ? "Dry-run selesai (tidak ada perubahan)." : "Upgrade database selesai.");
}

module.exports = { run };

if (require.main === module) {
  run({ dryRun: process.argv.includes("--dry-run") })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Upgrade database gagal:", err.message);
      process.exit(1);
    });
}
