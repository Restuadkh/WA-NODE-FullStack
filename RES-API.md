# RES-API — Referensi API

Dokumen ini menjelaskan API yang tersedia pada **v3.0.0** (versi ramping). Untuk webhook lihat **[WebHook.md](WebHook.md)**; untuk media lihat **[MEDIA.md](MEDIA.md)**.

- Base URL: `https://wa.contoh.com` (sesuaikan dengan domain Anda)
- Semua respons JSON memakai amplop: `{ "error": false, "data": ... }` atau `{ "error": true, "message": "..." }`.

---

## 1. Autentikasi

### 1.1 Login dashboard (JWT)

`POST /api/auth/login`

```json
{ "email": "admin@contoh.com", "password": "rahasia" }
```

Respons `200`:

```json
{
  "error": false,
  "token": "<JWT>",
  "user": { "id": "...", "name": "Admin", "email": "admin@contoh.com", "role": "admin" }
}
```

Gunakan `Authorization: Bearer <JWT>` untuk endpoint dashboard.

Role:
- `admin` — kelola device dan pengguna.
- `agent` — balas chat di Inbox.

Semua user yang login boleh melihat semua device.

### 1.2 API kirim pesan (instance key)

Endpoint `/api/message/*` memakai `instance_key` device:

```
X-Api-Key: <instance_key>
```

Alternatif lama: `?key=<instance_key>` (bisa dimatikan dengan `GATEWAY_ALLOW_QUERY_KEY=false`).

Jika `PROTECT_ROUTES=true`, tambahkan juga:

```
Authorization: Bearer <TOKEN>
```

`instance_key` dilihat admin di halaman **Devices**.

---

## 2. API kirim pesan

Semua endpoint di bawah:

- device harus **online** (`409` bila belum terhubung);
- pesan yang terkirim ikut disimpan dan tampil di Inbox;
- nomor tujuan boleh berawalan `0` (otomatis diganti `DEFAULT_COUNTRY_CODE`, default `62`);
- dibatasi `GATEWAY_RATE_LIMIT_PER_MINUTE` per IP.

### 2.1 Kirim teks

`POST /api/message/text`

```json
{ "id": "08123456789", "message": "Halo dari sistem" }
```

`id` = nomor tujuan, `message` = teks (maks 4096 karakter).

### 2.2 Kirim media (multipart)

`POST /api/message/image`
`POST /api/message/video`
`POST /api/message/audio`
`POST /api/message/sticker`
`POST /api/message/note` (voice note / PTT)
`POST /api/message/doc` (dokumen)

Field:

| Field | Wajib | Keterangan |
|---|---|---|
| `id` | ya | Nomor tujuan |
| `file` | ya | File media |
| `caption` | tidak | Keterangan |
| `filename` | tidak | Nama file yang ditampilkan |
| `ptt` | tidak | Khusus `/audio`: `true` untuk voice note |

Contoh:

```bash
curl -X POST "https://wa.contoh.com/api/message/image" \
  -H "X-Api-Key: <instance_key>" \
  -F "id=08123456789" \
  -F "caption=Katalog" \
  -F "file=@/path/foto.jpg"
```

Respons sukses: `201`.

---

## 3. Endpoint dashboard

Semua memerlukan `Authorization: Bearer <JWT>`.

### 3.1 Device

| Method | Path | Akses | Fungsi |
|---|---|---|---|
| GET | `/api/devices` | JWT | Daftar device. `instance_key`/webhook hanya terlihat oleh admin |
| POST | `/api/devices` | admin | Tambah device + mulai sesi |
| PUT/PATCH | `/api/devices/:id` | admin | Ubah nama / webhook |
| GET | `/api/devices/:id/qr` | JWT | QR untuk menautkan WhatsApp |
| GET | `/api/devices/:id/status` | JWT | Status & nomor device |
| POST | `/api/devices/:id/redial` | admin | Putus lalu mulai ulang koneksi |
| DELETE | `/api/devices/:id` | admin | Logout + hapus device, chat, pesan, media |

Contoh membuat device:

```json
{
  "name": "CS Utama",
  "phone_number": "628123456789",
  "webhook_url": "https://aplikasi.contoh.id/wa",
  "webhook_secret": "rahasia-webhook"
}
```

`phone_number` opsional (untuk metadata/duplikasi); penautan tetap lewat QR.

### 3.2 Chat & pesan

| Method | Path | Fungsi |
|---|---|---|
| GET | `/api/devices/:deviceId/chats` | Daftar chat pada device |
| GET | `/api/chats/:chatId/messages?limit=&before=` | Riwayat pesan (urut naik) |
| POST | `/api/chats/:chatId/messages` | Kirim teks atau media dari Inbox |
| POST | `/api/chats/:chatId/read` | Tandai chat dibaca |

Kirim teks:

```json
{ "text": "Baik kak", "replyTo": "<wa_message_id>" }
```

Kirim media: multipart field `file` + `type` (`image|video|audio|sticker|document`), `caption`, `ptt`.

Kirim kontak (vCard) — satu atau banyak kontak dalam satu pesan:

```json
{ "contacts": [ { "name": "Budi", "phone": "08123456789" } ] }
```

### 3.3 Pengguna (admin)

| Method | Path | Fungsi |
|---|---|---|
| GET | `/api/users` | Daftar pengguna |
| POST | `/api/users` | Buat pengguna |
| PUT/PATCH | `/api/users/:id` | Ubah nama/role/password |
| DELETE | `/api/users/:id` | Hapus pengguna |

Buat pengguna:

```json
{ "name": "Agen Satu", "email": "agen@contoh.com", "password": "rahasia123", "role": "agent" }
```

Aturan:
- `role`: `admin` atau `agent`.
- password minimal 8 karakter.
- admin terakhir tidak bisa diturunkan menjadi agent atau dihapus.
- tidak bisa menghapus akun sendiri.

---

## 4. Status & error

| HTTP | Arti |
|---|---|
| `200` | Sukses |
| `201` | Pesan/entitas dibuat |
| `400` | Parameter tidak valid |
| `401` | Token/API key tidak valid |
| `403` | Role tidak diizinkan (`admin` diperlukan) |
| `404` | Data tidak ditemukan |
| `409` | Konflik (device offline, email duplikat, admin terakhir) |
| `413` | File melebihi `MEDIA_MAX_MB` |
| `422` | Nomor tujuan tidak valid |
| `429` | Melebihi rate limit |

Contoh error:

```json
{ "error": true, "message": "Device belum terhubung ke WhatsApp" }
```

---

## 5. Webhook

Webhook diatur per device (fallback `WEBHOOK_URL` global). Event: `messages`, `message.update`, `connection`.

Payload:

```json
{
  "id": "...",
  "version": "1.0",
  "event": "messages",
  "device_id": "...",
  "device_name": "CS Utama",
  "timestamp": "2026-11-25T10:00:00.000Z",
  "data": { }
}
```

Bila secret diisi, header `X-Signature: sha256=<hex>` berisi HMAC-SHA256 dari body mentah. Detail & contoh verifikasi: **[WebHook.md](WebHook.md)**.

---

## 6. Endpoint yang dihapus di v3.0

`/api/message/queue*`, `/api/message/mediaurl`, `/api/devices/:id/contacts*`, `/api/devices/:id/rules`, `/api/roles/*`, `/api/users/:id/permissions`, dan `/api/cron/redial` sudah tidak tersedia. Lihat **[CHANGELOG.md](CHANGELOG.md)**.

---

## 7. Endpoint publik (tanpa login)

### 7.1 Formulir kontak

| Method | Path | Akses | Fungsi |
|---|---|---|---|
| POST | `/api/contact` | publik | Terima pesan pengunjung situs publik |

- **Rate limit**: maks 5 request / 15 menit per IP (`429` bila lebih).
- **Honeypot**: field `website` harus kosong; bila terisi dianggap bot (`400`).
- **Validasi** (`400` + daftar `fields`): `name` ≥ 2 karakter, `email` format valid, `subject` ≥ 3 karakter, `message` ≥ 10 karakter. Karakter kontrol dibuang dan panjang dipotong (`name` 100, `email` 254, `subject` 150, `message` 2000).

Contoh request:

```json
{
  "name": "Budi",
  "email": "budi@contoh.id",
  "subject": "Pertanyaan layanan",
  "message": "Halo, saya ingin bertanya tentang device WhatsApp."
}
```

Respons sukses `201`:

```json
{
  "ok": true,
  "id": "<uuid>",
  "message": "Pesan tersimpan. Gunakan nomor referensi berikut untuk tindak lanjut."
}
```

Pesan disimpan sebagai satu baris JSONL per pesan pada `CONTACT_DIR` (default `src/data/contact/messages.jsonl`, di luar folder statis). Setiap baris memuat `id`, `createdAt`, data formulir yang sudah dibersihkan, dan `ipHash` (HMAC-SHA256 24 karakter dari IP, kunci `JWT_SECRET`) — IP asli tidak disimpan. Belum ada notifikasi email otomatis.

Endpoint pendukung situs publik yang juga tanpa login: `GET /robots.txt` dan `GET /sitemap.xml` (mengikuti host yang dipakai pengunjung).
