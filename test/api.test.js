// Tes integrasi: API + DB SQLite in-memory + instance WhatsApp palsu (tanpa koneksi ke WhatsApp).
// Jalankan:  npm i --no-save sqlite3 && npm test
const os = require("os");
const fs = require("fs");
const path = require("path");

const authDir = fs.mkdtempSync(path.join(os.tmpdir(), "wa-auth-"));
Object.assign(process.env, {
  DOTENV_CONFIG_PATH: path.join(authDir, "tidak-ada.env"),
  NODE_ENV: "test",
  DB_DIALECT: "sqlite",
  DB_STORAGE: ":memory:",
  JWT_SECRET: "test-secret-test-secret-test-secret",
  WHATSAPP_ENABLED: "false",
  AUTH_DIR: authDir,
  WEBHOOK_URL: "",
  PROTECT_ROUTES: "false",
  LOG_LEVEL: "silent",
});

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const bcrypt = require("bcryptjs");

const sequelize = require("../src/config/database");
const { User, Device, Chat, Message } = require("../src/api/models");
const app = require("../src/app");
const { initRealtime } = require("../src/api/services/realtime");
const manager = require("../src/api/whatsapp/manager");
const { handleIncoming, handleStatusUpdates } = require("../src/api/services/messageHandler");
const { parseContent } = require("../src/api/services/messageService");
const { toJid } = require("../src/api/whatsapp/jid");
const { matches } = require("../src/api/services/autoReply");

let server;
let base;
let adminToken;
let agentToken;
let device;
let instance;
const sent = []; // pesan yang "dikirim" lewat WhatsApp palsu

const call = async (method, url, { token, body } = {}) => {
  const res = await fetch(base + url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const incoming = (text, over = {}) => ({
  key: { remoteJid: "628111111111@s.whatsapp.net", fromMe: false, id: `ID${Math.random()}` },
  pushName: "Budi",
  messageTimestamp: Math.floor(Date.now() / 1000),
  message: { conversation: text },
  ...over,
});

test.before(async () => {
  await sequelize.sync({ force: true });
  await User.create({ name: "Admin", email: "admin@test.id", password: await bcrypt.hash("rahasia123", 4), role: "admin" });
  await User.create({ name: "Agen", email: "agen@test.id", password: await bcrypt.hash("rahasia123", 4), role: "agent" });

  server = http.createServer(app);
  initRealtime(server);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server.closeAllConnections?.();
  await new Promise((r) => server.close(r));
  await sequelize.close();
  fs.rmSync(authDir, { recursive: true, force: true });
});

test("unit: toJid, parseContent, matches", () => {
  assert.equal(toJid("0812-3456-789"), "628123456789@s.whatsapp.net");
  assert.equal(toJid("+62 812 3456 789"), "628123456789@s.whatsapp.net");
  assert.equal(toJid("1203630@g.us"), "1203630@g.us");
  assert.throws(() => toJid("12"), /tidak valid/);

  assert.deepEqual(parseContent({ conversation: "halo" }), { type: "text", body: "halo" });
  assert.deepEqual(parseContent({ extendedTextMessage: { text: "reply" } }), { type: "text", body: "reply" });
  assert.deepEqual(parseContent({ imageMessage: { caption: "foto" } }), { type: "image", body: "[Gambar] foto" });
  assert.equal(parseContent({ reactionMessage: {} }), null);
  assert.equal(parseContent({ protocolMessage: {} }), null);

  const rule = (keyword, match_type) => ({ keyword, match_type });
  assert.ok(matches(rule("*", "exact"), "apa saja"));
  assert.ok(matches(rule("halo", "contains"), "oke halo kak"));
  assert.ok(!matches(rule("halo", "exact"), "halo kak"));
  assert.ok(matches(rule("halo", "starts_with"), "halo kak"));
});

test("health dan 404 JSON", async () => {
  assert.equal((await call("GET", "/api/status")).body.status, "ok");
  const nf = await call("GET", "/api/tidak-ada");
  assert.equal(nf.status, 404);
  assert.equal(nf.body.error, true);
});

test("login: salah, benar, dan akses tanpa token", async () => {
  assert.equal((await call("POST", "/api/auth/login", { body: { email: "admin@test.id", password: "salah" } })).status, 401);
  assert.equal((await call("POST", "/api/auth/login", { body: { email: "x@x.id", password: "x" } })).status, 401);
  assert.equal((await call("POST", "/api/auth/login", { body: {} })).status, 400);

  const admin = await call("POST", "/api/auth/login", { body: { email: "Admin@Test.id", password: "rahasia123" } });
  assert.equal(admin.status, 200);
  adminToken = admin.body.token;
  agentToken = (await call("POST", "/api/auth/login", { body: { email: "agen@test.id", password: "rahasia123" } })).body.token;

  assert.equal((await call("GET", "/api/devices")).status, 401);
  assert.equal((await call("GET", "/api/devices", { token: "bukan-jwt" })).status, 401);
});

test("device: hak akses, pembuatan, dan penyembunyian instance_key", async () => {
  assert.equal((await call("POST", "/api/devices", { token: agentToken, body: { name: "X" } })).status, 403);
  assert.equal((await call("POST", "/api/devices", { token: adminToken, body: {} })).status, 400);

  const created = await call("POST", "/api/devices", { token: adminToken, body: { name: "CS Utama", phone_number: "0812-111" } });
  assert.equal(created.status, 201);
  assert.ok(created.body.data.instance_key);
  device = await Device.findByPk(created.body.data.id);

  const asAdmin = await call("GET", "/api/devices", { token: adminToken });
  const asAgent = await call("GET", "/api/devices", { token: agentToken });
  assert.ok(asAdmin.body.data[0].instance_key);
  assert.equal(asAgent.body.data[0].instance_key, undefined);

  const qr = await call("GET", `/api/devices/${device.id}/qr`, { token: agentToken });
  assert.equal(qr.status, 200);
  assert.equal(qr.body.data.qr, null);
  assert.equal((await call("GET", "/api/devices/tidak-ada/qr", { token: agentToken })).status, 404);

  // Jadikan instance "terhubung" dengan socket palsu
  instance = manager.get(device.instance_key);
  assert.ok(instance);
  instance.status = "connected";
  instance.sock = {
    sendMessage: async (jid, content) => {
      sent.push({ jid, content });
      return { key: { id: `OUT${sent.length}`, remoteJid: jid, fromMe: true } };
    },
    onWhatsApp: async (jid) => [{ jid, exists: !jid.startsWith("628000") }],
    groupMetadata: async () => ({ subject: "Grup Teknisi" }),
    logout: async () => {},
    end() {},
    ev: { removeAllListeners() {} },
  };
});

test("pesan masuk: tersimpan, dedupe, nama kontak, grup, pesan sistem diabaikan", async () => {
  const msg = incoming("Selamat pagi");
  await handleIncoming(device, instance, msg);
  await handleIncoming(device, instance, msg); // duplikat
  await handleIncoming(device, instance, incoming("", { message: { protocolMessage: {} } }));
  await handleIncoming(device, instance, incoming("status", { key: { remoteJid: "status@broadcast", id: "S1" } }));

  const chats = await Chat.findAll({ where: { device_id: device.id } });
  assert.equal(chats.length, 1);
  assert.equal(chats[0].contact_name, "Budi");
  assert.equal(chats[0].unread_count, 1);
  assert.equal(await Message.count({ where: { chat_id: chats[0].id } }), 1);

  await handleIncoming(device, instance, incoming("tes grup", { key: { remoteJid: "12036300@g.us", id: "G1", participant: "628222@s.whatsapp.net" } }));
  const group = await Chat.findOne({ where: { wa_jid: "12036300@g.us" } });
  assert.equal(group.is_group, true);
  assert.equal(group.contact_name, "Grup Teknisi");

  // Pesan yang dikirim dari ponsel sendiri
  await handleIncoming(device, instance, incoming("dibalas dari HP", { key: { remoteJid: "628111111111@s.whatsapp.net", fromMe: true, id: "ME1" } }));
  const mine = await Message.findOne({ where: { wa_message_id: "ME1" } });
  assert.equal(mine.direction, "outgoing");
  assert.equal(mine.status, "sent");
});

test("daftar chat, riwayat pesan (terbaru, urut naik), tandai dibaca", async () => {
  const list = await call("GET", `/api/devices/${device.id}/chats`, { token: agentToken });
  assert.equal(list.body.data.length, 2);
  const chat = list.body.data.find((c) => c.wa_jid.startsWith("628111111111"));

  for (let i = 0; i < 5; i++) await handleIncoming(device, instance, incoming(`pesan ${i}`));
  const msgs = await call("GET", `/api/chats/${chat.id}/messages?limit=3`, { token: agentToken });
  assert.deepEqual(msgs.body.data.map((m) => m.body), ["pesan 2", "pesan 3", "pesan 4"]);

  const read = await call("POST", `/api/chats/${chat.id}/read`, { token: agentToken });
  assert.equal(read.body.data.unread_count, 0);
});

test("balas dari dashboard: sukses, validasi, dan device offline", async () => {
  const chat = await Chat.findOne({ where: { wa_jid: "628111111111@s.whatsapp.net" } });
  const ok = await call("POST", `/api/chats/${chat.id}/messages`, { token: agentToken, body: { text: "Baik kak" } });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.data.direction, "outgoing");
  assert.equal(ok.body.data.wa_message_id, `OUT${sent.length}`);
  assert.equal(sent.at(-1).content.text, "Baik kak");

  assert.equal((await call("POST", `/api/chats/${chat.id}/messages`, { token: agentToken, body: { text: "  " } })).status, 400);
  assert.equal((await call("POST", `/api/chats/tidak-ada/messages`, { token: agentToken, body: { text: "x" } })).status, 404);

  instance.status = "disconnected";
  assert.equal((await call("POST", `/api/chats/${chat.id}/messages`, { token: agentToken, body: { text: "x" } })).status, 409);
  instance.status = "connected";
});

test("status pesan keluar naik: sent -> delivered -> read (tidak turun)", async () => {
  const msg = await Message.findOne({ where: { wa_message_id: `OUT${sent.length}` } });
  const key = { id: msg.wa_message_id, fromMe: true };
  await handleStatusUpdates(device, [{ key, update: { status: 4 } }]);
  assert.equal((await msg.reload()).status, "read");
  await handleStatusUpdates(device, [{ key, update: { status: 3 } }]);
  assert.equal((await msg.reload()).status, "read");
});

test("auto-reply: rule hanya dibuat admin, membalas sekali (cooldown)", async () => {
  const body = { keyword: "harga", match_type: "contains", reply_text: "Paket mulai Rp150rb", priority: 5 };
  assert.equal((await call("POST", `/api/devices/${device.id}/rules`, { token: agentToken, body })).status, 403);
  assert.equal((await call("POST", `/api/devices/${device.id}/rules`, { token: adminToken, body: { keyword: "", reply_text: "x" } })).status, 400);
  const made = await call("POST", `/api/devices/${device.id}/rules`, { token: adminToken, body });
  assert.equal(made.status, 201);

  const before = sent.length;
  await handleIncoming(device, instance, incoming("kak info HARGA paket?", { key: { remoteJid: "628333333333@s.whatsapp.net", id: "R1" } }));
  assert.equal(sent.length, before + 1);
  assert.equal(sent.at(-1).content.text, "Paket mulai Rp150rb");
  const auto = await Message.findOne({ where: { is_auto_reply: true } });
  assert.ok(auto);

  await handleIncoming(device, instance, incoming("harga lagi", { key: { remoteJid: "628333333333@s.whatsapp.net", id: "R2" } }));
  assert.equal(sent.length, before + 1, "cooldown mencegah balasan beruntun");

  const upd = await call("PUT", `/api/rules/${made.body.data.id}`, { token: adminToken, body: { is_active: false } });
  assert.equal(upd.body.data.is_active, false);
  const list = await call("GET", `/api/devices/${device.id}/rules`, { token: agentToken });
  assert.equal(list.body.data.length, 1);
});

test("gateway API: key, normalisasi nomor, nomor tidak terdaftar, device offline", async () => {
  const key = device.instance_key;
  const post = (path, body) => call("POST", `/api/message/${path}?key=${key}`, { body });

  assert.equal((await call("POST", "/api/message/text", { body: { id: "0811", message: "x" } })).status, 403);
  assert.equal((await call("POST", "/api/message/text?key=salah", { body: { id: "0811", message: "x" } })).status, 403);
  assert.equal((await post("text", { message: "tanpa tujuan" })).status, 400);
  assert.equal((await post("text", { id: "081234567890" })).status, 400);

  const ok = await post("text", { id: "081234567890", message: "Tagihan Oktober" });
  assert.equal(ok.status, 201);
  assert.equal(sent.at(-1).jid, "6281234567890@s.whatsapp.net");
  assert.ok(await Chat.findOne({ where: { wa_jid: "6281234567890@s.whatsapp.net" } }), "pesan API muncul di inbox");

  assert.equal((await post("text", { id: "628000000000", message: "x" })).status, 422);
  assert.equal((await post("mediaurl", { id: "0811222", type: "exe", url: "http://x/y" })).status, 400);
  assert.equal((await post("mediaurl", { id: "0811222", type: "image", url: "ftp://x/y" })).status, 400);
  const media = await post("mediaurl", { id: "0811222333", type: "image", url: "https://x.id/a.jpg", mimetype: "image/jpeg", caption: "Bukti" });
  assert.equal(media.status, 201);
  assert.deepEqual(sent.at(-1).content.image, { url: "https://x.id/a.jpg" });

  instance.status = "disconnected";
  assert.equal((await post("text", { id: "0811222333", message: "x" })).status, 409);
  instance.status = "connected";
});

test("gateway API: token bearer saat PROTECT_ROUTES aktif", async () => {
  const config = require("../src/config/config");
  config.gatewayApi.protect = true;
  config.gatewayApi.token = "token-rahasia";
  try {
    const url = `/api/message/text?key=${device.instance_key}`;
    const body = { id: "0811222333", message: "x" };
    assert.equal((await call("POST", url, { body })).status, 403);
    assert.equal((await call("POST", url, { token: "salah", body })).status, 403);
    assert.equal((await call("POST", url, { token: "token-rahasia", body })).status, 201);
  } finally {
    config.gatewayApi.protect = false;
  }
});

test("socket.io: wajib JWT, menerima message:new di room device", async (t) => {
  let io;
  try {
    ({ io } = require("../frontend/node_modules/socket.io-client"));
  } catch {
    return t.skip("socket.io-client tidak terpasang (cd frontend && npm i)");
  }

  const noAuth = io(base, { transports: ["websocket"], reconnection: false });
  await new Promise((resolve, reject) => {
    noAuth.on("connect", () => reject(new Error("seharusnya ditolak")));
    noAuth.on("connect_error", (e) => {
      assert.match(e.message, /unauthorized/);
      resolve();
    });
  });
  noAuth.close();

  const client = io(base, { transports: ["websocket"], auth: { token: agentToken }, reconnection: false });
  await new Promise((r) => client.on("connect", r));
  client.emit("join:device", device.id);
  await new Promise((r) => setTimeout(r, 100));

  const got = new Promise((r) => client.on("message:new", r));
  await handleIncoming(device, instance, incoming("realtime!", { key: { remoteJid: "628444444444@s.whatsapp.net", id: "RT1" } }));
  const payload = await Promise.race([got, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 2000))]);
  assert.equal(payload.message.body, "realtime!");
  client.close();
});

test("restore: sesi lama di folder auth diadopsi menjadi device", async () => {
  fs.mkdirSync(path.join(authDir, "sesi-lama-123"));
  await manager.restoreAll();
  const adopted = await Device.findOne({ where: { instance_key: "sesi-lama-123" } });
  assert.ok(adopted);
  assert.equal(adopted.status, "disconnected");
});

test("hapus device: hanya admin, membersihkan chat/pesan/rule", async () => {
  assert.equal((await call("DELETE", `/api/devices/${device.id}`, { token: agentToken })).status, 403);
  assert.equal((await call("DELETE", `/api/devices/${device.id}`, { token: adminToken })).status, 200);
  assert.equal(await Device.count({ where: { id: device.id } }), 0);
  assert.equal(await Chat.count({ where: { device_id: device.id } }), 0);
  assert.equal(await Message.count(), 0);
  assert.equal((await call("GET", `/api/devices/${device.id}/qr`, { token: adminToken })).status, 404);
});
