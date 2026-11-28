const { Op } = require("sequelize");
const { ContactName, Chat, Device } = require("../models");
const { assertDeviceAccess } = require("../services/deviceAccess");
const { phoneFromJid, normalizePhoneDigits } = require("../whatsapp/jid");

function serializeContact(c, chatByJid) {
  const row = c.toJSON();
  const phone = row.from_jid ? phoneFromJid(row.from_jid) : null;
  const chat = (row.from_jid && chatByJid.get(row.from_jid)) || (row.lid_user && chatByJid.get(row.lid_user)) || null;
  return {
    id: row.id,
    device_id: row.device_id,
    from_jid: row.from_jid,
    phone: phone || (row.from_jid ? String(row.from_jid).split("@")[0] : null),
    lid: row.lid_user || null,
    notify: row.notify || null,
    chat_id: chat?.id || null,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

async function listContacts(req, res) {
  await assertDeviceAccess(req.user, req.params.deviceId);
  const deviceId = req.params.deviceId;
  const q = String(req.query.q || "").trim().toLowerCase();
  const rows = await ContactName.findAll({
    where: { device_id: deviceId },
    order: [["updatedAt", "DESC"]],
    limit: 1000,
  });
  const jids = [];
  for (const r of rows) {
    if (r.from_jid) jids.push(r.from_jid);
    if (r.lid_user) jids.push(r.lid_user);
  }
  const chats = jids.length
    ? await Chat.findAll({ where: { device_id: deviceId, wa_jid: { [Op.in]: [...new Set(jids)] } }, attributes: ["id", "wa_jid"] })
    : [];
  const chatByJid = new Map(chats.map((c) => [c.wa_jid, c]));
  let data = rows.map((c) => serializeContact(c, chatByJid));
  if (q) {
    data = data.filter((c) => `${c.notify || ""} ${c.phone || ""} ${c.lid || ""}`.toLowerCase().includes(q));
  }
  res.json({ error: false, data });
}

async function openContactChat(req, res) {
  const device = await Device.findByPk(req.params.deviceId);
  if (!device) return res.status(404).json({ error: true, message: "Device tidak ditemukan" });
  await assertDeviceAccess(req.user, device.id);

  const contact = await ContactName.findOne({ where: { id: req.params.contactId, device_id: device.id } });
  if (!contact) return res.status(404).json({ error: true, message: "Kontak tidak ditemukan" });

  const rawJid = contact.from_jid || (contact.lid_user ? contact.lid_user : null);
  if (!rawJid) return res.status(400).json({ error: true, message: "Kontak tidak memiliki nomor/LID" });

  // Prefer nomor @s.whatsapp.net untuk chat kanonik.
  const phone = contact.from_jid ? normalizePhoneDigits(phoneFromJid(contact.from_jid)) : null;
  const waJid = phone ? `${phone}@s.whatsapp.net` : rawJid;

  let chat = await Chat.findOne({ where: { device_id: device.id, wa_jid: waJid } });
  if (!chat && contact.lid_user) {
    chat = await Chat.findOne({ where: { device_id: device.id, wa_jid: contact.lid_user } });
  }
  if (!chat) {
    chat = await Chat.create({
      device_id: device.id,
      wa_jid: waJid,
      contact_name: contact.notify || null,
      is_group: false,
    });
  } else if (contact.notify && chat.contact_name !== contact.notify) {
    await chat.update({ contact_name: contact.notify }).catch(() => {});
  }

  res.json({ error: false, data: { chat_id: chat.id, wa_jid: chat.wa_jid } });
}

module.exports = { listContacts, openContactChat };
