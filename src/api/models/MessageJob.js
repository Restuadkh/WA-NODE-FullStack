const { DataTypes } = require("sequelize");
const sequelize = require("../../config/database");
const { orderedUuid } = require("./orderedId");

// Antrean pesan keluar (outbox) yang dikirim oleh worker dengan jeda acak dan kuota
// per device. Semua status hidup di database sehingga aman saat server restart.
const MessageJob = sequelize.define(
  "MessageJob",
  {
    id: { type: DataTypes.UUID, defaultValue: orderedUuid, primaryKey: true },
    device_id: { type: DataTypes.UUID, allowNull: false },
    to_jid: { type: DataTypes.STRING, allowNull: false },
    type: {
      type: DataTypes.ENUM("text", "image", "video", "audio", "sticker", "document"),
      defaultValue: "text",
    },
    // text: { text } | media: { caption, ptt, media: { disk_name, mimetype, filename, type } }
    payload: { type: DataTypes.JSON, allowNull: false },
    status: {
      type: DataTypes.ENUM("pending", "sending", "sent", "failed", "cancelled"),
      defaultValue: "pending",
    },
    priority: { type: DataTypes.INTEGER, defaultValue: 0 }, // makin besar makin didahulukan
    scheduled_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    max_attempts: { type: DataTypes.INTEGER, defaultValue: 3 },
    next_attempt_at: { type: DataTypes.DATE, allowNull: true },
    last_error: { type: DataTypes.TEXT, allowNull: true },
    client_ref: { type: DataTypes.STRING(160), allowNull: true }, // idempotency dari pengirim
    source: { type: DataTypes.STRING(30), defaultValue: "api" },
    created_by_user_id: { type: DataTypes.UUID, allowNull: true },
    message_id: { type: DataTypes.UUID, allowNull: true }, // Message hasil pengiriman
    sent_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    indexes: [
      { fields: ["device_id", "status", "scheduled_at"] },
      { fields: ["status", "next_attempt_at"] },
      { unique: true, fields: ["device_id", "client_ref"], name: "message_jobs_device_ref_unique" },
    ],
  },
);

module.exports = MessageJob;
