const roleAccess = require("../services/roleAccess");
const httpError = require("../services/httpError");

const CANONICAL_KEYS = Object.keys(roleAccess.PERMISSIONS);

// Ambil hanya boolean yang dikenal (tolak kunci lain).
function permittedPatch(body) {
  const patch = {};
  const provided = [];
  for (const key of CANONICAL_KEYS) {
    if (body[key] !== undefined) {
      patch[key] = Boolean(body[key]);
      provided.push(key);
    }
  }
  return { patch, provided };
}

// GET /api/roles/permissions (admin & super_admin)
// -> matriks semua role + daftar izin + hierarki (siapa boleh mengatur siapa).
async function listPermissions(req, res) {
  const roles = ["super_admin", "admin", "agent"];
  const matrix = {
    super_admin: await roleAccess.getRoleConfig("super_admin"),
    admin: await roleAccess.getRoleConfig("admin"),
    agent: await roleAccess.getRoleConfig("agent"),
  };
  res.json({
    error: false,
    data: {
      permissions: roleAccess.PERMISSIONS,
      roles: roles.map((r) => ({ role: r, level: roleAccess.LEVELS[r] })),
      editable_by_me: roles.filter((r) => roleAccess.canManageRole(req.user?.role, r)),
      matrix,
    },
  });
}

// PUT /api/roles/permissions/:role  { devices_add?: bool, ... }
// Hierarki: super_admin mengatur admin & agent; admin hanya agent; role super_admin terkunci (selalu penuh).
async function updatePermissions(req, res) {
  const target = String(req.params.role || "");
  if (!roleAccess.LEVELS[target]) throw httpError("Role tidak dikenal", 400);
  if (target === "super_admin") {
    throw httpError("Izin super admin terkunci (selalu akses penuh)", 403);
  }
  if (!roleAccess.canManageRole(req.user?.role, target)) {
    throw httpError(`Role ${req.user?.role || "?"} tidak boleh mengatur role ${target}`, 403);
  }

  const { patch, provided } = permittedPatch(req.body || {});
  if (!provided.length) throw httpError("Tidak ada izin yang dikirim", 400);

  // findOrCreate bila baris role belum ada (RolePermission.create menerima nama kolom persis).
  const { RolePermission } = require("../models");
  const live = (await RolePermission.findOne({ where: { role: target } }))
    || (await RolePermission.create(roleAccess.rolesDefaultsRow(target)));
  await live.update(patch);

  const updated = await roleAccess.getRoleConfig(target);
  res.json({ error: false, data: updated });
}

// GET /api/roles/permissions/mine (semua user JWT) — dipakai frontend untuk refresh izin yang tersimpan.
async function myPermissions(req, res) {
  const config = await roleAccess.getRoleConfig(req.user.role);
  res.json({ error: false, data: config });
}

module.exports = { listPermissions, updatePermissions, myPermissions };
