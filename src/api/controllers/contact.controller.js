const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const config = require("../../config/config");

// Bersihkan karakter kontrol (termasuk newline tambahan) supaya satu baris JSONL tetap valid.
const stripControls = (value) =>
  Array.from(String(value ?? ""))
    .map((char) => (char.charCodeAt(0) > 31 && char.charCodeAt(0) !== 127 ? char : " "))
    .join("");

const clean = (value, max) =>
  stripControls(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(body = {}) {
  const fields = [];
  const name = clean(body.name, 100);
  const email = clean(body.email, 254).toLowerCase();
  const subject = clean(body.subject, 150);
  const message = stripControls(body.message)
    .trim()
    .slice(0, 2000);

  if (name.length < 2) fields.push("Nama minimal 2 karakter.");
  if (!EMAIL_RE.test(email)) fields.push("Alamat email tidak valid.");
  if (subject.length < 3) fields.push("Subjek minimal 3 karakter.");
  if (message.length < 10) fields.push("Pesan minimal 10 karakter.");
  return { fields, value: { name, email, subject, message } };
}

// Formulir publik: diterima tanpa login, dibatasi jumlah request, disimpan di luar folder publik.
// Tidak ada pengiriman email otomatis karena belum ada kredensial SMTP di proyek ini.
async function submit(req, res, next) {
  try {
    // Honeypot: field tersembunyi untuk bot. Manusia tidak mengisinya.
    if (req.body?.website) return res.status(400).json({ error: true, message: "Pengiriman ditolak." });

    const { fields, value } = validate(req.body);
    if (fields.length) {
      return res.status(400).json({ error: true, message: "Periksa kembali formulir Anda.", fields });
    }

    const id = crypto.randomUUID();
    const ipHash = crypto
      .createHmac("sha256", config.contact.hashSecret || "wa-dashboard-contact")
      .update(String(req.ip || ""))
      .digest("hex")
      .slice(0, 24);

    const record = {
      id,
      createdAt: new Date().toISOString(),
      ...value,
      ipHash,
    };

    await fs.mkdir(config.contact.dir, { recursive: true });
    await fs.appendFile(path.join(config.contact.dir, "messages.jsonl"), `${JSON.stringify(record)}\n`, "utf8");

    return res.status(201).json({
      ok: true,
      id,
      message: "Pesan tersimpan. Gunakan nomor referensi berikut untuk tindak lanjut.",
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { submit, validate };
