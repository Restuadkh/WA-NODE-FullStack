const crypto = require("crypto");
const config = require("../../config/config");
const logger = require("../services/logger");
const { Device } = require("../models");
const manager = require("../whatsapp/manager");

const sameToken = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

let warnedQueryKey = false;

// Autentikasi API kirim pesan untuk aplikasi lain: /api/message/*
//   Header  : X-Api-Key: <instance_key>      (disarankan)
//   Query   : ?key=<instance_key>            (lama; bisa dimatikan: GATEWAY_ALLOW_QUERY_KEY=false)
// Hasil: req.device, req.instance
//
// Opsi requireOnline=false dipakai endpoint antrean: pesan boleh dijadwalkan walau device
// sedang reconnect/offline; worker akan mengirim saat device online.
function gatewayAuth({ requireOnline = true } = {}) {
  return async function gatewayAuthMiddleware(req, res, next) {
    const { protect, token, allowQueryKey } = config.gatewayApi;
    if (protect) {
      const bearer = (req.headers.authorization || "").slice(7);
      if (!token || !bearer || !sameToken(bearer, token)) {
        return res.status(403).json({ error: true, message: "invalid bearer token supplied" });
      }
    }

    const headerKey = (req.get("x-api-key") || "").trim();
    const queryKey = allowQueryKey ? String(req.query.key ?? "").trim() : "";
    const key = headerKey || queryKey;

    if (!key) {
      const hint = allowQueryKey ? "header X-Api-Key or ?key=" : "header X-Api-Key";
      return res.status(403).json({ error: true, message: `no key supplied (${hint})` });
    }
    if (!headerKey && queryKey && !warnedQueryKey) {
      warnedQueryKey = true;
      logger.warn("API key dikirim lewat query string (?key=). Pindah ke header X-Api-Key agar key tidak tercatat di log.");
    }

    const device = await Device.findOne({ where: { instance_key: key } });
    if (!device) return res.status(403).json({ error: true, message: "invalid key supplied" });

    const instance = manager.get(key);
    if (requireOnline && !instance?.online) {
      return res.status(409).json({ error: true, message: "phone isn't connected" });
    }

    req.device = device;
    req.instance = instance || null;
    next();
  };
}

module.exports = gatewayAuth;
