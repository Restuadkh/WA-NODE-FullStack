const bcrypt = require("bcryptjs");
const { User } = require("../models");
const httpError = require("../services/httpError");

const ROLES = ["admin", "agent"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    created_at: user.createdAt,
  };
}

// GET /api/users (admin)
async function listUsers(req, res) {
  const users = await User.findAll({ order: [["createdAt", "ASC"]] });
  res.json({ error: false, data: users.map(serializeUser) });
}

// POST /api/users (admin)  { name, email, password, role }
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
  res.status(201).json({ error: false, data: serializeUser(user) });
}

// PUT /api/users/:id (admin)  { name?, role?, password? }
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
    // Jangan biarkan admin terakhir kehilangan perannya (dashboard terkunci).
    if (user.role === "admin" && body.role !== "admin") {
      const admins = await User.count({ where: { role: "admin" } });
      if (admins <= 1) throw httpError("Minimal satu admin harus tersisa", 409);
    }
    patch.role = body.role;
  }
  if (body.password !== undefined) {
    const password = String(body.password || "");
    if (password && password.length < 8) throw httpError("Password minimal 8 karakter", 400);
    if (password) patch.password = await bcrypt.hash(password, 10);
  }

  await user.update(patch);
  res.json({ error: false, data: serializeUser(user) });
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
  await user.destroy();
  res.json({ error: false, message: "User dihapus" });
}

module.exports = { listUsers, createUser, updateUser, deleteUser };
