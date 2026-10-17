// npm run seed:admin -- email@contoh.com "password-kuat" "Nama"
// Tanpa password, akan dibuat password acak dan ditampilkan sekali.
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const sequelize = require("../config/database");
const { User } = require("../api/models");

(async () => {
  const email = String(process.argv[2] || "admin@example.com").trim().toLowerCase();
  const generated = !process.argv[3];
  const password = process.argv[3] || crypto.randomBytes(9).toString("base64url");
  const name = process.argv[4] || "Admin";

  try {
    await sequelize.authenticate();
    await sequelize.sync();
    const [user, created] = await User.findOrCreate({
      where: { email },
      defaults: { name, password: await bcrypt.hash(password, 10), role: "admin" },
    });
    if (created) {
      console.log(`Admin dibuat: ${user.email}`);
      if (generated) console.log(`Password: ${password}  (simpan, tidak ditampilkan lagi)`);
    } else {
      console.log(`User ${email} sudah ada, tidak diubah.`);
    }
    process.exit(0);
  } catch (err) {
    console.error("Gagal membuat admin:", err.message);
    process.exit(1);
  }
})();
