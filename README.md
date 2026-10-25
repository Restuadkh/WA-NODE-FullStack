# WA Dashboard

Gateway WhatsApp (Baileys) dengan dashboard web: kelola nomor, balas chat bersama tim secara realtime, auto-reply, dan API kirim pesan untuk aplikasi lain.

- **Backend**: Node.js ≥ 20, Express 5, Sequelize (MySQL/MariaDB), socket.io, Baileys
- **Frontend**: React + Vite di `frontend/` (build butuh Node ≥ 20.19; hasil build disajikan backend, satu proses satu port)

> Versi **2.4** — antrean pesan keluar (anti-ban) dengan jeda acak & kuota per device. Sebelumnya: webhook per device (2.3), media penuh dan reconnect per sesi (2.2). **Pengguna lama: baca bagian [Upgrade dari v2.0](#upgrade-dari-v20).**

## Fitur
- Login JWT, role `admin` (kelola device, tautkan QR, rule) dan `agent` (balas chat)
- Device: tautkan lewat QR atau kode pairing, status realtime, hapus (logout + bersihkan data)
- Inbox: chat pribadi & grup, teks, **gambar, video, stiker, audio/voice note, dan dokumen** (terima & kirim), centang terkirim/diterima/dibaca, badge belum dibaca bersama
- Auto-reply berbasis kata kunci (exact / contains / starts_with / `*`), per device, dengan batas balasan per menit
- API kirim pesan untuk aplikasi lain: teks, gambar, video, audio, voice note, stiker, dokumen, media dari URL
- Reconnect otomatis **per sesi** dengan backoff + jitter; satu sesi yang terputus tidak memutus/menahan sesi lain
- Webhook keluar (opsional, dapat ditandatangani HMAC) untuk pesan masuk dan status koneksi, **diatur per device** dari dashboard (fallback `WEBHOOK_URL` global)
- **Antrean pesan keluar (anti-ban)**: kirim lewat `POST /api/message/queue` — jeda acak 8–25 detik, satu pesan sekaligus per device, kuota rolling per jam/24 jam, jam kirim, simulasi mengetik, retry backoff, dan halaman **Antrian** di dashboard. Device boleh offline saat enqueue; job tetap ada setelah restart. Panduan: **[QUEUE.md](QUEUE.md)**

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
- [ ] Backup `AUTH_DIR` (atau tabel `Session` bila `AUTH_STORE=mysql`), folder `MEDIA_DIR`, dan database

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
Nomor berawalan `0` otomatis diganti `DEFAULT_COUNTRY_CODE`. Endpoint lain: `/image`, `/video`, `/audio`, `/sticker`, `/note` (voice note/PTT), `/doc` (multipart, field `file`) dan `/mediaurl` (`url`, `type`, `mimetype`, `caption`, `ptt`). Pesan yang dikirim lewat API ikut tampil di Inbox. Dibatasi `GATEWAY_RATE_LIMIT_PER_MINUTE` per IP.

**Kirim massal dengan lebih aman** lewat antrean — device boleh offline, pesan dikirim bertahap:
```bash
curl -X POST "https://wa.contoh.com/api/message/queue" \
  -H "X-Api-Key: <instance_key>" \
  -H "Content-Type: application/json" \
  -d '{"id":"08123456789","message":"Halo","scheduled_at":"2026-10-26T09:00:00+07:00","ref":"invoice-1"}'
```
Endpoint `queue`, `queue/batch`, `queue/media`, `queue/mediaurl`; job dipantau/dibatalkan di halaman **Antrian**. Detail & batas anti-ban: **[QUEUE.md](QUEUE.md)**.

**Media masuk/keluar**: file disimpan di `MEDIA_DIR` (default `src/media/`) dan disajikan lewat URL bertanda tangan HMAC (`/media/...?t=...`), bukan folder publik terbuka. Metadata (MIME, nama file, ukuran, dimensi, durasi, voice note, caption) disimpan di tabel `messages`. Kolom baru dipasang otomatis saat start (dan oleh `npm run db:upgrade`); file media tidak ikut di database — backup folder `MEDIA_DIR` bersama database.

**`/mediaurl`**: server mengunduh file sendiri (maks `MEDIA_URL_MAX_MB`, timeout `MEDIA_URL_TIMEOUT_MS`) lalu mengirimkannya. URL yang mengarah ke alamat internal/privat (loopback, 10.x, 172.16–31.x, 192.168.x, 169.254.x termasuk metadata cloud, IPv6 lokal) **ditolak** dengan HTTP 400, termasuk lewat redirect atau DNS rebinding. Batasi lebih jauh dengan `MEDIA_URL_ALLOWED_HOSTS`.

## Webhook
Webhook diatur **per device**: isi URL (dan secret opsional) saat membuat device atau lewat tombol **Edit** di halaman Devices. Device tanpa webhook memakai `WEBHOOK_URL` global sebagai fallback.

Payload (JSON): `{ "id", "version": "1.0", "event": "messages" | "connection", "device_id", "device_name", "timestamp", "data": {...} }`. **`instance_key` tidak ikut dikirim** (set `WEBHOOK_INCLUDE_KEY=true` hanya bila klien lama masih membutuhkannya).

Bila secret diisi, setiap request membawa `X-Signature: sha256=<hex>` = HMAC-SHA256 dari **body mentah**, plus header `X-Webhook-Event` dan `X-Webhook-Id`. Panduan integrasi lengkap (contoh Node.js/PHP/Python, verifikasi signature, troubleshooting): **[WebHook.md](WebHook.md)**.

Contoh verifikasi (Node.js):
```js
const crypto = require("crypto");
const expected = "sha256=" + crypto.createHmac("sha256", process.env.WEBHOOK_SECRET).update(rawBody).digest("hex");
const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers["x-signature"] || ""));
```

## Upgrade dari v2.0
1. **Backup database** (`mysqldump`) dan folder `AUTH_DIR`.
2. `git pull && npm install && npm run build:frontend`.
3. Preview perubahan data: `npm run db:upgrade -- --dry-run`
4. Terapkan: `npm run db:upgrade` — membuat tabel antrean (`message_jobs`), menambahkan kolom media & ENUM `sticker`, kolom webhook device (`webhook_url`, `webhook_secret`), menghapus baris duplikat (`numbers` dan `messages`), lalu memasang index unik/riwayat. Aman dijalankan berulang.
5. Restart server. Bila Anda lupa langkah 4, server **tetap start** (hanya peringatan di log) tetapi index unik belum terpasang.

Perubahan yang perlu disesuaikan di sisi Anda:
| Perubahan | Tindakan |
|---|---|
| Webhook tidak lagi memuat `key` | Pakai `device_id` untuk mengenali device, atau set `WEBHOOK_INCLUDE_KEY=true` sementara |
| `GET /api/devices/:id/qr` hanya admin | Agent tidak lagi bisa membuka QR/pairing (tombol "Tautkan" disembunyikan untuk agent) |
| `/mediaurl` mengunduh di server | Pastikan URL publik; alamat internal ditolak. Batas ukuran 25 MB |
| `CLIENT_PLATFORM`, `CLIENT_BROWSER`, `CLIENT_VERSION` dihapus | Tidak pernah berpengaruh; hapus dari `.env` |
| Model `Number` → `ContactName` (tabel `numbers` tetap) | Hanya relevan bila Anda memakai kode internal repo ini |

## Skrip
| Perintah | Fungsi |
|---|---|
| `npm start` / `npm run dev` | Jalankan server / mode watch |
| `npm test` | Tes integrasi + keamanan (SQLite in-memory, WhatsApp palsu) |
| `npm run lint` | ESLint |
| `npm run seed:admin -- email "password" "Nama"` | Buat admin |
| `npm run seed:user -- email "password" "Nama"` | Buat agent |
| `npm run db:sync` / `db:reset` | Buat tabel / **hapus semua tabel** lalu buat ulang |
| `npm run db:upgrade [-- --dry-run]` | Rapikan DB lama (dedupe + index) |
| `npm run audit:prod` | `npm audit` untuk dependensi produksi |
| `npm run build:frontend` | Build `frontend/dist` |

## Catatan teknis
- Skema dibuat oleh `sequelize.sync()` (tanpa migrasi). Perubahan kolom pada tabel yang sudah ada **tidak** diterapkan otomatis; untuk perubahan skema berikutnya pertimbangkan `sequelize-cli`/`umzug`.
- Batas auto-reply per device (`AUTOREPLY_MAX_PER_MINUTE`, default 20) menjaga nomor dari pola kirim massal; rule `*` tetap berisiko bagi nomor Anda — gunakan seperlunya. Baileys adalah API tidak resmi, pemblokiran nomor oleh WhatsApp tetap mungkin.
- Token login disimpan di `localStorage` browser. Gunakan HTTPS dan jaga agar dashboard tidak terpapar ke publik tanpa perlu.

## Tes
```bash
npm test
```
