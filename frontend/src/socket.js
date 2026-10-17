import { io } from "socket.io-client";
import { API_BASE, getToken } from "./api";

// Satu koneksi socket dipakai bersama. Backend mewajibkan JWT (handshake auth.token).
// Event dari backend:
//   device:status   { device_id, status }                 (semua client)
//   message:new     { chat_id, message }                  (room device:<id>, setelah emit "join:device")
//   message:update  { chat_id, message_id, status }       (room device:<id>)
let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(API_BASE || undefined, {
      transports: ["websocket", "polling"],
      reconnectionDelayMax: 10000,
      // dievaluasi ulang di setiap (re)connect, jadi selalu memakai token terbaru
      auth: (cb) => cb({ token: getToken() }),
    });
  }
  return socket;
}

// Dipanggil saat logout agar koneksi lama (token lama) tidak tertinggal
export function closeSocket() {
  socket?.close();
  socket = null;
}
