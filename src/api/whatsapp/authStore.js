const fs = require("fs");
const path = require("path");
const { useMultiFileAuthState } = require("@whiskeysockets/baileys");
const config = require("../../config/config");

// Nama aman untuk folder/baris sesi (mencegah path traversal pada key)
const safeName = (key) => String(key).replace(/[^\w-]/g, "_");
const authDirFor = (key) => path.join(config.whatsapp.authDir, safeName(key));

// Mengembalikan { state, saveCreds } sesuai AUTH_STORE (file | mysql)
async function loadAuthState(key) {
  if (config.whatsapp.authStore === "mysql") {
    return require("./mysqlAuthState")(key);
  }
  return useMultiFileAuthState(authDirFor(key));
}

async function removeAuthState(key) {
  if (config.whatsapp.authStore === "mysql") {
    const sequelize = require("../../config/database");
    await sequelize
      // sanitasi harus sama dengan mysqlAuthState.js
      .query("DELETE FROM `Session` WHERE session_key = :k", {
        replacements: { k: String(key).replace(/[^a-zA-Z0-9_]/g, "_") },
      })
      .catch(() => {});
    return;
  }
  await fs.promises.rm(authDirFor(key), { recursive: true, force: true });
}

// Daftar sesi lama (folder di AUTH_DIR) untuk diadopsi menjadi Device
function listStoredKeys() {
  if (config.whatsapp.authStore !== "file") return [];
  try {
    return fs
      .readdirSync(config.whatsapp.authDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

module.exports = { loadAuthState, removeAuthState, listStoredKeys };
