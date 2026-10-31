const { Chat, Message } = require("../models");
const { emitToDevice } = require("./realtime");
const logger = require("./logger");
const mediaStore = require("./mediaStore");
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
  sticker: "[Stiker]",
};

const MEDIA_LABEL = (type, content) => {
  if (type === "document" && content?.fileName) return `[Dokumen] ${content.fileName}`;
  if (type === "audio" && content?.ptt) return "[Pesan suara]";
  return PREVIEW[type];
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
    ["stickerMessage", "sticker"],
  ];
  for (const [field, type] of media) {
    const m = content[field];
    if (m) {
      const label = MEDIA_LABEL(type, m);
      return { type, body: m.caption ? `${label} ${m.caption}` : label };
    }
  }
  if (content.contactMessage || content.contactsArrayMessage) return { type: "other", body: "[Kontak]" };
  if (content.locationMessage || content.liveLocationMessage) return { type: "other", body: "[Lokasi]" };
  return null; // reaction, protocol, poll update, dll.
}

// Metadata media (termasuk caption/durasi/dimensi) untuk pesan masuk.
// Null bila pesan bukan media.
function parseMedia(rawMessage) {
  const { normalizeMessageContent } = require("@whiskeysockets/baileys");
  const content = normalizeMessageContent(rawMessage);
  if (!content) return null;

  const common = (type, contentField, extra = {}) => ({
    kind: type,
    mimetype: contentField?.mimetype || null,
    filename: contentField?.fileName || null,
    caption: contentField?.caption || null,
    fileLength: Number(contentField?.fileLength) || null,
    ...extra,
  });

  if (content.imageMessage) {
    return common("image", content.imageMessage, {
      width: content.imageMessage.width || null,
      height: content.imageMessage.height || null,
    });
  }
  if (content.videoMessage) {
    return common("video", content.videoMessage, {
      width: content.videoMessage.width || null,
      height: content.videoMessage.height || null,
      seconds: content.videoMessage.seconds || null,
      gifPlayback: !!content.videoMessage.gifPlayback,
    });
  }
  if (content.audioMessage) {
    return common("audio", content.audioMessage, {
      ptt: !!content.audioMessage.ptt,
      seconds: content.audioMessage.seconds || null,
    });
  }
  if (content.stickerMessage) {
    return common("sticker", content.stickerMessage, {
      mimetype: content.stickerMessage.mimetype || "image/webp",
      width: content.stickerMessage.width || null,
      height: content.stickerMessage.height || null,
      animated: !!content.stickerMessage.isAnimated,
    });
  }
  if (content.documentMessage) {
    return common("document", content.documentMessage);
  }
  return null;
}


async function findOrCreateChat(device, jid, defaults = {}) {
  const [chat] = await Chat.findOrCreate({
    where: { device_id: device.id, wa_jid: jid },
    defaults: { is_group: jid.endsWith("@g.us"), ...defaults },
  });
  return chat;
}

// Simpan pesan ke DB, perbarui chat, dan siarkan ke dashboard.
async function storeMessage({
  device,
  chat,
  direction,
  type,
  body,
  media,
  waMessageId,
  status,
  userId,
  isAutoReply,
  at,
  replyTo,
}) {
  if (waMessageId) {
    const exists = await Message.findOne({ where: { chat_id: chat.id, wa_message_id: waMessageId } });
    if (exists) return { message: exists, created: false };
  }

  const mediaPatch = media
    ? {
        media_url: media.url || null,
        media_mimetype: media.mimetype || null,
        media_filename: media.filename || null,
        media_size: media.size || null,
        media_width: media.width || null,
        media_height: media.height || null,
        media_seconds: media.seconds || null,
        media_ptt: !!media.ptt,
        media_caption: media.caption || null,
      }
    : {};

  const replyPatch = replyTo
    ? {
        reply_to_wa_id: replyTo.waId || null,
        reply_to_body: replyTo.body || "",
        reply_to_from_me: !!replyTo.fromMe,
      }
    : {};

  let message;
  try {
    message = await Message.create({
      chat_id: chat.id,
      wa_message_id: waMessageId || null,
      direction,
      type,
      body,
      ...mediaPatch,
      ...replyPatch,
      status,
      sent_by_user_id: userId || null,
      is_auto_reply: !!isAutoReply,
      ...(at ? { createdAt: at } : {}),
    });
  } catch (err) {
    // Event yang sama diproses dua kali bersamaan: unique index menolak yang kedua
    if (waMessageId && err.name === "SequelizeUniqueConstraintError") {
      const existing = await Message.findOne({ where: { chat_id: chat.id, wa_message_id: waMessageId } });
      if (existing) return { message: existing, created: false };
    }
    throw err;
  }

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
 *   attachment: { buffer, mimetype, filename, width, height, seconds, ptt, caption }
 *              media yang ikut dikirim; disalin ke MEDIA_DIR setelah berhasil terkirim
 *
 * Bila pesan SUDAH terkirim ke WhatsApp tetapi gagal disimpan, kegagalan dicatat di log dan
 * { storageFailed: true, message: null } dikembalikan — pesan tidak dianggap gagal terkirim,
 * sehingga klien tidak mengirim ulang (pesan ganda ke pelanggan).
 */
async function sendAndStore({ device, instance, to, send, preview, attachment, userId, isAutoReply, replyTo }) {
  const jid = toJid(to);

  if (isPhoneNumber(to) && !(await instance.isOnWhatsApp(jid))) {
    throw httpError("Nomor tidak terdaftar di WhatsApp", 422);
  }

  const result = await send(instance, jid);

  let media = preview?.media || null;
  if (attachment?.buffer?.length) {
    try {
      const saved = await mediaStore.save({
        deviceId: device.id,
        messageId: result?.key?.id,
        buffer: attachment.buffer,
        mimetype: attachment.mimetype,
        filename: attachment.filename,
        type: attachment.type || preview?.type,
      });
      media = {
        ...saved,
        width: attachment.width || null,
        height: attachment.height || null,
        seconds: attachment.seconds || null,
        ptt: !!attachment.ptt,
        caption: attachment.caption || null,
      };
    } catch (err) {
      logger.error({ err, device: device.id, jid }, "Gagal menyimpan file media ke disk");
    }
  }

  try {
    const chat = await findOrCreateChat(device, jid);
    const { message } = await storeMessage({
      device,
      chat,
      direction: "outgoing",
      type: preview.type,
      body: preview.body,
      media,
      waMessageId: result?.key?.id,
      status: "sent",
      userId,
      isAutoReply,
      replyTo,
    });
    return { result, chat, message, storageFailed: false };
  } catch (err) {
    logger.error(
      { err, device: device.id, jid, wa_message_id: result?.key?.id },
      "Pesan terkirim ke WhatsApp tetapi gagal disimpan ke riwayat",
    );
    return { result, chat: null, message: null, storageFailed: true };
  }
}

module.exports = { parseContent, parseMedia, waTimestamp, findOrCreateChat, storeMessage, sendAndStore, PREVIEW };
