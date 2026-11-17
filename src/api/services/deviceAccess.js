const { DeviceAgent } = require("../models");
const httpError = require("./httpError");
const cache = require("./cache");

// ACL device: super_admin = akses penuh semua device.
// Admin dan agent = hanya device yang ditugaskan kepadanya (tabel device_agents),
// sehingga tiap admin punya device-nya sendiri dan tidak bisa membuka device admin lain.
// Dipakai route dashboard & socket.io.
//
// Cache 30 detik per user: setiap request dashboard/API memanggil ini, jadi tanpa cache
// tabel device_agents di-query berulang-ulang. Penugasan baru berlaku maksimal 30 detik
// (atau segera lewat invalidateDeviceAccess pada endpoint penugasan).

const TTL_MS = 30_000;

// ID device yang boleh diakses user. `null` berarti semua (hanya super_admin).
async function allowedDeviceIds(user) {
  if (!user) return [];
  if (user.role === "super_admin") return null; // akses penuh semua device
  return cache.wrap(`deviceIds:${user.id}`, TTL_MS, async () => {
    const rows = await DeviceAgent.findAll({ where: { user_id: user.id }, attributes: ["device_id"] });
    return rows.map((r) => r.device_id);
  });
}

// Panggil setelah perubahan penugasan device (add/remove) agar berlaku segera.
function invalidateDeviceAccess(userId) {
  cache.invalidate(`deviceIds:${userId}`);
}

// Kosongkan seluruh cache ACL (mis. device dihapus — penugasan siapa pun bisa berubah).
function invalidateAllDeviceAccess() {
  cache.invalidatePrefix("deviceIds:");
}

// Lempar 404 bila user tidak punya akses (jangan bocorkan keberadaan device).
async function assertDeviceAccess(user, deviceId) {
  const allowed = await allowedDeviceIds(user);
  if (allowed === null) return; // super admin
  if (!allowed.includes(String(deviceId))) throw httpError("Device tidak ditemukan", 404);
}

module.exports = { allowedDeviceIds, assertDeviceAccess, invalidateDeviceAccess, invalidateAllDeviceAccess };
