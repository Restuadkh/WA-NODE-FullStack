const crypto = require("crypto");
const config = require("../../config/config");
const { Device } = require("../models");
const manager = require("../whatsapp/manager");

const sameToken = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Autentikasi API kirim pesan untuk aplikasi lain: /api/message/*?key=<instance_key>
// Hasil: req.device, req.instance
async function gatewayAuth(req, res, next) {
  const { protect, token } = config.gatewayApi;
  if (protect) {
    const bearer = (req.headers.authorization || "").slice(7);
    if (!token || !bearer || !sameToken(bearer, token)) {
      return res.status(403).json({ error: true, message: "invalid bearer token supplied" });
    }
  }

  const key = req.query.key?.toString();
  if (!key) return res.status(403).json({ error: true, message: "no key query was present" });

  const device = await Device.findOne({ where: { instance_key: key } });
  if (!device) return res.status(403).json({ error: true, message: "invalid key supplied" });

  const instance = manager.get(key);
  if (!instance?.online) {
    return res.status(409).json({ error: true, message: "phone isn't connected" });
  }

  req.device = device;
  req.instance = instance;
  next();
}

module.exports = gatewayAuth;
