# Kesiapan Verifikasi Merchant Payment Gateway

Dokumen ini merangkum audit dan pekerjaan yang dilakukan pada **27 November 2026** untuk menyiapkan situs WA Dashboard bagi proses pemeriksaan merchant Tripay, Midtrans, dan Xendit.

## 1. Hasil audit

Proyek yang dibuka **bukan toko online**. Ini adalah dashboard gateway WhatsApp:

- Backend: Node.js 20+, Express 5, Sequelize (MySQL/MariaDB; SQLite untuk test), socket.io, Baileys.
- Frontend: React 18 + Vite + React Router, disajikan oleh backend dari `frontend/dist` dalam satu port.
- Fitur inti: login JWT (admin/agent), device + QR, inbox realtime, API `/api/message/*`, webhook per device.
- **Tidak ditemukan**: produk/harga, keranjang, checkout, order, payment gateway (Tripay/Midtrans/Xendit), nama badan hukum, alamat usaha, email/telepon/WhatsApp resmi, domain produksi, jam operasional.
- Identitas yang benar-benar ada: brand **WA Dashboard** (`README.md`, `frontend/index.html`, UI) dan penulis paket **Restuadkh** (`package.json`). Email pada riwayat commit git bukan informasi kontak resmi yang dikonfirmasi, sehingga tidak dipakai pada halaman publik.

Konsekuensi: halaman legal dan profil dapat dibuat jujur, tetapi **persetujuan merchant tidak dapat dijamin** sebelum data usaha dan alur pembayaran nyata tersedia.

## 2. Yang sudah diterapkan

- Halaman publik tanpa login: beranda, tentang kami, kebijakan privasi, syarat & ketentuan, kebijakan refund, kebijakan pembatalan, hubungi kami, FAQ, halaman 404.
- Navbar, breadcrumb, footer perusahaan/legal/bantuan, copyright tahun berjalan, tautan internal yang konsisten.
- Kebijakan privasi mengacu pada UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi dan disesuaikan dengan implementasi (JWT localStorage, Baileys, media HMAC, formulir kontak, belum ada gateway pembayaran).
- Formulir kontak benar-benar memproses data: validasi, honeypot, rate limit 5/15 menit per IP, simpan JSONL di `CONTACT_DIR` di luar folder statis, nomor referensi dikembalikan ke pengguna. Tidak ada klaim email otomatis.
- SEO: judul/deskripsi unik per halaman, canonical dinamis, Open Graph, Twitter card, favicon SVG, `robots.txt`, `sitemap.xml` yang mengikuti domain request (tanpa domain fiktif).
- Dashboard existing tetap berjalan: `/dashboard`, `/devices`, `/users`, `/api-docs`, `/login`. Root `/` menampilkan situs publik untuk pengunjung dan mengarahkan pengguna login ke `/dashboard`.
- Test: 31 tes lulus, lint bersih, build frontend sukses, `npm audit --omit=dev` = 0 kerentanan.

## 3. TODO sebelum submit ke payment gateway

| No | Data / tindakan | Status | Catatan |
|---|---|---|---|
| 1 | Nama badan hukum / nama usaha resmi | Belum ada | Isi `site.contact.legalName` di `frontend/src/public/site.js` |
| 2 | Alamat usaha | Belum ada | Isi `site.contact.address`; peta baru ditampilkan bila alamat tersedia |
| 3 | Email resmi | Belum ada | Isi `site.contact.email`; sebaiknya domain sendiri, bukan gmail |
| 4 | Nomor telepon & WhatsApp CS | Belum ada | Isi `site.contact.phone` / `whatsapp` |
| 5 | Jam operasional | Belum ada | Isi `site.contact.hours` |
| 6 | Domain produksi aktif + HTTPS | Belum ada di source | Atur Nginx/proxy, `TRUST_PROXY=1`, `CORS_ORIGIN=https://domain-anda` |
| 7 | Daftar produk/layanan berharga dalam IDR | Belum ada | Saat ini situs hanya perangkat lunak gateway WhatsApp tanpa paket harga |
| 8 | Alur checkout & integrasi payment gateway | Belum ada | Tripay/Midtrans/Xendit belum terintegrasi; jangan mengklaim metode pembayaran |
| 9 | SLA refund & peninjauan pengajuan | Belum ada | Halaman refund sengaja tidak menjanjikan waktu tertentu |
| 10 | Pejabat/unit pelindungan data (opsional) | Belum ada | Sesuai UU PDP bila diperlukan organisasi |
| 11 | CSRF/XSS library & pembatasan room socket per device | Belum diterapkan | Risiko tambahan; JWT localStorage dapat dibaca skrip bila ada XSS |
| 12 | Kebijakan retensi & penghapusan data otomatis | Belum ada | Perlu diputuskan pemilik layanan |

## 4. Rekomendasi per gateway

- **Umum**: lengkapi TODO nomor 1–8, pastikan nama brand dan data pendaftaran identik di semua halaman, aktifkan HTTPS, dan uji checkout dari browser publik (tanpa login) sebelum mengirim link verifikasi.
- **Tripay**: siapkan katalog/harga IDR, metode pembayaran yang benar-benar aktif, callback/status transaksi, serta kebijakan refund yang selaras dengan alur Tripay.
- **Midtrans**: siapkan order ID, Snap/endpoint pembayaran, notifikasi webhook dengan verifikasi signature, dan halaman status transaksi.
- **Xendit**: siapkan invoice/checkout, callback dengan token verifikasi, dan alur pembatalan/pengembalian dana yang sesuai.

> Keberadaan halaman legal tidak otomatis membuat pengajuan disetujui. Keputusan tetap berada di masing-masing payment gateway.
