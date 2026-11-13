const express = require("express");
const multer = require("multer");

const config = require("../../config/config");
const { authMiddleware, requireRole } = require("../middlewares/auth");
const gatewayAuth = require("../middlewares/gatewayAuth");
const rateLimit = require("../middlewares/rateLimit");

const auth = require("../controllers/auth.controller");
const devices = require("../controllers/devices.controller");
const chats = require("../controllers/chats.controller");
const rules = require("../controllers/rules.controller");
const gateway = require("../controllers/gateway.controller");
const queue = require("../controllers/queue.controller");
const users = require("../controllers/users.controller");
const rolePermissions = require("../controllers/rolePermissions.controller");
const contacts = require("../controllers/contacts.controller");
const roleAccess = require("../services/roleAccess");

const router = express.Router();
// Guard "admin" berlaku untuk admin biasa & super_admin.
const admin = requireRole("admin", "super_admin");
// Izin per role dikonfigurasi dari menu Pengguna (RolePermission), hierarki:
// super_admin (1) > admin (2) > agent (3). super_admin selalu punya semua izin.
const perm = roleAccess.requirePermission;

// Batas ukuran upload media (MB). Naikkan via env MEDIA_MAX_MB bila perlu kirim video besar.
const MEDIA_MAX_MB = Math.max(1, Number(process.env.MEDIA_MAX_MB) || 50);
const uploadOptions = {
  storage: multer.memoryStorage(),
  limits: { fileSize: MEDIA_MAX_MB * 1024 * 1024, files: 1, fields: 20 },
};
const upload = multer(uploadOptions).single("file");
const chatUpload = multer(uploadOptions).single("file");
const csvUpload = multer(uploadOptions).single("file");

router.get("/status", (req, res) => res.json({ status: "ok" }));

// ---- Redial via crontab/task scheduler (tanpa JWT; token = CRON_SECRET)
// Redial semua device yang tidak online, atau satu device: ?key=<instance_key> / ?id=<device_id>
router.post("/cron/redial", devices.cronRedial);
router.get("/cron/redial", devices.cronRedial);

// ---- Login (maks 10 percobaan / 15 menit per IP)
router.post("/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), auth.login);

// ---- API kirim pesan untuk aplikasi lain (header X-Api-Key atau ?key=<instance_key>)
const message = express.Router();
if (config.gatewayApi.rateLimitPerMinute > 0) {
  // Dipasang sebelum gatewayAuth agar tebak-tebakan key juga dibatasi
  message.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: config.gatewayApi.rateLimitPerMinute,
      message: "Terlalu banyak request, coba lagi sebentar",
    }),
  );
}
// Pengiriman langsung: device wajib online.
const online = gatewayAuth();
// Antrean: device boleh offline/reconnect; worker mengirim saat online.
const enqueueOnly = gatewayAuth({ requireOnline: false });

message.post("/text", online, gateway.text);
message.post("/image", online, upload, gateway.image);
message.post("/video", online, upload, gateway.video);
message.post("/audio", online, upload, gateway.audio);
message.post("/sticker", online, upload, gateway.sticker);
message.post("/note", online, upload, gateway.voiceNote);
message.post("/doc", online, upload, gateway.document);
message.post("/mediaurl", online, gateway.mediaUrl);

// Antrean pesan (anti-ban): teks, batch, media, media dari URL.
message.post("/queue", enqueueOnly, queue.enqueueText);
message.post("/queue/batch", enqueueOnly, queue.enqueueBatch);
message.post("/queue/media", enqueueOnly, upload, queue.enqueueMedia);
message.post("/queue/mediaurl", enqueueOnly, queue.enqueueMediaUrl);
router.use("/message", message);

// ---- Dashboard (JWT). Hanya path dashboard yang dijaga, sehingga path tak dikenal tetap 404.
router.use(["/devices", "/chats", "/rules", "/jobs", "/users", "/roles"], authMiddleware);

router.get("/devices", devices.listDevices);
// Aksi device mengikuti matriks izin per role (halaman Pengguna → Rule akses per role),
// bukan role "admin" mentah. Scope device tetap dibatasi penugasan (device_agents).
router.post("/devices", perm("devices_add"), devices.createDevice);
router.put("/devices/:id", perm("devices_edit"), devices.updateDevice);
router.patch("/devices/:id", perm("devices_edit"), devices.updateDevice);
// QR / pairing code boleh dibuka admin & agent (untuk menautkan WhatsApp device yang ditugaskan)
router.get("/devices/:id/qr", devices.getDeviceQr);
router.get("/devices/:id/status", devices.getDeviceStatus);
// Redial paksa satu device (izin devices_redial): putus lalu mulai ulang koneksinya.
router.post("/devices/:id/redial", perm("devices_redial"), devices.redialDevice);
router.delete("/devices/:id", perm("devices_delete"), devices.removeDevice);

router.get("/devices/:deviceId/chats", chats.listChats);
router.get("/chats/:chatId/messages", chats.listMessages);
router.post("/chats/:chatId/messages", chatUpload, chats.sendMessage);
router.post("/chats/:chatId/read", chats.markRead);

// ---- Kontak per device: daftar, import (CSV/JSON), hapus.
// Izin contacts_import: admin & agent boleh (diatur lewat menu Pengguna → Rule akses per role).
router.get("/devices/:deviceId/contacts", contacts.listContacts);
router.post("/devices/:deviceId/contacts/import", perm("contacts_import"), csvUpload, contacts.importContacts);
router.post("/devices/:deviceId/contacts/:id/open", contacts.openContact);
router.post("/devices/:deviceId/contacts/broadcast", perm("contacts_import"), contacts.broadcastContacts);
router.delete("/devices/:deviceId/contacts/:id", perm("contacts_import"), contacts.removeContact);

router.get("/devices/:deviceId/rules", rules.listRules);
router.post("/devices/:deviceId/rules", perm("rules_manage"), rules.createRule);
router.put("/rules/:id", perm("rules_manage"), rules.updateRule);
router.delete("/rules/:id", perm("rules_manage"), rules.removeRule);

// Antrean pesan keluar: lihat untuk semua user, ubah mengikuti izin jobs_manage.
router.get("/devices/:deviceId/jobs", queue.listJobs);
router.get("/devices/:deviceId/jobs/stats", queue.jobStats);
router.delete("/jobs/:id", perm("jobs_manage"), queue.cancelJob);
router.post("/jobs/:id/retry", perm("jobs_manage"), queue.retryJob);

// ---- Izin per role (hierarki: super_admin > admin > agent, hanya mengatur role di bawahnya)
router.get("/roles/permissions", admin, rolePermissions.listPermissions);
router.get("/roles/permissions/mine", rolePermissions.myPermissions);
router.put("/roles/permissions/:role", admin, rolePermissions.updatePermissions);

// ---- Manajemen user (admin & super_admin): kelola akun dashboard & penugasan device (ACL)
// Hanya super_admin yang boleh mengangkat seseorang menjadi super_admin (dijaga di controller).
router.get("/users", admin, users.listUsers);
router.post("/users", admin, users.createUser);
router.put("/users/:id", admin, users.updateUser);
router.patch("/users/:id", admin, users.updateUser);
// Izin khusus per user (menimpa rule role; null = ikut role)
router.put("/users/:id/permissions", admin, users.setUserPermissions);
router.delete("/users/:id", admin, users.deleteUser);

module.exports = router;
