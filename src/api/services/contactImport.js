// Parser daftar kontak dari CSV (dipisah koma/titik-koma/tab), JSON, atau VCF (vCard).
// Format CSV fleksibel: dengan/tanpa header, kolom nomor bisa "0812...", "+62...", "62812...".
//   phone,name  /  nomor,nama  /  wa,nama kontak  /  satu kolom nomor saja
// VCF: satu kontak per kartu BEGIN:VCARD..END:VCARD; satu TEL = satu kontak.
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

// Parser vCard (VCF) sederhana: FN/N untuk nama, TEL untuk nomor (satu TEL = satu kontak).
// Mendukung vCard 2.1/3.0/4.0 yang lazim: param TEL;TYPE=..., escape \, \; \n, dan baris
// berlanjut (baris dimulai spasi = lanjutan baris sebelumnya). Photo/URL/ADR diabaikan.
function unescapeVcard(value) {
  return String(value || "")
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function unfoldVcfLines(text) {
  const out = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && out.length) {
      out[out.length - 1] += raw.slice(1); // baris "folded" (lanjutan)
    } else out.push(raw);
  }
  return out;
}

function parseVcf(text) {
  const out = [];
  let card = null;
  for (const line of unfoldVcfLines(text)) {
    const trimmed = line.trim();
    if (/^BEGIN:VCARD$/i.test(trimmed)) {
      card = { name: "", tels: [] };
      continue;
    }
    if (!card) continue;
    if (/^END:VCARD$/i.test(trimmed)) {
      for (const tel of card.tels) out.push({ phone: tel, name: card.name });
      card = null;
      continue;
    }
    const sep = trimmed.indexOf(":");
    if (sep === -1) continue;
    const prop = trimmed.slice(0, sep).toUpperCase();
    const value = unescapeVcard(trimmed.slice(sep + 1));
    if (!value) continue;
    if (prop === "FN") {
      card.name = value;
    } else if (prop === "N") {
      // N:Doe;John;;; — pakai sebagai nama bila FN tidak ada
      if (!card.name) card.name = value.split(";").filter(Boolean).reverse().join(" ");
    } else if (prop.startsWith("TEL")) {
      // TEL;TYPE=CELL,VOICE:+62812... / TEL:+62812...
      let tel = value.replace(/[\s()-]/g, "");
      // Prefix internasional "00..." (mis. 0062812...) -> buang nol depan agar jadi 62812...
      if (tel.startsWith("00")) tel = tel.replace(/^0+/, "");
      if (tel && !card.tels.includes(tel)) card.tels.push(tel);
    }
  }
  return out;
}

// Terima file upload (CSV/VCF) atau array JSON [{ phone, name }] / [["0812..", "Budi"]].
function extractContacts(req) {
  const name = `${req.file?.originalname || ""}`;
  const mime = `${req.file?.mimetype || ""}`.toLowerCase();
  if (req.file) {
    if (/\.vcf$|vcard/i.test(`${name} ${mime}`)) {
      return parseVcf(req.file.buffer.toString("utf8"));
    }
    if (!/\.csv$|text\/csv|text\/plain/i.test(`${name} ${mime}`)) {
      throw httpError("File harus .csv atau .vcf (Excel: simpan sebagai CSV UTF-8)", 400);
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

module.exports = { parseCsv, rowsToContacts, parseVcf, extractContacts, toContactJid };
