const express = require("express");
const multer = require("multer");

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
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }).single("file");

router.get("/status", (req, res) => res.json({ status: "ok" }));

// ---- Login (maks 10 percobaan / 15 menit per IP)
router.post("/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), auth.login);

// ---- API kirim pesan untuk aplikasi lain (?key=<instance_key>)
const message = express.Router();
message.use(gatewayAuth);
message.post("/text", gateway.text);
message.post("/image", upload, gateway.image);
message.post("/video", upload, gateway.video);
message.post("/audio", upload, gateway.audio);
message.post("/doc", upload, gateway.document);
message.post("/mediaurl", gateway.mediaUrl);
router.use("/message", message);

// ---- Dashboard (JWT). Hanya path dashboard yang dijaga, sehingga path tak dikenal tetap 404.
router.use(["/devices", "/chats", "/rules"], authMiddleware);

router.get("/devices", devices.listDevices);
router.post("/devices", admin, devices.createDevice);
router.get("/devices/:id/qr", devices.getDeviceQr);
router.get("/devices/:id/status", devices.getDeviceStatus);
router.delete("/devices/:id", admin, devices.removeDevice);

router.get("/devices/:deviceId/chats", chats.listChats);
router.get("/chats/:chatId/messages", chats.listMessages);
router.post("/chats/:chatId/messages", chats.sendMessage);
router.post("/chats/:chatId/read", chats.markRead);

router.get("/devices/:deviceId/rules", rules.listRules);
router.post("/devices/:deviceId/rules", admin, rules.createRule);
router.put("/rules/:id", admin, rules.updateRule);
router.delete("/rules/:id", admin, rules.removeRule);

module.exports = router;
