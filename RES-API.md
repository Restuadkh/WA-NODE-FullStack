# Dokumentasi REST API — WA Dashboard

Dokumentasi seluruh endpoint HTTP yang tersedia di aplikasi ini (v2.4.0).

- **Base URL (lokal)**: `http://localhost:3000`
- **Base URL (produksi)**: `https://wa.contoh.com` (sesuaikan)
- **Format**: JSON (`application/json`), kecuali endpoint upload memakai `multipart/form-data`
- **Prefix API**: `/api`
- **Media**: `/media/...` (URL bertanda tangan)

---

## Daftar Isi

1. [Autentikasi](#1-autentikasi)
2. [Format Response & Error](#2-format-response--error)
3. [Endpoint Umum](#3-endpoint-umum)
4. [API Gateway — Kirim Pesan (`/api/message/*`)](#4-api-gateway--kirim-pesan-apimessage)
   4A. [API Antrean Pesan (`/api/message/queue/*`, anti-ban)](#4a-api-antrean-pesan-apimessagequeue--anti-ban)
5. [API Dashboard — Devices](#5-api-dashboard--devices)
6. [API Dashboard — Chats & Pesan](#6-api-dashboard--chats--pesan)
7. [API Dashboard — Auto Reply Rules](#7-api-dashboard--auto-reply-rules)
8. [Penyajian Media](#8-penyajian-media)
9. [Struktur Data](#9-struktur-data)
10. [Webhook Keluar](#10-webhook-keluar)
11. [Realtime Socket.IO](#11-realtime-socketio)
12. [Batas & Konfigurasi Terkait API](#12-batas--konfigurasi-terkait-api)

---

## 1. Autentikasi

Ada **dua jenis autentikasi** yang berbeda:

| Jenis | Dipakai untuk | Cara kirim |
|---|---|---|
| **JWT Dashboard** | `/api/devices*`, `/api/chats*`, `/api/rules*` | Header `Authorization: Bearer <token>` |
| **API Key Gateway** | `/api/message/*` (kirim pesan dari aplikasi lain) | Header `X-Api-Key: <instance_key>` (disarankan) atau `?key=<instance_key>` |

### 1.1 JWT Dashboard

Token didapat dari `POST /api/auth/login`. Berlaku sesuai `JWT_EXPIRES_IN` (default `8h`).

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

Role user: `admin` dan `agent`.

- `agent` tidak bisa melihat `instance_key` pada response device.
- Endpoint bertanda **Admin** hanya bisa diakses role `admin` (selain itu `403`).

### 1.2 API Key Gateway

`instance_key` adalah UUID milik device (dapat dilihat admin di dashboard/halaman Devices, atau dari `GET /api/devices`).

```http
X-Api-Key: 0f8fad5b-d9cb-469f-a165-70867728950e
```

Alternatif lama: `POST /api/message/text?key=<instance_key>`.
Bisa dimatikan dengan `GATEWAY_ALLOW_QUERY_KEY=false`.

Jika `PROTECT_ROUTES=true`, tambahkan juga:

```http
Authorization: Bearer <TOKEN>
```

Device harus dalam keadaan **online** ke WhatsApp. Jika belum, response `409` dengan message `phone isn't connected`.

Pengecualian: endpoint **antrean** (`/api/message/queue*`) tetap menerima pesan walau device sedang offline. Job disimpan dan dikirim oleh worker saat device kembali `connected` (lihat §4A).

---

## 2. Format Response & Error

### Sukses

```json
{ "error": false, "data": { } }
```

Beberapa endpoint mengembalikan `message` tambahan:

```json
{ "error": false, "message": "Device dihapus" }
```

### Gagal

```json
{ "error": true, "message": "Penjelasan kesalahan" }
```

### Kode status yang dipakai

| Status | Arti |
|---|---|
| `200` | OK |
| `201` | Dibuat / pesan terkirim |
| `202` | Pesan terkirim ke WhatsApp, tetapi gagal disimpan ke riwayat |
| `400` | Parameter tidak valid |
| `401` | Token JWT tidak ada / tidak valid |
| `403` | Tidak punya akses, API key salah, atau signature media salah |
| `404` | Data / endpoint tidak ditemukan |
| `409` | Device belum terhubung ke WhatsApp |
| `413` | Ukuran file terlalu besar |
| `422` | Nomor tujuan tidak terdaftar di WhatsApp |
| `429` | Terlalu banyak request (lihat header `Retry-After`) |
| `500` | Kesalahan server |

---

## 3. Endpoint Umum

### 3.1 Health Check

```http
GET /api/status
```

**Auth**: tidak perlu.

**Response `200`**

```json
{ "status": "ok" }
```

---

### 3.2 Login

```http
POST /api/auth/login
Content-Type: application/json
```

**Auth**: tidak perlu. Dibatasi **10 percobaan / 15 menit per IP**.

**Body**

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `email` | string | ya | Email user |
| `password` | string | ya | Password |

```bash
curl -X POST "http://localhost:3000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"rahasia123"}'
```

**Response `200`**

```json
{
  "error": false,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "b3f1c2d4-...",
    "name": "Admin",
    "email": "admin@example.com",
    "role": "admin"
  }
}
```

**Response `401`**

```json
{ "error": true, "message": "Email atau password salah" }
```

> Buat admin pertama dengan `npm run seed:admin -- email@contoh.com "password-kuat" "Nama"`.

---

## 4. API Gateway — Kirim Pesan (`/api/message/*`)

Endpoint untuk aplikasi lain (ERP, CRM, bot, dll.) mengirim pesan **atas nama sebuah device**.

**Autentikasi**: `X-Api-Key` (atau `?key=`).
**Rate limit**: `GATEWAY_RATE_LIMIT_PER_MINUTE` per IP (default `120/menit`, `0` = tanpa batas). Jika terlampaui: `429` + header `Retry-After`.
**Efek samping**: semua pesan yang dikirim lewat sini **ikut tersimpan dan tampil di Inbox dashboard**.

Parameter `id` (tujuan) menerima:

| Input | Contoh | Menjadi |
|---|---|---|
| Nomor lokal | `08123456789` | `628123456789@s.whatsapp.net` |
| Nomor internasional | `+62 812-3456-789` | `628123456789@s.whatsapp.net` |
| JID langsung | `628123456789@s.whatsapp.net` | dipakai apa adanya |
| Grup | `1203630xxxx@g.us` | dipakai apa adanya |
| LID | `123456789@lid` | dipakai apa adanya |

Awalan `0` otomatis diganti `DEFAULT_COUNTRY_CODE` (default `62`). Nomor biasa akan dicek dulu ke WhatsApp; jika tidak terdaftar → `422`.

### Ringkasan Endpoint

| Method | Path | Body | Keterangan |
|---|---|---|---|
| POST | `/api/message/text` | JSON | Kirim teks |
| POST | `/api/message/image` | multipart | Kirim gambar |
| POST | `/api/message/video` | multipart | Kirim video |
| POST | `/api/message/audio` | multipart | Kirim audio (bisa PTT) |
| POST | `/api/message/sticker` | multipart | Kirim stiker (`.webp`) |
| POST | `/api/message/note` | multipart | Kirim voice note (PTT) |
| POST | `/api/message/doc` | multipart | Kirim dokumen |
| POST | `/api/message/mediaurl` | JSON | Kirim media dari URL publik |

Semua endpoint media memakai **field file bernama `file`**, maksimal **25 MB** (satu file per request).

---

### 4.1 Kirim Teks

```http
POST /api/message/text
Content-Type: application/json
X-Api-Key: <instance_key>
```

**Body**

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `id` | string | ya | Nomor / JID tujuan |
| `message` | string | ya | Isi pesan (maks 4096 karakter) |

```bash
curl -X POST "http://localhost:3000/api/message/text" \
  -H "X-Api-Key: <instance_key>" \
  -H "Content-Type: application/json" \
  -d '{"id":"08123456789","message":"Halo dari sistem"}'
```

**Response `201`**

```json
{
  "error": false,
  "data": {
    "key": {
      "remoteJid": "628123456789@s.whatsapp.net",
      "fromMe": true,
      "id": "3EB0A1B2C3D4E5F6"
    },
    "message": { "extendedTextMessage": { "text": "Halo dari sistem" } },
    "messageTimestamp": 1760000000,
    "status": 1
  }
}
```

`data` adalah objek hasil Baileys (`WebMessageInfo`). Field yang biasanya dipakai: `data.key.id`, `data.key.remoteJid`, `data.messageTimestamp`.

---

### 4.2 Kirim Gambar

```http
POST /api/message/image
Content-Type: multipart/form-data
X-Api-Key: <instance_key>
```

**Form fields**

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `id` | string | ya | Nomor / JID tujuan |
| `file` | file | ya | JPG/PNG/GIF, maks 25 MB |
| `caption` | string | tidak | Caption (maks 4096) |
| `filename` | string | tidak | Nama file yang ditampilkan |

```bash
curl -X POST "http://localhost:3000/api/message/image" \
  -H "X-Api-Key: <instance_key>" \
  -F "id=08123456789" \
  -F "caption=Bukti transfer" \
  -F "file=@C:/gambar/bukti.jpg"
```

**Response `201`**: `{ "error": false, "data": { ...WebMessageInfo } }`

---

### 4.3 Kirim Video

```http
POST /api/message/video
```

Form fields: `id`, `file`, `caption`, `filename` (sama seperti gambar). Maks 25 MB.

```bash
curl -X POST "http://localhost:3000/api/message/video" \
  -H "X-Api-Key: <instance_key>" \
  -F "id=08123456789" \
  -F "file=@C:/video/demo.mp4"
```

---

### 4.4 Kirim Audio / Voice Note

```http
POST /api/message/audio
```

**Form fields**

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `id` | string | ya | Nomor / JID tujuan |
| `file` | file | ya | Format audio (ogg/opus/mp3/m4a/aac/wav) |
| `ptt` | boolean | tidak | `true` = tampil sebagai voice note. Default `false` (pakai `/note` untuk selalu PTT) |
| `caption` | string | tidak | Caption (jarang dipakai WhatsApp) |
| `filename` | string | tidak | Nama file |

```bash
curl -X POST "http://localhost:3000/api/message/audio" \
  -H "X-Api-Key: <instance_key>" \
  -F "id=08123456789" \
  -F "ptt=false" \
  -F "file=@C:/audio/musik.mp3"
```

---

### 4.5 Kirim Voice Note (PTT)

Selalu dikirim sebagai voice note, terlepas dari nilai `ptt`.

```http
POST /api/message/note
```

Form fields: `id`, `file`, `caption`, `filename`.

```bash
curl -X POST "http://localhost:3000/api/message/note" \
  -H "X-Api-Key: <instance_key>" \
  -F "id=08123456789" \
  -F "file=@C:/audio/rekaman.ogg"
```

---

### 4.6 Kirim Stiker

Kirim file **WebP** (disarankan). Stiker animasi juga didukung bila file-nya WebP animasi.

```http
POST /api/message/sticker
```

Form fields: `id`, `file`.

```bash
curl -X POST "http://localhost:3000/api/message/sticker" \
  -H "X-Api-Key: <instance_key>" \
  -F "id=08123456789" \
  -F "file=@C:/stiker/logo.webp"
```

---

### 4.7 Kirim Dokumen

```http
POST /api/message/doc
```

**Form fields**

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `id` | string | ya | Nomor / JID tujuan |
| `file` | file | ya | File apa pun, maks 25 MB |
| `filename` | string | tidak | Nama file yang tampil di WhatsApp |
| `caption` | string | tidak | Caption |

```bash
curl -X POST "http://localhost:3000/api/message/doc" \
  -H "X-Api-Key: <instance_key>" \
  -F "id=08123456789" \
  -F "filename=invoice-001.pdf" \
  -F "caption=Invoice Anda" \
  -F "file=@C:/dokumen/invoice.pdf"
```

---

### 4.8 Kirim Media dari URL

Server **mengunduh sendiri** file dari URL, lalu mengirimkannya. URL **tidak** diberikan langsung ke WhatsApp/Baileys.

```http
POST /api/message/mediaurl
Content-Type: application/json
X-Api-Key: <instance_key>
```

**Body**

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `id` | string | ya | Nomor / JID tujuan |
| `url` | string | ya | Harus `http://` atau `https://` dan dapat diakses publik |
| `type` | string | ya | `image` \| `video` \| `audio` \| `sticker` \| `document` |
| `mimetype` | string | tidak | Override MIME (mis. `image/jpeg`) |
| `filename` | string | tidak | Nama file |
| `caption` | string | tidak | Caption |
| `ptt` | boolean | tidak | Untuk `audio`: `true` = voice note |

```bash
curl -X POST "http://localhost:3000/api/message/mediaurl" \
  -H "X-Api-Key: <instance_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "08123456789",
    "type": "image",
    "url": "https://contoh.com/foto.jpg",
    "caption": "Foto dari web"
  }'
```

**Batasan keamanan**

- Maks `MEDIA_URL_MAX_MB` (default 25 MB), timeout `MEDIA_URL_TIMEOUT_MS` (default 15 detik).
- Alamat **internal/privat ditolak** (`400`): loopback, `10.x`, `172.16–31.x`, `192.168.x`, `169.254.x` (termasuk metadata cloud), IPv6 lokal — juga lewat redirect/DNS rebinding.
- Batasi domain dengan `MEDIA_URL_ALLOWED_HOSTS=cdn.contoh.com,images.contoh.com`.

**Response `201`**

```json
{ "error": false, "data": { "key": { "id": "..." }, "message": { } } }
```

---

## 4A. API Antrean Pesan (`/api/message/queue/*`) — Anti-Ban

Mengirim pesan **lewat antrean** agar tidak dikirim serentak: satu pesan per device setiap putaran, jeda acak, kuota per jam/hari, dan jam kirim. Job disimpan di tabel `message_jobs`, jadi tetap ada setelah server restart. Panduan lengkap: **[QUEUE.md](QUEUE.md)**.

**Autentikasi**: sama dengan gateway (`X-Api-Key` / `?key=`).
**Berbeda dari endpoint kirim langsung**: device **boleh offline**. Job menunggu sampai device `connected`.
**Rate limit**: `GATEWAY_RATE_LIMIT_PER_MINUTE` per IP.

### Ringkasan Endpoint

| Method | Path | Body | Keterangan |
|---|---|---|---|
| POST | `/api/message/queue` | JSON | Enqueue teks |
| POST | `/api/message/queue/batch` | JSON | Enqueue banyak teks (maks `QUEUE_BATCH_MAX`) |
| POST | `/api/message/queue/media` | multipart | Enqueue media (upload) |
| POST | `/api/message/queue/mediaurl` | JSON | Enqueue media dari URL publik |
| GET | `/api/devices/:deviceId/jobs` | – | Daftar job (JWT) |
| GET | `/api/devices/:deviceId/jobs/stats` | – | Statistik job & kuota (JWT) |
| DELETE | `/api/jobs/:id` | – | Batalkan job **Admin** (JWT) |
| POST | `/api/jobs/:id/retry` | – | Ulangi job **Admin** (JWT) |

Field umum pada semua enqueue:

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `id` | string | ya | Nomor / JID tujuan (aturan sama dengan §4) |
| `scheduled_at` | string | tidak | ISO 8601. Kosong = kirim secepatnya |
| `priority` | integer | tidak | Makin besar makin didahulukan (default `0`) |
| `ref` | string | tidak | ID idempotensi; `ref` sama tidak membuat job ganda |

### 4A.1 Enqueue Teks

```http
POST /api/message/queue
Content-Type: application/json
X-Api-Key: <instance_key>
```

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `id` | string | ya | Nomor / JID tujuan |
| `message` | string | ya | Maks 4096 karakter |
| `scheduled_at`, `priority`, `ref` | – | tidak | Lihat tabel di atas |

```bash
curl -X POST "http://localhost:3000/api/message/queue" \
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
    "device_id": "a1b2c3d4-...",
    "to_jid": "628123456789@s.whatsapp.net",
    "type": "text",
    "payload": { "text": "Halo Budi, tagihan Oktober sudah tersedia." },
    "status": "pending",
    "priority": 5,
    "scheduled_at": "2026-10-26T02:00:00.000Z",
    "attempts": 0,
    "max_attempts": 3,
    "next_attempt_at": null,
    "last_error": null,
    "client_ref": "invoice-2026-10-budi",
    "source": "api",
    "message_id": null,
    "sent_at": null
  }
}
```

Bila `ref` sudah dipakai untuk device ini: HTTP `200` dengan `"duplicate": true` dan job yang sudah ada.

### 4A.2 Enqueue Batch

```http
POST /api/message/queue/batch
Content-Type: application/json
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

- Maksimal `QUEUE_BATCH_MAX` (default `100`) item per request.
- **Seluruh batch divalidasi lebih dulu.** Jika ada satu item tidak valid → `400`, tidak ada yang disimpan.

**Response `201`**

```json
{ "error": false, "data": { "queued": 3, "duplicates": 0, "jobs": [ ] } }
```

### 4A.3 Enqueue Media (upload)

```http
POST /api/message/queue/media
Content-Type: multipart/form-data
```

| Form field | Wajib | Keterangan |
|---|---|---|
| `id` | ya | Nomor / JID tujuan |
| `file` | ya | Maks 25 MB |
| `type` | tidak | `image` \| `video` \| `audio` \| `sticker` \| `document` |
| `caption` | tidak | Maks 4096 karakter |
| `ptt` | tidak | `true` untuk voice note (audio) |
| `filename` | tidak | Nama file yang dikirim |
| `scheduled_at`, `priority`, `ref` | tidak | Sama seperti teks |

```bash
curl -X POST "http://localhost:3000/api/message/queue/media" \
  -H "X-Api-Key: <instance_key>" \
  -F "id=08123456789" \
  -F "type=image" \
  -F "caption=Bukti transfer" \
  -F "file=@C:/gambar/bukti.jpg"
```

File disimpan sementara di `MEDIA_DIR` dan **dihapus otomatis** setelah terkirim atau dibatalkan. `disk_name` (nama file internal) tidak dikembalikan di response.

### 4A.4 Enqueue Media dari URL

```http
POST /api/message/queue/mediaurl
Content-Type: application/json
```

Body: `id`, `url`, `type` (wajib), plus `mimetype`, `filename`, `caption`, `ptt`, `scheduled_at`, `priority`, `ref`.

Server mengunduh file **saat enqueue**, sehingga URL yang kedaluwarsa tidak menggagalkan pengiriman nanti. Aturan keamanan sama dengan §4.8 (alamat internal ditolak, maks `MEDIA_URL_MAX_MB`).

### 4A.5 Daftar Job

```http
GET /api/devices/:deviceId/jobs?status=pending&limit=100&offset=0
Authorization: Bearer <JWT>
```

- `status` opsional: `pending`, `sending`, `sent`, `failed`, `cancelled`.
- `limit` 1–200 (default `100`), `offset` ≥ 0.
- Semua user boleh melihat; response:

```json
{ "error": false, "data": [ ], "total": 12, "limit": 100, "offset": 0 }
```

### 4A.6 Statistik Job & Kuota

```http
GET /api/devices/:deviceId/jobs/stats
Authorization: Bearer <JWT>
```

```json
{
  "error": false,
  "data": {
    "counts": { "pending": 3, "sending": 0, "sent": 40, "failed": 1, "cancelled": 0 },
    "usage": { "last_hour": 12, "last_day": 87 },
    "limits": {
      "hourly": 60,
      "daily": 200,
      "min_delay_ms": 8000,
      "max_delay_ms": 25000,
      "active_hours": "8-21",
      "timezone": "Asia/Jakarta"
    },
    "next_scheduled_at": "2026-10-26T02:00:00.000Z"
  }
}
```

`usage` menghitung **semua** pesan keluar device (antrean, dashboard, API, auto-reply), bukan hanya job antrean.

### 4A.7 Batalkan / Ulangi Job **Admin**

```http
DELETE /api/jobs/:id
Authorization: Bearer <JWT>
```

- Hanya job `pending` / `failed`; selain itu `409`.
- Status menjadi `cancelled`, file media sementara dihapus.

```http
POST /api/jobs/:id/retry
Authorization: Bearer <JWT>
```

- Hanya job `failed` / `cancelled`; selain itu `409`.
- Status kembali `pending`, `attempts` direset ke `0`, `scheduled_at` menjadi sekarang.

Job `sent` juga muncul sebagai pesan biasa di Inbox (dengan `message_id`).

---

## 5. API Dashboard — Devices

Semua endpoint di bagian ini butuh **JWT** (`Authorization: Bearer <token>`).

### 5.1 Daftar Device

```http
GET /api/devices
```

**Response `200`**

```json
{
  "error": false,
  "data": [
    {
      "id": "a1b2c3d4-...",
      "name": "CS Fokus.Net",
      "instance_key": "0f8fad5b-...",
      "phone_number": "628123456789",
      "status": "connected",
      "last_connected_at": "2026-10-25T08:00:00.000Z",
      "webhook_url": "https://contoh.com/webhook/whatsapp",
      "webhook_secret": "string-acak-panjang",
      "webhook_configured": true,
      "createdAt": "2026-10-20T03:00:00.000Z",
      "updatedAt": "2026-10-25T08:00:00.000Z"
    }
  ]
}
```

> `instance_key` hanya muncul untuk role **admin**. Agent tidak menerimanya.

### 5.2 Buat Device **Admin**

```http
POST /api/devices
Content-Type: application/json
```

**Body**

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `name` | string | ya | Label device (maks 100) |
| `phone_number` | string | tidak | Nomor untuk pairing code |
| `webhook_url` | string | tidak | URL webhook khusus device. Kosong = pakai `WEBHOOK_URL` global |
| `webhook_secret` | string | tidak | Secret `X-Signature` khusus device. Kosong = pakai `WEBHOOK_SECRET` |

```bash
curl -X POST "http://localhost:3000/api/devices" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CS Utama",
    "phone_number": "08123456789",
    "webhook_url": "https://contoh.com/webhook/whatsapp",
    "webhook_secret": "string-acak-panjang"
  }'
```

**Response `201`**: objek device. Instance WhatsApp langsung dijalankan di latar belakang (`status: "pending_qr"`).

### 5.3 Ambil QR / Pairing Code **Admin**

```http
GET /api/devices/:id/qr
```

Memulai instance bila belum berjalan (mis. setelah server restart).

**Response `200`**

```json
{
  "error": false,
  "data": {
    "status": "pending_qr",
    "qr": "data:image/png;base64,iVBORw0KGgo...",
    "pairing_code": null
  }
}
```

`qr` sudah berupa data URL siap ditampilkan di `<img>`. Bila memakai pairing code, `pairing_code` berisi kode 8 digit.

### 5.4 Status Device

```http
GET /api/devices/:id/status
```

**Response `200`**

```json
{
  "error": false,
  "data": { "status": "connected", "phone_number": "628123456789" }
}
```

Nilai `status`: `pending_qr` | `connected` | `disconnected` | `logged_out`.

### 5.5 Hapus Device **Admin**

```http
DELETE /api/devices/:id
```

Logout dari WhatsApp, lalu menghapus device beserta chat, pesan, rule, dan folder media-nya.

**Response `200`**

```json
{ "error": false, "message": "Device dihapus" }
```

### 5.6 Ubah Nama / Webhook Device **Admin**

```http
PUT /api/devices/:id
Content-Type: application/json
```

`PATCH` juga tersedia. Semua field opsional — hanya field yang dikirim yang diubah.

| Field | Tipe | Keterangan |
|---|---|---|
| `name` | string | Nama baru (1–100 karakter) |
| `webhook_url` | string | URL baru; kirim `""` untuk mematikan webhook device |
| `webhook_secret` | string | Secret baru; kirim `""` untuk menghapus secret |

```bash
curl -X PUT "http://localhost:3000/api/devices/<device_id>" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CS Utama (baru)",
    "webhook_url": "https://contoh.com/webhook/whatsapp",
    "webhook_secret": "secret-baru"
  }'
```

**Response `200`**: objek device terbaru. Instance yang sedang berjalan langsung memakai nama/webhook baru tanpa reconnect.

**Error**: `400` bila URL bukan `http(s)` atau nama kosong, `403` bila bukan admin, `404` bila device tidak ada.

---

## 6. API Dashboard — Chats & Pesan

Butuh **JWT**.

### 6.1 Daftar Chat per Device

```http
GET /api/devices/:deviceId/chats
```

Maksimal 500 chat, diurutkan dari `last_message_at` terbaru.

**Response `200`**

```json
{
  "error": false,
  "data": [
    {
      "id": "c1d2e3f4-...",
      "device_id": "a1b2c3d4-...",
      "wa_jid": "628123456789@s.whatsapp.net",
      "contact_name": "Budi",
      "is_group": false,
      "last_message_at": "2026-10-25T08:15:00.000Z",
      "unread_count": 3,
      "createdAt": "2026-10-20T03:00:00.000Z",
      "updatedAt": "2026-10-25T08:15:00.000Z"
    }
  ]
}
```

### 6.2 Riwayat Pesan

```http
GET /api/chats/:chatId/messages?limit=200&before=2026-10-25T08:00:00.000Z
```

**Query**

| Parameter | Default | Keterangan |
|---|---|---|
| `limit` | `200` | 1–500 |
| `before` | – | ISO date; ambil pesan **lebih lama** dari waktu ini (pagination) |

**Response `200`** — diurutkan **lama → baru**.

```json
{
  "error": false,
  "data": [
    {
      "id": "d4e5f6a7-...",
      "chat_id": "c1d2e3f4-...",
      "wa_message_id": "3EB0A1B2C3D4E5F6",
      "direction": "incoming",
      "type": "image",
      "body": "[Gambar] Bukti transfer",
      "media_url": "/media/a1b2c3d4-.../3EB0A1B2C3D4E5F6.jpg?t=ab12cd34...",
      "media_mimetype": "image/jpeg",
      "media_filename": "bukti.jpg",
      "media_size": 182736,
      "media_width": 1080,
      "media_height": 1350,
      "media_seconds": null,
      "media_ptt": false,
      "media_caption": "Bukti transfer",
      "status": "delivered",
      "sent_by_user_id": null,
      "is_auto_reply": false,
      "createdAt": "2026-10-25T08:10:00.000Z",
      "updatedAt": "2026-10-25T08:10:00.000Z"
    }
  ]
}
```

> `media_url` adalah path relatif bertanda tangan. Gabungkan dengan base URL, mis. `http://localhost:3000/media/...`.

### 6.3 Kirim Pesan dari Dashboard

```http
POST /api/chats/:chatId/messages
Authorization: Bearer <token>
```

Mendukung **JSON (teks)** atau **multipart (media)**.

#### a) Teks (JSON)

```bash
curl -X POST "http://localhost:3000/api/chats/c1d2e3f4-.../messages" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"text":"Halo, ada yang bisa dibantu?"}'
```

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `text` | string | ya | Maks 4096 karakter |

#### b) Media (multipart)

```bash
curl -X POST "http://localhost:3000/api/chats/c1d2e3f4-.../messages" \
  -H "Authorization: Bearer <token>" \
  -F "file=@C:/gambar/foto.jpg" \
  -F "caption=Produk ready" \
  -F "type=image"
```

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `file` | file | ya | Maks 25 MB |
| `caption` | string | tidak | Maks 4096 |
| `type` | string | tidak | `image`\|`video`\|`audio`\|`sticker`\|`document`. Jika kosong, dideteksi dari MIME. `.webp` → `sticker` |
| `ptt` | boolean | tidak | `true` untuk audio sebagai voice note |

**Response `201`**

```json
{ "error": false, "data": { "id": "...", "type": "text", "body": "Halo...", "status": "sent" } }
```

**Response `202`** — pesan sudah terkirim ke WhatsApp, tetapi gagal disimpan ke riwayat:

```json
{
  "error": false,
  "data": null,
  "message": "Pesan terkirim, tetapi gagal disimpan ke riwayat"
}
```

**Error umum**

| Status | Kondisi |
|---|---|
| `404` | Chat tidak ditemukan |
| `409` | Device chat tersebut belum terhubung |
| `400` | `text` kosong / terlalu panjang |

### 6.4 Tandai Chat Sudah Dibaca

```http
POST /api/chats/:chatId/read
```

**Response `200`**: objek chat dengan `unread_count: 0`.

---

## 7. API Dashboard — Auto Reply Rules

Butuh **JWT**. Operasi tulis hanya untuk **admin**.

### 7.1 Daftar Rule

```http
GET /api/devices/:deviceId/rules
```

Diurutkan `priority` terbesar, lalu `createdAt` terlama.

**Response `200`**

```json
{
  "error": false,
  "data": [
    {
      "id": "r1r2r3r4-...",
      "device_id": "a1b2c3d4-...",
      "keyword": "harga",
      "match_type": "contains",
      "reply_text": "Daftar harga ada di https://contoh.com/harga",
      "is_active": true,
      "priority": 10,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

### 7.2 Buat Rule **Admin**

```http
POST /api/devices/:deviceId/rules
Content-Type: application/json
```

**Body**

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `keyword` | string | ya | Maks 255. Gunakan `*` untuk semua pesan |
| `reply_text` | string | ya | Maks 4096 |
| `match_type` | string | tidak | `exact` \| `contains` (default) \| `starts_with` |
| `priority` | integer | tidak | Default `0`; makin besar makin didahulukan |
| `is_active` | boolean | tidak | Default `true` |

```bash
curl -X POST "http://localhost:3000/api/devices/a1b2c3d4-.../rules" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"keyword":"harga","reply_text":"Cek harga di https://contoh.com","match_type":"contains","priority":5}'
```

**Response `201`**: objek rule.

### 7.3 Ubah Rule **Admin**

```http
PUT /api/rules/:id
```

Body sama seperti create, tetapi **semua field opsional** (partial update).

**Response `200`**: objek rule terbaru.

### 7.4 Hapus Rule **Admin**

```http
DELETE /api/rules/:id
```

**Response `200`**

```json
{ "error": false, "message": "Rule dihapus" }
```

---

## 8. Penyajian Media

File media **tidak** disajikan sebagai folder publik. Setiap URL memiliki tanda tangan HMAC.

```http
GET /media/:deviceId/:filename?t=<signature>
```

- **Auth**: tidak perlu JWT, tetapi `t` wajib valid.
- Signature = HMAC-SHA256 dari `"<deviceId>/<filename>"` memakai `MEDIA_TOKEN_SECRET` (fallback `JWT_SECRET`).
- Signature **tidak kedaluwarsa**, tetapi berubah bila secret diganti.
- `Cache-Control: private, max-age=86400, immutable`.
- `403` jika signature salah, `404` jika file tidak ada.

Contoh URL yang dikembalikan pada `Message.media_url`:

```
/media/a1b2c3d4-.../3EB0A1B2C3D4E5F6.jpg?t=ab12cd34ef56...
```

Gunakan langsung di `<img>`, `<video>`, `<audio>`, atau tautan unduh:

```html
<img src="http://localhost:3000/media/a1b2c3d4-.../3EB0A1B2C3D4E5F6.jpg?t=ab12cd34ef56..." alt="Gambar" />
```

> Jangan membangun URL sendiri tanpa signature — akan ditolak `403`.

---

## 9. Struktur Data

### Device

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | UUID | Primary key |
| `name` | string | Label device |
| `instance_key` | string | Kunci API (hanya admin yang melihat) |
| `phone_number` | string/null | Nomor WhatsApp yang tertaut |
| `status` | enum | `pending_qr`, `connected`, `disconnected`, `logged_out` |
| `last_connected_at` | date/null | Terakhir terhubung |
| `webhook_url` | string/null | URL webhook khusus device (hanya admin) |
| `webhook_secret` | string/null | Secret signature webhook device (hanya admin) |
| `webhook_configured` | boolean | `true` bila device punya webhook sendiri |
| `createdAt`, `updatedAt` | date | Otomatis |

### Chat

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | UUID | Primary key |
| `device_id` | UUID | Device pemilik |
| `wa_jid` | string | Contoh `628xxx@s.whatsapp.net`, grup `...@g.us`, LID `...@lid` |
| `contact_name` | string/null | Nama kontak/grup |
| `is_group` | boolean | `true` untuk grup |
| `last_message_at` | date/null | Pesan terakhir |
| `unread_count` | integer | Jumlah belum dibaca |

### Message

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | UUID | Primary key (berurutan waktu) |
| `chat_id` | UUID | Chat terkait |
| `wa_message_id` | string/null | ID dari Baileys (untuk dedupe & status) |
| `direction` | enum | `incoming`, `outgoing` |
| `type` | enum | `text`, `image`, `document`, `audio`, `video`, `sticker`, `other` |
| `body` | text/null | Teks atau label media, mis. `[Gambar] caption` |
| `media_url` | string/null | Path `/media/...?t=...` |
| `media_mimetype` | string/null | MIME |
| `media_filename` | string/null | Nama file asli |
| `media_size` | integer/null | Ukuran byte |
| `media_width` | integer/null | Lebar (gambar/video/stiker) |
| `media_height` | integer/null | Tinggi (gambar/video/stiker) |
| `media_seconds` | integer/null | Durasi (audio/video) |
| `media_ptt` | boolean | `true` = voice note |
| `media_caption` | text/null | Caption media |
| `status` | enum | `pending`, `sent`, `delivered`, `read`, `failed` |
| `sent_by_user_id` | UUID/null | User pengirim dari dashboard; `null` = API / auto-reply / kontak |
| `is_auto_reply` | boolean | `true` bila dari rule auto reply |

### AutoReplyRule

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | UUID | Primary key |
| `device_id` | UUID | Device pemilik |
| `keyword` | string | Kata kunci, `*` = semua pesan |
| `match_type` | enum | `exact`, `contains`, `starts_with` |
| `reply_text` | text | Isi balasan |
| `is_active` | boolean | Aktif/tidak |
| `priority` | integer | Prioritas |

### MessageJob (antrean pesan)

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | UUID | Primary key (berurutan waktu) |
| `device_id` | UUID | Device pengirim |
| `to_jid` | string | JID tujuan hasil normalisasi |
| `type` | enum | `text`, `image`, `video`, `audio`, `sticker`, `document` |
| `payload` | JSON | `{ text }` atau `{ caption, ptt, media: { mimetype, filename, type } }` |
| `status` | enum | `pending`, `sending`, `sent`, `failed`, `cancelled` |
| `priority` | integer | Makin besar makin didahulukan |
| `scheduled_at` | date | Waktu kirim yang diminta |
| `attempts` / `max_attempts` | integer | Percobaan terpakai / batas |
| `next_attempt_at` | date/null | Jadwal retry berikutnya |
| `last_error` | text/null | Error terakhir |
| `client_ref` | string/null | ID idempotensi dari pengirim (unik per device) |
| `source` | string | Asal job: `api`, `api-media`, `api-url`, `batch` |
| `created_by_user_id` | UUID/null | User pembuat (null untuk API) |
| `message_id` | UUID/null | Pesan inbox hasil pengiriman |
| `sent_at` | date/null | Waktu terkirim |

### User (login)

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | UUID | Primary key |
| `name` | string | Nama |
| `email` | string | Unik |
| `role` | enum | `admin`, `agent` |
| `password` | hash | Tidak pernah dikembalikan API |

---

## 10. Webhook Keluar

Webhook dikirim **per device**. Atur URL lewat field `webhook_url` saat membuat device atau `PUT /api/devices/:id`. Jika device tidak punya `webhook_url`, sistem memakai `WEBHOOK_URL` global (fallback lama).

Panduan lengkap + contoh integrasi: **[WebHook.md](WebHook.md)**.

**Payload standar**

```json
{
  "id": "0f8fad5b-d9cb-469f-a165-70867728950e",
  "version": "1.0",
  "event": "messages",
  "device_id": "a1b2c3d4-...",
  "device_name": "CS Utama",
  "timestamp": 1760000000000,
  "data": {
    "id": "3EB0A1B2C3D4E5F6",
    "jid": "628123456789@s.whatsapp.net",
    "from_me": false,
    "push_name": "Budi",
    "type": "image",
    "body": "[Gambar] Bukti transfer",
    "media_url": "/media/a1b2c3d4-.../3EB0A1B2C3D4E5F6.jpg?t=ab12cd34...",
    "media_mimetype": "image/jpeg",
    "media_filename": "bukti.jpg",
    "media_ptt": false,
    "timestamp": 1760000000
  }
}
```

**Event `message.update`**

Dikirim saat status pesan keluar berubah naik (`sent` → `delivered` → `read`). Berlaku untuk pesan dari dashboard, API, antrean, auto-reply, dan ponsel.

```json
{
  "id": "...",
  "version": "1.0",
  "event": "message.update",
  "device_id": "a1b2c3d4-...",
  "device_name": "CS Utama",
  "timestamp": 1760000050000,
  "data": {
    "id": "3EB0A1B2C3D4E5F6",
    "jid": "628123456789@s.whatsapp.net",
    "from_me": true,
    "status": "delivered",
    "previous_status": "sent",
    "message_id": "0192f1c2-...",
    "chat_id": "b2c3d4e5-...",
    "type": "text",
    "body": "Halo dari sistem",
    "media_url": null,
    "media_mimetype": null,
    "media_filename": null,
    "media_ptt": false,
    "timestamp": 1760000000
  }
}
```

Detail field dan contoh penerima: **[WebHook.md](WebHook.md#4a-event-messageupdate)**.

**Event `connection`**

```json
{
  "id": "...",
  "version": "1.0",
  "event": "connection",
  "device_id": "a1b2c3d4-...",
  "device_name": "CS Utama",
  "timestamp": 1760000000000,
  "data": { "status": "connected", "phone": "628123456789" }
}
```

**Header request**

| Header | Keterangan |
|---|---|
| `Content-Type` | `application/json` |
| `X-Webhook-Event` | `messages`, `message.update`, atau `connection` |
| `X-Webhook-Id` | Sama dengan `id` di payload |
| `X-Signature` | `sha256=<hex>` = HMAC-SHA256 body mentah (jika secret diisi) |
| `User-Agent` | `WA-Dashboard-Webhook/1.0` |

Aturan:

- Secret dipilih dari `device.webhook_secret`, lalu `WEBHOOK_SECRET` global.
- `WEBHOOK_ALLOWED_EVENTS` hanya menyaring webhook **global**; webhook per device menerima `messages`, `message.update`, dan `connection`.
- `instance_key` **tidak** disertakan, kecuali `WEBHOOK_INCLUDE_KEY=true`.
- Timeout 5 detik (`WEBHOOK_TIMEOUT_MS`), fire-and-forget, **tanpa retry otomatis**. Balas `2xx` secepat mungkin.

Verifikasi signature (Node.js):

```js
const crypto = require("crypto");
const expected = "sha256=" + crypto.createHmac("sha256", process.env.WEBHOOK_SECRET).update(rawBody).digest("hex");
const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers["x-signature"] || ""));
```

---

## 11. Realtime Socket.IO

Dashboard memakai Socket.IO pada origin yang sama (`/socket.io`).

**Koneksi** — JWT wajib:

```js
import { io } from "socket.io-client";

const socket = io("http://localhost:3000", {
  auth: { token: "<jwt>" },
});

socket.on("connect", () => {
  socket.emit("join:device", "<device_id>");
});

socket.on("message:new", ({ chat_id, message }) => {
  console.log("Pesan baru", chat_id, message);
});

socket.on("message:update", ({ chat_id, message_id, status }) => {
  console.log("Status berubah", message_id, status);
});

socket.on("device:status", ({ device_id, status }) => {
  console.log("Device", device_id, "->", status);
});
```

| Event | Arah | Payload |
|---|---|---|
| `join:device` | client → server | `deviceId` (string) |
| `leave:device` | client → server | `deviceId` (string) |
| `device:status` | server → semua | `{ device_id, status }` |
| `message:new` | server → room device | `{ chat_id, message }` |
| `message:update` | server → room device | `{ chat_id, message_id, status }` |

---

## 12. Batas & Konfigurasi Terkait API

| Variabel `.env` | Default | Pengaruh |
|---|---|---|
| `PORT` | `3000` | Port server |
| `CORS_ORIGIN` | `*` | Origin yang diizinkan (pisahkan koma) |
| `TRUST_PROXY` | `loopback` | Untuk IP asli di belakang Nginx |
| `JWT_SECRET` | – | Wajib; menandatangani token dashboard |
| `JWT_EXPIRES_IN` | `8h` | Umur token |
| `PROTECT_ROUTES` | `false` | Wajib bearer `TOKEN` di `/api/message/*` |
| `TOKEN` | – | Bearer token tambahan untuk gateway |
| `GATEWAY_ALLOW_QUERY_KEY` | `true` | Izinkan `?key=` |
| `GATEWAY_RATE_LIMIT_PER_MINUTE` | `120` | Batas request gateway per IP (`0` = off) |
| `DEFAULT_COUNTRY_CODE` | `62` | Pengganti awalan `0` |
| `MEDIA_DIR` | `src/media` | Folder penyimpanan media |
| `MEDIA_MAX_MB` | `25` | Batas unduh media masuk |
| `MEDIA_TOKEN_SECRET` | `JWT_SECRET` | Secret signature URL media |
| `MEDIA_URL_MAX_MB` | `25` | Batas unduhan `/mediaurl` |
| `MEDIA_URL_TIMEOUT_MS` | `15000` | Timeout unduhan `/mediaurl` |
| `MEDIA_URL_ALLOWED_HOSTS` | – | Whitelist host untuk `/mediaurl` |
| `WEBHOOK_URL` | – | URL webhook global (fallback untuk device tanpa webhook sendiri) |
| `WEBHOOK_ALLOWED_EVENTS` | `all` | `all`, `messages`, `message.update`, `connection` (hanya untuk webhook global) |
| `WEBHOOK_SECRET` | – | Secret HMAC signature default |
| `WEBHOOK_INCLUDE_KEY` | `false` | Ikutkan `instance_key` di payload webhook |
| `WEBHOOK_TIMEOUT_MS` | `5000` | Timeout pengiriman webhook |

**Antrean pesan**

| Variabel `.env` | Default | Pengaruh |
|---|---|---|
| `QUEUE_ENABLED` | `true` | Aktifkan worker antrean |
| `QUEUE_POLL_MS` | `1000` | Interval cek antrean (ms) |
| `QUEUE_MIN_DELAY_MS` | `8000` | Jeda minimum antar pesan per device |
| `QUEUE_MAX_DELAY_MS` | `25000` | Jeda maksimum antar pesan per device |
| `QUEUE_HOURLY_LIMIT` | `60` | Maks pesan keluar device / 1 jam (`0` = tanpa batas) |
| `QUEUE_DAILY_LIMIT` | `200` | Maks pesan keluar device / 24 jam (`0` = tanpa batas) |
| `QUEUE_MAX_ATTEMPTS` | `3` | Percobaan maksimum per job |
| `QUEUE_RETRY_BASE_MS` | `30000` | Backoff awal saat gagal |
| `QUEUE_RETRY_MAX_MS` | `900000` | Backoff maksimum (15 menit) |
| `QUEUE_BATCH_MAX` | `100` | Maks item per request batch |
| `QUEUE_ACTIVE_HOURS` | – | Jam kirim lokal, mis. `8-21`. Kosong = 24 jam |
| `QUEUE_TIMEZONE` | `Asia/Jakarta` | Zona waktu `QUEUE_ACTIVE_HOURS` |
| `QUEUE_TYPING` | `false` | Simulasi status “sedang mengetik” |
| `QUEUE_TYPING_MAX_MS` | `4000` | Batas durasi simulasi mengetik |

**Batas aplikasi**

| Batas | Nilai |
|---|---|
| Ukuran upload (dashboard & gateway) | 25 MB / file, 1 file / request |
| Panjang pesan teks | 4096 karakter |
| Panjang caption | 4096 karakter |
| `limit` riwayat pesan | 1–500 (default 200) |
| Daftar chat | maks 500 |
| Login | 10 percobaan / 15 menit / IP |
| Gateway | 120 request / menit / IP (default) |

---

## Contoh Alur Lengkap

```bash
# 1. Login admin
TOKEN=$(curl -s -X POST "http://localhost:3000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"rahasia123"}' | jq -r .token)

# 2. Lihat daftar device + instance_key
curl -s "http://localhost:3000/api/devices" -H "Authorization: Bearer $TOKEN"

# 3. Ambil QR untuk menautkan WhatsApp (admin)
curl -s "http://localhost:3000/api/devices/<device_id>/qr" -H "Authorization: Bearer $TOKEN"

# 4. Kirim pesan lewat gateway
curl -s -X POST "http://localhost:3000/api/message/text" \
  -H "X-Api-Key: <instance_key>" \
  -H "Content-Type: application/json" \
  -d '{"id":"08123456789","message":"Halo dari sistem"}'

# 5. Lihat chat dan riwayat pesan
curl -s "http://localhost:3000/api/devices/<device_id>/chats" -H "Authorization: Bearer $TOKEN"
curl -s "http://localhost:3000/api/chats/<chat_id>/messages?limit=50" -H "Authorization: Bearer $TOKEN"

# 6. Kirim massal lewat antrean (aman saat device offline)
curl -s -X POST "http://localhost:3000/api/message/queue/batch" \
  -H "X-Api-Key: <instance_key>" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"id":"0811111111","message":"Halo A","ref":"promo-a"},{"id":"0822222222","message":"Halo B"}]}'

# 7. Pantau antrean & kuota
curl -s "http://localhost:3000/api/devices/<device_id>/jobs/stats" -H "Authorization: Bearer $TOKEN"
```
