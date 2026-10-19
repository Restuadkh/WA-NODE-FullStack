const { DataTypes } = require("sequelize");
const sequelize = require("../../config/database");
const { orderedUuid } = require("./orderedId");

const Number = sequelize.define("Number", {
  // ID berurutan waktu: tiebreaker urutan pesan yang masuk dalam detik yang sama
  id: { type: DataTypes.UUID, defaultValue: orderedUuid, primaryKey: true },
  fromJid: { type: DataTypes.STRING, allowNull: true }, // 62812345567@s.whatsapp.net
  lidUser: { type: DataTypes.STRING, allowNull: true }, // 2454645745634534
  device_id: { type: DataTypes.UUID, allowNull: false }, // ID perangkat yang terkait dengan nomor ini
  notify: { type: DataTypes.STRING, allowNull: true }, // Nama kontak dari buku alamat pengguna
});

module.exports = Number;
