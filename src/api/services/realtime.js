const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const config = require("../../config/config");
const logger = require("./logger");

let io = null;

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
      socket.data.user = jwt.verify(token, config.jwt.secret);
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("join:device", (deviceId) => {
      if (typeof deviceId === "string") socket.join(`device:${deviceId}`);
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
