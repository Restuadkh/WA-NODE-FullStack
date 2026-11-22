# Media keluar: gambar, batas ukuran, dan stabilitas proses

Dokumen ini menjelaskan cara aplikasi menyiapkan **gambar keluar** sebelum diserahkan ke Baileys/WhatsApp, serta cara menghindari restart service saat kirim gambar. Untuk media masuk dan URL bertanda tangan, lihat bagian Media di **[README.md](README.md#api-kirim-pesan-untuk-aplikasi-lain)**.

## Ringkasan

Sejak v2.8.2, semua gambar keluar diproses dulu oleh aplikasi (`src/api/services/outgoingMedia.js`) sebelum masuk ke Baileys.

Alasan: Baileys membuat thumbnail otomatis dengan `sharp`/libvips. File yang rusak, ber-MIME gambar padahal bukan gambar, atau gambar beresolusi ekstrem bisa menyebabkan error native / lonjakan memori. Pada deployment PM2 dengan `max_memory_restart: "700M"`, lonjakan itu membuat proses di-restart dan sesi WhatsApp terputus.

Dengan normalisasi di aplikasi:

- file bukan gambar ditolak lebih awal dengan HTTP `400`;
- gambar besar dikecilkan sebelum dikirim;
- `jpegThumbnail` dibuat aplikasi, sehingga Baileys **tidak memanggil decoder gambar** lagi;
- proses tetap stabil (diuji: PID tidak berubah, memori puncak ~204 MB).

## Alur pengiriman gambar

1. Upload diterima multer dengan batas `MEDIA_MAX_MB` (default **50 MB**, field `file`).
2. `WhatsAppInstance.sendMedia()` memanggil `prepareOutgoingImage(file)`.
3. Magic bytes diperiksa. MIME yang salah akan ditebak ulang dari isi file.
4. Metadata dibaca dengan `sharp` dan batas `limitInputPixels`.
5. Gambar dikecilkan/dikonversi bila melebihi batas.
6. Thumbnail JPEG dibuat aplikasi dan dikirim sebagai `jpegThumbnail`.
7. Baileys melihat `jpegThumbnail` sudah ada → melewati `generateThumbnail()` / `extractImageThumb()`.
8. Buffer yang sudah dinormalisasi dipakai untuk upload, disimpan ke `MEDIA_DIR`, dan dicatat di `messages`.

Contoh: PNG `6000x6000` dikirim sebagai JPEG `2560x2560` dengan kualitas 82. File asli tidak dikirim ke WhatsApp, tetapi salinan yang tersimpan di riwayat sudah ikut diperbarui agar konsisten.

## Format yang diterima

Dikenali dari magic bytes, bukan hanya dari MIME:

| Format | Magic | Perlakuan |
|---|---|---|
| JPEG | `FF D8 FF` | Dikirim apa adanya bila ≤ batas |
| PNG | `89 50 4E 47 0D 0A 1A 0A` | Dikirim apa adanya bila ≤ batas |
| WebP | `RIFF....WEBP` | Dikirim apa adanya bila ≤ batas |
| GIF | `GIF87a` / `GIF89a` | Dikonversi ke JPEG (frame pertama) |
| TIFF | `II*` / `MM*` | Dikonversi ke JPEG |
| HEIC/HEIF/AVIF | `ftyp...` | Dikonversi ke JPEG bila `sharp` mendukung |

Format lain (termasuk SVG dan file acak yang diberi MIME `image/jpeg`) ditolak.

> Animasi GIF/WebP tidak dipertahankan: yang dikirim adalah frame pertama sebagai JPEG.

## Batas dan environment variable

| Env | Default | Fungsi |
|---|---:|---|
| `MEDIA_MAX_MB` | `50` | Batas ukuran upload multiper field (multer). |
| `IMAGE_MAX_PIXELS` | `40000000` | Batas total piksel saat decode. Lebih dari ini ditolak. |
| `IMAGE_MAX_DIMENSION` | `8192` | Batas lebar/tinggi absolut. |
| `IMAGE_RESIZE_MAX` | `2560` | Sisi terpanjang maksimal sebelum di-resize. |
| `IMAGE_JPEG_QUALITY` | `82` | Kualitas JPEG saat gambar di-encode ulang. |
| `IMAGE_THUMBNAIL_SIZE` | `40` | Ukuran sisi thumbnail yang dikirim ke WhatsApp. |
| `BAILEYS_LOG_LEVEL` | `silent` | Log internal Baileys; naikkan ke `warn` hanya saat debug. |

Contoh `.env` untuk server dengan memori terbatas:

```dotenv
MEDIA_MAX_MB=25
IMAGE_MAX_PIXELS=20000000
IMAGE_RESIZE_MAX=1600
IMAGE_JPEG_QUALITY=78
```

## Perilaku error

| Kondisi | HTTP | Pesan |
|---|---:|---|
| File bukan gambar | `400` | `File bukan gambar yang dikenali (JPEG, PNG, WebP, GIF, TIFF, atau HEIC)` |
| Gambar rusak / decode gagal | `400` | `Gambar tidak dapat diproses: <detail>` |
| Resolusi > `IMAGE_MAX_PIXELS` | `400` | `Resolusi gambar terlalu besar (maksimal 40 megapiksel)` |
| Upload > `MEDIA_MAX_MB` | `413` | `Ukuran file melebihi batas <n> MB` |
| Device offline | `409` | `Device belum terhubung ke WhatsApp` |

Error-error ini **tidak** mematikan proses. Bila masih ada `uncaughtException`, detailnya ditulis log dengan level `fatal` dan proses sengaja dibiarkan hidup (lihat `src/server.js`).

## Endpoint yang terdampak

Normalisasi berlaku untuk semua jalur kirim gambar:

- Dashboard/Inbox: `POST /api/chats/:chatId/messages` dengan `type=image`
- Gateway langsung: `POST /api/message/image`
- Gateway antrean: `POST /api/message/queue/media` dengan `type=image`
- Gateway URL: `POST /api/message/mediaurl` dengan `type=image`
- Broadcast media dari halaman Kontak

Stiker (`image/webp` → `type=sticker`) **tidak** melewati normalisasi ini karena Baileys tidak membuat thumbnail untuk stiker.

## Instalasi / upgrade

`sharp` adalah dependency langsung sejak v2.8.2 (sebelumnya hanya optional peer Baileys).

```bash
npm ci
npm run build:frontend   # bila frontend belum dibuild
pm2 restart wa-dashboard --update-env
pm2 logs wa-dashboard
```

Bila `sharp` tidak bisa dipasang, aplikasi tetap jalan dengan thumbnail placeholder abu-abu, tetapi format yang perlu konversi (GIF/TIFF/HEIC) akan ditolak HTTP `400`. Pasang `sharp` untuk perilaku penuh.

## Contoh uji

```bash
curl -X POST "http://localhost:3000/api/message/image" \
  -H "X-Api-Key: <instance_key>" \
  -F "id=089671533195" \
  -F "caption=Uji stabilitas gambar" \
  -F "file=@C:/gambar/bukti.jpg;type=image/jpeg"
```

Respons sukses: `201` dengan `data.key.id` pesan WhatsApp. Gambar juga muncul di Inbox device tersebut.

Saat uji perbaikan ini:

- JPEG `1600x1200` → `201`, terkirim.
- PNG `6000x6000` → `201`, otomatis di-resize ke `2560x2560`.
- PNG `9000x9000` → `400`, ditolak dengan pesan batas megapiksel.
- Tidak ada `uncaughtException`/`fatal` di log; PID proses tidak berubah.

## Troubleshooting

**Service tetap restart saat kirim gambar?**

1. Cek penyebab restart PM2: `pm2 describe wa-dashboard` / `pm2 logs wa-dashboard --lines 200`.
2. Bila `max_memory_restart` yang muncul, turunkan `IMAGE_RESIZE_MAX` dan `IMAGE_MAX_PIXELS`, lalu restart dengan `--update-env`.
3. Pastikan sudah `npm ci` dan `sharp` terpasang: `npm ls sharp --depth=0`.
4. Pastikan hanya satu proses yang berjalan. Dua proses memakai sesi WhatsApp yang sama akan saling memutus (`connectionReplaced`) dan terlihat seperti restart.

**Thumbnail terlihat polos/abu-abu?**

Cek log saat start untuk peringatan `sharp tidak terpasang`. Pasang `sharp` lalu restart.

**Gambar jadi JPEG walaupun dikirim PNG?**

Itu normal bila sisi terpanjang > `IMAGE_RESIZE_MAX` atau format aslinya perlu konversi. Naikkan `IMAGE_RESIZE_MAX` bila ingin mempertahankan resolusi lebih tinggi (dengan risiko memori lebih besar).
