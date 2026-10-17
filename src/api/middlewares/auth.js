const jwt = require("jsonwebtoken");
const config = require("../../config/config");

// Login dashboard: header "Authorization: Bearer <jwt>"
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ error: true, message: "Token tidak ditemukan" });
  }
  try {
    req.user = jwt.verify(header.slice(7), config.jwt.secret);
    next();
  } catch {
    res.status(401).json({ error: true, message: "Token tidak valid atau kedaluwarsa" });
  }
}

const requireRole =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user?.role)
      ? next()
      : res.status(403).json({ error: true, message: "Anda tidak punya akses untuk aksi ini" });

module.exports = { authMiddleware, requireRole };
