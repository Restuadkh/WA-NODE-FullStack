const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const config = require("../../config/config");
const logger = require("./logger");

// Penyimpanan file media WhatsApp (gambar, video, stiker, audio/voice note, dokumen).
// File ditulis ke MEDIA_DIR/<device_id>/<nama-acak>.<ext>; database hanya menyimpan metadata
// dan URL bertanda tangan HMAC sehingga media tidak bisa diakses tanpa tanda tangan yang valid.

const MIME_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "text/plain": "txt",
};

const FALLBACK_EXT = {
  image: "jpg",
  video: "mp4",
  audio: "ogg",
  sticker: "webp",
  document: "bin",
};

const safeName = (name) =>
  String(name || "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^[._]+/, "")
    .slice(0, 180);

const baseMime = (mimetype) => String(mimetype || "").split(";")[0].trim().toLowerCase();

function extensionFor({ mimetype, filename, type }) {
  const byMime = MIME_EXT[baseMime(mimetype)];
  if (byMime) return byMime;
  const fromName = path.extname(String(filename || "")).replace(/^\./, "").toLowerCase();
  if (fromName && /^[a-z0-9]{1,8}$/.test(fromName)) return fromName;
  return FALLBACK_EXT[type] || "bin";
}

const deviceDir = (deviceId) => path.join(config.media.dir, safeName(deviceId));

const secret = () => {
  const s = config.media.tokenSecret;
  if (!s) throw new Error("MEDIA_TOKEN_SECRET/JWT_SECRET kosong — URL media tidak bisa ditandatangani");
  return s;
};

// URL media punya masa berlaku (MEDIA_URL_EXPIRY_HOURS, default 7 hari): token HMAC
// mencakup waktu kedaluwarsa sehingga URL lama otomatis mati setelah lewat.
function signature(deviceId, filename, exp) {
  return crypto
    .createHmac("sha256", secret())
    .update(`${deviceId}/${filename}/${exp}`)
    .digest("hex")
    .slice(0, 40);
}

function expiryAt() {
  return Date.now() + (config.media.urlExpiryMs || 7 * 24 * 60 * 60 * 1000);
}

function verify(deviceId, filename, token, exp) {
  const expires = Number(exp);
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  const expected = signature(deviceId, filename, expires);
  const given = String(token || "");
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

function publicUrl(deviceId, filename) {
  const exp = expiryAt();
  return `/media/${encodeURIComponent(deviceId)}/${encodeURIComponent(filename)}?e=${exp}&t=${signature(deviceId, filename, exp)}`;
}

// Perbarui tanda tangan URL media dari DB (URL lama bisa sudah kedaluwarsa).
// Return URL segar atau null bila tidak bisa diparse.
function refreshUrl(stored) {
  try {
    if (!stored) return null;
    const path = String(stored).split("?")[0];
    // URL format: /media/deviceId/filename -> split: ['', 'media', 'deviceId', 'filename']
    const parts = path.split("/").map((s) => decodeURIComponent(s));
    if (parts.length < 4 || parts[1] !== "media") return null;
    const deviceId = parts[2];
    const filename = parts[3];
    if (!deviceId || !filename) return null;
    return publicUrl(deviceId, filename);
  } catch {
    return null;
  }
}

// Terima array/objek Message Sequelize -> salin data + media_url segar.
function refreshUrls(rows) {
  const list = Array.isArray(rows) ? rows.map((r) => r.toJSON()) : null;
  if (!list) return rows;
  for (const row of list) {
    if (row.media_url) row.media_url = refreshUrl(row.media_url);
  }
  return list;
}

// Simpan buffer media. Mengembalikan metadata siap disimpan ke kolom media_*.
async function save({ deviceId, messageId, buffer, mimetype, filename, type }) {
  if (!buffer?.length) throw new Error("Buffer media kosong");

  const dir = deviceDir(deviceId);
  await fs.promises.mkdir(dir, { recursive: true });

  const ext = extensionFor({ mimetype, filename, type });
  const diskName = `${safeName(messageId) || crypto.randomUUID()}.${ext}`;
  const fullPath = path.join(dir, diskName);
  await fs.promises.writeFile(fullPath, buffer);

  const displayName = safeName(filename) || diskName;
  return {
    url: publicUrl(safeName(deviceId), diskName),
    mimetype: baseMime(mimetype) || null,
    filename: displayName,
    size: buffer.length,
    // Nama file di disk (dipakai internal antrean untuk membaca/menghapus file sementara).
    disk_name: diskName,
  };
}

// Hapus satu file media (dipakai antrean setelah pesan terkirim/dibatalkan).
async function remove(deviceId, filename) {
  const file = resolve(deviceId, filename);
  if (!file) return false;
  try {
    await fs.promises.unlink(file);
    return true;
  } catch (err) {
    logger.warn({ err: err.message, deviceId, filename }, "Gagal menghapus file media");
    return false;
  }
}

// Path absolut file bila ada dan masih berada di dalam folder device (anti path traversal).
function resolve(deviceId, filename) {
  const dir = path.resolve(deviceDir(deviceId));
  const target = path.resolve(dir, path.basename(String(filename || "")));
  if (target !== dir && !target.startsWith(dir + path.sep)) return null;
  return fs.existsSync(target) ? target : null;
}

async function removeDeviceMedia(deviceId) {
  try {
    await fs.promises.rm(deviceDir(deviceId), { recursive: true, force: true });
  } catch (err) {
    logger.warn({ err: err.message, deviceId }, "Gagal menghapus folder media device");
  }
}

module.exports = {
  save,
  remove,
  resolve,
  verify,
  publicUrl,
  refreshUrl,
  refreshUrls,
  removeDeviceMedia,
  signature,
  extensionFor,
  baseMime,
};
