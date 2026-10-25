const { AutoReplyRule } = require("../models");
const config = require("../../config/config");
const logger = require("./logger");
const { sendAndStore } = require("./messageService");

const COOLDOWN_MS = 5000; // cegah balas-balasan cepat dengan bot lain
const WINDOW_MS = 60 * 1000;

const lastReplyAt = new Map(); // chat.id -> timestamp
const deviceWindow = new Map(); // device.id -> { count, resetAt }

// Bersihkan entri kedaluwarsa agar Map tidak membesar selamanya
function prune(now = Date.now()) {
  for (const [id, t] of lastReplyAt) if (now - t > COOLDOWN_MS) lastReplyAt.delete(id);
  for (const [id, w] of deviceWindow) if (w.resetAt <= now) deviceWindow.delete(id);
}
setInterval(prune, WINDOW_MS).unref();

// Batas balasan otomatis per device per menit (AUTOREPLY_MAX_PER_MINUTE) — melindungi nomor dari
// pola kirim massal yang memicu pemblokiran WhatsApp.
function underDeviceLimit(deviceId, now) {
  const max = config.autoReply.maxPerMinute;
  if (!max) return true;

  let w = deviceWindow.get(deviceId);
  if (!w || w.resetAt <= now) {
    w = { count: 0, resetAt: now + WINDOW_MS };
    deviceWindow.set(deviceId, w);
  }
  if (w.count >= max) {
    if (w.count === max) logger.warn({ device: deviceId, max }, "Batas auto-reply per menit tercapai, balasan ditahan");
    w.count++; // supaya peringatan hanya tercatat sekali per jendela
    return false;
  }
  w.count++;
  return true;
}

function matches(rule, text) {
  const keyword = rule.keyword.trim().toLowerCase();
  if (keyword === "*") return true;
  if (rule.match_type === "exact") return text === keyword;
  if (rule.match_type === "starts_with") return text.startsWith(keyword);
  return text.includes(keyword);
}

// Cari rule yang cocok untuk pesan masuk dan kirim balasan otomatis.
async function reply({ device, instance, chat, text }) {
  if (!text || chat.is_group) return;

  const now = Date.now();
  if (now - (lastReplyAt.get(chat.id) || 0) < COOLDOWN_MS) return;

  const rules = await AutoReplyRule.findAll({
    where: { device_id: device.id, is_active: true },
    order: [
      ["priority", "DESC"],
      ["createdAt", "ASC"],
    ],
  });
  const normalized = text.trim().toLowerCase();
  const rule = rules.find((r) => matches(r, normalized));
  if (!rule) return;

  if (!underDeviceLimit(device.id, now)) return;

  lastReplyAt.set(chat.id, now);
  try {
    await sendAndStore({
      device,
      instance,
      to: chat.wa_jid,
      send: (inst, jid) => inst.sendText(jid, rule.reply_text),
      preview: { type: "text", body: rule.reply_text },
      isAutoReply: true,
    });
  } catch (err) {
    logger.warn({ err: err.message, chat: chat.id }, "Auto-reply gagal dikirim");
  }
}

module.exports = { reply, matches, prune, _state: { lastReplyAt, deviceWindow } };
