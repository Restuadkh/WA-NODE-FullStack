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
  MEDIA_DIR: path.join(authDir, "media"),
  WEBHOOK_URL: "",
  PROTECT_ROUTES: "false",
  LOG_LEVEL: "silent",
  QUEUE_ENABLED: "true",
  QUEUE_MIN_DELAY_MS: "0",
  QUEUE_MAX_DELAY_MS: "0",
  QUEUE_HOURLY_LIMIT: "0",
  QUEUE_DAILY_LIMIT: "0",
  QUEUE_ACTIVE_HOURS: "",
  QUEUE_TYPING: "false",
  QUEUE_POLL_MS: "250",
});

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const bcrypt = require("bcryptjs");

const sequelize = require("../src/config/database");
const { User, Device, Chat, Message, MessageJob } = require("../src/api/models");
const app = require("../src/app");
const { initRealtime } = require("../src/api/services/realtime");
const manager = require("../src/api/whatsapp/manager");
const { handleIncoming, handleStatusUpdates } = require("../src/api/services/messageHandler");
const { parseContent, parseMedia } = require("../src/api/services/messageService");
const mediaStore = require("../src/api/services/mediaStore");
const safeFetch = require("../src/utils/safeFetch");
const { toJid } = require("../src/api/whatsapp/jid");
const { matches } = require("../src/api/services/autoReply");
const queueService = require("../src/api/services/queueService");

let server;
let base;
let adminToken;
let agentToken;
let device;
let instance;
const sent = []; // pesan yang "dikirim" lewat WhatsApp palsu

// Worker mengirim maksimal satu pesan per device per putaran (jeda antar pesan).
const drainQueue = async (rounds = 20) => {
  for (let i = 0; i < rounds; i++) await queueService._tick();
};

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
  assert.deepEqual(parseContent({ stickerMessage: {} }), { type: "sticker", body: "[Stiker]" });
  assert.deepEqual(parseContent({ audioMessage: { ptt: true } }), { type: "audio", body: "[Pesan suara]" });
  assert.equal(parseContent({ reactionMessage: {} }), null);
  assert.equal(parseContent({ protocolMessage: {} }), null);

  const media = parseMedia({ imageMessage: { mimetype: "image/jpeg", caption: "foto", width: 10, height: 20, fileLength: 100 } });
  assert.equal(media.kind, "image");
  assert.equal(media.mimetype, "image/jpeg");
  assert.equal(media.fileLength, 100);
  assert.equal(parseMedia({ audioMessage: { ptt: true, seconds: 3 } }).ptt, true);
  assert.equal(parseMedia({ conversation: "x" }), null);

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

  const qr = await call("GET", `/api/devices/${device.id}/qr`, { token: adminToken });
  assert.equal(qr.status, 200);
  assert.equal(qr.body.data.qr, null);
  assert.equal((await call("GET", "/api/devices/tidak-ada/qr", { token: adminToken })).status, 404);

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

test("device: webhook per device disimpan, disembunyikan dari agent, dan bisa diubah", async () => {
  const created = await call("POST", "/api/devices", {
    token: adminToken,
    body: {
      name: "Device Webhook",
      webhook_url: "https://contoh.id/hook",
      webhook_secret: "rahasia-webhook",
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.webhook_url, "https://contoh.id/hook");
  assert.equal(created.body.data.webhook_secret, "rahasia-webhook");
  assert.equal(created.body.data.webhook_configured, true);

  const asAgent = await call("GET", "/api/devices", { token: agentToken });
  const agentView = asAgent.body.data.find((d) => d.id === created.body.data.id);
  assert.equal(agentView.webhook_url, undefined);
  assert.equal(agentView.webhook_secret, undefined);
  assert.equal(agentView.webhook_configured, true);

  const body = { name: "Diubah", webhook_url: "https://contoh.id/baru", webhook_secret: "" };
  assert.equal((await call("PUT", `/api/devices/${created.body.data.id}`, { token: agentToken, body })).status, 403);
  assert.equal(
    (await call("PUT", `/api/devices/${created.body.data.id}`, { token: adminToken, body: { webhook_url: "ftp://x" } })).status,
    400,
  );
  assert.equal(
    (await call("PUT", `/api/devices/${created.body.data.id}`, { token: adminToken, body: { webhook_url: "bukan-url" } })).status,
    400,
  );
  assert.equal((await call("PUT", `/api/devices/${created.body.data.id}`, { token: adminToken, body: { name: "  " } })).status, 400);

  const updated = await call("PUT", `/api/devices/${created.body.data.id}`, { token: adminToken, body });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.name, "Diubah");
  assert.equal(updated.body.data.webhook_url, "https://contoh.id/baru");
  assert.equal(updated.body.data.webhook_secret, null, "secret kosong = dihapus");

  // Instance yang sedang berjalan langsung memakai data device terbaru.
  const live = manager.get(created.body.data.instance_key);
  assert.ok(live);
  assert.equal(live.device.name, "Diubah");
  assert.equal(live.device.webhook_secret, null);

  // webhook_url kosong = webhook device dimatikan.
  const off = await call("PUT", `/api/devices/${created.body.data.id}`, { token: adminToken, body: { webhook_url: "" } });
  assert.equal(off.body.data.webhook_url, null);
  assert.equal(off.body.data.webhook_configured, false);

  await call("DELETE", `/api/devices/${created.body.data.id}`, { token: adminToken });
});

test("webhook: payload standar, header, signature HMAC, dan fallback global", async () => {
  const received = [];
  const receiver = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      received.push({ headers: req.headers, raw });
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    });
  });
  await new Promise((r) => receiver.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${receiver.address().port}/hook`;

  const config = require("../src/config/config");
  const { notify, sign } = require("../src/api/services/webhook");
  const waitFor = async (n) => {
    for (let i = 0; i < 100 && received.length < n; i++) await new Promise((r) => setTimeout(r, 20));
  };

  try {
    notify(
      "messages",
      { id: "dev-1", name: "Device 1", instance_key: "kunci", webhook_url: url, webhook_secret: "s3cr3t" },
      { body: "halo" },
    );
    await waitFor(1);
    assert.equal(received.length, 1);
    const payload = JSON.parse(received[0].raw);
    assert.equal(payload.version, "1.0");
    assert.equal(payload.event, "messages");
    assert.equal(payload.device_id, "dev-1");
    assert.equal(payload.device_name, "Device 1");
    assert.equal(payload.data.body, "halo");
    assert.ok(payload.id);
    assert.ok(payload.timestamp);
    assert.equal(payload.key, undefined, "instance_key tidak ikut dikirim");
    assert.equal(received[0].headers["x-webhook-event"], "messages");
    assert.equal(received[0].headers["x-webhook-id"], payload.id);
    assert.equal(received[0].headers["x-signature"], sign("s3cr3t", received[0].raw));

    // Fallback global: hanya event yang diizinkan yang dikirim, memakai WEBHOOK_SECRET.
    const oldUrl = config.webhook.url;
    const oldEvents = config.webhook.events;
    const oldSecret = config.webhook.secret;
    config.webhook.url = url;
    config.webhook.events = ["connection"];
    config.webhook.secret = "global-secret";
    try {
      notify("messages", { id: "dev-2", name: "Device 2" }, { body: "tidak boleh" });
      notify("connection", { id: "dev-2", name: "Device 2" }, { status: "connected" });
      await waitFor(2);
      assert.equal(received.length, 2, "event messages disaring untuk webhook global");
      assert.equal(JSON.parse(received[1].raw).event, "connection");
      assert.equal(received[1].headers["x-signature"], sign("global-secret", received[1].raw));
    } finally {
      config.webhook.url = oldUrl;
      config.webhook.events = oldEvents;
      config.webhook.secret = oldSecret;
    }
  } finally {
    receiver.closeAllConnections?.();
    await new Promise((r) => receiver.close(r));
  }
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

test("media masuk: diunduh, disimpan, dan disajikan dengan URL bertanda tangan", async () => {
  instance.downloadMedia = async () => Buffer.from("foto-biner");
  const msg = incoming("", {
    key: { remoteJid: "628777777777@s.whatsapp.net", fromMe: false, id: "IMG1" },
    message: {
      imageMessage: { mimetype: "image/jpeg", caption: "Bukti transfer", fileLength: 10, width: 100, height: 50 },
    },
  });
  await handleIncoming(device, instance, msg);

  const stored = await Message.findOne({ where: { wa_message_id: "IMG1" } });
  assert.equal(stored.type, "image");
  assert.equal(stored.media_caption, "Bukti transfer");
  assert.equal(stored.media_width, 100);
  assert.equal(stored.media_height, 50);
  assert.ok(stored.media_url);

  const [, , mediaDevice, mediaFile] = stored.media_url.split("/");
  const [diskFile, query] = mediaFile.split("?");
  const token = new URLSearchParams(query).get("t");
  assert.equal(mediaStore.verify(mediaDevice, diskFile, token), true);
  assert.ok(mediaStore.resolve(mediaDevice, diskFile));
  assert.equal(mediaStore.verify(mediaDevice, diskFile, "salah"), false);

  const served = await fetch(`${base}${stored.media_url}`);
  assert.equal(served.status, 200);
  assert.equal(await served.text(), "foto-biner");
  assert.equal((await fetch(`${base}${stored.media_url.split("?")[0]}`)).status, 403);
});

test("kirim media dari dashboard: multipart, stiker, dan voice note", async () => {
  const chat = await Chat.findOne({ where: { wa_jid: "628777777777@s.whatsapp.net" } });
  const post = (form) =>
    fetch(`${base}/api/chats/${chat.id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${agentToken}` },
      body: form,
    });

  const image = new FormData();
  image.append("file", new Blob([Buffer.from("png")], { type: "image/png" }), "foto.png");
  image.append("caption", "Halo");
  const resImage = await post(image);
  assert.equal(resImage.status, 201);
  const imageBody = await resImage.json();
  assert.equal(imageBody.data.type, "image");
  assert.ok(imageBody.data.media_url);
  assert.equal(sent.at(-1).content.image.toString(), "png");
  assert.equal(sent.at(-1).content.caption, "Halo");

  const sticker = new FormData();
  sticker.append("file", new Blob([Buffer.from("webp")], { type: "image/webp" }), "stiker.webp");
  const resSticker = await post(sticker);
  assert.equal(resSticker.status, 201);
  assert.equal((await resSticker.json()).data.type, "sticker");
  assert.equal(sent.at(-1).content.sticker.toString(), "webp");

  const note = new FormData();
  note.append("file", new Blob([Buffer.from("ogg")], { type: "audio/ogg" }), "suara.ogg");
  note.append("ptt", "true");
  const resNote = await post(note);
  assert.equal(resNote.status, 201);
  const noteData = (await resNote.json()).data;
  assert.equal(noteData.type, "audio");
  assert.equal(noteData.media_ptt, true);
  assert.equal(sent.at(-1).content.ptt, true);
});

test("daftar chat, riwayat pesan (terbaru, urut naik), tandai dibaca", async () => {
  const list = await call("GET", `/api/devices/${device.id}/chats`, { token: agentToken });
  assert.equal(list.body.data.length, 3);
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

test("status pesan keluar naik: sent -> delivered -> read, dan dikirim ke webhook", async () => {
  const received = [];
  const receiver = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      received.push({ headers: req.headers, raw });
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    });
  });
  await new Promise((r) => receiver.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${receiver.address().port}/hook`;
  const waitFor = async (n) => {
    for (let i = 0; i < 100 && received.length < n; i++) await new Promise((r) => setTimeout(r, 20));
  };

  const previousUrl = device.webhook_url;
  device.webhook_url = url;
  try {
    const msg = await Message.findOne({ where: { wa_message_id: `OUT${sent.length}` } });
    const key = { id: msg.wa_message_id, fromMe: true };
    await handleStatusUpdates(device, [{ key, update: { status: 4 } }]);
    assert.equal((await msg.reload()).status, "read");
    await handleStatusUpdates(device, [{ key, update: { status: 3 } }]);
    assert.equal((await msg.reload()).status, "read");

    await waitFor(1);
    assert.equal(received.length, 1, "satu update status = satu webhook");
    const payload = JSON.parse(received[0].raw);
    assert.equal(payload.event, "message.update");
    assert.equal(received[0].headers["x-webhook-event"], "message.update");
    assert.equal(payload.data.id, key.id);
    assert.equal(payload.data.jid, "628111111111@s.whatsapp.net");
    assert.equal(payload.data.from_me, true);
    assert.equal(payload.data.status, "read");
    assert.equal(payload.data.previous_status, "sent");
    assert.equal(payload.data.message_id, msg.id);
    assert.equal(payload.data.chat_id, msg.chat_id);
    assert.ok(payload.data.timestamp > 0, "waktu pesan (epoch detik) ikut dikirim");

    // Status yang tidak naik tidak memicu webhook tambahan.
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(received.length, 1);
  } finally {
    device.webhook_url = previousUrl;
    receiver.closeAllConnections?.();
    await new Promise((r) => receiver.close(r));
  }
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

  const originalFetch = safeFetch.fetchRemoteMedia;
  safeFetch.fetchRemoteMedia = async () => ({
    buffer: Buffer.from("gambar"),
    mimetype: "image/jpeg",
    filename: "a.jpg",
  });
  let media;
  try {
    media = await post("mediaurl", { id: "0811222333", type: "image", url: "https://x.id/a.jpg", mimetype: "image/jpeg", caption: "Bukti" });
  } finally {
    safeFetch.fetchRemoteMedia = originalFetch;
  }
  assert.equal(media.status, 201);
  assert.equal(Buffer.from(sent.at(-1).content.image).toString(), "gambar");
  assert.equal(sent.at(-1).content.caption, "Bukti");

  const latest = await Message.findOne({ order: [["createdAt", "DESC"]] });
  assert.equal(latest.type, "image");
  assert.ok(latest.media_url);
  const [, , mediaDevice, mediaFile] = latest.media_url.split("/");
  const [diskFile, query] = mediaFile.split("?");
  assert.equal(mediaStore.verify(mediaDevice, diskFile, new URLSearchParams(query).get("t")), true);
  assert.equal(latest.media_mimetype, "image/jpeg");

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

test("antrean: validasi, boleh enqueue saat device offline, dan worker mengirim", async () => {
  const post = (path, body) => call("POST", `/api/message/queue${path}?key=${device.instance_key}`, { body });

  assert.equal((await post("", { message: "tanpa tujuan" })).status, 400);
  assert.equal((await post("", { id: "0811222333" })).status, 400);
  assert.equal((await post("", { id: "0811222333", message: "x", scheduled_at: "bukan-tanggal" })).status, 400);
  assert.equal((await post("", { id: "0811222333", message: "x", priority: "tinggi" })).status, 400);
  assert.equal((await post("/batch", { messages: [] })).status, 400);
  assert.equal((await post("/batch", { messages: [{ id: "0811222333", message: "" }] })).status, 400);

  // Endpoint antrean tidak mensyaratkan device online.
  instance.status = "disconnected";
  const queued = await post("", { id: "0811222333", message: "Halo dari antrean" });
  assert.equal(queued.status, 201);
  assert.equal(queued.body.data.status, "pending");
  assert.equal(queued.body.data.to_jid, "62811222333@s.whatsapp.net");

  // ref yang sama = idempotent (tidak membuat job ganda).
  const ref = `ref-${Date.now()}`;
  const first = await post("", { id: "0811222333", message: "sekali", ref });
  const second = await post("", { id: "0811222333", message: "sekali", ref });
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.body.duplicate, true);
  assert.equal(second.body.data.id, first.body.data.id);
  assert.equal(await MessageJob.count({ where: { client_ref: ref } }), 1);

  instance.status = "connected";
  const before = sent.length;
  await drainQueue();
  const delivered = await MessageJob.findByPk(queued.body.data.id);
  assert.equal(delivered.status, "sent");
  assert.ok(delivered.sent_at);
  assert.ok(delivered.message_id);
  assert.equal(sent.length, before + 2, "dua job pending terkirim (queued + first)");
  assert.ok(sent.some((m) => m.content.text === "Halo dari antrean"));

  // Batch: semua item dibuat lalu dikirim oleh worker.
  const batch = await post("/batch", {
    messages: [
      { id: "0811222444", message: "batch satu" },
      { id: "0811222555", message: "batch dua", priority: 5 },
    ],
  });
  assert.equal(batch.status, 201);
  assert.equal(batch.body.data.queued, 2);
  await drainQueue();
  assert.equal(await MessageJob.count({ where: { status: "sent", device_id: device.id } }), 4);
});

test("antrean media: file disimpan sementara, dikirim, lalu dibersihkan", async () => {
  const form = new FormData();
  form.append("id", "0811222666");
  form.append("type", "image");
  form.append("caption", "Dari antrean");
  form.append("file", new Blob([Buffer.from("antrean-img")], { type: "image/png" }), "antrean.png");

  const res = await fetch(`${base}/api/message/queue/media?key=${device.instance_key}`, {
    method: "POST",
    body: form,
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  const job = await MessageJob.findByPk(body.data.id);
  assert.equal(job.status, "pending");
  assert.equal(job.payload.media.disk_name.length > 0, true);
  assert.equal(body.data.payload.media.disk_name, undefined, "disk_name tidak bocor ke API");

  await drainQueue();
  await job.reload();
  assert.equal(job.status, "sent");
  assert.equal(mediaStore.resolve(device.id, job.payload.media.disk_name), null, "file sementara dihapus");
  assert.equal(Buffer.from(sent.at(-1).content.image).toString(), "antrean-img");
  assert.equal(sent.at(-1).content.caption, "Dari antrean");
});

test("antrean: daftar, statistik, jadwal masa depan, batal, dan ulang (admin)", async () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const queued = await call("POST", `/api/message/queue?key=${device.instance_key}`, {
    body: { id: "0811222777", message: "nanti", scheduled_at: future },
  });
  assert.equal(queued.status, 201);

  await queueService._tick();
  assert.equal((await MessageJob.findByPk(queued.body.data.id)).status, "pending", "jadwal masa depan belum dikirim");

  const stats = await call("GET", `/api/devices/${device.id}/jobs/stats`, { token: agentToken });
  assert.equal(stats.status, 200);
  assert.ok(stats.body.data.counts.pending >= 1);
  assert.equal(stats.body.data.limits.hourly, 0);
  assert.equal(stats.body.data.usage.last_day >= 4, true);

  const list = await call("GET", `/api/devices/${device.id}/jobs?status=pending`, { token: agentToken });
  assert.equal(list.status, 200);
  assert.ok(list.body.data.some((j) => j.id === queued.body.data.id));

  assert.equal((await call("DELETE", `/api/jobs/${queued.body.data.id}`, { token: agentToken })).status, 403);
  assert.equal((await call("DELETE", `/api/jobs/${queued.body.data.id}`, { token: adminToken })).status, 200);
  assert.equal((await MessageJob.findByPk(queued.body.data.id)).status, "cancelled");

  const retry = await call("POST", `/api/jobs/${queued.body.data.id}/retry`, { token: adminToken });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.data.status, "pending");
  assert.equal(retry.body.data.attempts, 0);

  await call("DELETE", `/api/jobs/${queued.body.data.id}`, { token: adminToken });
  assert.equal((await call("POST", `/api/jobs/${queued.body.data.id}/retry`, { token: "bukan-jwt" })).status, 401);
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

test("reconnect: timer tiap instance terpisah, stop sesi lain tidak membatalkannya", async () => {
  const { WhatsAppInstance } = require("../src/api/whatsapp/instance");
  const a = new WhatsAppInstance({ key: "multi-a" });
  const b = new WhatsAppInstance({ key: "multi-b" });
  let startedA = 0;
  let startedB = 0;
  a.start = () => {
    startedA += 1;
  };
  b.start = () => {
    startedB += 1;
  };

  a._scheduleReconnect(10);
  b._scheduleReconnect(10);
  a.stop(); // hanya instance A yang dihentikan
  await new Promise((r) => setTimeout(r, 60));

  assert.equal(startedA, 0, "timer instance yang dihentikan dibatalkan");
  assert.equal(startedB, 1, "timer instance lain tetap berjalan");
  b.stop();
});

test("hapus device: hanya admin, membersihkan chat/pesan/rule", async () => {
  assert.equal((await call("DELETE", `/api/devices/${device.id}`, { token: agentToken })).status, 403);
  assert.equal((await call("DELETE", `/api/devices/${device.id}`, { token: adminToken })).status, 200);
  assert.equal(await Device.count({ where: { id: device.id } }), 0);
  assert.equal(await Chat.count({ where: { device_id: device.id } }), 0);
  assert.equal(await Message.count(), 0);
  assert.equal((await call("GET", `/api/devices/${device.id}/qr`, { token: adminToken })).status, 404);
});
