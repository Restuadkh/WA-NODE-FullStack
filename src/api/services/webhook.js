const config = require("../../config/config");
const logger = require("./logger");

// Webhook keluar (opsional) untuk aplikasi lain. Payload:
//   { event: "messages" | "connection", key: "<instance_key>", data: {...} }
function notify(event, key, data) {
  const { url, events } = config.webhook;
  if (!url) return;
  if (!events.includes("all") && !events.includes(event)) return;

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, key, data }),
    signal: AbortSignal.timeout(5000),
  }).catch((err) => logger.warn({ err: err.message, event }, "Webhook gagal terkirim"));
}

module.exports = { notify };
