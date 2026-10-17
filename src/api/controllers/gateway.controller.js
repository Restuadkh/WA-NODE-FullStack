const { sendAndStore } = require("../services/messageService");

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const MEDIA_TYPES = ["image", "video", "audio", "document"];
const LABEL = { image: "[Gambar]", video: "[Video]", audio: "[Audio]", document: "[Dokumen]" };

const target = (req) => {
  const id = req.body?.id;
  if (!id) throw httpError("Parameter 'id' (nomor tujuan) wajib diisi", 400);
  return id;
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

const uploadHandler = (type) => async (req, res) => {
  if (!req.file) throw httpError("File wajib dikirim (field 'file')", 400);
  const caption = req.body?.caption || "";
  const filename = req.body?.filename || req.file.originalname;

  const { result } = await sendAndStore({
    device: req.device,
    instance: req.instance,
    to: target(req),
    send: (inst, jid) =>
      inst.sendMedia(jid, { buffer: req.file.buffer, mimetype: req.file.mimetype, filename }, type, caption),
    preview: { type, body: caption ? `${LABEL[type]} ${caption}` : LABEL[type] },
  });
  res.status(201).json({ error: false, data: result });
};

async function mediaUrl(req, res) {
  const { url, type, mimetype, caption } = req.body || {};
  if (!MEDIA_TYPES.includes(type)) throw httpError(`type harus salah satu dari: ${MEDIA_TYPES.join(", ")}`, 400);
  if (!/^https?:\/\//i.test(String(url || ""))) throw httpError("url harus diawali http:// atau https://", 400);

  const { result } = await sendAndStore({
    device: req.device,
    instance: req.instance,
    to: target(req),
    send: (inst, jid) => inst.sendMediaUrl(jid, url, type, mimetype, caption || ""),
    preview: { type, body: caption ? `${LABEL[type]} ${caption}` : LABEL[type] },
  });
  res.status(201).json({ error: false, data: result });
}

module.exports = {
  text,
  image: uploadHandler("image"),
  video: uploadHandler("video"),
  audio: uploadHandler("audio"),
  document: uploadHandler("document"),
  mediaUrl,
};
