const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const { User, Device, DeviceAgent } = require("../models");

const httpError = require("../services/httpError");
const { allowedDeviceIds } = require("../services/deviceAccess");

const ROLES = ["super_admin", "admin", "agent"];
// Semua varian admin (super_admin + admin) dihitung sebagai admin untuk proteksi "admin terakhir".
const ADMIN_ROLES = ["super_admin", "admin"];

// Hierarki pembuatan akun: 1 super_admin > banyak admin > agent milik masing-masing admin.
// - super_admin boleh mengatur semua akun.
// - admin boleh mengatur: dirinya sendiri + akun yang DIA buat (harus ber-peran agent).
// - akun agent tidak punya akses ke route user sama sekali (dijaga route /users).
function assertCanManage(req, target, action) {
  if (req.user?.role === "super_admin") return; // super admin mengatur semua
  if (target.role !== "agent") {
    throw httpError(`Hanya super admin yang boleh ${action} akun admin`, 403);
  }
  const isMine = target.created_by === req.user?.id || target.id === req.user?.id;
  if (!isMine) {
    throw httpError(`Anda hanya bisa ${action} akun yang Anda buat sendiri`, 403);
  }
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Daftar user beserta device yang ditugaskan. instance_key tidak ikut.
function serializeUser(user, deviceIds) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    device_ids: deviceIds || [],
    created_by: user.created_by || null, // admin pembuat (untuk hierarki antar-admin)
    created_at: user.createdAt,
  };
}

// GET /api/users (admin)
// super_admin melihat semua; admin hanya melihat dirinya + agent yang ia buat.
async function listUsers(req, res) {
  const where =
    req.user?.role === "super_admin"
      ? {}
      : { [Op.or]: [{ id: req.user.id }, { created_by: req.user.id }] };
  const users = await User.findAll({ where, order: [["createdAt", "ASC"]] });
  const links = await DeviceAgent.findAll({ attributes: ["user_id", "device_id"] });
  const byUser = new Map();
  for (const link of links) {
    if (!byUser.has(link.user_id)) byUser.set(link.user_id, []);
    byUser.get(link.user_id).push(link.device_id);
  }
  res.json({ error: false, data: users.map((u) => serializeUser(u, byUser.get(u.id) || [])) });
}

// POST /api/users (admin)  { name, email, password, role, device_ids? }
async function createUser(req, res) {
  const body = req.body || {};
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const role = ROLES.includes(body.role) ? body.role : "agent";

  if (!name) throw httpError("Nama wajib diisi", 400);
  if (!EMAIL_RE.test(email)) throw httpError("Email tidak valid", 400);
  if (password.length < 8) throw httpError("Password minimal 8 karakter", 400);

  // Membuat akun admin/super_admin hanya boleh oleh super_admin.
  if (role !== "agent" && req.user?.role !== "super_admin") {
    throw httpError("Hanya super admin yang boleh membuat akun admin", 403);
  }
  if (role === "super_admin" && req.user?.role !== "super_admin") {
    throw httpError("Hanya super admin yang boleh membuat super admin", 403);
  }

  const exists = await User.findOne({ where: { email } });
  if (exists) throw httpError("Email sudah dipakai", 409);

  const user = await User.create({
    name,
    email,
    role,
    password: await bcrypt.hash(password, 10),
    // Hierarki: catat pembuat akun (1 super_admin > admin > agent milik admin tsb).
    created_by: req.user?.id || null,
  });
  const deviceIds = body.device_ids !== undefined ? await assignDevices(user, body.device_ids, req.user) : [];
  res.status(201).json({ error: false, data: serializeUser(user, deviceIds) });
}

// PUT /api/users/:id (admin)  { name?, role?, password?, device_ids? }
async function updateUser(req, res) {
  const user = await User.findByPk(req.params.id);
  if (!user) throw httpError("User tidak ditemukan", 404);
  // Hierarki: akun admin hanya dipacu super_admin; selain itu hanya akun yang dia buat sendiri.
  assertCanManage(req, user, "mengedit");
  const body = req.body || {};
  const patch = {};

  if (body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) throw httpError("Nama wajib diisi", 400);
    patch.name = name;
  }
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) throw httpError("role harus super_admin, admin, atau agent", 400);
    // Role admin/super_admin hanya boleh diatur super_admin.
    if (req.user?.role !== "super_admin" && ADMIN_ROLES.includes(body.role)) {
      throw httpError("Hanya super admin yang boleh menetapkan role admin", 403);
    }
    // Super admin hanya bisa diatur oleh super_admin.
    if (req.user?.role !== "super_admin" && user.role === "super_admin") {
      throw httpError("Hanya super admin yang boleh mengatur akun super admin", 403);
    }
    patch.role = body.role;
  }
  if (body.password !== undefined) {
    const password = String(body.password || "");
    if (password && password.length < 8) throw httpError("Password minimal 8 karakter", 400);
    if (password) patch.password = await bcrypt.hash(password, 10);
  }
  // Jangan biarkan admin terakhir kehilangan perannya (dashboard terkunci).
  if (patch.role && ADMIN_ROLES.includes(user.role) && !ADMIN_ROLES.includes(patch.role)) {
    const admins = await User.count({ where: { role: ADMIN_ROLES } });
    if (admins <= 1) throw httpError("Minimal satu admin harus tersisa", 409);
  }

  await user.update(patch);

  let deviceIds;
  if (body.device_ids !== undefined) deviceIds = await assignDevices(user, body.device_ids, req.user);

  res.json({ error: false, data: serializeUser(user, deviceIds) });
}

// DELETE /api/users/:id (admin)
async function deleteUser(req, res) {
  const user = await User.findByPk(req.params.id);
  if (!user) throw httpError("User tidak ditemukan", 404);
  // Hierarki: hanya super_admin yang boleh menghapus akun lain di luar agen miliknya
  // (admin terakhir tetap terlindungi).
  assertCanManage(req, user, "menghapus");
  if (user.id === req.user.id) throw httpError("Tidak bisa menghapus akun sendiri", 409);
  if (ADMIN_ROLES.includes(user.role)) {
    const admins = await User.count({ where: { role: ADMIN_ROLES } });
    if (admins <= 1) throw httpError("Minimal satu admin harus tersisa", 409);
  }
  await DeviceAgent.destroy({ where: { user_id: user.id } });
  await user.destroy();
  res.json({ error: false, message: "User dihapus" });
}

// Ganti penugasan device seorang user. Hanya super_admin yang punya akses penuh;
// admin & agent mengakses device lewat penugasan ini (masing-masing punya device sendiri).
// PENTING: penugasan oleh admin biasa tidak boleh menyertakan device yang bukan miliknya —
// kalau tidak, admin yang dibatasi bisa "memberi" dirinya device admin lain (bypass ACL).
async function assignDevices(user, deviceIds, owner) {
  if (!Array.isArray(deviceIds)) throw httpError("device_ids harus berupa array ID device", 400);
  const unique = [...new Set(deviceIds.map(String))];
  if (unique.length) {
    const found = await Device.findAll({ where: { id: { [Op.in]: unique } }, attributes: ["id"] });
    const foundIds = new Set(found.map((d) => d.id));
    const invalid = unique.filter((id) => !foundIds.has(id));
    if (invalid.length) throw httpError(`Device tidak ditemukan: ${invalid.join(", ")}`, 400);

    // Pemanggil bukan super_admin hanya bisa menugaskan device yang dia miliki sendiri.
    if (owner?.role !== "super_admin") {
      const allowed = (await allowedDeviceIds(owner)) || [];
      const forbidden = unique.filter((id) => !allowed.includes(id));
      if (forbidden.length) {
        throw httpError("Anda hanya bisa menugaskan device yang ditugaskan/dibuat oleh Anda", 403);
      }
    }
  }
  await DeviceAgent.destroy({ where: { user_id: user.id } });
  if (unique.length) {
    await DeviceAgent.bulkCreate(unique.map((device_id) => ({ user_id: user.id, device_id })));
  }
  return unique;
}

module.exports = { listUsers, createUser, updateUser, deleteUser };
