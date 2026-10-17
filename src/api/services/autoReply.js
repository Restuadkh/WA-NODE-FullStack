const { AutoReplyRule } = require("../models");
const logger = require("./logger");
const { sendAndStore } = require("./messageService");

const COOLDOWN_MS = 5000; // cegah balas-balasan cepat dengan bot lain
const lastReplyAt = new Map(); // chat.id -> timestamp

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

module.exports = { reply, matches };
