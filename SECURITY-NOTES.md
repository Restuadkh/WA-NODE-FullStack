# Catatan Keamanan (Security Notes)

Dokumen ini merangkum posisi keamanan **WA-NODE-FullStack** per 27 November 2026 dan pekerjaan keamanan yang masih terbuka. Project ini adalah **WhatsApp Gateway** (REST API + webhook) dengan dashboard web — bukan toko online dan tidak memproses pembayaran.

## 1. Arsitektur & permukaan serangan

- Backend: Node.js 20+, Express 5, Sequelize (MySQL/MariaDB; SQLite untuk test), socket.io, Baileys.
- Frontend: React 18 + Vite + React Router, disajikan backend dari `frontend/dist` dalam satu port.
- Autentikasi dashboard: JWT (HS256, algoritma dikunci) di header `Authorization: Bearer`, disimpan di `localStorage`.
- API kirim pesan: header `X-Api-Key` per device (opsional `?key=`, default nonaktif — lihat `GATEWAY_ALLOW_QUERY_KEY`).
- Webhook keluar: `X-Signature: sha256=<hex>` = HMAC-SHA256 body mentah (detail di [WebHook.md](WebHook.md)).
- Media: URL bertanda tangan HMAC (`MEDIA_URL_EXPIRY_HOURS`), disimpan di `MEDIA_DIR` di luar folder statis.
- Formulir kontak publik: rate limit 5/15 menit per IP, honeypot, validasi + pembersihan karakter kontrol, `ipHash` (HMAC) — IP asli tidak disimpan.

## 2. Yang sudah diterapkan

- `helmet` (CSP, HSTS di production), CORS dibatasi `CORS_ORIGIN`, `x-powered-by` disembunyikan.
- Validasi konfigurasi saat start: `JWT_SECRET` lemah = server menolak jalan (`process.exit(1)`).
- Rate limit khusus pada endpoint tanpa login: `/api/auth/login` (10/15 menit) dan `/api/contact` (5/15 menit).
- Input pembersih karakter kontrol sebelum disimpan/di-log; escape XML pada `sitemap.xml`.
- `robots.txt`/`sitemap.xml` mengikuti host request tanpa memercayai host mentah (validasi regex).
- `npm audit --omit=dev` = 0 kerentanan; 31 tes lulus; lint bersih.

## 3. Pekerjaan keamanan yang masih terbuka

| # | Item | Risiko | Rencana |
|---|------|--------|---------|
| 1 | **Room socket.io belum dibatasi per device/user** | Semua klien dashboard menerima event semua device (pesan masuk & status lintas device) | Batasi join room berdasarkan device yang berhak; jadwal di [ROADMAP.md](ROADMAP.md) jangka menengah |
| 2 | **JWT di localStorage tanpa refresh token** | Skrip yang berhasil XSS dapat membaca token sampai kedaluwarsa; logout tidak mengakhiri sesi di server | Refresh token berumur pendek + denylist; jadwal jangka menengah |
| 3 | **Belum ada CSP yang membatasi skrip pihak ketiga secara ketat** | Memperbesar dampak bila ada celah XSS | Tinjau directive `script-src`; hindari inline script baru |
| 4 | **Retensi data belum diotomatisasi** | Pesan, media, dan log menumpuk tanpa batas | Job pembersihan > N hari (env), jadwal jangka menengah |
| 5 | **Rate limit global belum ada** | Endpoint `/api` lain hanya dilindungi auth | Rate limit global per IP di depan router |
| 6 | **Backup belum terotomatisasi** | Kehilangan data saat disk gagal | Backup terjadwal DB + `MEDIA_DIR` + `CONTACT_DIR` |

## 4. Rekomendasi operasional

- Jalankan di belakang reverse proxy dengan HTTPS; set `TRUST_PROXY=1` agar rate limit & `req.ip` benar.
- `GATEWAY_ALLOW_QUERY_KEY=false` di production: key di query string tercatat di log Nginx/proxy.
- Isi `CORS_ORIGIN` dengan domain dashboard, jangan `*`.
- Rotasi log dan backup `MEDIA_DIR`/`CONTACT_DIR` secara terjadwal.
- Pantau rilis Baileys (versi rc sering mengubah internal) sebelum upgrade mayor.

> Status keamanan terkini dan rencana jangka menengah/panjang selalu merujuk ke **[ROADMAP.md](ROADMAP.md)**.
