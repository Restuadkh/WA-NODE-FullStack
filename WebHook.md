# Panduan Webhook — WA Dashboard

Panduan lengkap memakai **webhook per device** untuk integrasi aplikasi lain (CRM, ERP, helpdesk, bot, dan sebagainya).

- **Format**: HTTP `POST`, body JSON
- **Arah**: dari WA Dashboard → aplikasi Anda
- **Event**: `messages` dan `connection`
- **Konfigurasi**: per device (dashboard) atau lewat REST API
- **Signature**: opsional, HMAC-SHA256 (`X-Signature`)
- **Timeout**: 5 detik, tanpa retry otomatis

Referensi endpoint lain: [RES-API.md](RES-API.md).

---

## Daftar Isi

1. [Cara Kerja](#1-cara-kerja)
2. [Mengatur Webhook](#2-mengatur-webhook)
3. [Format Standar Payload](#3-format-standar-payload)
4. [Event `messages`](#4-event-messages)
5. [Event `connection`](#5-event-connection)
6. [Verifikasi Signature](#6-verifikasi-signature)
7. [Yang Harus Dilakukan Aplikasi Penerima](#7-yang-harus-dilakukan-aplikasi-penerima)
8. [Contoh Penerima Lengkap](#8-contoh-penerima-lengkap)
9. [Testing & Debugging](#9-testing--debugging)
10. [Troubleshooting](#10-troubleshooting)
11. [Checklist Produksi](#11-checklist-produksi)

---

## 1. Cara Kerja

```
WhatsApp ──► WA Dashboard ──HTTP POST──► Aplikasi Anda
                 │                           │
                 │  event: messages          │ simpan / proses
                 │  event: connection        │ balas 2xx < 5 detik
                 └───────────────────────────┘
```

Aturan utama:

1. **Satu URL per device.** Device A dan Device B bisa mengirim ke aplikasi/endpoint yang berbeda.
2. **Fallback global.** Device yang tidak punya `webhook_url` memakai `WEBHOOK_URL` dari `.env` (perilaku lama).
3. **Webhook per device menerima semua event** (`messages` + `connection`). Filter `WEBHOOK_ALLOWED_EVENTS` hanya berlaku untuk webhook global.
4. **Fire-and-forget.** Setelah request dikirim, server tidak menunggu balasan lebih dari 5 detik dan **tidak mengulang** request yang gagal.
5. **Tidak ada instance_key.** Kredensial API tidak pernah ikut, kecuali Anda menyalakan `WEBHOOK_INCLUDE_KEY=true`.

### Event apa saja yang dikirim?

| Event | Kapan dikirim |
|---|---|
| `messages` | Ada pesan yang masuk lewat event WhatsApp — termasuk pesan yang **Anda kirim dari ponsel** (`from_me: true`). |
| `connection` | Status koneksi device berubah: `pending_qr`, `connected`, `disconnected`, `logged_out`. |

> **Catatan:** pesan yang dikirim dari dashboard atau lewat API `/api/message/*` **tidak** memicu webhook `messages` (aplikasi Anda yang mengirim, jadi tidak perlu echo). Yang dikirim adalah pesan yang diterima dari WhatsApp, termasuk yang diketik dari ponsel yang tertaut.

---

## 2. Mengatur Webhook

### 2.1 Lewat Dashboard (paling mudah)

1. Login sebagai **admin**.
2. Buka menu **Devices**.
3. Klik **+ Tambah device**, isi:
   - **Webhook URL**: `https://aplikasi-anda.com/webhook/whatsapp`
   - **Webhook secret**: string acak panjang (opsional tapi sangat disarankan)
4. Simpan. Setelah device terhubung, setiap event akan dikirim ke URL tersebut.
5. Untuk mengubah nanti: klik **Edit** pada baris device → ubah nama, URL, atau secret → **Simpan**.
   - Mengosongkan **Webhook URL** = mematikan webhook device (jatuh ke fallback global).
   - Mengosongkan **Webhook secret** = menghapus secret (header `X-Signature` tidak lagi dikirim).

### 2.2 Lewat REST API

**Saat membuat device**

```bash
curl -X POST "https://wa.contoh.com/api/devices" \
  -H "Authorization: Bearer <JWT_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CS Utama",
    "phone_number": "08123456789",
    "webhook_url": "https://aplikasi-anda.com/webhook/whatsapp",
    "webhook_secret": "ubah-dengan-string-acak-panjang"
  }'
```

**Mengubah device yang sudah ada**

```bash
curl -X PUT "https://wa.contoh.com/api/devices/<device_id>" \
  -H "Authorization: Bearer <JWT_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CS Utama",
    "webhook_url": "https://aplikasi-anda.com/webhook/whatsapp",
    "webhook_secret": "secret-baru"
  }'
```

- Semua field opsional; hanya yang dikirim yang diubah.
- `webhook_url: ""` mematikan webhook device.
- `webhook_secret: ""` menghapus secret.
- URL wajib `http://` atau `https://` (maks 500 karakter), secret maks 255 karakter.

**Melihat konfigurasi**

`GET /api/devices` (admin) mengembalikan `webhook_url`, `webhook_secret`, dan `webhook_configured`. Agent hanya melihat `webhook_configured` (URL & secret disembunyikan).

### 2.3 Fallback global (opsional)

Isi `.env` bila ingin satu webhook untuk semua device yang belum punya URL sendiri:

```env
WEBHOOK_URL=https://aplikasi-anda.com/webhook/whatsapp
WEBHOOK_SECRET=secret-global
WEBHOOK_ALLOWED_EVENTS=all
WEBHOOK_TIMEOUT_MS=5000
```

Urutan yang dipakai:

| Pengaturan | Sumber |
|---|---|
| URL | `device.webhook_url` → `WEBHOOK_URL` |
| Secret | `device.webhook_secret` → `WEBHOOK_SECRET` |
| Filter event | Hanya untuk webhook global (`WEBHOOK_ALLOWED_EVENTS`) |

---

## 3. Format Standar Payload

Semua event memakai **envelope yang sama**:

```json
{
  "id": "6f1c2a9e-3b6d-4c8f-9a10-2d7e5b8c4f01",
  "version": "1.0",
  "event": "messages",
  "device_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "device_name": "CS Utama",
  "timestamp": 1760000000000,
  "data": { }
}
```

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | string (UUID) | ID unik pengiriman. Pakai untuk **idempotency** (abaikan `id` yang sudah pernah diproses). |
| `version` | string | Versi format payload. Saat ini `"1.0"`. |
| `event` | string | `messages` atau `connection`. |
| `device_id` | string (UUID) | Device pengirim event. Stabil, aman dipakai sebagai kunci. |
| `device_name` | string | Nama device saat event terjadi. Bisa berubah. |
| `timestamp` | number | Waktu event (epoch **milidetik**, UTC). |
| `data` | object | Isi event — lihat bagian berikut. |
| `key` | string | **Hanya** bila `WEBHOOK_INCLUDE_KEY=true`. Jangan diandalkan. |

### Header HTTP

| Header | Contoh | Keterangan |
|---|---|---|
| `Content-Type` | `application/json` | Selalu JSON |
| `X-Webhook-Event` | `messages` | Sama dengan `event` |
| `X-Webhook-Id` | `6f1c2a9e-...` | Sama dengan `id` |
| `X-Signature` | `sha256=ab12...` | Ada hanya jika secret diisi |
| `User-Agent` | `WA-Dashboard-Webhook/1.0` | Identitas pengirim |

---

## 4. Event `messages`

Dikirim untuk setiap pesan WhatsApp yang masuk/disinkronkan (termasuk pesan dari ponsel sendiri).

```json
{
  "id": "6f1c2a9e-3b6d-4c8f-9a10-2d7e5b8c4f01",
  "version": "1.0",
  "event": "messages",
  "device_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "device_name": "CS Utama",
  "timestamp": 1760000000000,
  "data": {
    "id": "3EB0A1B2C3D4E5F6",
    "jid": "628123456789@s.whatsapp.net",
    "from_me": false,
    "push_name": "Budi",
    "type": "image",
    "body": "[Gambar] Bukti transfer",
    "media_url": "/media/a1b2c3d4-e5f6-7890-abcd-ef1234567890/3EB0A1B2C3D4E5F6.jpg?t=ab12cd34ef56...",
    "media_mimetype": "image/jpeg",
    "media_filename": "bukti.jpg",
    "media_ptt": false,
    "timestamp": 1760000000
  }
}
```

| Field `data` | Tipe | Keterangan |
|---|---|---|
| `id` | string | ID pesan WhatsApp (`wa_message_id`). Unik per chat — pakai bersama `jid` untuk dedupe. |
| `jid` | string | Pengirim/chat: `...@s.whatsapp.net` (pribadi), `...@g.us` (grup), `...@lid` |
| `from_me` | boolean | `true` = dikirim dari nomor Anda (termasuk dari ponsel) |
| `push_name` | string/null | Nama tampilan pengirim dari WhatsApp |
| `type` | string | `text`, `image`, `video`, `audio`, `sticker`, `document`, `other` |
| `body` | string | Teks pesan, atau label media + caption (mis. `[Gambar] Bukti transfer`) |
| `media_url` | string/null | Path relatif media bertanda tangan; `null` bila bukan media |
| `media_mimetype` | string/null | MIME media |
| `media_filename` | string/null | Nama file asli |
| `media_ptt` | boolean | `true` = voice note |
| `timestamp` | number/null | Waktu pesan WhatsApp (epoch **detik**) |

### Catatan media

- `media_url` adalah **path relatif**. Bentuk URL lengkap:

  ```
  https://wa.contoh.com/media/a1b2.../3EB0....jpg?t=ab12...
  ```

  Timpa `https://wa.contoh.com` dengan base URL server Anda.

- URL sudah membawa tanda tangan HMAC. **Jangan menambah/mengubah** query `t`; tanpa signature yang valid akan ditolak `403`.
- Signature tidak kedaluwarsa, tetapi bisa berubah bila `MEDIA_TOKEN_SECRET`/`JWT_SECRET` diganti.
- **Unduh segera** setelah event diterima. File bisa hilang bila device dihapus atau folder `MEDIA_DIR` dibersihkan.
- Media yang gagal diunduh server tetap dikirim sebagai pesan teks berlabel (mis. `[Gambar]`), dengan `media_url: null`.

### Kapan `messages` TIDAK dikirim?

- Pesan sistem: reaction, poll update, protocol message, dan sejenisnya.
- Pesan dari `status@broadcast`, `@broadcast`, dan `@newsletter`.
- Pesan keluar yang dikirim lewat **dashboard** atau **API** `/api/message/*` (tidak di-echo).
- Event duplikat dari WhatsApp (sudah pernah diproses) tidak dikirim ulang.

---

## 5. Event `connection`

Dikirim saat status koneksi device berubah.

```json
{
  "id": "9c2b7d10-4a5e-4f11-8b22-1c3d5e7f9a00",
  "version": "1.0",
  "event": "connection",
  "device_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "device_name": "CS Utama",
  "timestamp": 1760000000000,
  "data": {
    "status": "connected",
    "phone": "628123456789"
  }
}
```

| Field `data` | Tipe | Keterangan |
|---|---|---|
| `status` | string | `pending_qr`, `connected`, `disconnected`, `logged_out` |
| `phone` | string/null | Nomor WhatsApp bila diketahui |

Contoh pemakaian: matikan antrean pengiriman saat `disconnected`, tampilkan alert saat `logged_out`, atau catat waktu `connected`.

> Event `connection` bisa terkirim berulang saat server restart (status yang sama). Aplikasi penerima sebaiknya menyimpan status terakhir dan mengabaikan duplikat.

---

## 6. Verifikasi Signature

Jika secret diisi, setiap request membawa:

```http
X-Signature: sha256=<hex>
```

Nilainya adalah `HMAC-SHA256(secret, rawBody)` dalam bentuk hex, dengan prefix `sha256=`.

**Penting:** hitung dari **body mentah** (byte yang benar-benar diterima), bukan dari objek JSON yang sudah di-parse lalu di-`JSON.stringify` ulang. Urutan key/spasi bisa berubah dan signature tidak akan cocok.

### Node.js (Express)

```js
const express = require("express");
const crypto = require("crypto");

const app = express();

// Simpan raw body KHUSUS untuk webhook.
app.post(
  "/webhook/whatsapp",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const raw = req.body; // Buffer
    const expected =
      "sha256=" + crypto.createHmac("sha256", process.env.WEBHOOK_SECRET).update(raw).digest("hex");
    const given = req.get("x-signature") || "";

    const valid =
      given.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));

    if (!valid) return res.status(401).json({ error: "invalid signature" });

    const event = JSON.parse(raw.toString("utf8"));
    console.log(event.event, event.device_id, event.data);

    // Balas cepat; proses berat lakukan setelah response (queue/background job).
    res.status(200).json({ ok: true });
  },
);
```

> Jangan pakai `express.json()` pada route ini sebelum verifikasi, karena body aslinya sudah hilang.

### PHP (native)

```php
<?php
$raw = file_get_contents("php://input");
$secret = getenv("WEBHOOK_SECRET");
$expected = "sha256=" . hash_hmac("sha256", $raw, $secret);
$given = $_SERVER["HTTP_X_SIGNATURE"] ?? "";

if (!hash_equals($expected, $given)) {
    http_response_code(401);
    echo json_encode(["error" => "invalid signature"]);
    exit;
}

$event = json_decode($raw, true);
// ... proses ...
http_response_code(200);
echo json_encode(["ok" => true]);
```

### Laravel

```php
use Illuminate\Http\Request;

Route::post('/webhook/whatsapp', function (Request $request) {
    $raw = $request->getContent();
    $expected = 'sha256=' . hash_hmac('sha256', $raw, config('services.wa.webhook_secret'));

    if (!hash_equals($expected, $request->header('X-Signature', ''))) {
        abort(401, 'invalid signature');
    }

    $event = json_decode($raw, true);
    // dispatch(new ProcessWhatsAppEvent($event));  // antrekan
    return response()->json(['ok' => true]);
})->withoutMiddleware([\App\Http\Middleware\VerifyCsrfToken::class]);
```

### Python (Flask)

```python
import hashlib, hmac, os
from flask import Flask, request, jsonify, abort

app = Flask(__name__)

@app.post("/webhook/whatsapp")
def webhook():
    raw = request.get_data()  # bytes asli
    expected = "sha256=" + hmac.new(
        os.environ["WEBHOOK_SECRET"].encode(), raw, hashlib.sha256
    ).hexdigest()
    given = request.headers.get("X-Signature", "")

    if not hmac.compare_digest(expected, given):
        abort(401)

    event = request.get_json()
    print(event["event"], event["device_id"], event["data"])
    return jsonify(ok=True)
```

### Go (net/http)

```go
func webhook(w http.ResponseWriter, r *http.Request) {
    raw, _ := io.ReadAll(r.Body)
    mac := hmac.New(sha256.New, []byte(os.Getenv("WEBHOOK_SECRET")))
    mac.Write(raw)
    expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))

    if !hmac.Equal([]byte(expected), []byte(r.Header.Get("X-Signature"))) {
        http.Error(w, "invalid signature", http.StatusUnauthorized)
        return
    }

    var event map[string]any
    if err := json.Unmarshal(raw, &event); err != nil {
        http.Error(w, "invalid json", http.StatusBadRequest)
        return
    }
    w.Header().Set("Content-Type", "application/json")
    w.Write([]byte(`{"ok":true}`))
}
```

---

## 7. Yang Harus Dilakukan Aplikasi Penerima

1. **Balas `2xx` secepat mungkin** (idealnya < 1 detik, maksimal 5 detik).
   Jangan melakukan pekerjaan berat (kirim email, panggil API lambat) sebelum membalas — simpan ke queue dulu.
2. **Verifikasi `X-Signature`** memakai raw body (jika secret dipakai).
3. **Idempotensi**: simpan `id` (header `X-Webhook-Id`) yang sudah diproses. Request bisa terkirim lebih dari sekali pada kondisi tertentu (mis. restart, event berulang).
4. **Dedupe pesan**: untuk `messages`, gunakan kombinasi `device_id + data.jid + data.id`.
5. **Jangan mengandalkan urutan.** Meski dikirim berurutan, jaringan bisa membuat event datang tidak berurutan. Gunakan `timestamp`/`data.timestamp` bila butuh urutan.
6. **Tangani `media_url` segera** dan simpan file di storage Anda sendiri bila perlu.
7. **Log `id` dan `event`** untuk memudahkan troubleshooting.
8. **Kembalikan status non-2xx bila gagal** agar terlihat di log server (walaupun tidak ada retry otomatis).

Response yang disarankan:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{"ok":true}
```

---

## 8. Contoh Penerima Lengkap

Contoh Node.js + Express + penyimpanan idempotensi sederhana di memori:

```js
const express = require("express");
const crypto = require("crypto");

const app = express();
const SECRET = process.env.WEBHOOK_SECRET;
const seen = new Set(); // produksi: pakai Redis/DB

app.post("/webhook/whatsapp", express.raw({ type: "application/json" }), (req, res) => {
  const raw = req.body;
  const expected = "sha256=" + crypto.createHmac("sha256", SECRET).update(raw).digest("hex");
  const given = req.get("x-signature") || "";
  if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) {
    return res.status(401).json({ error: "invalid signature" });
  }

  const event = JSON.parse(raw.toString("utf8"));

  if (event.version !== "1.0") return res.status(400).json({ error: "unsupported version" });
  if (seen.has(event.id)) return res.status(200).json({ ok: true, duplicate: true });
  seen.add(event.id);

  if (event.event === "messages") {
    const m = event.data;
    console.log(`[${event.device_name}] ${m.from_me ? "OUT" : "IN"} ${m.jid}: ${m.body}`);
    if (m.media_url) {
      // media_url relatif terhadap server WA Dashboard
      const absolute = new URL(m.media_url, "https://wa.contoh.com").toString();
      console.log("media:", absolute, m.media_mimetype, m.media_filename);
    }
  } else if (event.event === "connection") {
    console.log(`[${event.device_name}] status: ${event.data.status}`);
  }

  res.status(200).json({ ok: true });
});

app.listen(4000, () => console.log("Webhook receiver :4000"));
```

Uji lokal:

```bash
WEBHOOK_SECRET=rahasia node receiver.js
# lalu isi Webhook URL device: http://localhost:4000/webhook/whatsapp
```

> Jika server WA Dashboard berjalan di Docker/host lain, `localhost` akan menunjuk ke mesin server tersebut, bukan komputer Anda. Gunakan IP LAN, nama host, atau tunnel (ngrok/cloudflared).

---

## 9. Testing & Debugging

### 9.1 Webhook sementara

- **webhook.site** — buka https://webhook.site, salin URL unik, isi sebagai Webhook URL device. Semua request + header terlihat langsung.
- **RequestBin / Pipedream** — alternatif bila butuh meneruskan ke skrip.

### 9.2 Tunnel ke lokal

```bash
# Cloudflare Tunnel
cloudflared tunnel --url http://localhost:4000

# atau ngrok
ngrok http 4000
```

Salin URL HTTPS hasil tunnel ke kolom Webhook URL.

### 9.3 Memicu event

| Event | Cara memicu |
|---|---|
| `messages` | Kirim pesan WhatsApp ke nomor device (atau kirim dari ponsel yang tertaut ke chat mana pun). |
| `connection` | Restart server, atau putuskan/sambungkan ulang device. Perubahan status juga terlihat di dashboard. |

### 9.4 Cek dari sisi server

- Log server menampilkan `Webhook gagal terkirim` bila request gagal (DNS, timeout, koneksi ditolak).
- Tidak ada log sukses per event; pantau dari sisi penerima.
- Pastikan URL dapat diakses **dari server**:
  ```bash
  curl -i -X POST "https://aplikasi-anda.com/webhook/whatsapp" \
    -H "Content-Type: application/json" \
    -d '{"test":true}'
  ```

---

## 10. Troubleshooting

| Gejala | Kemungkinan penyebab | Solusi |
|---|---|---|
| Tidak ada request sama sekali | `webhook_url` kosong dan `WEBHOOK_URL` global kosong | Isi Webhook URL device lewat Edit |
| Tidak ada request | Device belum `connected` | Tautkan device lewat QR/pairing |
| Tidak ada request | URL mengarah ke `localhost` dari mesin yang salah | Pakai IP LAN / tunnel |
| Request masuk tapi `401` | Signature tidak cocok | Hitung dari **raw body**, pastikan secret sama persis |
| `X-Signature` tidak ada | Secret device kosong dan `WEBHOOK_SECRET` kosong | Isi secret device |
| Timeout / log `Webhook gagal terkirim` | Aplikasi penerima > 5 detik atau tidak dapat diakses | Balas `2xx` dulu, proses async; naikkan `WEBHOOK_TIMEOUT_MS` bila perlu |
| Event dobel | Event berulang dari WhatsApp / restart | Dedupe dengan `id` dan `data.id` |
| Event `messages` tidak dikirim untuk pesan dari dashboard/API | Memang by design (tidak echo) | Gunakan response API/dashboard sebagai konfirmasi |
| Media `403` | URL diubah / signature rusak | Gunakan `media_url` apa adanya |
| Media `404` | File sudah dihapus (device dihapus / folder dibersihkan) | Unduh & simpan media segera |
| Ganti secret tapi masih gagal | Aplikasi masih memakai secret lama | Samakan secret di kedua sisi |

---

## 11. Checklist Produksi

- [ ] Webhook URL memakai **HTTPS** dan dapat diakses dari server WA Dashboard.
- [ ] Secret diisi (string acak panjang, mis. `openssl rand -hex 32`) dan **disimpan aman** di aplikasi penerima.
- [ ] Signature **selalu diverifikasi** dari raw body memakai perbandingan constant-time.
- [ ] Endpoint membalas `2xx` dalam < 5 detik; pekerjaan berat masuk queue.
- [ ] Idempotensi berdasarkan `X-Webhook-Id` dan dedupe pesan berdasarkan `device_id + jid + data.id`.
- [ ] Media diunduh dan disimpan di storage sendiri bila dibutuhkan.
- [ ] Monitoring: catat request masuk, status response, dan kegagalan.
- [ ] Uji saat device `disconnected` dan setelah server restart.
- [ ] Backup database + folder `MEDIA_DIR` tetap berjalan.

---

## Lampiran: Ringkasan Cepat

```http
POST https://aplikasi-anda.com/webhook/whatsapp
Content-Type: application/json
X-Webhook-Event: messages
X-Webhook-Id: 6f1c2a9e-...
X-Signature: sha256=...
User-Agent: WA-Dashboard-Webhook/1.0

{
  "id": "6f1c2a9e-...",
  "version": "1.0",
  "event": "messages",
  "device_id": "...",
  "device_name": "CS Utama",
  "timestamp": 1760000000000,
  "data": { "id": "...", "jid": "...", "from_me": false, "type": "text", "body": "Halo", "media_url": null, "media_mimetype": null, "media_filename": null, "media_ptt": false, "timestamp": 1760000000 }
}
```

Balasan yang diharapkan: **HTTP 2xx** dalam waktu < 5 detik.
