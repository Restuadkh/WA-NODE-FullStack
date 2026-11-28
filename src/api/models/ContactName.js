const { DataTypes } = require("sequelize");
const sequelize = require("../../config/database");
const { orderedUuid } = require("./orderedId");

// Kontak WhatsApp per device: dipetakan dari JID nomor (@s.whatsapp.net) dan/atau LID (@lid).
// Nama tabel ("numbers") dan kolom lama dipertahankan agar DB lama tetap kompatibel.
// createdAt/updatedAt disediakan otomatis oleh Sequelize (timestamps default).
// Unique index (device_id, lid_user) dipasang oleh services/dbIndexes.js; dedupe nomor/LID
// juga dijaga di numberService untuk menghindari baris ganda.
const ContactName = sequelize.define(
  "ContactName",
  {
    id: { type: DataTypes.UUID, defaultValue: orderedUuid, primaryKey: true },
    from_jid: { type: DataTypes.STRING, allowNull: true }, // 62812345567@s.whatsapp.net
    lid_user: { type: DataTypes.STRING, allowNull: true }, // 2454645745634534@lid
    device_id: { type: DataTypes.UUID, allowNull: false },
    notify: { type: DataTypes.STRING, allowNull: true }, // nama kontak / notify dari WhatsApp
  },
  { tableName: "numbers" },
);

module.exports = ContactName;
