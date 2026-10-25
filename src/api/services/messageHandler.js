const { Message, Chat } = require("../models");
const logger = require("./logger");
const { emitToDevice } = require("./realtime");
const { notify } = require("./webhook");
const autoReply = require("./autoReply");
const mediaStore = require("./mediaStore");
const config = require("../../config/config");
const { parseContent, parseMedia, waTimestamp, findOrCreateChat, storeMessage } = require("./messageService");
const { getWhatsappJid, getWhatsappLid, getWhatsappName, storeNumberName } = require("./numberService");

const IGNORED_JID = (jid) =>
  !jid || jid === "status@broadcast" || jid.endsWith("@broadcast") || jid.endsWith("@newsletter");

// Unduh media dari WhatsApp lalu simpan ke disk. Kegagalan unduh tidak menggagalkan pesan:
// riwayat tetap tersimpan dengan label teks (mis. "[Gambar]") agar agent tahu ada media.
async function saveIncomingMedia(device, instance, msg, media) {
  if (!media) return null;
  if (media.fileLength && media.fileLength > config.media.maxIncomingBytes) {
    logger.warn(
      { device: device.id, size: media.fileLength, limit: config.media.maxIncomingBytes },
      "Media masuk melebihi batas, tidak diunduh",
    );
    return null;
  }

  try {
    const buffer = await instance.downloadMedia(msg);
    if (!buffer?.length) return null;
    const saved = await mediaStore.save({
      deviceId: device.id,
      messageId: msg.key?.id,
      buffer,
      mimetype: media.mimetype,
      filename: media.filename,
      type: media.kind,
    });
    return {
      ...saved,
      width: media.width,
      height: media.height,
      seconds: media.seconds,
      ptt: media.ptt,
      caption: media.caption,
    };
  } catch (err) {
    logger.warn({ err: err.message, device: device.id, type: media.kind }, "Gagal mengunduh media masuk");
    return null;
  }
}

// Pesan masuk dari WhatsApp (termasuk yang Anda kirim dari ponsel) -> DB -> dashboard
async function handleIncoming(device, instance, msg) {
  const jid = msg?.key?.remoteJid;
  if (IGNORED_JID(jid) || !msg.message) return;

  const parsed = parseContent(msg.message);
  if (!parsed) return;

  // Pemetaan nomor <-> LID + nama kontak. Kegagalan di sini tidak boleh menghentikan penyimpanan pesan.
  try {
    const key = msg.message?.key ?? msg.key;
    await storeNumberName(getWhatsappJid(key), getWhatsappLid(key), getWhatsappName(msg), device);
  } catch (err) {
    logger.warn({ err: err.message, device: device.id }, "Gagal menyimpan nama kontak");
  }

  const fromMe = !!msg.key.fromMe;
  const isGroup = jid.endsWith("@g.us");

  const chat = await findOrCreateChat(device, jid);

  // Lengkapi nama kontak / grup
  if (!fromMe && !isGroup && msg.pushName && chat.contact_name !== msg.pushName) {
    await chat.update({ contact_name: msg.pushName });
  } else if (isGroup && !chat.contact_name) {
    const groupName = await instance.groupName(jid);
    if (groupName) await chat.update({ contact_name: groupName });
  }

  const media = await saveIncomingMedia(device, instance, msg, parseMedia(msg.message));

  const { created } = await storeMessage({
    device,
    chat,
    direction: fromMe ? "outgoing" : "incoming",
    type: parsed.type,
    body: parsed.body,
    media,
    waMessageId: msg.key.id,
    status: fromMe ? "sent" : "delivered",
    at: waTimestamp(msg.messageTimestamp),
  });
  if (!created) return;

  notify("messages", device, {
    id: msg.key.id,
    jid,
    from_me: fromMe,
    push_name: msg.pushName || null,
    type: parsed.type,
    body: parsed.body,
    media_url: media?.url || null,
    media_mimetype: media?.mimetype || null,
    media_filename: media?.filename || null,
    media_ptt: !!media?.ptt,
    timestamp: Number(msg.messageTimestamp) || null,
  });

  if (!fromMe) await autoReply.reply({ device, instance, chat, text: parsed.type === "text" ? parsed.body : "" });
}

// Status pesan keluar: sent -> delivered -> read
const STATUS_BY_CODE = { 0: "failed", 1: "pending", 2: "sent", 3: "delivered", 4: "read", 5: "read" };
const RANK = { failed: 0, pending: 1, sent: 2, delivered: 3, read: 4 };

async function handleStatusUpdates(device, updates) {
  for (const { key, update } of updates) {
    const status = STATUS_BY_CODE[update?.status];
    if (!status || !key?.fromMe || !key.id) continue;

    const message = await Message.findOne({
      where: { wa_message_id: key.id, direction: "outgoing" },
      include: [{ model: Chat, where: { device_id: device.id }, attributes: ["id"] }],
    });
    if (!message || RANK[status] <= RANK[message.status]) continue;

    await message.update({ status });
    emitToDevice(device.id, "message:update", {
      chat_id: message.chat_id,
      message_id: message.id,
      status,
    });
  }
}

const safe = (fn) =>
  (...args) =>
    fn(...args).catch((err) => logger.error({ err }, "Gagal memproses event WhatsApp"));

module.exports = {
  handleIncoming: safe(handleIncoming),
  handleStatusUpdates: safe(handleStatusUpdates),
};
