# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/); versi mengikuti SemVer.

## [2.8.3] — 2026-11-22

### Diperbaiki — `EPERM: operation not permitted, unlink ... app-state-sync-key-*.json`
- Penyebabnya: **dua device memakai nomor WhatsApp yang sama** (`TEST` dan `test2`, keduanya `6285172020817`). WhatsApp memutus sesi dengan `401 Connection Failure`, aplikasi lalu menghapus folder auth saat Baileys masih menulis file `app-state-sync-key`, dan Windows/Defender menolak `unlink` (`EPERM`).
- `removeAuthState()` sekarang **serial, idempoten, dan tidak pernah melempar**: retry untuk `EPERM/EBUSY/ENOTEMPTY/EACCES`, fallback pindah folder, lalu marker `.logged-out` bila tetap terkunci. Kredensial lama tidak dipakai lagi saat sesi dicoba ulang.
- `restoreAll()` melewati device dengan nomor ganda dan memilih satu sesi aktif; `POST /api/devices` menolak nomor duplikat dengan HTTP `409`.
- Panduan troubleshooting ditambahkan ke **[DEPLOY-WINDOWS.md](DEPLOY-WINDOWS.md)**.

### 🧪 Tes
- Tes regresi baru: penghapusan sesi dipanggil bersamaan, marker logout, dan `listStoredKeys` melewati folder ber-marker.
- `npm test`: 42 lolos, 2 gagal baseline yang sudah ada sebelumnya (webhook HMAC & manajemen user).

## [2.8.2] — 2026-11-22

### Diperbaiki — Kirim gambar tidak menyebabkan service restart
- **Akar masalah**: Baileys membuat thumbnail dengan `sharp`/libvips setiap kali mengirim `image`. file rusak, format tak dikenal, atau gambar resolusi ekstrem membuat decoder native bekerja tanpa batas (lonjakan memori / error libvips). Karena proses berjalan di PM2 dengan `max_memory_restart: 700M`, service ikut restart dan sesi WhatsApp terputus.
- `sendMedia()` sekarang menyiapkan gambar di aplikasi **sebelum** diserahkan ke Baileys:
  - menolak file yang bukan gambar (magic bytes JPEG/PNG/WebP/GIF/TIFF/HEIC) dengan HTTP 400,
  - mengecilkan gambar > 2560 px ke JPEG kualitas 82 (batas aman: 8192 px / 40 MP),
  - membuat `jpegThumbnail` sendiri sehingga Baileys **tidak memanggil decoder gambar** sama sekali,
  - memutakhirkan buffer/meta objek file agar salinan di disk dan riwayat sama dengan yang terkirim.
- `sharp` kini dependency langsung (bukan hanya optional peer Baileys), dengan fallback thumbnail placeholder bila tidak terpasang.
- Env baru: `IMAGE_MAX_PIXELS`, `IMAGE_MAX_DIMENSION`, `IMAGE_RESIZE_MAX`, `IMAGE_JPEG_QUALITY`, `IMAGE_THUMBNAIL_SIZE` (ditambahkan ke `.env.example`).
- Dokumentasi lengkap: **[MEDIA.md](MEDIA.md)** (alur, format, batas, error, deployment, troubleshooting), plus tautan dari `README.md`, `RES-API.md`, dan `DEPLOY-WINDOWS.md`.

### 🧪 Tes
- Tes regresi: gambar rusak ditolak, gambar 6000x6000 dikecilkan < 2560 px, thumbnail dihasilkan aplikasi, dan `content.jpegThumbnail` ikut terkirim.
- Uji manual ke `089671533195`: JPEG 1600x1200 & PNG 6000x6000 terkirim HTTP 201, PNG 9000x9000 ditolak HTTP 400 dengan pesan jelas, PID proses tidak berubah, memori puncak ~204 MB.

## [2.8.1] — 2026-11-20

### Diperbaiki — Kirim gambar saat service restart mendadak
- **Inbox sekarang tahan crash**: sebelum memanggil WhatsApp, gambar (dan media lain) dari composer disimpan lebih dulu sebagai `message_jobs` ber-status `sending` + file sementara di `MEDIA_DIR`. Jika proses mati mendadak di tengah kirim, worker memulihkan job itu saat start dan mengirim ulang dari file tersebut — caption, chat asal, pengirim, dan kutipan reply tetap terjaga. Job yang berhasil tetap ditandai `sent` seperti biasa.
- **Pemulihan antrean tanpa tunggu 15 menit**: saat proses start, semua job `sending` langsung dikembalikan ke `pending` (deployment wajib satu proses). Sebelumnya job yang baru diklaim sebelum crash mandek sampai `claimed_at` lewat 15 menit. `tick()` tetap memakai pengecekan klaim basi agar tidak merebut job dari proses lain yang masih hidup.
- Script `npm test` diperbaiki untuk Node 22 / Windows (`node --test "test/*.test.js"`).

### 🧪 Tes
- 3 tes regresi baru: pemulihan job gambar antrean setelah crash, pemulihan outbox gambar Inbox (termasuk kutipan & metadata), dan penulisan outbox Inbox sebelum kirim.

## [2.8.0] — 2026-11-16

### Ditambah — Kirim Kontak dari Composer
- **Kirim kartu kontak (vCard)** dari Inbox: tombol 👤 membuka **combobox** berisi kontak dari database — kotak pencarian + **centang banyak kontak sekaligus**, terkirim sebagai SATU pesan berisi daftar kartu kontak (maks 25/pesan).
- Penerima di WhatsApp bisa tap kartu kontak → chat langsung terbuka, tinggal kirim pesan.
- Format lama (satu kontak `{ contact }`) tetap didukung; format baru `{ contacts: [...] }` untuk banyak.
- Nama kosong otomatis memakai nomor; nomor tidak valid ditolak (HTTP 400); riwayat tersimpan sebagai `[Kontak] N kontak: …`.
- Test uji nomor `0896123345667` → dinormalisasi ke `+62896123345667` otomatis.

### Ditambah — Reply & Edit di Inbox
- **Pesan masuk berupa reply kini menampilkan kutipan**: handler membaca `contextInfo` (stanzaId, participant, quotedMessage) dari komponen pesan mana pun — kotak kutipan di atas gelembung dengan label "Anda"/nama kontak.
- **Pesan diedit (WhatsApp "edit")** kini tampil: body diperbarui ke teks terbaru, teks **sebelum edit pertama** tersimpan di kolom baru `edited_from` + `edited_at`, dan penanda kecil **"diedit"** di meta gelembung — hover untuk tooltip, klik untuk membuka teks aslinya. Update realtime lewat `message:update` (chat terbuka berubah tanpa refresh).

## [2.7.0] — 2026-11-16

### Ditambah — Manajemen Kontak & Broadcast
- **Halaman Kontak** per device: daftar nomor (nama, nomor, LID, pesan terakhir), tambah manual, hapus, dan tombol "Pesan" untuk membuka chat kontak langsung di Inbox.
- **Import kontak** dari **CSV, JSON, dan VCF** (kartu nama): dedupe otomatis berdasarkan nomor dinormalisasi (`normalizePhoneDigits` — menangani awalan `00` dan pola `62`+`0`), entri pertama menang; import ulang nomor yang sama memperbarui kontak yang ada.
- Batas import via env **`CONTACTS_IMPORT_MAX`** (default 5000 nomor unik per file).
- **Export kontak ke CSV** (BOM UTF-8, langsung rapi di Excel) — endpoint `GET /api/devices/:id/contacts/export` + tombol di halaman Kontak.
- **Broadcast** ke kontak lewat **antrean anti-ban** (jeda acak, kuota harian, jam aktif) dengan template `{{nama}}` dan `{{nomor}}`; target via checkbox per kontak ("pilih semua" tersedia) — tanpa seleksi berarti semua kontak yang tampil (ikut pencarian).
- **Broadcast media**: lampiran gambar/video/audio/dokumen dari form broadcast; teks menjadi caption dengan template tetap bekerja.
- Izin baru **`contacts_import`** (kolom di `role_permissions`, di-backfill sesuai default per role).
- Kontak disimpan di tabel `numbers` yang sudah ada (kolom `from_jid`, `lid_user`, `notify`) — LID ikut tersimpan saat kontak diimport/open.

### Ditambah — Inbox & Pengiriman
- **Kirim kartu kontak (vCard)** dari composer Inbox: tombol 👤 membuka form nama + nomor, dikirim sebagai kontak WhatsApp asli (vCard v3.0) dan tersimpan di riwayat sebagai `[Kontak] Nama (+nomor)`.
- **Reply/quote dari composer**: pesan balasan menyertakan objek `quoted` lengkap yang dituntut Baileys (`{ key: { remoteJid, id, fromMe, participant? }, message }`) — membalas pesan pribadi maupun grup kini berfungsi.
- **Nama pengirim di grup** ditampilkan di atas gelembung pesan (kolom baru `messages.sender_jid`).
- **Penanda "riwayat"** untuk pesan yang masuk via history sync saat device offline (kolom baru `messages.is_history`); badge unread tetap naik, pesan lama tidak memundurkan `last_message_at`.

### Ditambah — Mode Senyap (jalan di belakang layar)
- Env **`SEND_READ_RECEIPTS=false`**: membuka chat di dashboard TIDAK mengirim "terbaca" (centang biru) ke WhatsApp — badge lokal tetap dibersihkan, tapi kontak tidak tahu pesannya dibaca. Berlaku juga di auto-ack pesan masuk. Default `true` (perilaku lama).

### Diperbaiki
- Daftar chat menampilkan **nomor telepon (phone JID)**, bukan LID, supaya konsisten dan mudah dicari.
- Broadcast dengan `contact_ids: []` kini berarti "semua kontak" (sebelumnya menghasilkan 0 target).
- `super_admin` selalu mendapat semua izin tanpa membaca baris DB.

## [2.6.0] — 2026-11-08

### 🔒 Keamanan

- **Role `super_admin` baru** — memisahkan admin yang melihat SEMUA device dari admin yang punya device-nya sendiri:
  - `super_admin` = akses penuh semua device (memindahkan perilaku lama "admin tanpa penugasan").
  - `admin` = **hanya** device yang ditugaskan/dibuat, meski tanpa penugasan (memperbaiki bug admin tanpa akses device yang masih bisa melihat & membuka semua device).
  - `agent` = hanya device yang ditugaskan; di halaman Devices bisa buka QR & status, **tidak bisa** tambah/edit/hapus/redial device (`GET /api/devices/:id/qr` dibuka untuk agent).
  - Hanya `super_admin` yang boleh membuat/mengatur akun `super_admin`.
- Jalankan `npm run db:upgrade` (atau restart server) untuk menambah nilai ENUM `role: super_admin` pada tabel `users` lama; `seed:admin` kini membuat akun `super_admin`.

### ✨ Fitur

- **Tabel `_RolePermission` — matriks izin per role dengan hierarki** (1 `super_admin` > 2 `admin` > 3 `agent`):
  - Super admin mengatur rule akses role **admin & agent**; admin hanya role **agent**; izin `super_admin` terkunci (selalu akses penuh).
  - Aksi yang bisa diatur: tambah/edit/hapus/redial device, kelola rule auto-reply, batalkan/ulangi job antrean.
  - Ditegakkan di backend via `requirePermission()` (403 bila izin tidak diberikan) dan ditampilkan sebagai tabel checkbox di menu **Pengguna → Rule akses per role**.
  - Semua route device/rule/jobs kini memakai izin, bukan role "admin" mentah; scope device tetap dibatasi penugasan (`device_agents`).
- **Hierarki manajemen akun diperketat** — (perbaikan pasca-audit):
  - `/api/roles/*` kini dilindungi JWT (sebelumnya tidak masuk daftar path yang dijaga).
  - Admin biasa **tidak bisa** membuat/mengedit/menghapus akun admin (hanya super admin) maupun menetapkan role `admin`/`super_admin`.
  - Admin biasa hanya bisa menugaskan **device miliknya sendiri** saat mengelola user — menutup celah admin yang dibatasi memberi dirinya device admin lain.
- **Hierarki pembuatan akun (`created_by`)** — tabel `users mendapat kolom `created_by`: admin hanya melihat & mengelola dirinya + agent yang DIA buat; super admin melihat semua.
- **Izin khusus per user (override)** — tabel `UserPermissions` baru: tiap akun bisa dinilai "Ikuti role / Izinkan / Tolak" per izin (menimpa tabel Rule akses per role). Endpoint `PUT /api/users/:id/permissions`; editor ada di modal Edit Pengguna. İzin dihitung berlapis: override user > rule role > super_admin (selalu penuh).
- **Halaman Dok API dilengkapi** — tabel "Dashboard API (JWT)" berisi semua endpoint `/api/devices*`, `/api/chats*`, `/api/rules*`, `/api/jobs*`, `/api/users*`, `/api/roles/permissions*`, `/api/cron/redial`, beserta matriks akses per role.

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
- **Input pesan auto-resize di Inbox** — textarea membesar ke atas hingga maksimal ~5 baris, lalu muncul scrollbar vertikal untuk teks panjang (>100 karakter). Mendukung Shift+Enter untuk baris baru, Enter untuk kirim.
- **Pengelolaan akses device per user (Admin & Agent)** — tiga mode pilihan jelas: **Semua device** (hanya admin, akses penuh termasuk device baru), **Tidak ada device** (tidak bisa melihat device manapun), **Pilih device tertentu** (centang device individual). Device bisa dibagikan ke beberapa user sekaligus. Saat ganti role, mode akses otomatis disesuaikan (admin→"all", agent→"none").

### 🛠 Perbaikan bug

- `refreshUrl` pada `mediaStore` memperbaiki parsing URL media — sebelumnya salah mengekstrak `deviceId` dan `filename` menyebabkan URL jadi `/media/media/...` di production (PM2).
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
