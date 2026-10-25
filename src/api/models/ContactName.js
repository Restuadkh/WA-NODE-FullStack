const { DataTypes } = require("sequelize");
const sequelize = require("../../config/database");
const { orderedUuid } = require("./orderedId");

// Nama kontak per device (pushName) yang dipetakan dari JID nomor ke LID WhatsApp.
// Sebelumnya bernama model "Number" (menimpa global `Number`) dan tanpa unique index sehingga
// baris bertambah tanpa batas. Nama tabel ("numbers") dan kolom TIDAK berubah, jadi DB lama
// tetap kompatibel. Unique index (device_id, lid_user) dipasang oleh services/dbIndexes.js
// (otomatis saat start bila bisa; untuk DB lama yang berisi duplikat: npm run db:upgrade).
const ContactName = sequelize.define(
  "ContactName",
  {
    id: { type: DataTypes.UUID, defaultValue: orderedUuid, primaryKey: true },
    from_jid: { type: DataTypes.STRING, allowNull: true }, // 62812345567@s.whatsapp.net
    lid_user: { type: DataTypes.STRING, allowNull: true }, // 2454645745634534@lid
    device_id: { type: DataTypes.UUID, allowNull: false },
    notify: { type: DataTypes.STRING, allowNull: true }, // nama kontak (pushName)
  },
  { tableName: "numbers" },
);

module.exports = ContactName;
