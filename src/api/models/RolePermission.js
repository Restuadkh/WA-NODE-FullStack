const { DataTypes } = require("sequelize");
const sequelize = require("../../config/database");

// Matriks izin per role (1 baris per role).
// View channel, QR & status device selalu boleh untuk semua user dashboard
// (scope device tetap dibatasi oleh penugasan di device_agents).
// super_admin SELALU punya semua izin — barisnya tidak dipakai dan tidak bisa diedit.
const RolePermission = sequelize.define("RolePermission", {
  // super_admin (1) > admin (2) > agent (3). Role dengan level kecil boleh mengatur level di bawahnya.
  role: { type: DataTypes.ENUM("super_admin", "admin", "agent"), primaryKey: true },
  // Menambah device baru. Admin/agent yang membuat device otomatis "memiliki" device itu (device_agents).
  devices_add: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  // Mengubah nama/webhook device yang ditugaskan kepadanya.
  devices_edit: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  devices_delete: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  // Redial paksa (putuskan lalu start ulang) device yang ditugaskan.
  devices_redial: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  // Buat / ubah / hapus rule auto-reply pada device yang ditugaskan.
  rules_manage: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  // Batalkan (DELETE /api/jobs/:id) atau retry (POST /api/jobs/:id/retry) job antrean.
  jobs_manage: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
});

module.exports = RolePermission;
