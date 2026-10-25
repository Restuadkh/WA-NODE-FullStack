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

const secret = () => config.media.tokenSecret || "wa-media";

function signature(deviceId, filename) {
  return crypto.createHmac("sha256", secret()).update(`${deviceId}/${filename}`).digest("hex").slice(0, 40);
}

function verify(deviceId, filename, token) {
  const expected = signature(deviceId, filename);
  const given = String(token || "");
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

function publicUrl(deviceId, filename) {
  return `/media/${encodeURIComponent(deviceId)}/${encodeURIComponent(filename)}?t=${signature(deviceId, filename)}`;
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
  removeDeviceMedia,
  signature,
  extensionFor,
  baseMime,
};
