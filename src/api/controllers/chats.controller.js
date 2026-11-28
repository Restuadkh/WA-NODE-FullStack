const { Op } = require("sequelize");
const { Chat, Message, Device, ContactName } = require("../models");
const manager = require("../whatsapp/manager");
const { sendAndStore, PREVIEW } = require("../services/messageService");
const { phoneFromJid, normalizePhoneDigits } = require("../whatsapp/jid");
const mediaStore = require("../services/mediaStore");
const { assertDeviceAccess } = require("../services/deviceAccess");
const cache = require("../services/cache");
const { relatedChatIds } = require("../services/chatIdentity");

const httpError = require("../services/httpError");
const config = require("../../config/config");
const MAX_TEXT = 4096;
const MEDIA_TYPES = ["image", "video", "audio", "sticker", "document"];
const CHATS_CACHE_TTL = 15_000;
const MESSAGES_CACHE_TTL = 15_000;

// Tebak jenis media dari MIME/ekstensi. File .webp dianggap stiker.
function detectMediaType(file) {
  const mime = String(file?.mimetype || "").toLowerCase();
  const name = String(file?.originalname || "").toLowerCase();
  if (mime === "image/webp" || name.endsWith(".webp")) return "sticker";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

async function listChats(req, res) {
  await assertDeviceAccess(req.user, req.params.deviceId);
  const cacheKey = `chats:${req.params.deviceId}`;
  const data = await cache.wrap(cacheKey, CHATS_CACHE_TTL, async () => {
    const chats = await Chat.findAll({
      where: { device_id: req.params.deviceId },
      order: [["last_message_at", "DESC"]],
      limit: 500,
    });
    const jids = chats.map((c) => c.wa_jid).filter(Boolean);
    const lidJids = jids.filter((j) => String(j).endsWith("@lid"));
    const phoneJids = jids.filter((j) => String(j).endsWith("@s.whatsapp.net"));
    const numbers = jids.length
      ? await ContactName.findAll({
          where: {
            device_id: req.params.deviceId,
            [Op.or]: [
              ...(lidJids.length ? [{ lid_user: { [Op.in]: lidJids } }] : []),
              ...(phoneJids.length ? [{ from_jid: { [Op.in]: phoneJids } }] : []),
            ],
          },
          attributes: ["lid_user", "from_jid", "notify"],
        })
      : [];
    const byLid = new Map();
    const byJid = new Map();
    for (const n of numbers) {
      if (n.lid_user) byLid.set(n.lid_user, n);
      if (n.from_jid) byJid.set(n.from_jid, n);
    }

    const merged = new Map();
    for (const c of chats) {
      const row = c.toJSON();
      const n = byJid.get(c.wa_jid) || byLid.get(c.wa_jid) || null;
      const phone = n?.from_jid ? phoneFromJid(n.from_jid) : phoneFromJid(c.wa_jid);
      row.phone = phone || null;
      row.lid = n?.lid_user || (String(c.wa_jid).endsWith("@lid") ? c.wa_jid : null);
      row.notify = n?.notify || null;
      if (!row.contact_name && n?.notify) row.contact_name = n.notify;

      // Gabungkan chat yang nomor sama (mis. @lid dan @s.whatsapp.net) agar inbox tidak dobel.
      const key = row.is_group ? `g:${row.id}` : row.phone ? `p:${normalizePhoneDigits(row.phone)}` : `j:${row.wa_jid}`;
      const prev = merged.get(key);
      if (!prev) {
        merged.set(key, { ...row, merged_chat_ids: [row.id] });
        continue;
      }
      prev.merged_chat_ids.push(row.id);
      prev.unread_count = (Number(prev.unread_count) || 0) + (Number(row.unread_count) || 0);
      const prevAt = prev.last_message_at ? new Date(prev.last_message_at).getTime() : 0;
      const curAt = row.last_message_at ? new Date(row.last_message_at).getTime() : 0;
      // Pilih chat terbaru sebagai chat utama, tapi pertahankan identitas terbaik.
      if (curAt >= prevAt) {
        merged.set(key, {
          ...row,
          contact_name: row.contact_name || prev.contact_name || null,
          phone: row.phone || prev.phone || null,
          lid: row.lid || prev.lid || null,
          notify: row.notify || prev.notify || null,
          unread_count: prev.unread_count,
          merged_chat_ids: prev.merged_chat_ids,
        });
      } else {
        prev.contact_name = prev.contact_name || row.contact_name || null;
        prev.phone = prev.phone || row.phone || null;
        prev.lid = prev.lid || row.lid || null;
        prev.notify = prev.notify || row.notify || null;
      }
    }

    return [...merged.values()].sort((a, b) => {
      const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return tb - ta;
    });
  });

  res.json({ error: false, data });
}

// ACL: chat dicari lewat chatId, jadi akses dicek lewat device pemilik chat.
async function findChatWithAccess(chatId, user) {
  const chat = await Chat.findByPk(chatId, { include: Device });
  if (!chat) throw httpError("Chat tidak ditemukan", 404);
  await assertDeviceAccess(user, chat.device_id);
  return chat;
}

// Pesan terbaru (urut lama -> baru). ?limit=200 (maks 500), ?before=<ISO date> untuk halaman sebelumnya.
async function listMessages(req, res) {
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
  const beforeRaw = req.query.before ? String(req.query.before) : "";
  const beforeDate = beforeRaw ? new Date(beforeRaw) : null;
  const beforeMs = beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate.getTime() : 0;

  const chat = await Chat.findByPk(req.params.chatId, { attributes: ["id", "device_id", "is_group", "wa_jid"] });
  if (chat) await assertDeviceAccess(req.user, chat.device_id);
  const chatIds = chat ? await relatedChatIds(chat) : [req.params.chatId];
  // Key cache harus mencakup semua chatId yang digabung agar tidak bocor/stale.
  const cacheKey = `messages:${chatIds.slice().sort().join(",")}:${limit}:${beforeMs}`;

  const cached = await cache.wrap(cacheKey, MESSAGES_CACHE_TTL, async () => {
    const where = { chat_id: { [Op.in]: chatIds } };
    if (beforeMs) where.createdAt = { [Op.lt]: new Date(beforeMs) };

    const rows = await Message.findAll({
      where,
      order: [
        ["createdAt", "DESC"],
        ["id", "DESC"],
      ],
      limit,
    });

    // Lengkapi identitas pengirim/pesan dari tabel numbers (nomor/LID/notify).
    let data = rows.reverse().map((r) => r.toJSON());
    const senders = [...new Set(data.map((r) => r.sender_jid).filter(Boolean))];
    const numbers = senders.length && chat?.device_id
      ? await ContactName.findAll({
          where: {
            device_id: chat.device_id,
            [Op.or]: [{ from_jid: { [Op.in]: senders } }, { lid_user: { [Op.in]: senders } }],
          },
          attributes: ["from_jid", "lid_user", "notify"],
        })
      : [];
    const byJid = new Map();
    for (const n of numbers) {
      if (n.from_jid) byJid.set(n.from_jid, n);
      if (n.lid_user) byJid.set(n.lid_user, n);
    }
    data = data.map((r) => {
      const n = r.sender_jid ? byJid.get(r.sender_jid) : null;
      r.sender_name = n?.notify || null;
      r.sender_phone = n?.from_jid
        ? phoneFromJid(n.from_jid)
        : r.sender_jid
          ? String(r.sender_jid).split("@")[0]
          : null;
      return r;
    });

    return { deviceId: chat?.device_id || null, data };
  });

  if (cached.deviceId) await assertDeviceAccess(req.user, cached.deviceId);
  res.json({ error: false, data: mediaStore.refreshUrls(cached.data) });
}

// Selesaikan target reply: cari pesan di chat ini berdasarkan wa_message_id.
// Mengembalikan { key, quoted, info }:
//   - key   : key pesan yang dibalas (remoteJid/id/fromMe/participant) — untuk riwayat
//   - quoted: objek lengkap sesuai tuntutan Baileys ({ key, message }) — diberikan ke
//             `sendMessage(jid, content, { quoted })`; tanpa `message`, Baileys melempar
//             TypeError "Cannot read properties of undefined (reading 'fromMe')".
// Isi kutipannya direkonstruksi dari DB (body/caption), bukan proto asli WhatsApp.
//   - info  : untuk disimpan di riwayat.
async function resolveReplyTarget(chat, raw) {
  const waId = typeof raw === "string" ? raw.trim() : "";
  if (!waId) return null;
  const row = await Message.findOne({
    where: { chat_id: chat.id, wa_message_id: waId },
    attributes: ["wa_message_id", "body", "media_caption", "direction", "type", "sender_jid"],
  });
  if (!row) throw httpError("Pesan yang dibalas tidak ditemukan di chat ini", 400);
  const fromMe = row.direction === "outgoing";
  // Grup menuntut participant (pengirim pesan yang dibalas) di quoted key:
  // - balasan ke pesan orang lain -> sender_jid yang tersimpan saat pesan masuk
  // - balasan ke pesan kita sendiri -> nomor device
  let participant = null;
  if (chat.is_group) {
    participant = !fromMe
      ? row.sender_jid || chat.wa_jid
      : chat.Device?.phone_number
        ? `${phoneFromJid(chat.Device.phone_number)}@s.whatsapp.net`
        : null;
  }
  const quotedKey = {
    remoteJid: chat.wa_jid,
    id: row.wa_message_id,
    fromMe,
    ...(participant ? { participant } : {}),
  };
  const quotedBody = row.media_caption || row.body || "[Media]";
  return {
    key: quotedKey,
    quoted: {
      key: quotedKey,
      message: { conversation: quotedBody },
    },
    info: { waId: row.wa_message_id, body: quotedBody, fromMe },
  };
}

// Kirim teks (JSON) atau media (multipart field "file" + type/caption/ptt).
// Sebagai reply: kirim field `replyTo` = wa_message_id pesan yang dibalas.
async function sendMessage(req, res) {
  const chat = await findChatWithAccess(req.params.chatId, req.user);

  const instance = manager.get(chat.Device.instance_key);
  if (!instance?.online) throw httpError("Device belum terhubung ke WhatsApp", 409);

  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const caption = typeof req.body?.caption === "string" ? req.body.caption.trim() : text;
  const requestedType = String(req.body?.type || "").toLowerCase();
  const reply = await resolveReplyTarget(chat, req.body?.replyTo);
  const quoted = reply?.quoted;

  // Kirim kontak (vCard): body { contact: { name, phone } } ATAU
  // { contacts: [{ name, phone }, ...] } — banyak kontak dalam SATU pesan vCard.
  const rawContacts = Array.isArray(req.body?.contacts) && req.body.contacts.length
    ? req.body.contacts
    : req.body?.contact && typeof req.body.contact === "object"
      ? [req.body.contact]
      : null;
  if (rawContacts) {
    const entries = [];
    for (const c of rawContacts.slice(0, 25)) {
      if (!c || typeof c !== "object") continue;
      const name = String(c.name ?? "").trim();
      const digits = normalizePhoneDigits(c.phone);
      if (!digits || digits.length < 8) throw httpError(`Nomor kontak tidak valid: ${name || "(tanpa nama)"}`, 400);
      entries.push({
        name,
        digits,
        vcard: [
          "BEGIN:VCARD",
          "VERSION:3.0",
          `FN:${name || digits}`,
          `TEL;TYPE=CELL:+${digits}`,
          "END:VCARD",
        ].join("\n"),
      });
    }
    if (!entries.length) throw httpError("Tidak ada kontak yang valid untuk dikirim", 400);

    const displayName = entries.length === 1 ? entries[0].name || entries[0].digits : `${entries.length} kontak`;
    const previewBody =
      entries.length === 1
        ? `[Kontak] ${displayName} (+${entries[0].digits})`
        : `[Kontak] ${entries.length} kontak: ${entries.map((e) => e.name || `+${e.digits}`).join(", ")}`;

    const { message, storageFailed } = await sendAndStore({
      device: chat.Device,
      instance,
      to: chat.wa_jid,
      send: (inst, jid) => inst.sendContact(jid, { displayName, vcards: entries.map((e) => e.vcard) }, { quoted }),
      preview: { type: "other", body: previewBody },
      userId: req.user.id,
      replyTo: reply?.info,
    });
    if (storageFailed) {
      return res.status(202).json({ error: false, data: null, message: "Pesan terkirim, tetapi gagal disimpan ke riwayat" });
    }
    return res.status(201).json({ error: false, data: message });
  }

  if (req.file) {
    if (caption.length > MAX_TEXT) throw httpError(`Caption maksimal ${MAX_TEXT} karakter`, 400);

    const type = MEDIA_TYPES.includes(requestedType) ? requestedType : detectMediaType(req.file);
    const ptt = String(req.body?.ptt ?? "").toLowerCase() === "true";
    const file = {
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      filename: req.file.originalname,
    };
    const label = type === "audio" && ptt ? "[Pesan suara]" : PREVIEW[type] || "[Media]";

    const { message, storageFailed } = await sendAndStore({
      device: chat.Device,
      instance,
      to: chat.wa_jid,
      send: (inst, jid) => inst.sendMedia(jid, file, type, caption, { ptt, quoted }),
      preview: { type, body: caption ? `${label} ${caption}` : label },
      attachment: { ...file, type, caption, ptt },
      userId: req.user.id,
      replyTo: reply?.info,
    });

    if (storageFailed) {
      return res.status(202).json({
        error: false,
        data: null,
        message: "Pesan terkirim, tetapi gagal disimpan ke riwayat",
      });
    }
    return res.status(201).json({ error: false, data: message });
  }

  if (!text) throw httpError("Isi pesan wajib diisi", 400);
  if (text.length > MAX_TEXT) throw httpError(`Pesan maksimal ${MAX_TEXT} karakter`, 400);

  const { message, storageFailed } = await sendAndStore({
    device: chat.Device,
    instance,
    to: chat.wa_jid,
    send: (inst, jid) => inst.sendText(jid, text, { quoted }),
    preview: { type: "text", body: text },
    userId: req.user.id,
    replyTo: reply?.info,
  });

  if (storageFailed) {
    // Sudah terkirim ke WhatsApp; jangan balas error agar agent tidak mengirim ulang.
    return res.status(202).json({
      error: false,
      data: null,
      message: "Pesan terkirim, tetapi gagal disimpan ke riwayat",
    });
  }
  res.status(201).json({ error: false, data: message });
}

async function markRead(req, res) {
  const chat = await findChatWithAccess(req.params.chatId, req.user);
  const chatIds = await relatedChatIds(chat);
  const siblings = await Chat.findAll({ where: { id: { [Op.in]: chatIds } } });
  for (const c of siblings) {
    if (c.unread_count) await c.update({ unread_count: 0 });
  }
  cache.invalidate(`chats:${chat.device_id}`);

  // Mode senyap (SEND_READ_RECEIPTS=false): jangan kirim "terbaca" ke WhatsApp —
  // proyek berjalan di belakang layar; badge lokal tetap dibersihkan di atas.
  if (!config.whatsapp.sendReadReceipts) return res.json({ error: false, data: { unread_count: 0, silent: true } });

  // Tandai dibaca juga di WhatsApp agar centang di ponsel ikut berubah.
  try {
    const instance = manager.get(chat.Device?.instance_key);
    if (instance?.online && !chat.is_group) {
      const unread = await Message.findAll({
        attributes: ["wa_message_id", "createdAt"],
        where: { chat_id: chat.id, direction: "incoming", status: { [Op.ne]: "read" }, wa_message_id: { [Op.ne]: null } },
        order: [["createdAt", "ASC"]],
        limit: 100,
      });
      const keys = unread.map((m) => ({
        remoteJid: chat.wa_jid,
        id: m.wa_message_id,
        fromMe: false,
        messageTimestamp: Math.floor(new Date(m.createdAt).getTime() / 1000),
      }));
      if (keys.length) await instance.sock?.readMessages?.(keys);
      if (unread.length) {
        await Message.update(
          { status: "read" },
          { where: { chat_id: chat.id, direction: "incoming", status: { [Op.ne]: "read" } } },
        );
      }
    }
  } catch {
    // Gagal sinkron ke WhatsApp tidak boleh menggagalkan penandaan di dashboard.
  }

  res.json({ error: false, data: chat });
}

module.exports = { listChats, listMessages, sendMessage, markRead, detectMediaType };
