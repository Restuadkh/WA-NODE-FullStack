const { DeviceAgent } = require("../models");
const httpError = require("./httpError");

// ACL device: super_admin = akses penuh semua device.
// Admin dan agent = hanya device yang ditugaskan kepadanya (tabel device_agents),
// sehingga tiap admin punya device-nya sendiri dan tidak bisa membuka device admin lain.
// Dipakai route dashboard & socket.io.

// ID device yang boleh diakses user. `null` berarti semua (hanya super_admin).
async function allowedDeviceIds(user) {
  if (!user) return [];
  if (user.role === "super_admin") return null; // akses penuh semua device
  const rows = await DeviceAgent.findAll({ where: { user_id: user.id }, attributes: ["device_id"] });
  return rows.map((r) => r.device_id);
}

// Lempar 404 bila user tidak punya akses (jangan bocorkan keberadaan device).
async function assertDeviceAccess(user, deviceId) {
  const allowed = await allowedDeviceIds(user);
  if (allowed === null) return; // super admin
  if (!allowed.includes(String(deviceId))) throw httpError("Device tidak ditemukan", 404);
}

module.exports = { allowedDeviceIds, assertDeviceAccess };
