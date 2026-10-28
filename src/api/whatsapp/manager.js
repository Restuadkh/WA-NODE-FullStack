const { Op } = require("sequelize");
const { Device } = require("../models");
const logger = require("../services/logger");
const { emitAll } = require("../services/realtime");
const { notify } = require("../services/webhook");
const { handleIncoming, handleStatusUpdates } = require("../services/messageHandler");
const { WhatsAppInstance } = require("./instance");
const { listStoredKeys } = require("./authStore");

// instance_key -> WhatsAppInstance (hidup di memori proses ini).
// Karena itu aplikasi ini harus berjalan sebagai SATU proses (PM2 fork mode, bukan cluster).
const instances = new Map();
let shuttingDown = false;

function create(device) {
  const instance = new WhatsAppInstance({
    key: device.instance_key,
    phoneNumber: device.phone_number,
  });
  // Referensi device terbaru (bisa diganti lewat refreshDevice saat admin mengubah webhook/nama).
  instance.device = device;

  instance.on("status", async ({ status, phone }) => {
    const current = instance.device;
    const patch = { status };
    if (status === "connected") {
      patch.last_connected_at = new Date();
      if (phone) patch.phone_number = phone;
    }
    try {
      await current.update(patch);
    } catch (err) {
      logger.error({ err, device: current.id }, "Gagal menyimpan status device");
    }
    emitAll("device:status", { device_id: current.id, status });
    notify("connection", current, { status, phone });
  });

  instance.on("message", (msg) => handleIncoming(instance.device, instance, msg));
  instance.on("message.update", (updates) => handleStatusUpdates(instance.device, updates));

  instances.set(device.instance_key, instance);
  return instance;
}

// Ganti referensi device pada instance yang sedang berjalan (dipanggil setelah update device),
// agar event berikutnya memakai nama/webhook terbaru tanpa perlu reconnect.
function refreshDevice(device) {
  const instance = instances.get(device.instance_key);
  if (instance) instance.device = device;
  return instance;
}

// Ambil instance milik device (dibuat bila belum ada) dan pastikan sudah berjalan.
// opts.maxAttempts = sesi start terbatas (retry otomatis dibatasi, lalu berhenti).
async function ensure(device, opts = {}) {
  if (shuttingDown) return instances.get(device.instance_key) || null;
  const existing = instances.get(device.instance_key);
  if (existing) {
    existing.device = device;
    await existing.start(opts);
    return existing;
  }
  const instance = create(device);
  await instance.start(opts);
  return instance;
}

const get = (key) => instances.get(key);

async function remove(device) {
  const instance = instances.get(device.instance_key) || create(device);
  await instance.logout();
  instance.removeAllListeners();
  instances.delete(device.instance_key);
}

// Sesi lama (folder auth tanpa baris Device) dijadikan Device agar tetap bisa dipakai
async function adoptLegacySessions() {
  const known = new Set((await Device.findAll({ attributes: ["instance_key"] })).map((d) => d.instance_key));
  for (const key of listStoredKeys()) {
    if (known.has(key)) continue;
    await Device.create({ name: `Sesi lama ${key.slice(0, 8)}`, instance_key: key, status: "disconnected" });
    logger.info({ key }, "Sesi lama diadopsi sebagai device");
  }
}

// Jalankan ulang semua device yang pernah tertaut.
// Setiap instance dijalankan dengan jeda kecil dan TIDAK saling menunggu: satu sesi yang lambat
// (mis. menunggu QR/versi WhatsApp) tidak boleh menahan atau memutus sesi lainnya.
async function restoreAll() {
  if (shuttingDown) return 0;
  await adoptLegacySessions();
  const devices = await Device.findAll({
    where: { status: { [Op.in]: ["connected", "disconnected"] } },
    order: [["last_connected_at", "DESC"]],
  });
  logger.info(`Memulihkan ${devices.length} sesi WhatsApp`);

  const results = await Promise.allSettled(
    devices.map(
      (device, index) =>
        new Promise((resolve) => setTimeout(resolve, index * 150)).then(() =>
          shuttingDown ? null : ensure(device),
        ),
    ),
  );
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      logger.error(
        { err: result.reason, device: devices[index].id },
        "Gagal memulihkan sesi WhatsApp",
      );
    }
  });
  return devices.length;
}

async function stopAll() {
  shuttingDown = true;
  await Promise.allSettled([...instances.values()].map((i) => i.stop()));
}

module.exports = { ensure, get, remove, refreshDevice, restoreAll, stopAll };
