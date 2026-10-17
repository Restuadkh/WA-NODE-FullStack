const config = require("../../config/config");

// Ubah input (nomor / jid) menjadi jid WhatsApp.
//   "08123456789"        -> "628123456789@s.whatsapp.net"  (kode negara default)
//   "+62 812-3456-789"   -> "628123456789@s.whatsapp.net"
//   "xxx@g.us" / "...@lid" / "...@s.whatsapp.net" -> dikembalikan apa adanya
function toJid(input) {
  const raw = String(input ?? "").trim();
  if (!raw) throw Object.assign(new Error("Tujuan pesan kosong"), { statusCode: 400 });
  if (raw.includes("@")) return raw;

  let digits = raw.replace(/\D/g, "");
  const cc = config.whatsapp.defaultCountryCode;
  if (cc && digits.startsWith("0")) digits = cc + digits.slice(1);
  if (digits.length < 8) {
    throw Object.assign(new Error("Nomor tujuan tidak valid"), { statusCode: 400 });
  }
  return `${digits}@s.whatsapp.net`;
}

// Apakah input berupa nomor telepon biasa (perlu dicek terdaftar di WhatsApp)
const isPhoneNumber = (input) => !String(input ?? "").includes("@");

const phoneFromJid = (jid) => String(jid || "").split("@")[0].split(":")[0];

module.exports = { toJid, isPhoneNumber, phoneFromJid };
