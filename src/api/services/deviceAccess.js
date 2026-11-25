// Semua user yang login (admin & agent) boleh melihat semua device.
// Fungsi dipertahankan sebagai no-op agar pemanggil lama tidak perlu diubah.
async function allowedDeviceIds() {
  return null;
}

function invalidateDeviceAccess() {}

function invalidateAllDeviceAccess() {}

async function assertDeviceAccess() {}

module.exports = { allowedDeviceIds, assertDeviceAccess, invalidateDeviceAccess, invalidateAllDeviceAccess };
