const fs = require("fs");
const { Op, fn, col } = require("sequelize");
const config = require("../../config/config");
const logger = require("./logger");
const manager = require("../whatsapp/manager");
const mediaStore = require("./mediaStore");
const { sendAndStore, PREVIEW } = require("./messageService");
const { MessageJob, Device, Chat, Message } = require("../models");
const { orderedUuid } = require("../models/orderedId");
const { toJid } = require("../whatsapp/jid");

const DAY_MS = 24 * 60 * 60 * 1000;

let timer = null;
let ticking = false;
let stopped = false;
let started = false;

const processing = new Set(); // device_id yang sedang mengirim
const blockedUntil = new Map(); // device_id -> timestamp
const nextSendAt = new Map(); // device_id -> timestamp (jeda acak antar pesan)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const permanentError = (message, statusCode = 400) =>
  Object.assign(new Error(message), { permanent: true, statusCode });

function randomDelay() {
  const min = Math.max(0, config.queue.minDelayMs);
  const max = Math.max(0, config.queue.maxDelayMs);
  if (!max && !min) return 0;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.round(lo + Math.random() * (hi - lo));
}

function parseActiveHours() {
  const raw = String(config.queue.activeHours || "").trim();
  if (!raw) return null;
  const match = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(raw);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start === end) return null;
  return { start, end };
}

// Jam lokal sesuai QUEUE_TIMEZONE; "8-21" = kirim hanya pukul 08:00–20:59.
function withinActiveHours(date = new Date()) {
  const range = parseActiveHours();
  if (!range) return true;
  let hour;
  try {
    hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: config.queue.timezone,
        hour: "2-digit",
        hour12: false,
      }).format(date),
    );
  } catch {
    hour = date.getHours();
  }
  hour %= 24;
  if (range.start < range.end) return hour >= range.start && hour < range.end;
  // Rentang melewati tengah malam, mis. "22-6".
  return hour >= range.start || hour < range.end;
}

const dueWhere = (now = new Date()) => ({
  status: "pending",
  scheduled_at: { [Op.lte]: now },
  [Op.or]: [{ next_attempt_at: null }, { next_attempt_at: { [Op.lte]: now } }],
});

// Semua pesan keluar device (manual, auto-reply, API, antrean) dihitung untuk kuota.
function countOutgoing(deviceId, since) {
  return Message.count({
    where: { direction: "outgoing", createdAt: { [Op.gte]: since } },
    include: [{ model: Chat, attributes: [], where: { device_id: deviceId }, required: true }],
  });
}

async function quotaState(device) {
  const now = Date.now();
  if (config.queue.hourlyLimit > 0) {
    const count = await countOutgoing(device.id, new Date(now - 60 * 60 * 1000));
    if (count >= config.queue.hourlyLimit) return { blocked: true, until: now + 60 * 1000, reason: "hourly" };
  }
  if (config.queue.dailyLimit > 0) {
    const count = await countOutgoing(device.id, new Date(now - DAY_MS));
    if (count >= config.queue.dailyLimit) return { blocked: true, until: now + 5 * 60 * 1000, reason: "daily" };
  }
  return { blocked: false };
}

async function ensureNextSendAt(device) {
  if (nextSendAt.has(device.id)) return nextSendAt.get(device.id);
  const last = await Message.findOne({
    attributes: ["createdAt"],
    where: { direction: "outgoing" },
    include: [{ model: Chat, attributes: [], where: { device_id: device.id }, required: true }],
    order: [["createdAt", "DESC"]],
  });
  const at = last?.createdAt ? new Date(last.createdAt).getTime() + randomDelay() : 0;
  nextSendAt.set(device.id, at);
  return at;
}

function normalizeDate(value) {
  if (value === undefined || value === null || value === "") return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw permanentError("Waktu jadwal (scheduled_at) tidak valid");
  return date;
}

function normalizePriority(value) {
  if (value === undefined || value === null || value === "") return 0;
  const n = Number(value);
  if (!Number.isInteger(n)) throw permanentError("priority harus bilangan bulat");
  return Math.max(-1000, Math.min(1000, n));
}

// Simpan job teks/media. Mengembalikan { job, duplicate }.
async function enqueue({
  device,
  to,
  type = "text",
  payload,
  scheduledAt,
  priority,
  clientRef,
  userId,
  source = "api",
  maxAttempts,
  id,
}) {
  const jid = toJid(to);
  const jobId = id || orderedUuid();
  try {
    const job = await MessageJob.create({
      id: jobId,
      device_id: device.id,
      to_jid: jid,
      type,
      payload,
      scheduled_at: normalizeDate(scheduledAt),
      priority: normalizePriority(priority),
      max_attempts: maxAttempts || config.queue.maxAttempts,
      client_ref: clientRef ? String(clientRef).slice(0, 160) : null,
      source,
      created_by_user_id: userId || null,
    });
    return { job, duplicate: false };
  } catch (err) {
    if (clientRef && err.name === "SequelizeUniqueConstraintError") {
      const existing = await MessageJob.findOne({
        where: { device_id: device.id, client_ref: String(clientRef).slice(0, 160) },
      });
      if (existing) return { job: existing, duplicate: true };
    }
    throw err;
  }
}

function enqueueText({ device, to, message, ...rest }) {
  const text = String(message ?? "");
  if (!text.trim()) throw permanentError("Parameter 'message' wajib diisi");
  if (text.length > 4096) throw permanentError("Pesan maksimal 4096 karakter");
  return enqueue({ device, to, type: "text", payload: { text }, ...rest });
}

// Simpan media ke MEDIA_DIR lebih dulu; worker membaca file ini saat mengirim.
async function enqueueMedia({ device, to, type, buffer, mimetype, filename, caption = "", ptt = false, ...rest }) {
  if (!buffer?.length) throw permanentError("File wajib dikirim (field 'file')");
  const id = rest.id || orderedUuid();
  const saved = await mediaStore.save({
    deviceId: device.id,
    messageId: id,
    buffer,
    mimetype,
    filename,
    type,
  });
  try {
    const result = await enqueue({
      ...rest,
      id,
      device,
      to,
      type,
      payload: {
        caption: String(caption || ""),
        ptt: !!ptt,
        media: {
          disk_name: saved.disk_name,
          mimetype: saved.mimetype,
          filename: saved.filename,
          type,
        },
      },
    });
    // Duplikat (ref sama) memakai job lama; file yang baru diunggah tidak terpakai.
    if (result.duplicate) await mediaStore.remove(device.id, saved.disk_name);
    return result;
  } catch (err) {
    await mediaStore.remove(device.id, saved.disk_name);
    throw err;
  }
}

async function cleanupMedia(job, deviceId) {
  const diskName = job?.payload?.media?.disk_name;
  if (!diskName) return;
  await mediaStore.remove(deviceId, diskName);
}

function mediaPreview(type, payload) {
  const caption = String(payload.caption || "");
  const label = type === "audio" && payload.ptt ? "[Pesan suara]" : PREVIEW[type] || "[Media]";
  return caption ? `${label} ${caption}` : label;
}

async function simulateTyping(instance, jid, text) {
  try {
    await instance.sendPresence(jid, "composing");
    const ms = Math.min(config.queue.typingMaxMs, 700 + String(text || "").length * 25);
    await sleep(ms);
  } catch {
    // presence bersifat opsional
  } finally {
    try {
      await instance.sendPresence(jid, "paused");
    } catch {
      /* abaikan */
    }
  }
}

async function runJob(job, device, instance) {
  const payload = job.payload || {};
  let delivered = false;
  let deliveredMessage = null;
  try {
    let send;
    let preview;
    let attachment;

    if (job.type === "text") {
      const text = String(payload.text || "");
      if (!text) throw permanentError("Isi pesan kosong");
      send = (inst, jid) => inst.sendText(jid, text);
      preview = { type: "text", body: text };
      if (config.queue.typing) await simulateTyping(instance, job.to_jid, text);
    } else {
      const media = payload.media || {};
      const file = media.disk_name ? mediaStore.resolve(device.id, media.disk_name) : null;
      if (!file) throw permanentError("File media antrean tidak ditemukan (mungkin sudah dibersihkan)");
      const buffer = await fs.promises.readFile(file);
      const caption = String(payload.caption || "");
      attachment = {
        buffer,
        mimetype: media.mimetype,
        filename: media.filename,
        type: job.type,
        caption,
        ptt: !!payload.ptt,
      };
      preview = { type: job.type, body: mediaPreview(job.type, payload) };
      send = (inst, jid) => inst.sendMedia(jid, attachment, job.type, caption, { ptt: !!payload.ptt });
    }

    const { message, storageFailed } = await sendAndStore({
      device,
      instance,
      to: job.to_jid,
      send,
      preview,
      attachment,
      userId: job.created_by_user_id,
    });
    delivered = true;
    deliveredMessage = message || null;

    await job.update({
      status: "sent",
      sent_at: new Date(),
      next_attempt_at: null,
      message_id: message?.id || null,
      last_error: storageFailed ? "Pesan terkirim tetapi gagal disimpan ke riwayat" : null,
    });
    await cleanupMedia(job, device.id);
    nextSendAt.set(device.id, Date.now() + randomDelay());
    blockedUntil.delete(device.id);
    logger.info({ job: job.id, device: device.id, type: job.type }, "Job pesan terkirim");
  } catch (err) {
    // Pesan SUDAH terkirim ke WhatsApp; jangan pernah mengulang hanya karena update DB gagal.
    if (delivered) {
      logger.error({ job: job.id, device: device.id, err }, "Pesan terkirim tetapi status job gagal disimpan");
      try {
        await job.update({
          status: "sent",
          sent_at: new Date(),
          next_attempt_at: null,
          message_id: deliveredMessage?.id || null,
          last_error: String(err.message || err).slice(0, 1000),
        });
      } catch {
        /* biarkan; job stuck "sending" akan dikembalikan saat restart */
      }
      nextSendAt.set(device.id, Date.now() + randomDelay());
      await cleanupMedia(job, device.id);
      return;
    }

    const attempts = job.attempts;
    const permanent = err.permanent || err.statusCode === 400 || err.statusCode === 422;
    const message = String(err.message || err).slice(0, 1000);

    if (permanent || attempts >= job.max_attempts) {
      await job.update({ status: "failed", last_error: message, next_attempt_at: null });
      logger.warn({ job: job.id, device: device.id, attempts, err: message }, "Job pesan gagal permanen");
    } else {
      const backoff = Math.min(
        config.queue.retryMaxMs,
        config.queue.retryBaseMs * 2 ** Math.max(0, attempts - 1),
      );
      const delay = Math.round(backoff * (0.8 + Math.random() * 0.4));
      await job.update({
        status: "pending",
        last_error: message,
        next_attempt_at: new Date(Date.now() + delay),
      });
      logger.warn({ job: job.id, device: device.id, attempts, delay, err: message }, "Job pesan gagal, dijadwalkan ulang");
    }
    // Beri napas sebentar sebelum job berikutnya pada device ini.
    blockedUntil.set(device.id, Date.now() + 1000);
  }
}

async function processDevice(device) {
  if (processing.has(device.id)) return;
  if ((blockedUntil.get(device.id) || 0) > Date.now()) return;

  const instance = manager.get(device.instance_key);
  if (!instance?.online) return;
  if (!withinActiveHours()) return;

  const quota = await quotaState(device);
  if (quota.blocked) {
    blockedUntil.set(device.id, quota.until);
    return;
  }

  const waitUntil = await ensureNextSendAt(device);
  if (waitUntil > Date.now()) {
    blockedUntil.set(device.id, waitUntil);
    return;
  }

  const candidate = await MessageJob.findOne({
    where: { ...dueWhere(), device_id: device.id },
    order: [
      ["priority", "DESC"],
      ["scheduled_at", "ASC"],
      ["createdAt", "ASC"],
    ],
  });
  if (!candidate) return;

  // Klaim atomik: hanya satu worker/timer yang boleh mengambil job ini.
  const [claimed] = await MessageJob.update(
    { status: "sending", attempts: candidate.attempts + 1 },
    { where: { id: candidate.id, status: "pending" } },
  );
  if (!claimed) return;

  const job = await MessageJob.findByPk(candidate.id);
  processing.add(device.id);
  try {
    await runJob(job, device, instance);
  } finally {
    processing.delete(device.id);
  }
}

// Satu putaran worker: ambil semua device yang punya job jatuh tempo.
async function tick() {
  if (!config.queue.enabled || stopped || ticking) return;
  ticking = true;
  try {
    const groups = await MessageJob.findAll({
      attributes: ["device_id"],
      where: dueWhere(),
      group: ["device_id"],
      raw: true,
    });
    await Promise.allSettled(
      groups.map(async ({ device_id }) => {
        const device = await Device.findByPk(device_id);
        if (device) await processDevice(device);
      }),
    );
  } catch (err) {
    logger.error({ err }, "Worker antrean gagal memproses");
  } finally {
    ticking = false;
  }
}

async function start() {
  if (started) return;
  started = true;
  stopped = false;

  // Job yang tertinggal di status "sending" karena server mati dikembalikan ke antrean.
  const [reset] = await MessageJob.update(
    { status: "pending", next_attempt_at: new Date() },
    { where: { status: "sending" } },
  );
  if (reset) logger.warn({ jumlah: reset }, "Job antrean yang terputus dikembalikan ke pending");

  if (!config.queue.enabled) {
    logger.info("Antrean pesan nonaktif (QUEUE_ENABLED=false)");
    return;
  }

  timer = setInterval(() => tick(), Math.max(250, config.queue.pollMs));
  timer.unref?.();
  logger.info(
    {
      minDelayMs: config.queue.minDelayMs,
      maxDelayMs: config.queue.maxDelayMs,
      hourlyLimit: config.queue.hourlyLimit,
      dailyLimit: config.queue.dailyLimit,
      activeHours: config.queue.activeHours || "24 jam",
    },
    "Worker antrean pesan aktif",
  );
  tick().catch((err) => logger.error({ err }, "Tick awal antrean gagal"));
}

async function stop() {
  stopped = true;
  if (timer) clearInterval(timer);
  timer = null;
  // Tunggu job yang sedang dikirim (maks 10 detik) agar tidak terputus di tengah jalan.
  const deadline = Date.now() + 10000;
  while (processing.size && Date.now() < deadline) await sleep(100);
  started = false;
}

async function stats(deviceId) {
  const rows = await MessageJob.findAll({
    attributes: ["status", [fn("COUNT", col("id")), "count"]],
    where: { device_id: deviceId },
    group: ["status"],
    raw: true,
  });
  const counts = { pending: 0, sending: 0, sent: 0, failed: 0, cancelled: 0 };
  rows.forEach((row) => {
    counts[row.status] = Number(row.count) || 0;
  });

  const now = Date.now();
  const [lastHour, lastDay] = await Promise.all([
    countOutgoing(deviceId, new Date(now - 60 * 60 * 1000)),
    countOutgoing(deviceId, new Date(now - DAY_MS)),
  ]);
  const next = await MessageJob.findOne({
    attributes: ["scheduled_at"],
    where: { device_id: deviceId, status: "pending" },
    order: [["scheduled_at", "ASC"]],
  });

  return {
    counts,
    usage: { last_hour: lastHour, last_day: lastDay },
    limits: {
      hourly: config.queue.hourlyLimit,
      daily: config.queue.dailyLimit,
      min_delay_ms: config.queue.minDelayMs,
      max_delay_ms: config.queue.maxDelayMs,
      active_hours: config.queue.activeHours || "0-24",
      timezone: config.queue.timezone,
    },
    next_scheduled_at: next?.scheduled_at || null,
  };
}

async function cancel(job) {
  if (!["pending", "failed"].includes(job.status)) {
    throw Object.assign(new Error("Hanya job pending/failed yang bisa dibatalkan"), { statusCode: 409 });
  }
  await job.update({ status: "cancelled", next_attempt_at: null });
  await cleanupMedia(job, job.device_id);
  return job;
}

async function retry(job) {
  if (!["failed", "cancelled"].includes(job.status)) {
    throw Object.assign(new Error("Hanya job failed/cancelled yang bisa diulang"), { statusCode: 409 });
  }
  await job.update({
    status: "pending",
    attempts: 0,
    next_attempt_at: null,
    last_error: null,
    scheduled_at: new Date(),
  });
  return job;
}

module.exports = {
  start,
  stop,
  stats,
  cancel,
  retry,
  enqueue,
  enqueueText,
  enqueueMedia,
  countOutgoing,
  withinActiveHours,
  _tick: tick,
};
