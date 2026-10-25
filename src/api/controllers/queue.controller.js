const config = require("../../config/config");
const { MessageJob } = require("../models");
const queueService = require("../services/queueService");
const { findDevice, httpError } = require("./devices.controller");
const safeFetch = require("../../utils/safeFetch");

const MEDIA_TYPES = ["image", "video", "audio", "sticker", "document"];
const STATUSES = ["pending", "sending", "sent", "failed", "cancelled"];

const isTrue = (value) => ["true", "1", "yes", "on"].includes(String(value ?? "").toLowerCase());

const target = (body) => {
  const id = body?.id;
  if (!id) throw httpError("Parameter 'id' (nomor tujuan) wajib diisi", 400);
  return id;
};

// Jangan bocorkan nama file internal (disk_name) ke API.
function serializeJob(job) {
  const data = job.toJSON();
  if (data.payload?.media) {
    const { disk_name, ...media } = data.payload.media;
    data.payload = { ...data.payload, media };
  }
  return data;
}

function scheduleOf(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw httpError("scheduled_at tidak valid (gunakan ISO 8601)", 400);
  return date;
}

function priorityOf(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n)) throw httpError("priority harus bilangan bulat", 400);
  return n;
}

// POST /api/message/queue  (teks)
async function enqueueText(req, res) {
  const body = req.body || {};
  const { job, duplicate } = await queueService.enqueueText({
    device: req.device,
    to: target(body),
    message: body.message,
    scheduledAt: scheduleOf(body.scheduled_at),
    priority: priorityOf(body.priority),
    clientRef: body.ref,
  });
  res.status(duplicate ? 200 : 201).json({ error: false, duplicate, data: serializeJob(job) });
}

// POST /api/message/queue/batch  { messages: [{ id, message, scheduled_at?, priority?, ref? }] }
async function enqueueBatch(req, res) {
  const list = req.body?.messages;
  if (!Array.isArray(list) || !list.length) throw httpError("messages harus berupa array dan tidak kosong", 400);
  if (list.length > config.queue.batchMax) {
    throw httpError(`Maksimal ${config.queue.batchMax} pesan per batch`, 400);
  }

  // Validasi seluruh batch lebih dulu agar tidak setengah tersimpan saat ada item salah.
  list.forEach((item, index) => {
    if (!item || typeof item !== "object") throw httpError(`messages[${index}] tidak valid`, 400);
    if (!item.id) throw httpError(`messages[${index}].id wajib diisi`, 400);
    if (!String(item.message ?? "").trim()) throw httpError(`messages[${index}].message wajib diisi`, 400);
    if (String(item.message).length > 4096) throw httpError(`messages[${index}].message maksimal 4096 karakter`, 400);
    scheduleOf(item.scheduled_at);
    priorityOf(item.priority);
  });

  const jobs = [];
  let duplicates = 0;
  for (const item of list) {
    const { job, duplicate } = await queueService.enqueueText({
      device: req.device,
      to: item.id,
      message: item.message,
      scheduledAt: scheduleOf(item.scheduled_at),
      priority: priorityOf(item.priority),
      clientRef: item.ref,
      source: "batch",
    });
    if (duplicate) duplicates += 1;
    jobs.push(serializeJob(job));
  }

  res.status(201).json({
    error: false,
    data: { queued: jobs.length - duplicates, duplicates, jobs },
  });
}

// POST /api/message/queue/media (multipart: id, file, type?, caption?, ptt?, scheduled_at?, priority?, ref?)
async function enqueueMedia(req, res) {
  if (!req.file) throw httpError("File wajib dikirim (field 'file')", 400);
  const body = req.body || {};
  const requested = String(body.type || "").toLowerCase();
  const type = MEDIA_TYPES.includes(requested)
    ? requested
    : String(req.file.mimetype || "").startsWith("image/")
      ? "image"
      : "document";

  const { job, duplicate } = await queueService.enqueueMedia({
    device: req.device,
    to: target(body),
    type,
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
    filename: body.filename || req.file.originalname,
    caption: body.caption || "",
    ptt: type === "audio" && isTrue(body.ptt),
    scheduledAt: scheduleOf(body.scheduled_at),
    priority: priorityOf(body.priority),
    clientRef: body.ref,
    source: "api-media",
  });

  res.status(duplicate ? 200 : 201).json({ error: false, duplicate, data: serializeJob(job) });
}

// POST /api/message/queue/mediaurl (JSON: id, url, type, mimetype?, caption?, ptt?, ...)
// File diunduh saat enqueue supaya URL yang kedaluwarsa tidak menggagalkan pengiriman nanti.
async function enqueueMediaUrl(req, res) {
  const body = req.body || {};
  const type = String(body.type || "").toLowerCase();
  if (!MEDIA_TYPES.includes(type)) {
    throw httpError(`type harus salah satu dari: ${MEDIA_TYPES.join(", ")}`, 400);
  }
  if (!/^https?:\/\//i.test(String(body.url || ""))) {
    throw httpError("url harus diawali http:// atau https://", 400);
  }

  const media = await safeFetch.fetchRemoteMedia(String(body.url));
  const { job, duplicate } = await queueService.enqueueMedia({
    device: req.device,
    to: target(body),
    type,
    buffer: media.buffer,
    mimetype: body.mimetype || media.mimetype || "application/octet-stream",
    filename: body.filename || media.filename || "file",
    caption: body.caption || "",
    ptt: type === "audio" && isTrue(body.ptt),
    scheduledAt: scheduleOf(body.scheduled_at),
    priority: priorityOf(body.priority),
    clientRef: body.ref,
    source: "api-url",
  });

  res.status(duplicate ? 200 : 201).json({ error: false, duplicate, data: serializeJob(job) });
}

// GET /api/devices/:deviceId/jobs?status=pending&limit=100&offset=0
async function listJobs(req, res) {
  await findDevice(req.params.deviceId);
  const status = String(req.query.status || "").trim();
  if (status && !STATUSES.includes(status)) throw httpError("status tidak valid", 400);

  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const where = { device_id: req.params.deviceId };
  if (status) where.status = status;

  const { rows, count } = await MessageJob.findAndCountAll({
    where,
    order: [
      ["createdAt", "DESC"],
      ["id", "DESC"],
    ],
    limit,
    offset,
  });
  res.json({ error: false, data: rows.map(serializeJob), total: count, limit, offset });
}

// GET /api/devices/:deviceId/jobs/stats
async function jobStats(req, res) {
  await findDevice(req.params.deviceId);
  res.json({ error: false, data: await queueService.stats(req.params.deviceId) });
}

// DELETE /api/jobs/:id
async function cancelJob(req, res) {
  const job = await MessageJob.findByPk(req.params.id);
  if (!job) throw httpError("Job tidak ditemukan", 404);
  await queueService.cancel(job);
  res.json({ error: false, data: serializeJob(job) });
}

// POST /api/jobs/:id/retry
async function retryJob(req, res) {
  const job = await MessageJob.findByPk(req.params.id);
  if (!job) throw httpError("Job tidak ditemukan", 404);
  await queueService.retry(job);
  res.json({ error: false, data: serializeJob(job) });
}

module.exports = {
  enqueueText,
  enqueueBatch,
  enqueueMedia,
  enqueueMediaUrl,
  listJobs,
  jobStats,
  cancelJob,
  retryJob,
  serializeJob,
  MEDIA_TYPES,
  STATUSES,
};
