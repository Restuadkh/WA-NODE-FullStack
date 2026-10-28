# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/); versi mengikuti SemVer.

## [2.5.0] — 2026-10-29

### 🔒 Keamanan

- **Webhook HMAC** — header `X-Signature` kini berisi HMAC-SHA256 dari body mentah (`sha256=<hex>`), bukan lagi secret mentah (bug kritis yang membuat secret bocor ke penerima webhook). Log `console.debug` yang membocorkan secret & isi pesan dihapus.
- **ACL per device untuk semua role** — penugasan device di tabel `device_agents` kini berlaku untuk admin DAN agent:
  - Admin **tanpa** penugasan = akses penuh ke semua device (super admin, perilaku lama).
  - Admin **dengan** penugasan = hanya melihat/mengelola device yang ditugaskan (chat, rule, antrian, QR, edit, hapus). Device lain dibalas `404`.
  - Agent = hanya device yang ditugaskan; tanpa penugasan = tidak melihat device apa pun (memperbaiki bug user tanpa device masih melihat device).
  - Device yang dibuat oleh admin yang dibatasi otomatis masuk daftar miliknya.
  - Pembatasan juga berlaku di **socket.io**: `join:device` divalidasi, event realtime hanya sampai ke user pemilik device.
- **URL media berkedaluwarsa** — tanda tangan HMAC kini mencakup waktu kedaluwarsa (`MEDIA_URL_EXPIRY_HOURS`, default 7 hari). URL diperbarui otomatis setiap daftar pesan dibuka; URL lama yang bocor otomatis mati.
- **Fallback secret media lemah dihapus** — tanda tangan media menolak jalan bila `MEDIA_TOKEN_SECRET`/`JWT_SECRET` kosong.

### ✨ Fitur

- **Manajemen Pengguna di dashboard** (menu **Pengguna**, admin): tambah/edit/hapus akun, ganti nama/role/password, dan **penugasan device** per user. Admin terakhir dilindungi (tidak bisa dihapus/diturunkan), tidak bisa menghapus akun sendiri.
- **Auto-reconnect terbatas dari endpoint QR** — membuka QR / tombol Tautkan pada device offline/terputus memicu retry otomatis maksimal `DEVICE_QR_START_ATTEMPTS` (default **3**) dengan jeda 2 detik, lalu **berhenti total + cooldown 60 detik** (bukan retry tanpa akhir). Response `GET /api/devices/:id/qr` kini memuat `attempts` (progres percobaan) dan `cooldown_ms`. Modal QR menampilkan "percobaan 2/3" dan sisa waktu cooldown.
- **Halaman Dok API** (`/api-docs`) di dashboard: dokumentasi penggunaan `/api/message/*` beserta contoh request/response, tabel kode status, ringkasan kuota anti-ban, dan format webhook (detail lengkap tetap di `RES-API.md`).

### 🛠 Perbaikan bug

- `removeDevice` kini dalam **transaksi database** — kegagalan di tengah tidak lagi menyisakan data setengah terhapus; link ACL ikut dibersihkan.
- **Antrean anti kirim-dobel** — kolom baru `claimed_at` (terpasang otomatis saat start / `npm run db:upgrade`): job `sending` hanya direset bila klaimnya basi (>15 menit), guard `message_id` mencegah pengiriman ulang, dan increment `attempts` dilakukan di SQL agar tidak saling menimpa dengan tombol Ulangi.
- `markRead` di inbox kini **sinkron ke WhatsApp** (`readMessages`) — centang di ponsel ikut berubah, bukan hanya di dashboard.
- `toJid` memvalidasi suffix jid (`@s.whatsapp.net`, `@g.us`, `@lid`, `@broadcast`) — email / string aneh tidak lagi bisa dikirim sebagai jid.
- `createUser` tanpa field `device_ids` tidak lagi gagal 400.

### 📄 Dokumentasi

- `.env.example` dilengkapi opsi yang selama ini tidak terdokumentasi: `GATEWAY_ALLOW_QUERY_KEY`, `GATEWAY_RATE_LIMIT_PER_MINUTE`, `AUTOREPLY_MAX_PER_MINUTE`, `MEDIA_URL_EXPIRY_HOURS`, `DB_DIALECT`/`DB_STORAGE`, `DEVICE_QR_START_ATTEMPTS`. Variabel usang `CLIENT_*` dihapus.
- `RES-API.md`: bagian baru **7b Manajemen Pengguna**, aturan ACL terbaru, dan format URL media berkedaluwarsa.

### 🧪 Tes

- 24 tes lulus (sebelumnya 22): penugasan/ACL admin & agent (termasuk admin terbatas 404 di device lain, auto-assign device buatan admin terbatas, agent tanpa device melihat kosong), proteksi admin terakhir, start terbatas 3x + cooldown, URL media kedaluwarsa ditolak, jid tidak valid ditolak.

### ⬆️ Upgrade dari 2.4

1. Backup database & folder `AUTH_DIR`.
2. `git pull && npm install && npm run build:frontend`.
3. Jalankan `npm run db:upgrade` (menambah kolom `claimed_at` + tabel `device_agents`; juga aman dijalankan berulang).
4. Restart server.
5. **Perilaku baru yang perlu diketahui**: user agent lama tanpa penugasan tidak lagi melihat device apa pun — tugaskan device lewat menu **Pengguna**. Aplikasi klien webhook/media harus memakai `media_url` dari response terbaru (URL media kini berkedaluwarsa).

## [2.4.0] — rilis sebelumnya

- Antrean pesan keluar anti-ban: jeda acak 8–25 detik, kuota rolling per jam/24 jam per device, jam kirim, simulasi mengetik, retry backoff, halaman Antrian. Lihat `QUEUE.md`.
