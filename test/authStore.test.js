// Regresi: penghapusan sesi WhatsApp harus idempoten dan tidak melempar EPERM
// saat Windows/Defender sesekali menahan file app-state-sync-key.
const os = require("os");
const fs = require("fs");
const path = require("path");

const authDir = fs.mkdtempSync(path.join(os.tmpdir(), "wa-authstore-"));
Object.assign(process.env, {
  DOTENV_CONFIG_PATH: path.join(authDir, "tidak-ada.env"),
  NODE_ENV: "test",
  AUTH_STORE: "file",
  AUTH_DIR: authDir,
  LOG_LEVEL: "silent",
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadAuthState, removeAuthState, listStoredKeys } = require("../src/api/whatsapp/authStore");

test("removeAuthState aman dipanggil dua kali dan untuk folder yang sudah hilang", async () => {
  const key = "idempoten";
  const dir = path.join(authDir, key);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "creds.json"), "{}");

  const results = await Promise.all([removeAuthState(key), removeAuthState(key), removeAuthState(key)]);
  assert.deepEqual(results, [true, true, true]);
  assert.equal(fs.existsSync(dir), false);

  // Tidak boleh melempar walaupun folder sudah tidak ada.
  assert.equal(await removeAuthState(key), true);

  // Setelah logout, start() harus mendapat state baru (belum terdaftar) agar QR bisa dibuat.
  const { state } = await loadAuthState(key);
  assert.equal(state.creds.registered, false);
});

test("marker logout mencegah kredensial lama dipakai lagi", async () => {
  const key = "terkunci";
  const dir = path.join(authDir, key);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ".logged-out"), "2026-11-22");
  fs.writeFileSync(path.join(dir, "creds.json"), '{"lama":true}');

  const { state } = await loadAuthState(key);
  assert.ok(state?.creds, "state baru harus dibuat");
  assert.equal(state.creds.lama, undefined, "kredensial lama tidak boleh dipakai");
  assert.equal(fs.existsSync(path.join(dir, ".logged-out")), false);
  assert.ok(
    fs.readdirSync(authDir, { withFileTypes: true }).some((d) => d.isDirectory() && d.name.startsWith(`${key}--`)),
    "sesi baru dibuat di folder terpisah",
  );
});

test("listStoredKeys melewati folder yang ditandai logout", () => {
  const key = "logout";
  const dir = path.join(authDir, key);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ".logged-out"), "2026-11-22");
  assert.equal(listStoredKeys().includes(key), false);
});
