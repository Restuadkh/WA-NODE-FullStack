# Roadmap

Rencana kerja **WA-NODE-FullStack** per November 2026 (setelah rilis [3.1.0](CHANGELOG.md)).

**Posisi project:** WhatsApp Gateway — kelola device WhatsApp, inbox realtime, kirim pesan lewat **REST API** (`/api/message/*`), dan terima event lewat **webhook** (pesan masuk, update status, koneksi). Project ini **bukan toko online dan tidak memproses pembayaran**; tidak ada roadmap jualan/merchant.

Status: ⬜ belum mulai · 🟨 sedang/berjalan · ✅ selesai

---

## 🎯 Jangka pendek (0–1 bulan) — deployment & kelengkapan operasional

| # | Item | Detail |
|---|------|--------|
| 1 ⬜ | Domain produksi + HTTPS | Nginx reverse proxy di depan Node, `TRUST_PROXY=1`, `CORS_ORIGIN=https://domain-anda` di `.env` |
| 2 ⬜ | CI (GitHub Actions) | `npm run lint` + `npm test` + build frontend pada setiap push — saat ini semua masih dijalankan manual |
| 3 ⬜ | Notifikasi email untuk pesan kontak | Kirim email (SMTP/nodemailer, env `SMTP_*`) ke pemilik setiap ada isi `POST /api/contact` — saat ini pesan hanya tersimpan di `CONTACT_DIR`, mudah terlewat |
| 4 ⬜ | Halaman admin "Pesan Kontak" | Baca/tandai selesai pesan formulir kontak langsung dari dashboard (ganti JSONL → tabel `contact_messages` + migrasi file lama) |
| 5 ⬜ | Health check lebih informatif | `/api/status` memuat kondisi DB, jumlah device terhubung, uptime — untuk monitoring uptime eksternal |

**Definisi selesai:** gateway berjalan di domain produksi dengan HTTPS, perubahan terdeteksi CI, dan pesan kontak tidak lagi terlewat.

---

## 🔧 Jangka menengah (1–3 bulan) — keandalan API & keamanan

### Webhook & API
- ⬜ **Retry webhook dengan backoff** — pengiriman saat ini *fire-and-forget* (`webhook.js`): satu kegagalan jaringan di penerima = event hilang selamanya. Tambahkan retry terjadwal (mis. 3 percobaan, backoff eksponensial) + endpoint replay/manual redelivery.
- ⬜ **Spesifikasi API terbuka (OpenAPI)** yang dihasilkan dari kode, sehingga konsumen `/api/message/*` bisa generate client & docs selalu sinkron dengan `RES-API.md`.
- ⬜ **Contoh kode multi-bahasa** (PHP/cURL/Python) untuk kirim teks & media di `RES-API.md` atau folder `examples/`.

### Keamanan
- ⬜ **Pembatasan room socket.io per device/user** — saat ini semua klien dashboard menerima event semua device; batasi agar event hanya sampai ke pihak yang berhak.
- ⬜ **Refresh token / masa berlaku JWT** + logout yang benar-benar mengakhiri sesi (saat ini JWT di localStorage sampai kedaluwarsa).
- ⬜ **Rate limit global** untuk seluruh `/api` (saat ini hanya login & kontak yang dibatasi).
- ⬜ **Retensi & penghapusan data otomatis**: job pembersihan pesan/media lebih dari N hari, diatur env.

### Operasional
- ⬜ **Backup otomatis** database + `MEDIA_DIR` + `CONTACT_DIR` dengan rotasi.
- ⬜ **Log rotasi** (pino-file + rotate) di `logs/`.

---

## 🚀 Jangka panjang (3–6+ bulan) — skalabilitas & fitur gateway

- ⬜ **Arsitektur multi-proses/worker** — saat ini instance Baileys hidup di memori sehingga **wajib satu proses** (PM2 fork mode). Untuk banyak device, pisahkan proses gateway per kelompok device dari proses API (komunikasi via DB/antrean). Ini prasyarat semua item skala di bawah.
- ⬜ **Statistik dashboard**: volume pesan harian, chat belum dibalas, waktu respon pertama, health per device.
- ⬜ **Broadcast yang aman** (opsional): personalisasi template + throttle per menit + jeda antar device — fitur ini dihapus di v3.0.0; hidupkan kembali hanya dengan mekanisme anti-ban yang benar.
- ⬜ **Auto-reply / chatbot** (opsional): aturan balas otomatis, atau biarkan aplikasi eksternal membalas via REST API + webhook (pola yang sudah didukung sekarang).
- ⬜ **Upgrade Baileys major** dengan jendela pengujian khusus (versi rc sering mengubah internal).

---

## Prinsip yang dipertahankan

- **Fokus gateway**: REST API + webhook adalah produk utama; tidak menambah fitur toko/checkout/pembayaran.
- **Satu proses, PM2 fork mode** — instance WhatsApp hidup di memori; jangan cluster tanpa desain ulang.
- **Tidak menghapus data saat migrasi** — `sequelize.sync()` hanya membuat tabel baru; patch kolom lewat `dbSchema.js`.
- **Setiap fitur baru punya tes regresi** — pola yang dipakai sejak v2.8.x dan menjaga suite tetap hijau.
