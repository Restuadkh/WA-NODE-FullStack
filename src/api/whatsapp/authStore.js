const fs = require("fs");
const path = require("path");
const { useMultiFileAuthState } = require("@whiskeysockets/baileys");
const config = require("../../config/config");
const logger = require("../services/logger");

// Nama aman untuk folder/baris sesi (mencegah path traversal pada key)
const safeName = (key) => String(key).replace(/[^\w-]/g, "_");
const authRoot = config.whatsapp.authDir;
const authDirFor = (key) => path.join(authRoot, safeName(key));

const LOGOUT_MARKER = ".logged-out";
const DIR_POINTER = ".session-dir";
const RETRIABLE = new Set(["EPERM", "EBUSY", "ENOTEMPTY", "EACCES"]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const exists = (p) => fs.promises.access(p).then(() => true, () => false);

// Beberapa proses/event bisa menghapus folder yang sama bersamaan (logout() dan
// connection.update 401). Kunci ini membuat penghapusan bersifat serial & idempoten.
const pendingRemovals = new Map();

async function pointerPath(base) {
  return path.join(base, DIR_POINTER);
}

async function currentDir(base) {
  try {
    const target = (await fs.promises.readFile(await pointerPath(base), "utf8")).trim();
    if (target && !path.isAbsolute(target)) {
      const resolved = path.resolve(authRoot, target);
      if (resolved.startsWith(authRoot + path.sep) && (await exists(resolved))) return resolved;
    }
  } catch {
    // pointer tidak ada = pakai folder utama
  }
  return base;
}

async function purge(dir) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fs.promises.rm(dir, { recursive: true, force: true });
      return true;
    } catch (err) {
      if (!RETRIABLE.has(err.code)) {
        logger.warn({ err: err.message, dir }, "Gagal menghapus folder sesi WhatsApp");
        return false;
      }
      // Windows/Defender kadang menahan file app-state-sync-key beberapa ratus ms.
      await sleep(100 * (attempt + 1));
    }
  }
  return false;
}

async function markLoggedOut(base) {
  try {
    await fs.promises.mkdir(base, { recursive: true });
    await fs.promises.writeFile(path.join(base, LOGOUT_MARKER), new Date().toISOString());
  } catch (err) {
    logger.warn({ err: err.message, base }, "Gagal menulis penanda logout sesi");
  }
}

async function resetToFreshDir(base) {
  const fresh = path.join(authRoot, `${path.basename(base)}--${Date.now()}`);
  await fs.promises.mkdir(base, { recursive: true });
  await fs.promises.unlink(path.join(base, LOGOUT_MARKER)).catch(() => {});
  await fs.promises.writeFile(await pointerPath(base), path.relative(authRoot, fresh));
  return fresh;
}

// Mengembalikan { state, saveCreds } dari folder AUTH_DIR (file).
async function loadAuthState(key) {
  const base = authDirFor(key);
  const marker = path.join(base, LOGOUT_MARKER);

  // Logout gagal menghapus folder (EPERM). Jangan pakai kredensial lama:
  // pindahkan sesi ke folder baru dan tandai folder lama agar tidak diadopsi ulang.
  if (await exists(marker)) {
    await fs.promises.unlink(marker).catch(() => {});
    await removeAuthState(key);
    // removeAuthState bisa menulis ulang marker bila folder tetap terkunci.
    // Buang lagi sebelum memakai folder baru agar tidak loop reset.
    await fs.promises.unlink(marker).catch(() => {});
    return useMultiFileAuthState(await resetToFreshDir(base));
  }

  return useMultiFileAuthState(await currentDir(base));
}

// Tidak pernah melempar error: kegagalan menghapus file sesi tidak boleh
// menggagalkan penanganan connection.update sampai proses berhenti/recover.
async function removeAuthState(key) {
  const base = authDirFor(key);
  const previous = pendingRemovals.get(base) || Promise.resolve();
  let settled;
  const task = previous.catch(() => {}).then(async () => {
    const dir = await currentDir(base);

    if (await exists(dir)) {
      const removed = await purge(dir);
      if (!removed) {
        const backup = `${dir}.removed-${Date.now()}`;
        try {
          await fs.promises.rename(dir, backup);
          logger.info({ dir, backup }, "Folder sesi dipindahkan karena terkunci");
        } catch (err) {
          logger.warn({ err: err.message, dir }, "Folder sesi terkunci; kredensial dinonaktifkan dengan marker");
          await markLoggedOut(base);
        }
      }
    }

    if (dir !== base) await fs.promises.unlink(await pointerPath(base)).catch(() => {});
    await fs.promises.unlink(path.join(base, LOGOUT_MARKER)).catch(() => {});
    return true;
  });

  settled = task.finally(() => {
    if (pendingRemovals.get(base) === settled) pendingRemovals.delete(base);
  });
  pendingRemovals.set(base, settled);
  return settled.catch(() => true);
}

// Daftar sesi lama (folder di AUTH_DIR) untuk diadopsi menjadi Device.
// Folder ber-marker logout sengaja dilewati agar tidak reconnect memakai kredensial lama.
function listStoredKeys() {
  try {
    return fs
      .readdirSync(authRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .filter((d) => !existsSyncMarker(path.join(authRoot, d.name)))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

function existsSyncMarker(dir) {
  try {
    return fs.existsSync(path.join(dir, LOGOUT_MARKER));
  } catch {
    return false;
  }
}

module.exports = { loadAuthState, removeAuthState, listStoredKeys };
