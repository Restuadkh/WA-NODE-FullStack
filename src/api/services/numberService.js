/**
 * Pemetaan & sinkron kontak WhatsApp per device.
 * Menyimpan: nomor (@s.whatsapp.net), LID (@lid), dan nama/notify.
 * Dedupe: nomor/LID yang sama tidak membuat baris baru; notify di-update bila berubah.
 */
const { Op } = require("sequelize");
const { ContactName, Chat } = require("../models");
const cache = require("./cache");
const { phoneFromJid } = require("../whatsapp/jid");

function pickJid(key, suffix) {
  if (!key) return null;
  const { remoteJid, remoteJidAlt, participant, participantAlt } = key;
  const candidates = [remoteJidAlt, remoteJid, participantAlt, participant];
  return candidates.find((jid) => typeof jid === "string" && jid.endsWith(suffix)) || null;
}

const getWhatsappJid = (key) => pickJid(key, "@s.whatsapp.net");
const getWhatsappLid = (key) => pickJid(key, "@lid");

function getWhatsappName(message) {
  if (!message) return null;
  const { pushName, verifiedBizName } = message;
  return [pushName, verifiedBizName].find((n) => typeof n === "string" && n.trim().length > 0) || null;
}

const clean = (v) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};

const digitsOfJid = (jid) => String(jid || "").split("@")[0].replace(/\D/g, "");

function sameDigits(a, b) {
  const da = digitsOfJid(a);
  const db = digitsOfJid(b);
  return !!da && da === db;
}

async function mergeInto(target, source) {
  if (!target || !source || target.id === source.id) return target;
  const patch = {};
  if (!target.from_jid && source.from_jid) patch.from_jid = source.from_jid;
  if (!target.lid_user && source.lid_user) patch.lid_user = source.lid_user;
  if (!target.notify && source.notify) patch.notify = source.notify;
  if (Object.keys(patch).length) await target.update(patch);
  await source.destroy().catch(() => {});
  return target;
}

async function upsertContact(device, { jid, lid, notify }) {
  const deviceId = device?.id;
  if (!deviceId) return null;
  const fromJid = clean(jid);
  const lidUser = clean(lid);
  const name = clean(notify);
  if (!fromJid && !lidUser) return null;

  const cacheKey = `num:${deviceId}:${lidUser || ""}:${fromJid || ""}:${name || ""}`;
  if (cache.get(cacheKey)) return null;

  const or = [];
  if (fromJid) or.push({ from_jid: fromJid });
  if (lidUser) or.push({ lid_user: lidUser });
  const rows = or.length
    ? await ContactName.findAll({ where: { device_id: deviceId, [Op.or]: or }, order: [["updatedAt", "DESC"]] })
    : [];

  let row = rows[0] || null;
  for (let i = 1; i < rows.length; i++) row = await mergeInto(row, rows[i]);

  if (!row && fromJid) {
    // Fallback: kadang LID berubah/berbeda bentuk; cocokkan berdasarkan nomor yang sama.
    const candidates = await ContactName.findAll({
      where: { device_id: deviceId, from_jid: { [Op.ne]: null } },
      limit: 200,
      order: [["updatedAt", "DESC"]],
    });
    const same = candidates.find((c) => sameDigits(c.from_jid, fromJid));
    if (same) row = same;
  }

  if (row) {
    const patch = {};
    if (fromJid && row.from_jid !== fromJid) patch.from_jid = fromJid;
    if (lidUser && row.lid_user !== lidUser) patch.lid_user = lidUser;
    if (name && row.notify !== name) patch.notify = name;
    if (Object.keys(patch).length) await row.update(patch);
  } else {
    try {
      row = await ContactName.create({ device_id: deviceId, from_jid: fromJid, lid_user: lidUser, notify: name });
    } catch (err) {
      if (err.name !== "SequelizeUniqueConstraintError") throw err;
      row = await ContactName.findOne({ where: { device_id: deviceId, ...(lidUser ? { lid_user: lidUser } : { from_jid: fromJid }) } });
      if (row) {
        const patch = {};
        if (fromJid && row.from_jid !== fromJid) patch.from_jid = fromJid;
        if (lidUser && row.lid_user !== lidUser) patch.lid_user = lidUser;
        if (name && row.notify !== name) patch.notify = name;
        if (Object.keys(patch).length) await row.update(patch);
      }
    }
  }

  // Sinkronkan nama ke chat agar tampil di inbox.
  if (row?.from_jid && row.notify) {
    await Chat.update(
      { contact_name: row.notify },
      { where: { device_id: deviceId, wa_jid: row.from_jid, is_group: false } },
    ).catch(() => {});
  }

  cache.set(cacheKey, true, 60_000);
  cache.invalidate(`chats:${deviceId}`);
  return row;
}

async function storeNumberName(jid, lid, name, device) {
  return upsertContact(device, { jid, lid, notify: name });
}

function contactFromBaileys(c) {
  const jid = c?.id?.endsWith?.("@s.whatsapp.net") ? c.id : c?.jid?.endsWith?.("@s.whatsapp.net") ? c.jid : null;
  const lid = c?.lid?.endsWith?.("@lid") ? c.lid : c?.id?.endsWith?.("@lid") ? c.id : null;
  const notify = clean(c?.notify || c?.name || c?.verifiedName || c?.pushName);
  return { jid, lid, notify };
}

async function syncContacts(device, contacts = []) {
  const list = Array.isArray(contacts) ? contacts : [];
  let saved = 0;
  for (const c of list) {
    const payload = contactFromBaileys(c);
    if (!payload.jid && !payload.lid) continue;
    const row = await upsertContact(device, payload);
    if (row) saved += 1;
  }
  return saved;
}

function jidPhone(jid) {
  const phone = phoneFromJid(jid);
  return phone || null;
}

module.exports = {
  getWhatsappJid,
  getWhatsappLid,
  getWhatsappName,
  storeNumberName,
  upsertContact,
  syncContacts,
  jidPhone,
};
