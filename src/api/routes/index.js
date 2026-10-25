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

const router = express.Router();
const admin = requireRole("admin");
const uploadOptions = {
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 20 },
};
const upload = multer(uploadOptions).single("file");
const chatUpload = multer(uploadOptions).single("file");

router.get("/status", (req, res) => res.json({ status: "ok" }));

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
message.use(gatewayAuth);
message.post("/text", gateway.text);
message.post("/image", upload, gateway.image);
message.post("/video", upload, gateway.video);
message.post("/audio", upload, gateway.audio);
message.post("/sticker", upload, gateway.sticker);
message.post("/note", upload, gateway.voiceNote);
message.post("/doc", upload, gateway.document);
message.post("/mediaurl", gateway.mediaUrl);
router.use("/message", message);

// ---- Dashboard (JWT). Hanya path dashboard yang dijaga, sehingga path tak dikenal tetap 404.
router.use(["/devices", "/chats", "/rules"], authMiddleware);

router.get("/devices", devices.listDevices);
router.post("/devices", admin, devices.createDevice);
// QR / pairing code = kunci menautkan nomor WhatsApp, jadi hanya admin
router.get("/devices/:id/qr", admin, devices.getDeviceQr);
router.get("/devices/:id/status", devices.getDeviceStatus);
router.delete("/devices/:id", admin, devices.removeDevice);

router.get("/devices/:deviceId/chats", chats.listChats);
router.get("/chats/:chatId/messages", chats.listMessages);
router.post("/chats/:chatId/messages", chatUpload, chats.sendMessage);
router.post("/chats/:chatId/read", chats.markRead);

router.get("/devices/:deviceId/rules", rules.listRules);
router.post("/devices/:deviceId/rules", admin, rules.createRule);
router.put("/rules/:id", admin, rules.updateRule);
router.delete("/rules/:id", admin, rules.removeRule);

module.exports = router;
