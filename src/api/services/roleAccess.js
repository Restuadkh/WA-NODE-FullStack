const { RolePermission } = require("../models");
const httpError = require("./httpError");

// Hierarki role: level kecil = kuasa besar. super_admin (1) mengatur admin (2) & agent (3);
// admin (2) hanya mengatur agent (3).
const LEVELS = { super_admin: 1, admin: 2, agent: 3 };

// Daftar kunci izin beserta label-nya (dipakai API & halaman Users).
const PERMISSIONS = {
  devices_add: "Tambah device baru",
  devices_edit: "Edit device (nama/webhook)",
  devices_delete: "Hapus device",
  devices_redial: "Redial device",
  rules_manage: "Kelola rule auto-reply (buat/ubah/hapus)",
  jobs_manage: "Kelola antrean (batal/retry job)",
};

// Default saat RolePermission belum dikonfigurasi — mengikuti perilaku lama:
// admin penuh, agent hanya lihat/QR.
const DEFAULTS = {
  super_admin: null, // super_admin selalu punya semua izin
  admin: {
    devices_add: true,
    devices_edit: true,
    devices_delete: true,
    devices_redial: true,
    rules_manage: true,
    jobs_manage: true,
  },
  agent: {
    devices_add: false,
    devices_edit: false,
    devices_delete: false,
    devices_redial: false,
    rules_manage: false,
    jobs_manage: false,
  },
};

function defaultsFor(role) {
  if (role === "super_admin") return { role, ...Object.fromEntries(Object.keys(PERMISSIONS).map((k) => [k, true])) };
  return { role, ...(DEFAULTS[role] || {}) };
}

// Baris konfigurasi sebuah role (dibuat dengan nilai default bila belum ada).
async function getRoleConfig(role) {
  if (!LEVELS[role]) throw httpError("Role tidak dikenal", 400);
  const [row, created] = await RolePermission.findOrCreate({
    where: { role },
    defaults: rolesDefaultsRow(role),
  });
  return created ? cleanRow(row) : { role, ...Object.fromEntries(Object.keys(PERMISSIONS).map((k) => [k, Boolean(row[k])])) };
}

function rolesDefaultsRow(role) {
  if (role === "super_admin") return defaultsFor(role);
  return Object.fromEntries(Object.entries(DEFAULTS[role]).map(([k, v]) => [k, v]));
}

function cleanRow(row) {
  return { role: row.role, ...Object.fromEntries(Object.keys(PERMISSIONS).map((k) => [k, Boolean(row[k])])) };
}

// Apakah user boleh melakukan aksi ini? super_admin selalu boleh;
// role lain mengikuti baris RolePermission (fallback ke default).
async function can(user, action) {
  if (!user?.role) return false;
  if (user.role === "super_admin") return true;
  if (!(action in PERMISSIONS)) return false;
  const config = await getRoleConfig(user.role);
  return Boolean(config[action]);
}

// Middleware: gagal 403 bila user tidak punya izin setelah pengecekan role kasar di route.
function requirePermission(action) {
  return async (req, res, next) => {
    try {
      if (await can(req.user, action)) return next();
      res.status(403).json({ error: true, message: "Akses ditolak (izin tidak diberikan)" });
    } catch (err) {
      next(err);
    }
  };
}

// Aturan hierarki: pengurus hanya boleh mengatur role dengan level DI BAWAH levelnya.
function canManageRole(actorRole, targetRole) {
  if (!LEVELS[actorRole] || !LEVELS[targetRole]) return false;
  return LEVELS[actorRole] < LEVELS[targetRole];
}

module.exports = { PERMISSIONS, LEVELS, DEFAULTS, defaultsFor, rolesDefaultsRow, getRoleConfig, cleanRow, can, requirePermission, canManageRole };
