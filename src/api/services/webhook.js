const crypto = require("crypto");
const config = require("../../config/config");
const logger = require("./logger");

// Tanda tangan HMAC-SHA256 dari body mentah, format "sha256=<hex>"
const sign = (secret, body) => `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;

// Webhook keluar (opsional) untuk aplikasi lain. Payload:
//   { event: "messages" | "connection", device_id, device_name, timestamp, data: {...} }
// instance_key (kredensial API) TIDAK disertakan, kecuali WEBHOOK_INCLUDE_KEY=true.
// Bila WEBHOOK_SECRET diisi, header "X-Signature: sha256=<hmac body>" ikut dikirim.
function notify(event, device, data) {
  const { url, events, secret, includeKey } = config.webhook;
  if (!url) return;
  if (!events.includes("all") && !events.includes(event)) return;

  const payload = { event, device_id: device.id, device_name: device.name, timestamp: Date.now(), data };
  if (includeKey) payload.key = device.instance_key;
  const body = JSON.stringify(payload);

  const headers = { "Content-Type": "application/json" };
  if (secret) headers["X-Signature"] = sign(secret, body);

  fetch(url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(5000),
  }).catch((err) => logger.warn({ err: err.message, event }, "Webhook gagal terkirim"));
}

module.exports = { notify, sign };
