// npm run db:sync          -> buat tabel yang belum ada (aman)
// npm run db:reset         -> HAPUS semua tabel lalu buat ulang (data hilang!)
const sequelize = require("../config/database");
require("../api/models");

(async () => {
  const force = process.argv.includes("--force");
  try {
    await sequelize.authenticate();
    if (force) console.warn("PERINGATAN: --force menghapus semua tabel aplikasi.");
    await sequelize.sync({ force });
    console.log(force ? "Database di-reset." : "Sinkronisasi tabel selesai.");
    process.exit(0);
  } catch (err) {
    console.error("Gagal sinkronisasi database:", err.message);
    process.exit(1);
  }
})();
