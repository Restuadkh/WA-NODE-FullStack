const { DataTypes } = require("sequelize");
const sequelize = require("../../config/database");
const { orderedUuid } = require("./orderedId");

// Index tambahan (unik chat_id+wa_message_id, dan chat_id+created_at) dipasang oleh
// services/dbIndexes.js — sengaja tidak di sini agar sync() tidak membuat server gagal start
// pada DB lama yang masih berisi duplikat.
const Message = sequelize.define(
  "Message",
  {
    // ID berurutan waktu: tiebreaker urutan pesan yang masuk dalam detik yang sama
    id: { type: DataTypes.UUID, defaultValue: orderedUuid, primaryKey: true },
    chat_id: { type: DataTypes.UUID, allowNull: false },
    wa_message_id: { type: DataTypes.STRING, allowNull: true }, // id dari Baileys, untuk dedupe & status
    direction: { type: DataTypes.ENUM("incoming", "outgoing"), allowNull: false },
    type: {
      type: DataTypes.ENUM("text", "image", "document", "audio", "video", "sticker", "other"),
      defaultValue: "text",
    },
    body: { type: DataTypes.TEXT, allowNull: true },

    // Media (disimpan sebagai file di MEDIA_DIR, DB hanya menyimpan metadata + URL bertanda tangan)
    media_url: { type: DataTypes.STRING, allowNull: true },
    media_mimetype: { type: DataTypes.STRING(120), allowNull: true },
    media_filename: { type: DataTypes.STRING(255), allowNull: true },
    media_size: { type: DataTypes.INTEGER, allowNull: true },
    media_width: { type: DataTypes.INTEGER, allowNull: true },
    media_height: { type: DataTypes.INTEGER, allowNull: true },
    media_seconds: { type: DataTypes.INTEGER, allowNull: true },
    media_ptt: { type: DataTypes.BOOLEAN, defaultValue: false }, // true = voice note
    media_caption: { type: DataTypes.TEXT, allowNull: true },

    status: {
      type: DataTypes.ENUM("pending", "sent", "delivered", "read", "failed"),
      defaultValue: "pending",
    },

    // Reply (membalas pesan tertentu): id & potongan teks pesan yang dibalas
    reply_to_wa_id: { type: DataTypes.STRING, allowNull: true },
    reply_to_body: { type: DataTypes.TEXT, allowNull: true },
    reply_to_from_me: { type: DataTypes.BOOLEAN, defaultValue: false },
    sent_by_user_id: { type: DataTypes.UUID, allowNull: true }, // null = auto-reply / kontak / API
    is_auto_reply: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
);

module.exports = Message;
