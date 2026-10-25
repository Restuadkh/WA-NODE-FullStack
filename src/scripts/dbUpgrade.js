// Upgrade database LAMA ke skema v2.2 (aman dijalankan berulang):
//   npm run db:upgrade                 -> lengkapi kolom media, hapus baris duplikat, pasang index
//   npm run db:upgrade -- --dry-run    -> hanya menampilkan perubahan yang akan dilakukan
//
// SANGAT disarankan backup database dulu (mysqldump), karena script ini MENGHAPUS baris duplikat:
//   messages  : kolom media_* ditambahkan + ENUM type mendapat "sticker"
//   numbers   : unik (device_id, lid_user)      -> baris TERBARU dipertahankan
//   messages  : unik (chat_id, wa_message_id)   -> baris TERLAMA dipertahankan
//   messages  : index biasa (chat_id, created_at) untuk riwayat chat
// Definisi index ada di src/api/services/dbIndexes.js, kolom media di src/api/services/dbSchema.js.
const sequelize = require("../config/database");
require("../api/models");
const { ensureIndexes } = require("../api/services/dbIndexes");
const { ensureMediaSchema } = require("../api/services/dbSchema");

async function run({ dryRun = false, log = console.log } = {}) {
  await sequelize.authenticate();
  if (!dryRun) await sequelize.sync(); // buat tabel yang belum ada (tidak mengubah yang sudah ada)
  await ensureMediaSchema({ dryRun, log });
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
