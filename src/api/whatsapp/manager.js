const { Op } = require("sequelize");
const { Device } = require("../models");
const logger = require("../services/logger");
const { emitAll } = require("../services/realtime");
const { notify } = require("../services/webhook");
const { handleIncoming, handleStatusUpdates } = require("../services/messageHandler");
const { WhatsAppInstance } = require("./instance");
const { listStoredKeys } = require("./authStore");

// instance_key -> WhatsAppInstance (hidup di memori proses ini)
const instances = new Map();

function create(device) {
  const instance = new WhatsAppInstance({
    key: device.instance_key,
    phoneNumber: device.phone_number,
  });

  instance.on("status", async ({ status, phone }) => {
    const patch = { status };
    if (status === "connected") {
      patch.last_connected_at = new Date();
      if (phone) patch.phone_number = phone;
    }
    try {
      await device.update(patch);
    } catch (err) {
      logger.error({ err, device: device.id }, "Gagal menyimpan status device");
    }
    emitAll("device:status", { device_id: device.id, status });
    notify("connection", device.instance_key, { status, phone });
  });

  instance.on("message", (msg) => handleIncoming(device, instance, msg));
  instance.on("message.update", (updates) => handleStatusUpdates(device, updates));

  instances.set(device.instance_key, instance);
  return instance;
}

// Ambil instance milik device (dibuat bila belum ada) dan pastikan sudah berjalan
async function ensure(device) {
  const instance = instances.get(device.instance_key) || create(device);
  await instance.start();
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

// Jalankan ulang semua device yang pernah tertaut
async function restoreAll() {
  await adoptLegacySessions();
  const devices = await Device.findAll({
    where: { status: { [Op.in]: ["connected", "disconnected"] } },
  });
  logger.info(`Memulihkan ${devices.length} sesi WhatsApp`);
  for (const device of devices) {
    await ensure(device); // berurutan agar tidak membanjiri server WhatsApp
  }
  return devices.length;
}

async function stopAll() {
  await Promise.allSettled([...instances.values()].map((i) => i.stop()));
}

module.exports = { ensure, get, remove, restoreAll, stopAll };
