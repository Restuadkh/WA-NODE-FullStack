const { randomBytes } = require("crypto");

// UUIDv7: 48 bit waktu (ms) + counter 12 bit + acak. Format tetap UUID (kolom tidak berubah),
// tetapi urut sesuai waktu pembuatan. Dipakai sebagai tiebreaker karena timestamp WhatsApp dan
// DATETIME MySQL hanya presisi detik, sehingga beberapa pesan dalam satu detik punya createdAt sama.
let lastMs = 0;
let counter = 0;

function orderedUuid() {
  const now = Date.now();
  if (now > lastMs) {
    lastMs = now;
    counter = 0;
  } else if (++counter > 0xfff) {
    lastMs += 1; // lebih dari 4096 id dalam 1 ms: geser waktu agar tetap menaik
    counter = 0;
  }

  const time = lastMs.toString(16).padStart(12, "0");
  const tail = randomBytes(8);
  tail[0] = (tail[0] & 0x3f) | 0x80; // varian RFC 4122
  const rand = tail.toString("hex");

  return [
    time.slice(0, 8),
    time.slice(8),
    (0x7000 | counter).toString(16),
    rand.slice(0, 4),
    rand.slice(4),
  ].join("-");
}

module.exports = { orderedUuid };
