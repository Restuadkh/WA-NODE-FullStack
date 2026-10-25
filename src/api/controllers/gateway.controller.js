const { sendAndStore, PREVIEW } = require("../services/messageService");
// Dipanggil lewat objek modul (safeFetch.fetchRemoteMedia) agar mudah di-stub di test.
const safeFetch = require("../../utils/safeFetch");

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const MEDIA_TYPES = ["image", "video", "audio", "sticker", "document"];

const target = (req) => {
  const id = req.body?.id;
  if (!id) throw httpError("Parameter 'id' (nomor tujuan) wajib diisi", 400);
  return id;
};

const isTrue = (value) => ["true", "1", "yes", "on"].includes(String(value ?? "").toLowerCase());

const labelFor = (type, { caption, ptt } = {}) => {
  const label = type === "audio" && ptt ? "[Pesan suara]" : PREVIEW[type] || "[Media]";
  return caption ? `${label} ${caption}` : label;
};

// Semua endpoint di sini memakai req.device / req.instance dari gatewayAuth
// dan menyimpan pesan ke inbox dashboard.

async function text(req, res) {
  const message = String(req.body?.message ?? "");
  if (!message.trim()) throw httpError("Parameter 'message' wajib diisi", 400);

  const { result } = await sendAndStore({
    device: req.device,
    instance: req.instance,
    to: target(req),
    send: (inst, jid) => inst.sendText(jid, message),
    preview: { type: "text", body: message },
  });
  res.status(201).json({ error: false, data: result });
}

// type: image | video | audio | sticker | document
const uploadHandler = (type, { forcePtt = false, defaultPtt = false } = {}) => async (req, res) => {
  if (!req.file) throw httpError("File wajib dikirim (field 'file')", 400);
  const caption = req.body?.caption || "";
  const filename = req.body?.filename || req.file.originalname;
  const ptt = type === "audio" ? forcePtt || isTrue(req.body?.ptt) || defaultPtt : false;
  const file = { buffer: req.file.buffer, mimetype: req.file.mimetype, filename };

  const { result } = await sendAndStore({
    device: req.device,
    instance: req.instance,
    to: target(req),
    send: (inst, jid) => inst.sendMedia(jid, file, type, caption, { ptt }),
    preview: { type, body: labelFor(type, { caption, ptt }) },
    attachment: { ...file, type, caption, ptt },
  });
  res.status(201).json({ error: false, data: result });
};

// Media dari URL: server mengunduh sendiri lewat pengunduh yang menolak alamat internal (SSRF),
// lalu mengirim buffer-nya. URL TIDAK PERNAH diserahkan langsung ke Baileys.
async function mediaUrl(req, res) {
  const { url, type, mimetype, caption } = req.body || {};
  if (!MEDIA_TYPES.includes(type)) throw httpError(`type harus salah satu dari: ${MEDIA_TYPES.join(", ")}`, 400);
  if (!/^https?:\/\//i.test(String(url || ""))) throw httpError("url harus diawali http:// atau https://", 400);
  const to = target(req);
  const ptt = type === "audio" ? isTrue(req.body?.ptt) : false;

  const media = await safeFetch.fetchRemoteMedia(String(url));
  const file = {
    buffer: media.buffer,
    mimetype: String(mimetype || media.mimetype || "application/octet-stream"),
    filename: req.body?.filename || media.filename || "file",
  };

  const { result } = await sendAndStore({
    device: req.device,
    instance: req.instance,
    to,
    send: (inst, jid) => inst.sendMedia(jid, file, type, caption || "", { ptt }),
    preview: { type, body: labelFor(type, { caption, ptt }) },
    attachment: { ...file, type, caption, ptt },
  });
  res.status(201).json({ error: false, data: result });
}

module.exports = {
  text,
  image: uploadHandler("image"),
  video: uploadHandler("video"),
  audio: uploadHandler("audio"),
  sticker: uploadHandler("sticker"),
  // "note" = voice note (PTT)
  voiceNote: uploadHandler("audio", { forcePtt: true }),
  document: uploadHandler("document"),
  mediaUrl,
};
