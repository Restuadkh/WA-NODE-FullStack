# Media (gambar, video, stiker, audio, dokumen)

Dokumen ini menjelaskan penyimpanan dan pengiriman media setelah penyederhanaan v3.0.

## Ringkasan

- Media **masuk** diunduh dari WhatsApp, disimpan di `MEDIA_DIR` (default `src/media/`), dan dicatat di tabel `messages`.
- Media **keluar** (upload dari Inbox atau `/api/message/*`) dikirim apa adanya ke Baileys.
- URL media ditandatangani HMAC dan berkedaluwarsa (`MEDIA_URL_EXPIRY_HOURS`, default 7 hari).
- Sejak v3.0 aplikasi **tidak lagi me-resize gambar** dan tidak memakai `sharp`. Kirim gambar dengan ukuran wajar.

## Batas & environment

| Env | Default | Fungsi |
|---|---:|---|
| `MEDIA_DIR` | `src/media` | Folder penyimpanan file media. |
| `MEDIA_MAX_MB` | `50` | Batas upload multipart dan unduhan media masuk. |
| `MEDIA_TOKEN_SECRET` | `JWT_SECRET` | Rahasia tanda tangan URL media. |
| `MEDIA_URL_EXPIRY_HOURS` | `168` | Masa berlaku URL media (jam). |

## Alur kirim media

1. Upload diterima multer (field `file`, batas `MEDIA_MAX_MB`).
2. Jenis media ditentukan dari MIME/ekstensi (`.webp` = stiker).
3. `WhatsAppInstance.sendMedia()` mengirim buffer ke Baileys.
4. Pesan disimpan ke database dan file disimpan ke `MEDIA_DIR`.

Stiker (`image/webp`, `type=sticker`) tidak melewati pemrosesan gambar.

## Error umum

| Kondisi | HTTP | Pesan |
|---|---:|---|
| File tidak dikirim | `400` | `File wajib dikirim (field 'file')` |
| Device offline | `409` | `Device belum terhubung ke WhatsApp` |
| Upload > `MEDIA_MAX_MB` | `413` | `Ukuran file melebihi batas` |

## Contoh

```bash
curl -X POST "http://localhost:3000/api/message/image" \
  -H "X-Api-Key: <instance_key>" \
  -F "id=08123456789" \
  -F "caption=Bukti transfer" \
  -F "file=@C:/gambar/bukti.jpg;type=image/jpeg"
```

Respons sukses: `201` dengan `data` berisi pesan yang tersimpan. Media juga muncul di Inbox device tersebut.
