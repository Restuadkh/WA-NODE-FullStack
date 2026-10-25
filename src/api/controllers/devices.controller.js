const { randomUUID } = require("crypto");
const { Device, Chat, Message, AutoReplyRule, MessageJob } = require("../models");
const manager = require("../whatsapp/manager");
const mediaStore = require("../services/mediaStore");
const logger = require("../services/logger");

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const WEBHOOK_URL_MAX = 500;
const WEBHOOK_SECRET_MAX = 255;

// instance_key adalah kunci API kirim pesan, webhook_secret adalah kredensial integrasi:
// hanya admin yang boleh melihatnya.
function serialize(device, user) {
  const data = device.toJSON();
  data.webhook_configured = !!device.webhook_url;
  if (user?.role !== "admin") {
    delete data.instance_key;
    delete data.webhook_url;
    delete data.webhook_secret;
  }
  return data;
}

// Normalisasi URL webhook: kosong/null = matikan webhook. Wajib http(s) dan <= 500 karakter.
function parseWebhookUrl(value) {
  const url = String(value ?? "").trim();
  if (!url) return null;
  if (url.length > WEBHOOK_URL_MAX) throw httpError(`URL webhook maksimal ${WEBHOOK_URL_MAX} karakter`, 400);
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw httpError("URL webhook tidak valid", 400);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw httpError("URL webhook harus diawali http:// atau https://", 400);
  }
  return url;
}

function parseWebhookSecret(value) {
  const secret = String(value ?? "");
  if (!secret) return null;
  if (secret.length > WEBHOOK_SECRET_MAX) {
    throw httpError(`Secret webhook maksimal ${WEBHOOK_SECRET_MAX} karakter`, 400);
  }
  return secret;
}

// Hanya ubah field yang dikirim (undefined = biarkan seperti sebelumnya).
function webhookPatch(body) {
  const patch = {};
  if (body?.webhook_url !== undefined) patch.webhook_url = parseWebhookUrl(body.webhook_url);
  if (body?.webhook_secret !== undefined) patch.webhook_secret = parseWebhookSecret(body.webhook_secret);
  return patch;
}

async function findDevice(id) {
  const device = await Device.findByPk(id);
  if (!device) throw httpError("Device tidak ditemukan", 404);
  return device;
}

// Jalankan instance di latar belakang; hasilnya dipantau lewat status/QR
function startInBackground(device) {
  manager.ensure(device).catch((err) => logger.error({ err, device: device.id }, "Gagal menjalankan instance"));
}

async function listDevices(req, res) {
  const devices = await Device.findAll({ order: [["createdAt", "DESC"]] });
  res.json({ error: false, data: devices.map((d) => serialize(d, req.user)) });
}

async function createDevice(req, res) {
  const name = String(req.body?.name || "").trim();
  const phone = String(req.body?.phone_number || "").replace(/\D/g, "");
  if (!name) throw httpError("Nama device wajib diisi", 400);
  if (name.length > 100) throw httpError("Nama device terlalu panjang", 400);

  const device = await Device.create({
    name,
    instance_key: randomUUID(),
    phone_number: phone || null,
    status: "pending_qr",
    ...webhookPatch(req.body || {}),
  });
  startInBackground(device);
  res.status(201).json({ error: false, data: serialize(device, req.user) });
}

// Ubah nama device dan/atau webhook per device. Kirim webhook_url: "" untuk mematikan,
// webhook_secret: "" untuk menghapus secret.
async function updateDevice(req, res) {
  const device = await findDevice(req.params.id);
  const body = req.body || {};
  const patch = webhookPatch(body);

  if (body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) throw httpError("Nama device wajib diisi", 400);
    if (name.length > 100) throw httpError("Nama device terlalu panjang", 400);
    patch.name = name;
  }

  await device.update(patch);
  // Instance yang sedang berjalan harus memakai nama/webhook terbaru.
  manager.refreshDevice(device);
  res.json({ error: false, data: serialize(device, req.user) });
}

// Status + QR / pairing code. Memulai instance bila belum berjalan (mis. setelah restart server).
async function getDeviceQr(req, res) {
  const device = await findDevice(req.params.id);
  let instance = manager.get(device.instance_key);
  // start() aman dipanggil berulang (tidak melakukan apa pun bila socket sudah ada). Dipanggil juga
  // untuk instance yang terputus / logout / QR-nya kedaluwarsa, supaya QR baru dibuat tanpa restart server.
  if (!instance?.online) {
    startInBackground(device);
    instance = manager.get(device.instance_key);
  }
  res.json({
    error: false,
    data: {
      status: instance?.status || device.status,
      qr: instance?.qr || null,
      pairing_code: instance?.pairingCode || null,
    },
  });
}

async function getDeviceStatus(req, res) {
  const device = await findDevice(req.params.id);
  res.json({
    error: false,
    data: { status: device.status, phone_number: device.phone_number },
  });
}

// Logout dari WhatsApp lalu hapus device beserta chat dan rule-nya
async function removeDevice(req, res) {
  const device = await findDevice(req.params.id);
  await manager.remove(device);

  const chatIds = (await Chat.findAll({ where: { device_id: device.id }, attributes: ["id"] })).map((c) => c.id);
  if (chatIds.length) await Message.destroy({ where: { chat_id: chatIds } });
  await Chat.destroy({ where: { device_id: device.id } });
  await AutoReplyRule.destroy({ where: { device_id: device.id } });
  await MessageJob.destroy({ where: { device_id: device.id } });
  await mediaStore.removeDeviceMedia(device.id);
  await device.destroy();

  res.json({ error: false, message: "Device dihapus" });
}

module.exports = {
  listDevices,
  createDevice,
  updateDevice,
  getDeviceQr,
  getDeviceStatus,
  removeDevice,
  findDevice,
  httpError,
};
