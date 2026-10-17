const { DataTypes } = require("sequelize");
const sequelize = require("../../config/database");

const Chat = sequelize.define(
  "Chat",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    device_id: { type: DataTypes.UUID, allowNull: false },
    wa_jid: { type: DataTypes.STRING, allowNull: false }, // 6281234567890@s.whatsapp.net
    contact_name: { type: DataTypes.STRING, allowNull: true },
    is_group: { type: DataTypes.BOOLEAN, defaultValue: false },
    last_message_at: { type: DataTypes.DATE, allowNull: true },
    unread_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  {
    indexes: [{ unique: true, fields: ["device_id", "wa_jid"] }],
  },
);

module.exports = Chat;
