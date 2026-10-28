const { DataTypes } = require("sequelize");
const sequelize = require("../../config/database");

// Tabel relasi agent <-> device. Admin punya akses ke semua device tanpa baris di sini;
// agent hanya bisa melihat device yang ditugaskan kepadanya (ACL).
const DeviceAgent = sequelize.define(
  "DeviceAgent",
  {
    device_id: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
  },
  { updatedAt: false, indexes: [{ fields: ["user_id"] }] },
);

module.exports = DeviceAgent;
