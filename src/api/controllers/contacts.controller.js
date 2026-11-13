const { Op } = require("sequelize");
const { ContactName, Chat } = require("../models");
const { assertDeviceAccess } = require("../services/deviceAccess");
const httpError = require("../services/httpError");
const { extractContacts, toContactJid } = require("../services/contactImport");
const { phoneFromJid } = require("../whatsapp/jid");

// Daftar kontak satu device: dibaca dari tabel "numbers" (ContactName) yang menyimpan
// pasangan nomor (from_jid) <-> LID (lid_user) <-> nama kontak (notify).
// Baris ini diisi otomatis saat pesan masuk (numberService) maupun lewat import manual.
// ?q= untuk mencari nomor/nama/lid.
async function listContacts(req, res) {
  await assertDeviceAccess(req.user, req.params.deviceId);
  const where = { device_id: req.params.deviceId };
  const q = String(req.query.q || "").trim();
  if (q) {
    where[Op.or] = [
      { from_jid: { [Op.like]: `%${q}%` } },
      { lid_user: { [Op.like]: `%${q}%` } },
      { notify: { [Op.like]: `%${q}%` } },
    ];
  }
  const rows = await ContactName.findAll({
    where,
    attributes: ["id", "from_jid", "lid_user", "notify", "createdAt"],
    order: [["notify", "ASC"]],
    limit: 2000,
  });
  // Kontak tanpa nama ditaruh paling bawah (urutan CASE di SQL tidak perlu — cukup di sini).
  rows.sort((a, b) => {
    const an = (a.notify || "").trim();
    const bn = (b.notify || "").trim();
    if (!an && bn) return 1;
    if (an && !bn) return -1;
    return an.localeCompare(bn);
  });
  // Tanggal pesan terakhir per nomor (dari tabel chats), kalau ada.
  const jids = rows.map((r) => r.from_jid).filter(Boolean);
  const chats = jids.length
    ? await Chat.findAll({
        where: { device_id: req.params.deviceId, wa_jid: { [Op.in]: jids } },
        attributes: ["wa_jid", "last_message_at"],
      })
    : [];
  const lastByJid = new Map(chats.map((c) => [c.wa_jid, c.last_message_at]));

  res.json({
    error: false,
    data: rows.map((r) => ({
      id: r.id,
      phone: r.from_jid ? phoneFromJid(r.from_jid) : null,
      name: r.notify,
      lid: r.lid_user,
      last_message_at: lastByJid.get(r.from_jid) || null,
      created_at: r.createdAt,
    })),
  });
}

// Normalisasi LID: "2454645..." atau "2454645...@lid" -> "2454645...@lid" (format sama seperti numberService).
function normalizeLid(lid) {
  const raw = String(lid || "").trim();
  if (!raw) return null;
  if (raw.endsWith("@lid")) return raw;
  const digits = raw.replace(/\D/g, "");
  return digits ? `${digits}@lid` : null;
}

// Import kontak: upload CSV (field "file") atau JSON { contacts: [{ phone, name, lid }] }.
// Semua disimpan ke tabel "numbers" (ContactName): nomor (from_jid), LID (lid_user), nama (notify).
// - Kontak dengan LID di-upsert per (device_id + lid_user) — key unik yang sama dipakai numberService.
// - Kontak tanpa LID di-upsert per (device_id + from_jid).
// Nomor tidak valid dilewati dan dilaporkan di respons.
async function importContacts(req, res) {
  await assertDeviceAccess(req.user, req.params.deviceId);
  const deviceId = req.params.deviceId;
  const contacts = extractContacts(req);
  if (contacts.length > 5000) throw httpError("Maksimal 5000 kontak per import", 400);

  let imported = 0;
  let updated = 0;
  const errors = [];
  const seen = new Set();

  for (const [i, c] of contacts.entries()) {
    let jid;
    try {
      jid = toContactJid(c.phone);
    } catch (e) {
      errors.push({ row: i + 1, phone: c.phone, message: e.message });
      continue;
    }
    if (seen.has(jid)) continue; // duplikat dalam file yang sama
    seen.add(jid);

    const name = String(c.name || "").trim() || null;
    const lid = normalizeLid(c.lid);
    const where = lid
      ? { device_id: deviceId, lid_user: lid }
      : { device_id: deviceId, from_jid: jid };
    const existing = await ContactName.findOne({ where });

    if (existing) {
      const patch = {};
      if (name && existing.notify !== name) patch.notify = name;
      if (existing.from_jid !== jid) patch.from_jid = jid;
      if (lid && existing.lid_user !== lid) patch.lid_user = lid;
      if (Object.keys(patch).length) {
        await existing.update(patch);
        updated++;
      }
    } else {
      try {
        await ContactName.create({ device_id: deviceId, from_jid: jid, lid_user: lid, notify: name });
        imported++;
      } catch (err) {
        // Dua baris identik bisa masuk bersamaan: yang kalah balapan cukup diabaikan.
        if (err.name !== "SequelizeUniqueConstraintError") throw err;
      }
    }
  }

  res.json({
    error: false,
    data: {
      total: contacts.length,
      imported,
      updated,
      duplicates_skipped: contacts.length - seen.size,
      errors,
    },
  });
}

// Buka chat untuk sebuah kontak (dipakai tombol "Pesan" di halaman Kontak):
// pastikan baris Chat untuk nomor kontaknya ada, lalu kembalikan chat_id-nya.
async function openContact(req, res) {
  await assertDeviceAccess(req.user, req.params.deviceId);
  const row = await ContactName.findOne({
    where: { id: req.params.id, device_id: req.params.deviceId },
  });
  if (!row) throw httpError("Kontak tidak ditemukan", 404);
  if (!row.from_jid) throw httpError("Kontak ini belum punya nomor", 400);

  const [chat] = await Chat.findOrCreate({
    where: { device_id: req.params.deviceId, wa_jid: row.from_jid },
    defaults: { contact_name: row.notify || null, is_group: false },
  });
  // Sinkronkan nama kontak bila berubah sejak chat dibuat.
  if (row.notify && chat.contact_name !== row.notify) await chat.update({ contact_name: row.notify });

  res.json({ error: false, data: { chat_id: chat.id, device_id: req.params.deviceId } });
}

// Hapus satu kontak dari tabel "numbers". Riwayat chat di tabel chats tidak ikut terhapus.
async function removeContact(req, res) {
  await assertDeviceAccess(req.user, req.params.deviceId);
  const row = await ContactName.findOne({ where: { id: req.params.id, device_id: req.params.deviceId } });
  if (!row) throw httpError("Kontak tidak ditemukan", 404);
  await row.destroy();
  res.json({ error: false, data: { deleted: req.params.id } });
}

module.exports = { listContacts, importContacts, openContact, removeContact };
