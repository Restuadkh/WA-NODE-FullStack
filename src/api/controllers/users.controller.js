const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const { User, Device, DeviceAgent } = require("../models");

const httpError = require("../services/httpError");

const ROLES = ["admin", "agent"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Daftar user beserta device yang ditugaskan. instance_key tidak ikut.
function serializeUser(user, deviceIds) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    device_ids: deviceIds || [],
    created_at: user.createdAt,
  };
}

// GET /api/users (admin)
async function listUsers(req, res) {
  const users = await User.findAll({ order: [["createdAt", "ASC"]] });
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

  const exists = await User.findOne({ where: { email } });
  if (exists) throw httpError("Email sudah dipakai", 409);

  const user = await User.create({ name, email, role, password: await bcrypt.hash(password, 10) });
  const deviceIds = body.device_ids !== undefined ? await assignDevices(user, body.device_ids) : [];
  res.status(201).json({ error: false, data: serializeUser(user, deviceIds) });
}

// PUT /api/users/:id (admin)  { name?, role?, password?, device_ids? }
async function updateUser(req, res) {
  const user = await User.findByPk(req.params.id);
  if (!user) throw httpError("User tidak ditemukan", 404);
  const body = req.body || {};
  const patch = {};

  if (body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) throw httpError("Nama wajib diisi", 400);
    patch.name = name;
  }
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) throw httpError("role harus admin atau agent", 400);
    patch.role = body.role;
  }
  if (body.password !== undefined) {
    const password = String(body.password || "");
    if (password && password.length < 8) throw httpError("Password minimal 8 karakter", 400);
    if (password) patch.password = await bcrypt.hash(password, 10);
  }
  // Jangan biarkan admin terakhir kehilangan perannya (dashboard terkunci).
  if (patch.role && user.role === "admin" && patch.role !== "admin") {
    const admins = await User.count({ where: { role: "admin" } });
    if (admins <= 1) throw httpError("Minimal satu admin harus tersisa", 409);
  }

  await user.update(patch);

  let deviceIds;
  if (body.device_ids !== undefined) deviceIds = await assignDevices(user, body.device_ids);

  res.json({ error: false, data: serializeUser(user, deviceIds) });
}

// DELETE /api/users/:id (admin)
async function deleteUser(req, res) {
  const user = await User.findByPk(req.params.id);
  if (!user) throw httpError("User tidak ditemukan", 404);
  if (user.id === req.user.id) throw httpError("Tidak bisa menghapus akun sendiri", 409);
  if (user.role === "admin") {
    const admins = await User.count({ where: { role: "admin" } });
    if (admins <= 1) throw httpError("Minimal satu admin harus tersisa", 409);
  }
  await DeviceAgent.destroy({ where: { user_id: user.id } });
  await user.destroy();
  res.json({ error: false, message: "User dihapus" });
}

// Ganti penugasan device seorang user. Admin tidak perlu penugasan (akses penuh),
// tapi tetap disimpan agar jika role turun menjadi agent penugasan sudah siap.
async function assignDevices(user, deviceIds) {
  if (!Array.isArray(deviceIds)) throw httpError("device_ids harus berupa array ID device", 400);
  const unique = [...new Set(deviceIds.map(String))];
  if (unique.length) {
    const found = await Device.findAll({ where: { id: { [Op.in]: unique } }, attributes: ["id"] });
    const foundIds = new Set(found.map((d) => d.id));
    const invalid = unique.filter((id) => !foundIds.has(id));
    if (invalid.length) throw httpError(`Device tidak ditemukan: ${invalid.join(", ")}`, 400);
  }
  await DeviceAgent.destroy({ where: { user_id: user.id } });
  if (unique.length) {
    await DeviceAgent.bulkCreate(unique.map((device_id) => ({ user_id: user.id, device_id })));
  }
  return unique;
}

module.exports = { listUsers, createUser, updateUser, deleteUser };
