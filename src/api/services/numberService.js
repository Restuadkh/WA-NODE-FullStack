/**
 * Pemetaan JID nomor <-> LID WhatsApp dan nama kontak.
 * Mendukung remoteJid / remoteJidAlt / participant / participantAlt.
 */
const { ContactName } = require("../models");

// Ambil identitas pertama (urut prioritas) yang berakhiran suffix tertentu
function pickJid(key, suffix) {
  if (!key) return null;
  const { remoteJid, remoteJidAlt, participant, participantAlt } = key;
  const candidates = [remoteJidAlt, remoteJid, participantAlt, participant];
  return candidates.find((jid) => typeof jid === "string" && jid.endsWith(suffix)) || null;
}

// Nomor WhatsApp asli (62812...@s.whatsapp.net)
const getWhatsappJid = (key) => pickJid(key, "@s.whatsapp.net");

// LID (2454...@lid)
const getWhatsappLid = (key) => pickJid(key, "@lid");

function getWhatsappName(message) {
  if (!message) return null;
  const { pushName, verifiedBizName } = message;
  return [pushName, verifiedBizName].find((n) => typeof n === "string" && n.length > 0) || null;
}

// Simpan / perbarui nama kontak. Satu baris per (device, lid): tidak menumpuk tiap pesan masuk.
async function storeNumberName(jid, lid, name, device) {
  if (!jid || !lid || !name) return;

  const where = { device_id: device.id, lid_user: lid };
  const existing = await ContactName.findOne({ where });
  if (existing) {
    const patch = {};
    if (existing.notify !== name) patch.notify = name;
    if (existing.from_jid !== jid) patch.from_jid = jid;
    if (Object.keys(patch).length) await existing.update(patch);
    return;
  }

  try {
    await ContactName.create({ ...where, from_jid: jid, notify: name });
  } catch (err) {
    // Dua pesan dari kontak yang sama bisa tiba bersamaan: yang kalah balapan cukup diabaikan
    if (err.name !== "SequelizeUniqueConstraintError") throw err;
  }
}

module.exports = { getWhatsappJid, getWhatsappLid, getWhatsappName, storeNumberName };
