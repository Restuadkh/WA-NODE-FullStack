# Antrean Pesan (Anti-Ban) — Panduan

Fitur **antrean pesan keluar** mengirim pesan bertahap dengan jeda acak, kuota per device, jam kirim, dan retry. Tujuannya mengurangi pola “blast” yang mudah dikenali sebagai bot.

> **Tidak ada sistem yang bisa menjamin nomor bebas dari blokir/ban.** WhatsApp/Meta menilai banyak hal (laporan penerima, kualitas konten, perilaku, nomor baru, dsb.). Antrean ini hanya mengurangi risiko, bukan menghilangkannya. Untuk volume besar, gunakan **WhatsApp Business Platform (API resmi)**.

---

## Daftar Isi

1. [Cara Kerja](#1-cara-kerja)
2. [Konfigurasi](#2-konfigurasi)
3. [API Antrean](#3-api-antrean)
4. [Status & Format Job](#4-status--format-job)
5. [Melihat & Mengelola Antrean](#5-melihat--mengelola-antrean)
6. [Perilaku Anti-Ban](#6-perilaku-anti-ban)
7. [Praktik Aman Mengirim Massal](#7-praktik-aman-mengirim-massal)
8. [Troubleshooting](#8-troubleshooting)
9. [Menjalankan 24/7](#9-menjalankan-247)

---

## 1. Cara Kerja

```
Aplikasi Anda ──POST /api/message/queue──► tabel message_jobs (pending)
                                              │
                          worker (proses yang sama)
                                              │
                     cek kuota + jeda + jam kirim
                                              │
                                       kirim via Baileys
                                              │
                                   sent / retry / failed
```

- **Persisten di database.** Job disimpan di tabel `message_jobs`, jadi tidak hilang saat server restart.
- **Satu pesan per device per putaran.** Device A tidak menunggu device B.
- **Jeda acak** antar pesan (default 8–25 detik).
- **Kuota rolling** 1 jam & 24 jam per device (default 60/jam, 200/hari).
- **Worker berjalan di proses yang sama** dengan instance WhatsApp. Wajib **satu proses** (lihat [DEPLOY-WINDOWS.md](DEPLOY-WINDOWS.md)).
- **Device boleh offline saat enqueue.** Job menunggu sampai device `connected`, lalu dikirim.
- **Job gagal** dicoba ulang dengan backoff (default 3 percobaan).

Pesan dari dashboard/auto-reply tetap dikirim **langsung** (tidak lewat antrean) karena bersifat responsif. Kuota antrean tetap menghitung semua pesan keluar device, termasuk balasan manual tersebut.

---

## 2. Konfigurasi

Semua pengaturan di `.env` (ubah lalu restart server):

| Variabel | Default | Keterangan |
|---|---|---|
| `QUEUE_ENABLED` | `true` | Aktifkan worker antrean |
| `QUEUE_POLL_MS` | `1000` | Interval cek antrean (ms) |
| `QUEUE_MIN_DELAY_MS` | `8000` | Jeda minimum antar pesan |
| `QUEUE_MAX_DELAY_MS` | `25000` | Jeda maksimum antar pesan |
| `QUEUE_HOURLY_LIMIT` | `60` | Maks pesan keluar per device / 1 jam (`0` = tanpa batas) |
| `QUEUE_DAILY_LIMIT` | `200` | Maks pesan keluar per device / 24 jam (`0` = tanpa batas) |
| `QUEUE_MAX_ATTEMPTS` | `3` | Percobaan maksimum per job |
| `QUEUE_RETRY_BASE_MS` | `30000` | Backoff awal saat gagal |
| `QUEUE_RETRY_MAX_MS` | `900000` | Backoff maksimum (15 menit) |
| `QUEUE_BATCH_MAX` | `100` | Maks item per request batch |
| `QUEUE_ACTIVE_HOURS` | *(kosong)* | Jam kirim lokal, mis. `8-21`. Kosong / `0-24` = 24 jam |
| `QUEUE_TIMEZONE` | `Asia/Jakarta` | Zona waktu untuk `QUEUE_ACTIVE_HOURS` |
| `QUEUE_TYPING` | `false` | Kirim status “sedang mengetik” sebelum pesan |
| `QUEUE_TYPING_MAX_MS` | `4000` | Batas durasi simulasi mengetik |

Contoh konservatif untuk nomor baru:

```env
QUEUE_MIN_DELAY_MS=20000
QUEUE_MAX_DELAY_MS=60000
QUEUE_HOURLY_LIMIT=15
QUEUE_DAILY_LIMIT=60
QUEUE_ACTIVE_HOURS=8-21
QUEUE_TYPING=true
```

> Kuota dihitung dari **semua** pesan keluar device (antrean, dashboard, API, auto-reply). Jika kuota habis, antrean berhenti sementara sampai jendela waktu bergeser.

Tabel `message_jobs` dibuat otomatis saat server start (`DB_AUTO_SYNC=true`) dan oleh `npm run db:upgrade`.

---

## 3. API Antrean

Autentikasi sama dengan API gateway: header **`X-Api-Key: <instance_key>`** (atau `?key=`).
Berbeda dari endpoint kirim langsung, endpoint antrean **tidak memerlukan device online**.

Rate limit tetap berlaku (`GATEWAY_RATE_LIMIT_PER_MINUTE`).

### 3.1 Enqueue teks

```http
POST /api/message/queue
Content-Type: application/json
X-Api-Key: <instance_key>
```

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `id` | string | ya | Nomor / JID tujuan |
| `message` | string | ya | Maks 4096 karakter |
| `scheduled_at` | string | tidak | ISO 8601, mis. `2026-10-26T09:00:00+07:00`. Kosong = sekarang |
| `priority` | integer | tidak | Makin besar makin didahulukan (default `0`) |
| `ref` | string | tidak | ID idempotensi milik Anda; `ref` sama tidak membuat job ganda |

```bash
curl -X POST "https://wa.contoh.com/api/message/queue" \
  -H "X-Api-Key: <instance_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "08123456789",
    "message": "Halo Budi, tagihan Oktober sudah tersedia.",
    "scheduled_at": "2026-10-26T09:00:00+07:00",
    "priority": 5,
    "ref": "invoice-2026-10-budi"
  }'
```

**Response `201`**

```json
{
  "error": false,
  "duplicate": false,
  "data": {
    "id": "0192f1c2-...",
    "device_id": "...",
    "to_jid": "628123456789@s.whatsapp.net",
    "type": "text",
    "payload": { "text": "Halo Budi, tagihan Oktober sudah tersedia." },
    "status": "pending",
    "priority": 5,
    "scheduled_at": "2026-10-26T02:00:00.000Z",
    "attempts": 0,
    "max_attempts": 3,
    "client_ref": "invoice-2026-10-budi"
  }
}
```

Jika `ref` sudah pernah dipakai, response `200` dengan `"duplicate": true` dan job yang sama.

### 3.2 Enqueue batch

```http
POST /api/message/queue/batch
```

```json
{
  "messages": [
    { "id": "0811111111", "message": "Halo A", "ref": "promo-a" },
    { "id": "0822222222", "message": "Halo B", "priority": 2 },
    { "id": "0833333333", "message": "Halo C", "scheduled_at": "2026-10-26T10:30:00+07:00" }
  ]
}
```

- Maksimal `QUEUE_BATCH_MAX` (default 100) per request.
- **Seluruh batch divalidasi dulu.** Jika satu item tidak valid, tidak ada yang disimpan.
- Response:

```json
{
  "error": false,
  "data": { "queued": 3, "duplicates": 0, "jobs": [ ] }
}
```

### 3.3 Enqueue media (upload)

```http
POST /api/message/queue/media
Content-Type: multipart/form-data
```

| Form field | Wajib | Keterangan |
|---|---|---|
| `id` | ya | Nomor / JID tujuan |
| `file` | ya | Maks 25 MB |
| `type` | tidak | `image`, `video`, `audio`, `sticker`, `document` |
| `caption` | tidak | Maks 4096 |
| `ptt` | tidak | `true` untuk voice note (audio) |
| `filename` | tidak | Nama file yang dikirim |
| `scheduled_at`, `priority`, `ref` | tidak | Sama seperti teks |

```bash
curl -X POST "https://wa.contoh.com/api/message/queue/media" \
  -H "X-Api-Key: <instance_key>" \
  -F "id=08123456789" \
  -F "type=image" \
  -F "caption=Bukti transfer" \
  -F "scheduled_at=2026-10-26T09:00:00+07:00" \
  -F "file=@C:/gambar/bukti.jpg"
```

File disimpan sementara di `MEDIA_DIR` dan **dihapus otomatis** setelah terkirim atau dibatalkan. Setelah terkirim, media final tersimpan seperti pesan media biasa.

### 3.4 Enqueue media dari URL

```http
POST /api/message/queue/mediaurl
Content-Type: application/json
```

```bash
curl -X POST "https://wa.contoh.com/api/message/queue/mediaurl" \
  -H "X-Api-Key: <instance_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "08123456789",
    "url": "https://contoh.com/invoice.pdf",
    "type": "document",
    "filename": "invoice.pdf",
    "caption": "Invoice Anda",
    "scheduled_at": "2026-10-26T09:00:00+07:00"
  }'
```

Server mengunduh file **saat enqueue** (bukan saat kirim), sehingga URL yang kedaluwarsa tidak menggagalkan pengiriman nanti. Aturan keamanan sama dengan `/api/message/mediaurl` (alamat internal ditolak, maks `MEDIA_URL_MAX_MB`).

---

## 4. Status & Format Job

```
pending ──► sending ──► sent
   │            │
   │            └──► pending (retry, backoff) ──► failed
   └──► cancelled
```

| Status | Arti |
|---|---|
| `pending` | Menunggu jadwal/kuota/device online |
| `sending` | Sedang dikirim (dikunci worker) |
| `sent` | Terkirim ke WhatsApp |
| `failed` | Gagal permanen (nomor invalid, file hilang, percobaan habis) |
| `cancelled` | Dibatalkan admin |

Field penting:

| Field | Keterangan |
|---|---|
| `attempts` / `max_attempts` | Jumlah percobaan |
| `last_error` | Pesan error terakhir |
| `scheduled_at` | Waktu kirim yang diminta |
| `next_attempt_at` | Waktu percobaan berikutnya (retry) |
| `message_id` | ID pesan di inbox setelah terkirim |
| `to_jid` | JID hasil normalisasi nomor |
| `payload` | Isi pesan (teks/caption/metadata media) |

Job `sent` juga muncul sebagai pesan biasa di **Inbox** (dengan status pengiriman WhatsApp).

---

## 5. Melihat & Mengelola Antrean

### 5.1 Dashboard

Menu **Antrian** menampilkan:

- Statistik per status (menunggu, mengirim, terkirim, gagal)
- Pemakaian kuota 1 jam / 24 jam
- Jadwal berikutnya, jeda, jam kirim
- Daftar job + error terakhir
- Tombol **Batalkan** dan **Ulangi** (admin)

### 5.2 REST API

Semua butuh JWT dashboard (`Authorization: Bearer <token>`).

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/devices/:deviceId/jobs?status=pending&limit=100&offset=0` | semua user | Daftar job |
| GET | `/api/devices/:deviceId/jobs/stats` | semua user | Statistik & kuota |
| DELETE | `/api/jobs/:id` | admin | Batalkan job `pending`/`failed` |
| POST | `/api/jobs/:id/retry` | admin | Ulangi job `failed`/`cancelled` |

Contoh:

```bash
curl "https://wa.contoh.com/api/devices/<device_id>/jobs?status=failed" \
  -H "Authorization: Bearer <JWT>"

curl -X POST "https://wa.contoh.com/api/jobs/<job_id>/retry" \
  -H "Authorization: Bearer <JWT>"
```

- Membatalkan job = status `cancelled`; file media sementara dihapus.
- Mengulangi job = status kembali `pending`, `attempts` direset, jadwal menjadi sekarang.
- Job `sending` tidak bisa dibatalkan (sedang di jaringan).

### 5.3 Hapus device

Menghapus device juga menghapus seluruh job-nya dan folder medianya.

---

## 6. Perilaku Anti-Ban

Yang **dilakukan** antrean:

1. **Jeda acak** antar pesan (bukan interval tetap yang terlihat seperti mesin).
2. **Satu pesan sekaligus per device** (tidak ada burst paralel).
3. **Kuota per jam & per hari**, dihitung dari seluruh pesan keluar device.
4. **Jam kirim** (opsional) agar tidak mengirim tengah malam.
5. **Retry dengan backoff** untuk gangguan sementara (mis. koneksi putus).
6. **Simulasi mengetik** (opsional) sebelum mengirim.
7. **Prioritas & jadwal**, sehingga pengiriman bisa disebar.

Yang **tidak** dilakukan (dan tidak bisa dijamin):

- Tidak menghapus/mengubah isi pesan agar “terlihat manusia”.
- Tidak memverifikasi apakah penerima setuju dihubungi.
- Tidak mencegah laporan/blokir dari penerima.
- Tidak menggantikan WhatsApp Business API resmi untuk volume besar.

---

## 7. Praktik Aman Mengirim Massal

### 7.1 Pemanasan nomor baru

| Hari | Saran volume/hari | Catatan |
|---|---|---|
| 1–3 | 10–20 | Prioritas percakapan masuk/keluar dua arah |
| 4–7 | 20–40 | Tambah bertahap, jangan loncat |
| 8–14 | 40–80 | Pantau laporan/blokir |
| 15+ | 80–150 | Sesuaikan dengan respons & kualitas nomor |

Gunakan `QUEUE_DAILY_LIMIT` dan `QUEUE_HOURLY_LIMIT` yang lebih rendah saat pemanasan.

### 7.2 Konten

- Kirim hanya ke kontak yang **opt-in** (pernah berinteraksi / mendaftar).
- **Personalisasi** nama/isi; hindari pesan identik ke ratusan nomor.
- Hindari link mencurigakan atau terlalu banyak link di pesan pertama.
- Sertakan cara berhenti/langganan (mis. “balas STOP”).
- Hormati jam wajar (mis. 08.00–21.00 waktu penerima).
- Jangan mengirim ulang ke nomor yang tidak pernah membalas berkali-kali.

### 7.3 Operasional

- Pantau status `failed` dan `last_error` di halaman Antrian.
- Jika banyak gagal/`connectionReplaced`, **hentikan** pengiriman dan periksa sesi.
- Jangan menjalankan dua proses untuk nomor yang sama.
- Gunakan satu device untuk beban yang wajar; jangan semua blast dari satu nomor.
- Simpan bukti opt-in bila diperlukan.

---

## 8. Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| Job tetap `pending` | Device offline | Cek status device / tautkan ulang |
| Job tetap `pending` | Di luar `QUEUE_ACTIVE_HOURS` | Tunggu jam kirim atau ubah konfigurasi |
| Job tetap `pending` | Kuota jam/24 jam penuh | Lihat statistik; tunggu atau naikkan limit |
| Job `failed` “Nomor tidak terdaftar” | Nomor tidak punya WhatsApp | Perbaiki nomor; retry tidak akan berhasil |
| Job `failed` “File media … tidak ditemukan” | File sementara terhapus | Enqueue ulang |
| Job `sending` lama setelah restart | Crash saat kirim | Worker mengembalikannya ke `pending` saat start |
| Pesan terkirim dobel | Retry setelah crash tepat setelah kirim | Gunakan `ref` idempoten & pantau; batasi retry |
| Semua job berhenti | Proses mati | Jalankan via PM2/service (lihat DEPLOY-WINDOWS.md) |
| Media dari URL gagal | URL/internal/timeout | Pastikan URL publik; cek `MEDIA_URL_*` |

Cek status worker di log:

```
Worker antrean pesan aktif
Job pesan terkirim
Job pesan gagal, dijadwalkan ulang
```

---

## 9. Menjalankan 24/7

Worker antrean hidup di proses Node yang sama. Agar tetap berjalan setelah terminal ditutup atau Windows reboot, gunakan PM2 atau Windows Service:

- Panduan lengkap: **[DEPLOY-WINDOWS.md](DEPLOY-WINDOWS.md)**
- Konfigurasi siap pakai: `ecosystem.config.js` (PM2 fork, 1 instance)

Perintah singkat:

```powershell
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 logs wa-dashboard
```

Jangan memakai mode cluster atau lebih dari satu instance.
