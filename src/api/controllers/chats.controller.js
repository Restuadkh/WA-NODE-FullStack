const { Op } = require("sequelize");
const { Chat, Message, Device } = require("../models");
const manager = require("../whatsapp/manager");
const { sendAndStore } = require("../services/messageService");

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const MAX_TEXT = 4096;

async function listChats(req, res) {
  const chats = await Chat.findAll({
    where: { device_id: req.params.deviceId },
    order: [["last_message_at", "DESC"]],
    limit: 500,
  });
  res.json({ error: false, data: chats });
}

// Pesan terbaru (urut lama -> baru). ?limit=200 (maks 500), ?before=<ISO date> untuk halaman sebelumnya.
async function listMessages(req, res) {
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
  const where = { chat_id: req.params.chatId };
  if (req.query.before) {
    const before = new Date(String(req.query.before));
    if (!Number.isNaN(before.getTime())) where.createdAt = { [Op.lt]: before };
  }
  const rows = await Message.findAll({
    where,
    order: [
      ["createdAt", "DESC"],
      ["id", "DESC"],
    ],
    limit,
  });
  res.json({ error: false, data: rows.reverse() });
}

async function sendMessage(req, res) {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) throw httpError("Isi pesan wajib diisi", 400);
  if (text.length > MAX_TEXT) throw httpError(`Pesan maksimal ${MAX_TEXT} karakter`, 400);

  const chat = await Chat.findByPk(req.params.chatId, { include: Device });
  if (!chat) throw httpError("Chat tidak ditemukan", 404);

  const instance = manager.get(chat.Device.instance_key);
  if (!instance?.online) throw httpError("Device belum terhubung ke WhatsApp", 409);

  const { message } = await sendAndStore({
    device: chat.Device,
    instance,
    to: chat.wa_jid,
    send: (inst, jid) => inst.sendText(jid, text),
    preview: { type: "text", body: text },
    userId: req.user.id,
  });
  res.status(201).json({ error: false, data: message });
}

async function markRead(req, res) {
  const chat = await Chat.findByPk(req.params.chatId);
  if (!chat) throw httpError("Chat tidak ditemukan", 404);
  if (chat.unread_count) await chat.update({ unread_count: 0 });
  res.json({ error: false, data: chat });
}

module.exports = { listChats, listMessages, sendMessage, markRead };
