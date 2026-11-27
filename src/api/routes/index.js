const express = require("express");
const multer = require("multer");

const config = require("../../config/config");
const { authMiddleware, requireRole } = require("../middlewares/auth");
const gatewayAuth = require("../middlewares/gatewayAuth");
const rateLimit = require("../middlewares/rateLimit");

const auth = require("../controllers/auth.controller");
const devices = require("../controllers/devices.controller");
const chats = require("../controllers/chats.controller");
const gateway = require("../controllers/gateway.controller");
const users = require("../controllers/users.controller");
const contact = require("../controllers/contact.controller");

const router = express.Router();
const admin = requireRole("admin");

// Batas ukuran upload media (MB). Naikkan via env MEDIA_MAX_MB bila perlu kirim video besar.
const MEDIA_MAX_MB = Math.max(1, Number(process.env.MEDIA_MAX_MB) || 50);
const uploadOptions = {
  storage: multer.memoryStorage(),
  limits: { fileSize: MEDIA_MAX_MB * 1024 * 1024, files: 1, fields: 20 },
};
const upload = multer(uploadOptions).single("file");
const chatUpload = multer(uploadOptions).single("file");

router.get("/status", (req, res) => res.json({ status: "ok" }));

// ---- Formulir kontak publik (maks 5 pesan / 15 menit per IP)
router.post("/contact", rateLimit({ windowMs: 15 * 60 * 1000, max: 5 }), contact.submit);

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

message.post("/text", online, gateway.text);
message.post("/image", online, upload, gateway.image);
message.post("/video", online, upload, gateway.video);
message.post("/audio", online, upload, gateway.audio);
message.post("/sticker", online, upload, gateway.sticker);
message.post("/note", online, upload, gateway.voiceNote);
message.post("/doc", online, upload, gateway.document);
router.use("/message", message);

// ---- Dashboard (JWT). Hanya path dashboard yang dijaga, sehingga path tak dikenal tetap 404.
router.use(["/devices", "/chats", "/users"], authMiddleware);

router.get("/devices", devices.listDevices);
router.post("/devices", admin, devices.createDevice);
router.put("/devices/:id", admin, devices.updateDevice);
router.patch("/devices/:id", admin, devices.updateDevice);
// QR boleh dibuka admin & agent untuk menautkan WhatsApp device.
router.get("/devices/:id/qr", devices.getDeviceQr);
router.get("/devices/:id/status", devices.getDeviceStatus);
// Redial paksa satu device: putus lalu mulai ulang koneksinya.
router.post("/devices/:id/redial", admin, devices.redialDevice);
router.delete("/devices/:id", admin, devices.removeDevice);

router.get("/devices/:deviceId/chats", chats.listChats);
router.get("/chats/:chatId/messages", chats.listMessages);
router.post("/chats/:chatId/messages", chatUpload, chats.sendMessage);
router.post("/chats/:chatId/read", chats.markRead);

// ---- Manajemen user (admin): kelola akun dashboard
router.get("/users", admin, users.listUsers);
router.post("/users", admin, users.createUser);
router.put("/users/:id", admin, users.updateUser);
router.patch("/users/:id", admin, users.updateUser);
router.delete("/users/:id", admin, users.deleteUser);

module.exports = router;
