const crypto = require("crypto");
const config = require("../../config/config");
const logger = require("./logger");

// Tanda tangan HMAC-SHA256 dari body mentah, format "sha256=<hex>"
const sign = (secret, body) => `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;

/**
 * Webhook keluar (opsional) untuk aplikasi lain.
 *
 * Tujuan (urutan prioritas):
 *   1. device.webhook_url  -> webhook khusus device (menerima semua event)
 *   2. WEBHOOK_URL global  -> fallback; disaring oleh WEBHOOK_ALLOWED_EVENTS
 *
 * Secret signature: device.webhook_secret, lalu WEBHOOK_SECRET.
 *
 * Payload standar:
 *   {
 *     id, version, event: "messages" | "message.update" | "connection",
 *     device_id, device_name, timestamp, data: {...}
 *   }
 * instance_key (kredensial API) TIDAK disertakan, kecuali WEBHOOK_INCLUDE_KEY=true.
 *
 * Pengiriman fire-and-forget dengan timeout singkat; kegagalan hanya dicatat di log
 * (tidak ada retry otomatis). Lihat WebHook.md untuk format lengkap dan cara verifikasi.
 */
function notify(event, device, data) {
  const deviceUrl = String(device?.webhook_url || "").trim();
  const url = deviceUrl || config.webhook.url;
  if (!url) return;

  // WEBHOOK_ALLOWED_EVENTS hanya membatasi webhook global (fallback), bukan webhook per device.
  if (!deviceUrl && !config.webhook.events.includes("all") && !config.webhook.events.includes(event)) {
    return;
  }

  const secret = device?.webhook_secret || config.webhook.secret;
  const id = crypto.randomUUID();
  const payload = {
    id,
    version: "1.0",
    event,
    device_id: device.id,
    device_name: device.name,
    timestamp: Date.now(),
    data,
  };
  if (config.webhook.includeKey) payload.key = device.instance_key;

  const body = JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "WA-Dashboard-Webhook/1.0",
    "X-Webhook-Event": event,
    "X-Webhook-Id": id,
  };
  if (secret) headers["X-Signature"] = sign(secret, body);
  console.debug({ url, event, device_id: device.id, body, headers }, "Mengirim webhook");
  fetch(url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(config.webhook.timeoutMs),
  })
  .then((res) => {
    if (!res.ok) {
      logger.warn({ status: res.status, event }, "Webhook ditolak penerima");
      return;
    }
    logger.info({ event, status: res.status }, `Webhook terkirim`);
  })
  .catch((err) => logger.warn({ err: err.message, event }, "Webhook gagal terkirim"));
}

module.exports = { notify, sign };
