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
  contacts_import: "Import & kelola kontak (CSV/JSON)",
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
    contacts_import: true,
  },
  agent: {
    devices_add: false,
    devices_edit: false,
    devices_delete: false,
    devices_redial: false,
    rules_manage: false,
    jobs_manage: false,
    contacts_import: true,
  },
};

function defaultsFor(role) {
  if (role === "super_admin") return { role, ...Object.fromEntries(Object.keys(PERMISSIONS).map((k) => [k, true])) };
  return { role, ...(DEFAULTS[role] || {}) };
}

// Baris konfigurasi sebuah role (dibuat dengan nilai default bila belum ada).
// super_admin SELALU akses penuh — barisnya tidak pernah dibaca dari DB, sehingga
// kolom izin baru (mis. contacts_import) tidak membuat super admin kehilangan izin.
async function getRoleConfig(role) {
  if (!LEVELS[role]) throw httpError("Role tidak dikenal", 400);
  if (role === "super_admin") return defaultsFor(role);
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

// Resolusi izin untuk SATU user: override user menimpa rule role-nya.
// -> { role, permissions: {key: bool}, overrides: {key: true|false|null} }
async function resolveForUser(user) {
  const role = user?.role || "agent";
  const base = await getRoleConfig(role);
  const { UserPermission } = require("../models");
  const row = role === "super_admin" ? null : await UserPermission.findByPk(user.id);
  const overrides = {};
  const permissions = {};
  for (const key of Object.keys(PERMISSIONS)) {
    const o = row ? row[key] : null;
    overrides[key] = o === null || o === undefined ? null : Boolean(o);
    permissions[key] = overrides[key] !== null ? overrides[key] : base[key];
  }
  return { role, permissions, overrides };
}

// Apakah user boleh melakukan aksi ini? Urutan: super_admin (selalu) > override user > rule role.
async function can(user, action) {
  if (!user?.role) return false;
  if (user.role === "super_admin") return true;
  if (!(action in PERMISSIONS)) return false;
  const { UserPermission } = require("../models");
  const row = await UserPermission.findByPk(user.id);
  if (row && row[action] !== null && row[action] !== undefined) return Boolean(row[action]);
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

module.exports = { PERMISSIONS, LEVELS, DEFAULTS, defaultsFor, rolesDefaultsRow, getRoleConfig, cleanRow, can, resolveForUser, requirePermission, canManageRole };
