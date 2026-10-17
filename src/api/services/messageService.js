const { Chat, Message } = require("../models");
const { emitToDevice } = require("./realtime");
const { toJid, isPhoneNumber } = require("../whatsapp/jid");

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const waTimestamp = (ts) => {
  const n = Number(ts);
  return n > 0 ? new Date(n * 1000) : new Date();
};

const PREVIEW = {
  image: "[Gambar]",
  video: "[Video]",
  audio: "[Audio]",
  document: "[Dokumen]",
};

// Ambil jenis & isi teks dari pesan Baileys. Return null untuk pesan sistem (diabaikan).
function parseContent(rawMessage) {
  const { normalizeMessageContent } = require("@whiskeysockets/baileys");
  const content = normalizeMessageContent(rawMessage);
  if (!content) return null;

  if (content.conversation) return { type: "text", body: content.conversation };
  if (content.extendedTextMessage) return { type: "text", body: content.extendedTextMessage.text || "" };

  const media = [
    ["imageMessage", "image"],
    ["videoMessage", "video"],
    ["audioMessage", "audio"],
    ["documentMessage", "document"],
  ];
  for (const [field, type] of media) {
    const m = content[field];
    if (m) {
      const label = type === "document" && m.fileName ? `[Dokumen] ${m.fileName}` : PREVIEW[type];
      return { type, body: m.caption ? `${label} ${m.caption}` : label };
    }
  }
  if (content.stickerMessage) return { type: "other", body: "[Stiker]" };
  if (content.contactMessage || content.contactsArrayMessage) return { type: "other", body: "[Kontak]" };
  if (content.locationMessage || content.liveLocationMessage) return { type: "other", body: "[Lokasi]" };
  return null; // reaction, protocol, poll update, dll.
}

async function findOrCreateChat(device, jid, defaults = {}) {
  const [chat] = await Chat.findOrCreate({
    where: { device_id: device.id, wa_jid: jid },
    defaults: { is_group: jid.endsWith("@g.us"), ...defaults },
  });
  return chat;
}

// Simpan pesan ke DB, perbarui chat, dan siarkan ke dashboard.
async function storeMessage({ device, chat, direction, type, body, waMessageId, status, userId, isAutoReply, at }) {
  if (waMessageId) {
    const exists = await Message.findOne({ where: { chat_id: chat.id, wa_message_id: waMessageId } });
    if (exists) return { message: exists, created: false };
  }

  const message = await Message.create({
    chat_id: chat.id,
    wa_message_id: waMessageId || null,
    direction,
    type,
    body,
    status,
    sent_by_user_id: userId || null,
    is_auto_reply: !!isAutoReply,
    ...(at ? { createdAt: at } : {}),
  });

  const patch = { last_message_at: at || new Date() };
  if (direction === "incoming") patch.unread_count = (chat.unread_count || 0) + 1;
  await chat.update(patch);

  emitToDevice(device.id, "message:new", { chat_id: chat.id, message });
  return { message, created: true };
}

/**
 * Kirim pesan lewat instance lalu simpan ke inbox.
 *   to       : nomor atau jid
 *   send     : (instance, jid) => Promise<waResult>   (mis. instance.sendText)
 *   preview  : { type, body }  yang disimpan di riwayat
 */
async function sendAndStore({ device, instance, to, send, preview, userId, isAutoReply }) {
  const jid = toJid(to);

  if (isPhoneNumber(to) && !(await instance.isOnWhatsApp(jid))) {
    throw httpError("Nomor tidak terdaftar di WhatsApp", 422);
  }

  const result = await send(instance, jid);
  const chat = await findOrCreateChat(device, jid);
  const { message } = await storeMessage({
    device,
    chat,
    direction: "outgoing",
    type: preview.type,
    body: preview.body,
    waMessageId: result?.key?.id,
    status: "sent",
    userId,
    isAutoReply,
  });
  return { result, chat, message };
}

module.exports = { parseContent, waTimestamp, findOrCreateChat, storeMessage, sendAndStore };
