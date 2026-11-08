const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const config = require("../../config/config");
const { User } = require("../models");
const roleAccess = require("../services/roleAccess");

// Hash palsu agar waktu respons sama baik user ada maupun tidak
const DUMMY_HASH = bcrypt.hashSync("tidak-dipakai", 10);

async function login(req, res) {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!email || !password) {
    return res.status(400).json({ error: true, message: "Email dan password wajib diisi" });
  }

  const user = await User.findOne({ where: { email } });
  const valid = await bcrypt.compare(password, user?.password || DUMMY_HASH);
  if (!user || !valid) {
    return res.status(401).json({ error: true, message: "Email atau password salah" });
  }

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, config.jwt.secret, {
    algorithm: "HS256",
    expiresIn: config.jwt.expiresIn,
  });

  const permissions = await roleAccess.getRoleConfig(user.role);
  const userData = { id: user.id, name: user.name, email: user.email, role: user.role, permissions };

  res.json({
    error: false,
    token,
    user: userData,
  });
}

module.exports = { login };
