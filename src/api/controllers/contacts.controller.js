const { Op } = require("sequelize");
const { ContactName, Chat, Device } = require("../models");
const { assertDeviceAccess } = require("../services/deviceAccess");
const { phoneFromJid, normalizePhoneDigits } = require("../whatsapp/jid");
const { upsertContact } = require("../services/numberService");
const cache = require("../services/cache");

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

function decodeVcfValue(val) {
  return String(val || "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function parseVcf(text) {
  const unfolded = String(text || "")
    .replace(/\r\n[ \t]/g, "")
    .replace(/\n[ \t]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const cards = [];
  let cur = null;
  for (const line of unfolded.split("\n")) {
    if (/^BEGIN:VCARD/i.test(line)) {
      cur = [];
      continue;
    }
    if (/^END:VCARD/i.test(line)) {
      if (cur) cards.push(cur);
      cur = null;
      continue;
    }
    if (cur) cur.push(line);
  }

  const out = [];
  for (const lines of cards) {
    let fn = "";
    let nName = "";
    const phones = [];
    for (const line of lines) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const rawKey = line.slice(0, idx).toUpperCase();
      const base = rawKey.split(";")[0].split(".").pop();
      const val = decodeVcfValue(line.slice(idx + 1));
      if (base === "FN" && !fn) fn = val;
      if (base === "N" && !nName) {
        const parts = val.split(";"); // Family;Given;Additional;Prefix;Suffix
        nName = [parts[1], parts[0]].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      }
      if (base === "TEL") {
        const waid = rawKey.match(/WAID=(\d+)/i)?.[1];
        const digits = normalizePhoneDigits(waid || val);
        if (digits) phones.push(digits);
      }
    }
    const name = fn || nName || null;
    for (const phone of [...new Set(phones)]) out.push({ name, phone });
  }
  return out;
}

async function importContacts(req, res) {
  await assertDeviceAccess(req.user, req.params.deviceId);
  const device = await Device.findByPk(req.params.deviceId);
  if (!device) return res.status(404).json({ error: true, message: "Device tidak ditemukan" });
  if (!req.file?.buffer?.length) return res.status(400).json({ error: true, message: "File VCF wajib diupload (field: file)" });

  const text = req.file.buffer.toString("utf8");
  const entries = parseVcf(text);
  if (!entries.length) return res.status(400).json({ error: true, message: "Tidak ada kontak valid di file VCF" });

  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const e of entries) {
    const phone = normalizePhoneDigits(e.phone);
    if (!phone) {
      skipped += 1;
      continue;
    }
    const jid = `${phone}@s.whatsapp.net`;
    const existing = await ContactName.findOne({
      where: { device_id: device.id, [Op.or]: [{ from_jid: jid }, { from_jid: { [Op.like]: `%${phone}%` } }] },
      order: [["updatedAt", "DESC"]],
    });
    const beforeNotify = existing?.notify || null;
    await upsertContact(device, { jid, notify: e.name || null });
    const after = await ContactName.findOne({
      where: { device_id: device.id, [Op.or]: [{ from_jid: jid }, { from_jid: { [Op.like]: `%${phone}%` } }] },
      order: [["updatedAt", "DESC"]],
    });
    if (!existing && after) created += 1;
    else if (existing && (beforeNotify !== (after?.notify || null) || existing.from_jid !== after?.from_jid)) updated += 1;
    else updated += 0; // no-op but processed
  }

  cache.invalidate(`chats:${device.id}`);
  return res.json({
    error: false,
    data: {
      total: entries.length,
      created,
      updated,
      processed: entries.length - skipped,
      skipped,
    },
  });
}

module.exports = { listContacts, openContactChat, importContacts };
