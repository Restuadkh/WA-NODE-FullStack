# WA Dashboard

Gateway WhatsApp (Baileys) dengan dashboard web: kelola nomor, balas chat bersama tim secara realtime, dan API kirim pesan untuk aplikasi lain. Riwayat perubahan: **[CHANGELOG.md](CHANGELOG.md)**.

- **Backend**: Node.js ≥ 20, Express 5, Sequelize (MySQL/MariaDB), socket.io, Baileys
- **Frontend**: React + Vite di `frontend/` (build butuh Node ≥ 20.19; hasil build disajikan backend, satu proses satu port)

> Versi **3.0.0** — versi **ramping**. Fitur sekunder (antrean anti-ban, import/export kontak, auto-reply, role bertingkat/izin per user, ACL per device, media URL, pairing code, MySQL auth store) **dihapus** agar lebih stabil dan mudah dirawat. Inti yang tersisa: login, device + QR, Inbox teks & media, API kirim pesan, dan webhook (global + per device). **Baca [Perubahan v3.0](#perubahan-v30).**

## Fitur
- Login JWT dengan dua role sederhana: `admin` (kelola device & pengguna) dan `agent` (balas chat)
- Manajemen pengguna di dashboard (admin): tambah, ubah nama/role/password, hapus
- Device: tautkan lewat **QR**, status realtime, redial, hapus (logout + bersihkan data)
- Inbox: chat pribadi & grup, teks, **gambar, video, stiker, audio/voice note, dan dokumen** (terima & kirim), reply/quote, edit pesan, centang terkirim/diterima/dibaca, badge belum dibaca bersama
- API kirim pesan untuk aplikasi lain: teks, gambar, video, audio, voice note, stiker, dokumen
- Reconnect otomatis **per sesi** dengan backoff + jitter; satu sesi yang terputus tidak memutus sesi lain
- Webhook keluar (opsional, HMAC-SHA256) untuk pesan masuk, update status pesan, dan status koneksi — **per device** dengan fallback `WEBHOOK_URL` global
- **Halaman Dok API** di dashboard: ringkasan `/api/message/*` beserta contoh request/response (detail di **[RES-API.md](RES-API.md)**)

## Situs publik & halaman legal
Selain dashboard (login), build frontend menyediakan halaman yang dapat diakses tanpa login:
`/`, `/tentang-kami`, `/kebijakan-privasi`, `/syarat-ketentuan`, `/kebijakan-refund`,
`/kebijakan-pembatalan`, `/hubungi-kami`, dan `/faq`. Dashboard tetap tersedia di `/dashboard`,
`/devices`, `/users`, dan `/api-docs`.

Formulir kontak memakai `POST /api/contact` dan menyimpan pesan sebagai JSONL pada `CONTACT_DIR`
(default `src/data/contact`, di luar folder statis). Belum ada notifikasi email otomatis.
Data usaha yang belum tersedia (nama badan hukum, alamat, email, telepon, WhatsApp, jam operasional)
dan checklist verifikasi merchant ada di **[MERCHANT-READINESS.md](MERCHANT-READINESS.md)**.

## Instalasi
```bash
cp .env.example .env            # isi JWT_SECRET (openssl rand -hex 48) dan kredensial MySQL
npm install
npm run seed:admin -- admin@contoh.com "password-kuat" "Nama Admin"   # tabel dibuat otomatis (DB_AUTO_SYNC=true)

npm run build:frontend          # membuat frontend/dist

npm start                       # dashboard + API di http://localhost:3000
```
Pengembangan: `npm run dev` (backend) dan `cd frontend && npm run dev` (Vite di :5173, proxy ke backend).

**Server menolak start** bila `JWT_SECRET` kosong/kurang dari 16 karakter, atau `PROTECT_ROUTES=true` tanpa `TOKEN`. Di `NODE_ENV=production`, konfigurasi rawan (mis. CORS `*`, webhook tanpa secret) dicatat sebagai peringatan saat start.

## Produksi
Aplikasi ini **harus berjalan sebagai satu proses**: koneksi WhatsApp hidup di memori proses, jadi **jangan** pakai PM2 *cluster mode* atau menjalankan beberapa replika.

PM2 (mode `fork`, bawaan):
```bash
pm2 start ecosystem.config.js && pm2 save
```
Windows 24/7 (proses tetap hidup setelah terminal ditutup / reboot): lihat **[DEPLOY-WINDOWS.md](DEPLOY-WINDOWS.md)** — PM2 + Task Scheduler, atau NSSM sebagai Windows Service.
Nginx (WebSocket wajib diteruskan):
```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```
Set `TRUST_PROXY=1` dan `CORS_ORIGIN=https://domain-anda` di `.env`. Folder sesi WhatsApp (`AUTH_DIR`, default `src/auth/`) harus ikut di-backup.

### Checklist keamanan production
- [ ] `JWT_SECRET` acak panjang (`openssl rand -hex 48`)
- [ ] `PROTECT_ROUTES=true` dan `TOKEN` diisi (`openssl rand -hex 32`)
- [ ] `GATEWAY_ALLOW_QUERY_KEY=false` setelah semua aplikasi klien memakai header `X-Api-Key`
- [ ] `CORS_ORIGIN=https://domain-anda`
- [ ] `WEBHOOK_SECRET` diisi bila memakai webhook
- [ ] HTTPS di depan aplikasi (Nginx + sertifikat)
- [ ] Backup `AUTH_DIR`, folder `MEDIA_DIR`, dan database

## API kirim pesan untuk aplikasi lain
Dokumentasi lengkap semua endpoint: **[RES-API.md](RES-API.md)**.

Kunci API = `instance_key` device (admin melihatnya di halaman Devices). Kirim lewat **header `X-Api-Key`** (disarankan) atau `?key=` (lama; bisa dimatikan dengan `GATEWAY_ALLOW_QUERY_KEY=false`). Jika `PROTECT_ROUTES=true`, tambahkan `Authorization: Bearer <TOKEN>`.
```bash
curl -X POST "https://wa.contoh.com/api/message/text" \
  -H "X-Api-Key: <instance_key>" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"id":"08123456789","message":"Halo dari sistem"}'
```
Nomor berawalan `0` otomatis diganti `DEFAULT_COUNTRY_CODE`. Endpoint lain: `/image`, `/video`, `/audio`, `/sticker`, `/note` (voice note/PTT), dan `/doc` (multipart, field `file`). Pesan yang dikirim lewat API ikut tampil di Inbox. Dibatasi `GATEWAY_RATE_LIMIT_PER_MINUTE` per IP.

**Media masuk/keluar**: file disimpan di `MEDIA_DIR` (default `src/media/`) dan disajikan lewat URL bertanda tangan HMAC dengan masa berlaku (`MEDIA_URL_EXPIRY_HOURS`, default 7 hari) — bukan folder publik terbuka. URL diperbarui otomatis setiap inbox dibuka. Metadata (MIME, nama file, ukuran, dimensi, durasi, voice note, caption) disimpan di tabel `messages`. Kolom baru dipasang otomatis saat start (dan oleh `npm run db:upgrade`); file media tidak ikut di database — backup folder `MEDIA_DIR` bersama database.

## Webhook
Webhook diatur **per device**: isi URL (dan secret opsional) saat membuat device atau lewat tombol **Edit** di halaman Devices. Device tanpa webhook memakai `WEBHOOK_URL` global sebagai fallback.

Payload (JSON): `{ "id", "version": "1.0", "event": "messages" | "message.update" | "connection", "device_id", "device_name", "timestamp", "data": {...} }`. **`instance_key` tidak ikut dikirim** (set `WEBHOOK_INCLUDE_KEY=true` hanya bila klien lama masih membutuhkannya).

Bila secret diisi, setiap request membawa `X-Signature: sha256=<hex>` = HMAC-SHA256 dari **body mentah**, plus header `X-Webhook-Event` dan `X-Webhook-Id`. Panduan integrasi lengkap: **[WebHook.md](WebHook.md)**.

Contoh verifikasi (Node.js):
```js
const crypto = require("crypto");
const expected = "sha256=" + crypto.createHmac("sha256", process.env.WEBHOOK_SECRET).update(rawBody).digest("hex");
const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers["x-signature"] || ""));
```

## Perubahan v3.0
Versi ini **menghapus** fitur berikut (beserta endpoint, halaman, model, dan env-nya):
- Antrean anti-ban & broadcast (`/api/message/queue*`, halaman Antrian, `QUEUE_*`)
- Import/export kontak & broadcast kontak (`/api/devices/:id/contacts*`, halaman Kontak)
- Auto-reply rules (`/api/devices/:id/rules`, halaman Auto-reply, `AUTOREPLY_*`)
- Role bertingkat `super_admin`, izin per role/per user, dan ACL per device (`/api/roles/*`, `/api/users/:id/permissions`, `DeviceAgent`)
- Kirim media dari URL (`/api/message/mediaurl`, `MEDIA_URL_*`) dan resize gambar `sharp` (`IMAGE_*`)
- Cron redial (`/api/cron/redial`, `CRON_SECRET`) dan pairing code (QR saja)
- MySQL auth store (`AUTH_STORE`, `MYSQL_ENABLED`) — sesi selalu di file

Yang perlu disesuaikan:
| Perubahan | Tindakan |
|---|---|
| `super_admin` dihapus | Ubah akun menjadi `admin`; semua admin setara |
| Semua user melihat semua device | Perilaku baru; tidak ada lagi penugasan device |
| Endpoint antrean/kontak/rule/mediaurl hilang | Kirim langsung lewat `/api/message/*`; kontak vCard tetap bisa dikirim dari Inbox |
| Gambar tidak lagi di-resize server | Kirim ukuran wajar; Baileys menangani thumbnail |
| `AUTH_STORE`/`MYSQL_ENABLED` diabaikan | Hapus dari `.env`; sesi memakai `AUTH_DIR` |

## Skrip
| Perintah | Fungsi |
|---|---|
| `npm start` / `npm run dev` | Jalankan server / mode watch |
| `npm test` | Tes integrasi (SQLite in-memory, WhatsApp palsu) |
| `npm run lint` | ESLint |
| `npm run seed:admin -- email "password" "Nama"` | Buat admin |
| `npm run seed:user -- email "password" "Nama"` | Buat agent |
| `npm run db:sync` / `db:reset` | Buat tabel / **hapus semua tabel** lalu buat ulang |
| `npm run db:upgrade [-- --dry-run]` | Rapikan DB lama (dedupe + index) |
| `npm run audit:prod` | `npm audit` untuk dependensi produksi |
| `npm run build:frontend` | Build `frontend/dist` |

## Catatan teknis
- Skema dibuat oleh `sequelize.sync()` (tanpa migrasi). Perubahan kolom pada tabel yang sudah ada **tidak** diterapkan otomatis; patch kolom media & webhook ditangani `dbSchema.js`.
- Baileys adalah API tidak resmi, pemblokiran nomor oleh WhatsApp tetap mungkin. Kirim pesan secara wajar.
- Token login disimpan di `localStorage` browser. Gunakan HTTPS dan jaga agar dashboard tidak terpapar ke publik tanpa perlu.

## Tes
```bash
npm test
```
