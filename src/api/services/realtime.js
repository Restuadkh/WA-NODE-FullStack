const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const config = require("../../config/config");
const logger = require("./logger");
const { JWT_ALGORITHMS } = require("../middlewares/auth");
const { allowedDeviceIds } = require("./deviceAccess");

let io = null;

// Cek ACL untuk socket. Cache hasil per socket agar tidak query setiap join.
// Admin tanpa penugasan = akses semua (null); lainnya dibatasi device yang ditugaskan.
const canAccess = async (socket, user, deviceId) => {
  if (!user) return false;
  socket.data.allowed ??= new Set(await allowedDeviceIds(user));
  return socket.data.allowed === null || socket.data.allowed.has(deviceId);
};

// Event ke dashboard:
//   device:status  { device_id, status }                  -> semua client
//   message:new    { chat_id, message }                   -> room device:<id>
//   message:update { chat_id, message_id, status }        -> room device:<id>
function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: config.corsOrigin },
  });

  // Hanya client dengan JWT valid yang boleh tersambung
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("unauthorized"));
    try {
      socket.data.user = jwt.verify(token, config.jwt.secret, { algorithms: JWT_ALGORITHMS });
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", async (socket) => {
    // ACL: agent hanya boleh join room device yang ditugaskan kepadanya.
    // Admin (null) boleh join semua. Dicek ulang saat join, bukan hanya saat connect.
    socket.on("join:device", async (deviceId) => {
      if (typeof deviceId !== "string") return;
      if (await canAccess(socket, socket.data.user, deviceId)) socket.join(`device:${deviceId}`);
    });
    socket.on("leave:device", (deviceId) => {
      if (typeof deviceId === "string") socket.leave(`device:${deviceId}`);
    });
  });

  logger.info("Realtime (socket.io) aktif");
  return io;
}

const emitAll = (event, payload) => io?.emit(event, payload);
const emitToDevice = (deviceId, event, payload) =>
  io?.to(`device:${deviceId}`).emit(event, payload);

module.exports = { initRealtime, emitAll, emitToDevice };
