const { DataTypes } = require("sequelize");
const sequelize = require("../../config/database");

// Satu row = satu nomor WhatsApp (satu instance Baileys).
const Device = sequelize.define("Device", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false }, // label bebas, mis. "CS Fokus.Net"
  instance_key: { type: DataTypes.STRING, allowNull: false, unique: true },
  phone_number: { type: DataTypes.STRING, allowNull: true }, // diisi otomatis setelah terhubung
  status: {
    type: DataTypes.ENUM("pending_qr", "connected", "disconnected", "logged_out"),
    defaultValue: "pending_qr",
  },
  last_connected_at: { type: DataTypes.DATE, allowNull: true },
});

module.exports = Device;
