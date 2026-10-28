const config = require("../../config/config");

// Suffix jid WhatsApp yang dikenal. Selain ini string dengan "@" ditolak agar
// input aneh (mis. email) tidak dikirim ke jid yang tidak disengaja.
const JID_SUFFIXES = ["@s.whatsapp.net", "@g.us", "@lid", "@broadcast"];

// Ubah input (nomor / jid) menjadi jid WhatsApp.
//   "08123456789"        -> "628123456789@s.whatsapp.net"  (kode negara default)
//   "+62 812-3456-789"   -> "628123456789@s.whatsapp.net"
//   "xxx@g.us" / "...@lid" / "...@s.whatsapp.net" -> dikembalikan apa adanya
function toJid(input) {
  const raw = String(input ?? "").trim();
  if (!raw) throw Object.assign(new Error("Tujuan pesan kosong"), { statusCode: 400 });
  if (raw.includes("@")) {
    if (JID_SUFFIXES.some((suffix) => raw.endsWith(suffix))) return raw;
    throw Object.assign(
      new Error(`Jid tidak valid (harus berakhiran ${JID_SUFFIXES.join(", ")})`),
      { statusCode: 400 },
    );
  }

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
