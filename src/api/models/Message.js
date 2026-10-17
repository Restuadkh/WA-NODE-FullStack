const { DataTypes } = require("sequelize");
const sequelize = require("../../config/database");
const { orderedUuid } = require("./orderedId");

const Message = sequelize.define("Message", {
  // ID berurutan waktu: tiebreaker urutan pesan yang masuk dalam detik yang sama
  id: { type: DataTypes.UUID, defaultValue: orderedUuid, primaryKey: true },
  chat_id: { type: DataTypes.UUID, allowNull: false },
  wa_message_id: { type: DataTypes.STRING, allowNull: true }, // id dari Baileys, untuk dedupe & status
  direction: { type: DataTypes.ENUM("incoming", "outgoing"), allowNull: false },
  type: {
    type: DataTypes.ENUM("text", "image", "document", "audio", "video", "other"),
    defaultValue: "text",
  },
  body: { type: DataTypes.TEXT, allowNull: true },
  media_url: { type: DataTypes.STRING, allowNull: true },
  status: {
    type: DataTypes.ENUM("pending", "sent", "delivered", "read", "failed"),
    defaultValue: "pending",
  },
  sent_by_user_id: { type: DataTypes.UUID, allowNull: true }, // null = auto-reply / kontak / API
  is_auto_reply: { type: DataTypes.BOOLEAN, defaultValue: false },
});

module.exports = Message;
