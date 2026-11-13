// Parser daftar kontak dari CSV (dipisah koma/titik-koma/tab) atau JSON.
// Format CSV fleksibel: dengan/tanpa header, kolom nomor bisa "0812...", "+62...", "62812...".
//   phone,name  /  nomor,nama  /  wa,nama kontak  /  satu kolom nomor saja
// Excel: simpan sebagai "CSV UTF-8" lalu upload file .csv-nya.

const { toJid } = require("../whatsapp/jid");
const httpError = require("./httpError");

// Alias nama kolom yang dikenali di baris header CSV.
const PHONE_KEYS = ["phone", "nomor", "no", "number", "wa", "whatsapp", "msisdn", "telp", "telepon"];
const NAME_KEYS = ["name", "nama", "contact", "contact_name", "nama_kontak"];
const LID_KEYS = ["lid", "lid_user", "lids", "lid kontak"];

// Parser CSV sederhana: dukung kutip ganda ("a,b"), kutip dobel ("") , dan pemisah koma.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const src = String(text || "").replace(/^\uFEFF/, ""); // buang BOM Excel

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0].trim() !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.length > 1 || row[0].trim() !== "") rows.push(row);
  }
  return rows;
}

function findKey(header, aliases) {
  return header.findIndex((h) => aliases.includes(h.trim().toLowerCase()));
}

// Ubah baris CSV mentah -> [{ name, phone }]. Baris tanpa nomor dilewati.
function rowsToContacts(rows) {
  if (!rows.length) return [];
  const first = rows[0].map((c) => c.trim());
  // Baris pertama dianggap header bila kolom nomornya bukan angka (mis. "phone"/"nomor").
  const hasHeader = first.length > 0 && /\D/.test(first[0].replace(/[\s+.-]/g, ""));
  let phoneIdx = 0;
  let nameIdx = first.length > 1 ? 1 : -1;
  let lidIdx = -1;
  let start = 0;

  if (hasHeader) {
    const p = findKey(first, PHONE_KEYS);
    if (p !== -1) phoneIdx = p;
    const n = findKey(first, NAME_KEYS);
    if (n !== -1) nameIdx = n;
    const l = findKey(first, LID_KEYS);
    if (l !== -1) lidIdx = l;
    start = 1;
  }

  const out = [];
  for (let i = start; i < rows.length; i++) {
    const cells = rows[i];
    const phone = String(cells[phoneIdx] ?? "").trim();
    if (!phone) continue;
    out.push({
      phone,
      name: nameIdx >= 0 ? String(cells[nameIdx] ?? "").trim() : "",
      lid: lidIdx >= 0 ? String(cells[lidIdx] ?? "").trim() : "",
    });
  }
  return out;
}

// Terima file upload (CSV) atau array JSON [{ phone, name }] / [["0812..", "Budi"]].
function extractContacts(req) {
  if (req.file) {
    if (!/\.csv$|text\/csv|text\/plain/i.test(`${req.file.originalname} ${req.file.mimetype}`)) {
      throw httpError("File harus .csv (Excel: simpan sebagai CSV UTF-8)", 400);
    }
    return rowsToContacts(parseCsv(req.file.buffer.toString("utf8")));
  }

  const body = req.body?.contacts ?? req.body;
  if (!Array.isArray(body) || body.length === 0) {
    throw httpError("Kirim file CSV (field 'file') atau JSON { contacts: [{ phone, name }] }", 400);
  }
  return body
    .map((item) => {
      if (Array.isArray(item)) return { phone: item[0], name: item[1], lid: item[2] };
      return {
        phone: item.phone ?? item.nomor ?? item.number,
        name: item.name ?? item.nama ?? "",
        lid: item.lid ?? item.lid_user ?? "",
      };
    })
    .filter((c) => String(c.phone ?? "").trim() !== "");
}

// Normalisasi satu kontak: nomor -> jid WhatsApp. Melempar error bila nomor tidak valid.
function toContactJid(phone) {
  return toJid(phone);
}

module.exports = { parseCsv, rowsToContacts, extractContacts, toContactJid };
