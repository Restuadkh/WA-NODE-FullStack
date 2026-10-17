# WA Dashboard – Frontend

React + Vite. Di produksi, hasil build (`dist/`) disajikan langsung oleh backend; lihat `README.md` di root repo.

## Fitur
- Login (JWT) dengan role admin / agent
- Devices: tambah, tautkan (QR / kode pairing), status realtime, hapus (admin)
- Inbox: chat per device, riwayat pesan, balas teks, centang status, badge belum dibaca, realtime (socket.io) dengan polling cadangan
- Auto-reply: daftar, tambah, aktif/nonaktif, hapus (admin; agent hanya melihat)

## Development
```bash
cp .env.example .env      # BACKEND_URL default http://localhost:3000
npm install
npm run dev               # http://localhost:5173
```
Dev server mem-proxy `/api` dan `/socket.io` ke backend, jadi CORS tidak perlu diubah.

## Build
```bash
npm run build             # -> frontend/dist
```
Isi `VITE_API_URL` hanya bila frontend dan backend berada di domain berbeda.

## Endpoint yang dipakai
| Fungsi | Endpoint |
|---|---|
| Login | `POST /api/auth/login` |
| Device | `GET/POST /api/devices`, `DELETE /api/devices/:id`, `GET /api/devices/:id/qr` |
| Chat | `GET /api/devices/:id/chats`, `GET /api/chats/:id/messages`, `POST /api/chats/:id/messages`, `POST /api/chats/:id/read` |
| Auto-reply | `GET/POST /api/devices/:id/rules`, `PUT/DELETE /api/rules/:id` |
| Realtime | socket.io dengan `auth.token`; emit `join:device`; event `message:new`, `message:update`, `device:status` |
