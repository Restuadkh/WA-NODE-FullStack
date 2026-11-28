const { Op } = require("sequelize");
const { Chat, ContactName } = require("../models");
const { phoneFromJid, normalizePhoneDigits } = require("../whatsapp/jid");

// Resolusi nomor kanonik untuk JID chat. Grup tidak digabung.
async function resolvePhone(deviceId, waJid) {
  if (!waJid || String(waJid).endsWith("@g.us")) return null;
  if (String(waJid).endsWith("@s.whatsapp.net")) return normalizePhoneDigits(phoneFromJid(waJid)) || null;
  if (String(waJid).endsWith("@lid")) {
    const row = await ContactName.findOne({
      where: { device_id: deviceId, lid_user: waJid, from_jid: { [Op.ne]: null } },
      attributes: ["from_jid"],
    });
    if (row?.from_jid) return normalizePhoneDigits(phoneFromJid(row.from_jid)) || null;
    return null;
  }
  return normalizePhoneDigits(phoneFromJid(waJid)) || null;
}

// Kembalikan semua chat id yang merujuk nomor yang sama (termasuk chatId sendiri).
async function relatedChatIds(chat) {
  if (!chat?.device_id || !chat?.wa_jid) return [chat?.id].filter(Boolean);
  if (String(chat.wa_jid).endsWith("@g.us")) return [chat.id];

  const phone = await resolvePhone(chat.device_id, chat.wa_jid);
  const or = [{ id: chat.id }, { wa_jid: chat.wa_jid }];

  if (phone) {
    or.push({ wa_jid: `${phone}@s.whatsapp.net` });
    const mapped = await ContactName.findAll({
      where: {
        device_id: chat.device_id,
        [Op.or]: [{ from_jid: `${phone}@s.whatsapp.net` }, { from_jid: { [Op.like]: `%${phone}%` } }],
      },
      attributes: ["lid_user", "from_jid"],
    });
    for (const n of mapped) {
      if (n.lid_user) or.push({ wa_jid: n.lid_user });
      if (n.from_jid) or.push({ wa_jid: n.from_jid });
    }
  } else if (String(chat.wa_jid).endsWith("@lid")) {
    // LID belum punya mapping nomor: jangan gabung sembarang.
    return [chat.id];
  }

  const rows = await Chat.findAll({
    where: { device_id: chat.device_id, [Op.or]: or },
    attributes: ["id", "wa_jid"],
  });
  const ids = [...new Set(rows.map((r) => r.id).filter(Boolean))];
  return ids.length ? ids : [chat.id];
}

module.exports = { resolvePhone, relatedChatIds };
