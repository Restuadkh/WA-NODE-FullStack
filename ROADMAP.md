# Roadmap

Rencana kerja **WA-NODE-FullStack** per November 2026 (setelah rilis [3.1.0](CHANGELOG.md)).
Prioritas disusun dari kondisi kode saat ini: inti gateway stabil (31 tes lulus), situs publik + formulir kontak sudah jalan, dan verifikasi merchant payment gateway masih menunggu data usaha.

Status: ⬜ belum mulai · 🟨 sedang/berjalan · ✅ selesai

---

## 🎯 Jangka pendek (0–1 bulan) — lolos verifikasi merchant

Fokus: satu-satunya tujuan adalah **pengajuan merchant (Tripay/Midtrans/Xendit) disetujui**. Semua item merujuk checklist [MERCHANT-READINESS.md](MERCHANT-READINESS.md).

| # | Item | Detail |
|---|------|--------|
| 1 ⬜ | Lengkapi data usaha | Isi `site.contact.legalName`, `address`, `email`, `phone`, `whatsapp`, `hours` di `frontend/src/public/site.js` (TODO no. 1–5) |
| 2 ⬜ | Domain produksi + HTTPS | Deploy di domain sendiri, Nginx reverse proxy, `TRUST_PROXY=1`, `CORS_ORIGIN=https://domain` (TODO no. 6) |
| 3 ⬜ | Halaman harga / layanan | Daftar paket & harga IDR untuk layanan gateway WhatsApp (TODO no. 7) |
| 4 ⬜ | Integrasi payment gateway pertama | Pilih satu (rekomendasi: **Tripay** — paling ringan): produk, checkout, callback + verifikasi signature, halaman status transaksi (TODO no. 8) |
| 5 ⬜ | Kebijakan refund dengan SLA jelas | Tetapkan SLA refund & waktu peninjauan setelah alur pembayaran nyata ada (TODO no. 9) |
| 6 ⬜ | Uji end-to-end dari browser publik | Checkout tanpa login → bayar → callback → status, sebelum link verifikasi dikirim |

**Definisi selesai:** link situs publik + checkout nyata siap dikirim ke penyedia payment gateway.

---

## 🔧 Jangka menengah (1–3 bulan) — operasional & keamanan

Fokus: membuat layanan layak operasional untuk pelanggan berbayar, bukan hanya lolos review.

### Pesan kontak & notifikasi
- ⬜ **Notifikasi email otomatis** untuk `POST /api/contact` (SMTP: nodemailer, env `SMTP_*`) — saat ini pesan hanya tersimpan, pemilik situs tidak tahu ada pesan masuk.
- ⬜ **Halaman admin "Pesan Kontak"** di dashboard: baca/balas/tandai selesai, ganti penyimpanan JSONL → tabel `contact_messages` (Sequelize) dengan migrasi dari file lama.
- ⬜ **Backup otomatis** `CONTACT_DIR` + folder media (`MEDIA_DIR`) dan rotasinya.

### Keamanan (melanjutkan TODO no. 11–12 di MERCHANT-READINESS.md)
- ⬜ **Pembatasan room socket.io per device/user** — saat ini semua klien dashboard menerima event semua device; batasi agar agent hanya menerima device yang ditugaskan.
- ⬜ **Refresh token / masa berlaku JWT** + logout yang benar-benar mengakhiri sesi (saat ini JWT di localStorage sampai kedaluwarsa).
- ⬜ **Retensi & penghapusan data otomatis** (TODO no. 12): job pembersihan pesan/media lebih dari N hari, diatur env.
- ⬜ Rate limit global selain endpoint login & kontak.

### Operasional
- ⬜ **CI (GitHub Actions)**: `npm run lint` + `npm test` + build frontend pada setiap push — saat ini semua dijalankan manual.
- ⬜ Health endpoint yang lebih informatif (`/api/status` + cek DB & jumlah sesi aktif) untuk monitoring uptime.
- ⬜ Log rotasi (pino-file + rotate) di `logs/`.

---

## 🚀 Jangka panjang (3–6+ bulan) — pertumbuhan produk

Fokus: dari "gateway untuk sendiri" menjadi produk yang bisa dijual.

- ⬜ **Multi-tenant / SaaS**: isolasi data per tenant, paket berlangganan, limit device/pesan per paket — prasyarat: arsitektur saat ini **wajib satu proses** (instance Baileys di memori, PM2 fork mode); perlu desain ulang (worker per proses / antrean) sebelum multi-tenant.
- ⬜ **Statistik dashboard**: volume pesan harian, chat belum dibalas, waktu respon pertama, health per device.
- ⬜ **Broadcast yang aman**: personalisasi template + throttle per menit + jeda antar device (fitur ini dihapus di v3.0.0; hidupkan kembali hanya dengan mekanisme anti-ban yang benar).
- ⬜ **Auto-reply / chatbot**: aturan balas otomatis atau integrasi webhook balasan dari aplikasi eksternal (juga dihapus di v3.0.0).
- ⬜ **Dukungan bahasa Inggris** untuk situs publik & dashboard (i18n) bila target pasar meluas.
- ⬜ **Upgrade Baileys major** dengan jendela pengujian khusus (Baileys versi rc sering ada perubahan breaking).

---

## Prinsip yang dipertahankan

- **Satu proses, PM2 fork mode** — instance WhatsApp hidup di memori; jangan cluster tanpa desain ulang.
- **Tidak menghapus data saat migrasi** — `sequelize.sync()` hanya membuat tabel baru; patch kolom lewat `dbSchema.js`.
- **Setiap fitur baru punya tes regresi** — pola yang dipakai sejak v2.8.x dan menjaga suite tetap hijau.
- **Halaman publik jujur** — tidak mengklaim fitur/pembayaran yang belum ada (pelajaran dari audit merchant).
