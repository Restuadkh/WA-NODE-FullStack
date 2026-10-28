const { DeviceAgent } = require("../models");
const httpError = require("./httpError");

// ACL device: admin TANPA penugasan = akses penuh (super admin, perilaku lama).
// Admin DENGAN penugasan dan agent = hanya device yang ditugaskan (tabel device_agents).
// Dipakai route dashboard & socket.io.

// ID device yang boleh diakses user. `null` berarti semua (admin tanpa penugasan).
async function allowedDeviceIds(user) {
  if (!user) return [];
  const rows = await DeviceAgent.findAll({ where: { user_id: user.id }, attributes: ["device_id"] });
  if (user.role === "admin" && rows.length === 0) return null; // super admin
  return rows.map((r) => r.device_id);
}

// Lempar 404 bila user tidak punya akses (jangan bocorkan keberadaan device).
async function assertDeviceAccess(user, deviceId) {
  const allowed = await allowedDeviceIds(user);
  if (allowed === null) return; // super admin
  if (!allowed.includes(String(deviceId))) throw httpError("Device tidak ditemukan", 404);
}

module.exports = { allowedDeviceIds, assertDeviceAccess };
