const config = require("../../config/config");
const logger = require("./logger");

// Gambar placeholder dipakai HANYA bila sharp tidak terpasang. Baileys tetap perlu
// jpegThumbnail agar tidak memanggil extractImageThumb()-nya sendiri (sharp/libvips).
const FALLBACK_THUMBNAIL = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9EKKKKAP/2Q==",
  "base64",
);

const httpError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

let sharpModule;
let sharpMissingLogged = false;

function loadSharp() {
  if (sharpModule !== undefined) return sharpModule;
  try {
    sharpModule = require("sharp");
  } catch (err) {
    sharpModule = null;
    if (!sharpMissingLogged) {
      sharpMissingLogged = true;
      logger.warn(
        { err: err.message },
        "sharp tidak terpasang; thumbnail gambar keluar memakai placeholder dan Baileys tidak akan memproses gambar",
      );
    }
  }
  return sharpModule;
}

function jpegSize(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let off = 2;
  while (off + 9 < b.length) {
    if (b[off] !== 0xff) {
      off += 1;
      continue;
    }
    while (b[off] === 0xff) off += 1;
    const marker = b[off++];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xda || marker === 0xd9) break;
    const len = b.readUInt16BE(off);
    if (len < 2 || off + len > b.length) break;
    const sof = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf];
    if (sof.includes(marker)) {
      return { width: b.readUInt16BE(off + 5), height: b.readUInt16BE(off + 3) };
    }
    off += len;
  }
  return null;
}

// Baca dimensi tanpa decode (dipakai saat sharp tidak tersedia).
function parseImageSize(b) {
  if (!Buffer.isBuffer(b) || b.length < 16) return null;

  if (b[0] === 0xff && b[1] === 0xd8) return jpegSize(b);

  if (b.toString("hex", 0, 8) === "89504e470d0a1a0a") {
    if (b.toString("ascii", 12, 16) !== "IHDR") return null;
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }

  if (b.toString("ascii", 0, 6).startsWith("GIF8")) {
    return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  }

  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const chunk = b.toString("ascii", 12, 16);
    if (chunk === "VP8X" && b.length >= 30) {
      return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    }
    if (chunk === "VP8 " && b.length >= 30) {
      return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === "VP8L" && b.length >= 25) {
      const b1 = b[21], b2 = b[22], b3 = b[23], b4 = b[24];
      return {
        width: 1 + (((b2 & 0x3f) << 8) | b1),
        height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
      };
    }
  }

  return null;
}

function detectMime(b) {
  if (!Buffer.isBuffer(b) || b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.toString("hex", 0, 8) === "89504e470d0a1a0a") return "image/png";
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (b.toString("ascii", 0, 6).startsWith("GIF8")) return "image/gif";
  if (b.toString("ascii", 0, 2) === "II" || b.toString("ascii", 0, 2) === "MM") return "image/tiff";
  if (b.toString("ascii", 4, 8) === "ftyp") return "image/heic";
  return null;
}

/**
 * Siapkan gambar keluar sebelum masuk Baileys.
 *
 * Baileys selalu membuat thumbnail dengan sharp/libvips bila `jpegThumbnail` tidak
 * disediakan. Gambar rusak / resolusi ekstrem bisa membuat native library itu
 * menghabiskan memori besar atau crash. Di sini kita:
 *   1. menolak file yang bukan gambar (magic bytes),
 *   2. membatasi piksel & dimensi, mengecilkan bila perlu,
 *   3. membuat thumbnail sendiri sehingga Baileys TIDAK menyentuh decoder gambar,
 *   4. memutakhirkan objek `file` agar salinan di disk/memori sama dengan yang dikirim.
 */
async function prepareOutgoingImage(file) {
  if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) {
    throw httpError("File gambar kosong/tidak terbaca");
  }

  const detected = detectMime(file.buffer);
  if (!detected) {
    throw httpError("File bukan gambar yang dikenali (JPEG, PNG, WebP, GIF, TIFF, atau HEIC)");
  }

  let mimetype = String(file.mimetype || "").split(";")[0].trim().toLowerCase();
  if (!mimetype.startsWith("image/")) mimetype = detected;
  file.mimetype = mimetype;

  const { maxPixels, maxDimension, resizeMax, quality, thumbnailSize } = config.media.outgoingImage;
  const sharp = loadSharp();
  let size = parseImageSize(file.buffer);

  if (sharp) {
    const options = { failOn: "error", limitInputPixels: maxPixels, sequentialRead: true };
    try {
      // Jangan pakai clone() setelah metadata(): sharp mengonsumsi input dan clone
      // berikutnya bisa menerima data terpotong (vipspng: libpng read error).
      const metadata = await sharp(file.buffer, options).metadata();
      size = {
        width: metadata.width || size?.width,
        height: metadata.height || size?.height,
      };
      if (!size.width || !size.height) throw httpError("Dimensi gambar tidak terbaca");

      const pixels = size.width * size.height;
      const needsResize =
        size.width > maxDimension ||
        size.height > maxDimension ||
        size.width > resizeMax ||
        size.height > resizeMax ||
        pixels > maxPixels;
      // Format selain JPEG/PNG/WebP diubah ke JPEG agar WhatsApp lebih kompatibel.
      const needsConvert = !["image/jpeg", "image/png", "image/webp"].includes(mimetype);

      if (needsResize || needsConvert) {
        const scale = Math.min(
          1,
          maxDimension / size.width,
          maxDimension / size.height,
          Math.sqrt(maxPixels / pixels),
          resizeMax / Math.max(size.width, size.height),
        );
        if (needsResize) {
          size = {
            width: Math.max(1, Math.round(size.width * scale)),
            height: Math.max(1, Math.round(size.height * scale)),
          };
        }
        file.buffer = await sharp(file.buffer, options)
          .rotate()
          .resize(size.width, size.height, { fit: "fill" })
          .flatten({ background: "#ffffff" })
          .jpeg({ quality })
          .toBuffer();
        file.mimetype = "image/jpeg";
        mimetype = "image/jpeg";
      }

      // Thumbnail ini mencegah generateThumbnail() Baileys mem-decode ulang gambar asli.
      file.jpegThumbnail = await sharp(file.buffer, options)
        .rotate()
        .resize(thumbnailSize, thumbnailSize, { fit: "inside" })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 50 })
        .toBuffer();
    } catch (err) {
      if (err.statusCode) throw err;
      if (/pixel limit/i.test(err.message)) {
        throw httpError(`Resolusi gambar terlalu besar (maksimal ${Math.round(maxPixels / 1_000_000)} megapiksel)`);
      }
      logger.warn({ err, mimetype }, "Gagal menyiapkan gambar keluar");
      throw httpError(`Gambar tidak dapat diproses: ${err.message}`);
    }
  } else {
    size = size || {};
    if (!size.width || !size.height) throw httpError("Dimensi gambar tidak terbaca (sharp tidak tersedia)");
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimetype)) {
      throw httpError(`Format ${mimetype} memerlukan sharp untuk dikonversi`);
    }
    file.jpegThumbnail = FALLBACK_THUMBNAIL;
  }

  const width = Number(size.width) || Number(file.width) || null;
  const height = Number(size.height) || Number(file.height) || null;
  if (!width || !height || width > maxDimension || height > maxDimension || width * height > maxPixels) {
    throw httpError("Dimensi gambar melebihi batas yang diizinkan");
  }
  file.width = width;
  file.height = height;
  return file;
}

module.exports = { prepareOutgoingImage, parseImageSize, detectMime };
