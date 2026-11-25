const { sendAndStore, PREVIEW } = require("../services/messageService");

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

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

module.exports = {
  text,

  image: uploadHandler("image"),
  video: uploadHandler("video"),
  audio: uploadHandler("audio"),
  sticker: uploadHandler("sticker"),
  // "note" = voice note (PTT)
  voiceNote: uploadHandler("audio", { forcePtt: true }),
  document: uploadHandler("document"),
};
