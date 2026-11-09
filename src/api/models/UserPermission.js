const { DataTypes } = require("sequelize");
const sequelize = require("../../config/database");

// Izin KHUSUS per user (override): menimpa rule role pada tabel RolePermissions.
// Nilai `null` = tidak ada override (mengikuti role). Sama seperti hierarki:
// 1 super_admin > admin > agent, tapi kini bisa dipertajam per akun.
const UserPermission = sequelize.define("UserPermission", {
  user_id: { type: DataTypes.UUID, primaryKey: true },
  devices_add: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: null },
  devices_edit: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: null },
  devices_delete: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: null },
  devices_redial: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: null },
  rules_manage: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: null },
  jobs_manage: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: null },
});

module.exports = UserPermission;
