import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

// Halaman dokumentasi RES-API: cara memakai /api/message/* beserta contoh
// request dan response. Konten statis agar mudah dibaca integrator.

const Code = ({ children }) => <pre>{children}</pre>;

const Endpoint = ({ method, path, desc, children }) => (
  <section className="card docs-card">
    <h2>
      <span className="method">{method}</span> <code className="inline">{path}</code>
    </h2>
    <p className="muted small">{desc}</p>
    {children}
  </section>
);

export default function ApiDocs() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const [instanceKey, setInstanceKey] = useState("");
  const [deviceName, setDeviceName] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    api
      .listDevices()
      .then((list) => {
        const first = list.find((d) => d.instance_key) || list[0];
        if (first) {
          setInstanceKey(first.instance_key || "<instance_key>");
          setDeviceName(first.name);
        }
      })
      .catch(() => {});
  }, [isAdmin]);

  const KEY = instanceKey || "<instance_key-device>";

  return (
    <div className="page docs">
      <header className="page-head">
        <div>
          <h1>Dokumentasi API</h1>
          <p className="muted">
            API kirim pesan untuk aplikasi lain. Semua contoh memakai base URL server ini, mis.{" "}
            <code className="inline">{window.location.origin}</code>.
          </p>
        </div>
      </header>

      <section className="card docs-card">
        <h2>Autentikasi</h2>
        <p>
          Kunci API = <b>instance_key</b> device (admin dapat melihatnya di halaman Devices). Kirim lewat header{" "}
          <code className="inline">X-Api-Key</code> (disarankan). Bila <code className="inline">PROTECT_ROUTES=true</code>{" "}
          di server, tambahkan juga header <code className="inline">Authorization: Bearer &lt;TOKEN&gt;</code>.
        </p>
        {isAdmin ? (
          <p className="small">
            Contoh memakai device <b>{deviceName || "pertama"}</b>: <code className="inline">X-Api-Key: {KEY}</code>
          </p>
        ) : (
          <p className="muted small">
            instance_key hanya terlihat oleh admin. Minta kunci API ke admin Anda.
          </p>
        )}
        <Code>{`curl -X POST "https://wa.contoh.com/api/message/text" \\
  -H "X-Api-Key: ${KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{"id":"08123456789","message":"Halo dari sistem"}'`}</Code>
        <h3>Format response</h3>
        <p className="small">
          Semua endpoint membalas JSON dengan bentuk <code className="inline">{`{ error, data, message? }`}</code>:
        </p>
        <Code>{`// sukses
{ "error": false, "duplicate": false, "data": { ...pesan/job... } }

// gagal
{ "error": true, "message": "no key supplied (header X-Api-Key)" }`}</Code>
        <h3>Kode status</h3>
        <table className="table">
          <tbody>
            <tr><td>200</td><td>Sukses (job duplikat via <code className="inline">ref</code> juga 200)</td></tr>
            <tr><td>201</td><td>Pesan/job berhasil dibuat</td></tr>
            <tr><td>400</td><td>Parameter salah (nomor tidak valid, message kosong, dst.)</td></tr>
            <tr><td>403</td><td>API key / Bearer token salah</td></tr>
            <tr><td>409</td><td>Device WhatsApp sedang tidak online (endpoint kirim langsung)</td></tr>
            <tr><td>422</td><td>Nomor tujuan tidak terdaftar di WhatsApp</td></tr>
            <tr><td>429</td><td>Lewat batas <code className="inline">GATEWAY_RATE_LIMIT_PER_MINUTE</code></td></tr>
          </tbody>
        </table>
        <p className="muted small">
          Nomor berawalan 0 otomatis pakai kode negara (<code className="inline">DEFAULT_COUNTRY_CODE</code>, default 62).
          Request dibatasi per IP; jangan kirim massal lewat endpoint langsung — gunakan antrean di bawah.
        </p>
      </section>

      <Endpoint method="POST" path="/api/message/text" desc="Kirim pesan teks. Device harus online.">
        <Code>{`// request
{ "id": "08123456789", "message": "Halo kak" }

// response 201
{ "error": false, "data": {
    "id": "3fa1...", "chat_id": "9d02...", "wa_message_id": "3EB0...",
    "direction": "outgoing", "type": "text", "body": "Halo kak", "status": "sent" } }`}</Code>
      </Endpoint>

      <Endpoint method="POST" path="/api/message/image · video · audio · sticker · note" desc="Kirim media multipart (field 'file'). note = voice note (PTT). Field opsional: caption (kecuali note), ptt=true, filename.">
        <Code>{`curl -X POST "https://wa.contoh.com/api/message/image" \\
  -H "X-Api-Key: ${KEY}" \\
  -F "id=08123456789" \\
  -F "caption=Katalog bulan ini" \\
  -F "file=@/path/foto.jpg"

// response 201: sama dengan /text, type = "image"`}</Code>
      </Endpoint>

      <Endpoint method="POST" path="/api/message/doc" desc="Kirim dokumen (PDF, zip, dll.) lewat multipart field 'file'.">
        <Code>{`curl -X POST "https://wa.contoh.com/api/message/doc" \\
  -H "X-Api-Key: ${KEY}" \\
  -F "id=08123456789" \\
  -F "caption=Invoice Oktober" \\
  -F "file=@invoice.pdf"`}</Code>
      </Endpoint>

      <Endpoint method="POST" path="/api/message/mediaurl" desc="Kirim media dari URL: server mengunduh sendiri (maks MEDIA_URL_MAX_MB) lalu mengirimkannya. URL internal/privat ditolak 400.">
        <Code>{`// request
{ "id": "08123456789", "url": "https://cdn.contoh.id/foto.jpg",
  "type": "image", "mimetype": "image/jpeg", "caption": "Promo", "ptt": false }

// response 201: sama dengan /text`}</Code>
      </Endpoint>

      <Endpoint method="POST" path="/api/message/queue" desc="Kirim massal dengan aman (anti-ban): pesan masuk antrean, dikirim bertahap dengan jeda acak & kuota per device. Device boleh offline saat enqueue.">
        <Code>{`// request (semua field opsional kecuali id & message)
{ "id": "08123456789",
  "message": "Halo, tagihan bulan ini sudah terbit",
  "scheduled_at": "2026-10-28T09:00:00+07:00",
  "priority": 0,
  "ref": "invoice-1" }

// response 201 (200 bila ref duplikat)
{ "error": false, "duplicate": false, "data": {
    "id": "018f...", "device_id": "3fa1...", "to_jid": "628123456789@s.whatsapp.net",
    "type": "text", "status": "pending", "scheduled_at": "2026-10-27T02:00:00.000Z",
    "priority": 0, "attempts": 0, "max_attempts": 3, "client_ref": "invoice-1",
    "source": "api", "message_id": null, "sent_at": null, "last_error": null } }

// ref yang sama dikirim dua kali -> 200 duplicate: true dengan job yang lama.
// Hanya teks 1–4096 karakter; media lihat endpoint di bawah.`}</Code>
      </Endpoint>

      <Endpoint method="POST" path="/api/message/queue/batch" desc="Enqueue banyak pesan sekaligus (maks QUEUE_BATCH_MAX, default 100).">
        <Code>{`// request
{ "messages": [
    { "id": "08123456789", "message": "Halo A", "ref": "blast-1" },
    { "id": "628987654321", "message": "Halo B", "scheduled_at": "2026-10-28T08:00:00+07:00" } ] }

// response 201
{ "error": false, "data": { "queued": 2, "duplicates": 0, "jobs": [ ...job... ] } }`}</Code>
      </Endpoint>

      <Endpoint method="POST" path="/api/message/queue/media · queue/mediaurl" desc="Enqueue media multipart (queue/media) atau dari URL (queue/mediaurl). Field: id, file/url, type (image|video|audio|sticker|document), caption, ptt, scheduled_at, priority, ref.">
        <Code>{`curl -X POST "https://wa.contoh.com/api/message/queue/media" \\
  -H "X-Api-Key: ${KEY}" \\
  -F "id=08123456789" -F "type=image" -F "caption=Katalog" \\
  -F "file=@/path/foto.jpg"`}</Code>
      </Endpoint>

      <section className="card docs-card">
        <h2>Kuota &amp; jeda antrean</h2>
        <ul className="small">
          <li>Jeda acak antar pesan per device (default 8–25 detik) + simulasi mengetik opsional.</li>
          <li>Kuota rolling per jam (default 60) dan per 24 jam (default 200) — menghitung SEMUA pesan keluar device, termasuk balasan manual.</li>
          <li>Jam kirim opsional (<code className="inline">QUEUE_ACTIVE_HOURS</code>, mis. 8-21). Job di luar jam menunggu.</li>
          <li>Gagal kirim diulang dengan backoff hingga <code className="inline">max_attempts</code> (default 3), lalu status <b>failed</b>.</li>
          <li>Job bertahan di database — device boleh offline dan server boleh restart.</li>
        </ul>
        <p className="muted small">Detail lengkap: lihat berkas QUEUE.md di repositori.</p>
      </section>

      <section className="card docs-card">
        <h2>Webhook (keluar)</h2>
        <p className="small">
          Server juga bisa mengirim event ke aplikasi Anda: <code className="inline">messages</code> (pesan masuk),{" "}
          <code className="inline">message.update</code> (status terkirim/dibaca), dan <code className="inline">connection</code>{" "}
          (status device). Diatur per device dari halaman Devices → Edit. Bila secret diisi, setiap request membawa header{" "}
          <code className="inline">X-Signature: sha256=&lt;hex&gt;</code> (HMAC-SHA256 dari body mentah).
        </p>
        <Code>{`{
  "id": "uuid", "version": "1.0", "event": "messages",
  "device_id": "3fa1...", "device_name": "CS Utama",
  "timestamp": 1769500000000,
  "data": { "id": "3EB0...", "jid": "628111111111@s.whatsapp.net",
            "from_me": false, "push_name": "Budi", "type": "text",
            "body": "Halo", "media_url": null, "timestamp": 1769499999 } }`}</Code>
        <p className="muted small">Panduan integrasi &amp; verifikasi signature: berkas WebHook.md.</p>
      </section>

      <section className="card docs-card">
        <h2>Dashboard API (JWT)</h2>
        <p className="small">
          Endpoint untuk dashboard SPA / integrasi internal. Autentikasi memakai token JWT dari login, dikirim lewat
          header <code className="inline">Authorization: Bearer &lt;TOKEN&gt;</code>.
        </p>
        <Code>{`curl -X POST "https://wa.contoh.com/api/auth/login" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"admin@contoh.com","password":"rahasia"}'

// response 200
{ "error": false, "token": "<JWT>",
  "user": { "id": "...", "name": "Admin", "email": "admin@contoh.com", "role": "super_admin" } }`}</Code>
        <p className="small">
          <b>Role &amp; akses:</b> <code className="inline">super_admin</code> = akses penuh semua device;{" "}
          <code className="inline">admin</code> = hanya device yang dibuat/ditugaskan kepadanya;{" "}
          <code className="inline">agent</code> = hanya melihat/membuka device yang ditugaskan. Aksi lanjutan (tambah,
          edit, hapus, redial device; kelola rule; batalkan/ulangi job) mengikuti <b>matriks izin per role</b> yang
          diatur petingginya dari menu Pengguna — hierarki: <code className="inline">super_admin (1)</code> &gt;{" "}
          <code className="inline">admin (2)</code> &gt; <code className="inline">agent (3)</code>. Device di luar
          penugasan dibalas <b>404</b>. Semua wajib JWT kecuali <code className="inline">/api/auth/login</code> dan{" "}
          <code className="inline">/api/cron/redial</code>.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Endpoint</th>
              <th>Metode</th>
              <th>Akses</th>
              <th>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><code className="inline">/api/status</code></td><td>GET</td><td>Publik</td><td>Cek server hidup</td></tr>
            <tr><td><code className="inline">/api/auth/login</code></td><td>POST</td><td>Publik (rate limit)</td><td>Login, dapat JWT (maks 10 percobaan / 15 menit per IP)</td></tr>
            <tr><td><code className="inline">/api/devices</code></td><td>GET</td><td>JWT</td><td>Daftar device sesuai penugasan/role</td></tr>
            <tr><td><code className="inline">/api/devices</code></td><td>POST</td><td>JWT (admin)</td><td>Tambah device — admin yang dibatasi otomatis memiliki device barunya</td></tr>
            <tr><td><code className="inline">/api/devices/:id</code></td><td>PUT / PATCH</td><td>JWT (admin)</td><td>Ubah nama / webhook device</td></tr>
            <tr><td><code className="inline">/api/devices/:id/qr</code></td><td>GET</td><td>JWT (admin &amp; agent)</td><td>QR / pairing code untuk menautkan WhatsApp</td></tr>
            <tr><td><code className="inline">/api/devices/:id/status</code></td><td>GET</td><td>JWT</td><td>Status &amp; nomor device</td></tr>
            <tr><td><code className="inline">/api/devices/:id/redial</code></td><td>POST</td><td>JWT (admin)</td><td>Redial paksa satu device</td></tr>
            <tr><td><code className="inline">/api/devices/:id</code></td><td>DELETE</td><td>JWT (admin)</td><td>Logout + hapus device beserta chat, rule, job, media</td></tr>
            <tr><td><code className="inline">/api/devices/:deviceId/chats</code></td><td>GET</td><td>JWT</td><td>Daftar chat pada device</td></tr>
            <tr><td><code className="inline">/api/chats/:chatId/messages</code></td><td>GET / POST</td><td>JWT</td><td>Riwayat pesan / kirim pesan dari inbox</td></tr>
            <tr><td><code className="inline">/api/chats/:chatId/read</code></td><td>POST</td><td>JWT</td><td>Tandai chat dibaca</td></tr>
            <tr><td><code className="inline">/api/devices/:deviceId/rules</code></td><td>GET / POST</td><td>JWT (list semua; buat admin)</td><td>Rule auto-reply per device</td></tr>
            <tr><td><code className="inline">/api/rules/:id</code></td><td>PUT / DELETE</td><td>JWT (admin)</td><td>Ubah / hapus rule</td></tr>
            <tr><td><code className="inline">/api/devices/:deviceId/jobs</code></td><td>GET</td><td>JWT</td><td>Daftar job antrean keluar device (+ <b>/jobs/stats</b>)</td></tr>
            <tr><td><code className="inline">/api/jobs/:id</code></td><td>DELETE</td><td>JWT (admin)</td><td>Batalkan job antrean</td></tr>
            <tr><td><code className="inline">/api/jobs/:id/retry</code></td><td>POST</td><td>JWT (admin)</td><td>Jalankan ulang job gagal</td></tr>
            <tr><td><code className="inline">/api/users</code></td><td>GET / POST</td><td>JWT (admin)</td><td>Daftar / buat user + penugasan device (<code className="inline">device_ids</code>)</td></tr>
            <tr><td><code className="inline">/api/users/:id</code></td><td>PUT / PATCH / DELETE</td><td>JWT (admin)</td><td>Ubah profil/role/penugasan, hapus user. Hanya super_admin yang boleh mengatur role super_admin</td></tr>
            <tr><td><code className="inline">/api/roles/permissions</code></td><td>GET</td><td>JWT (admin)</td><td>Matriks izin per role: izin yang tersedia, level hierarki, dan role yang boleh diedit pemanggil</td></tr>
            <tr><td><code className="inline">/api/roles/permissions/mine</code></td><td>GET</td><td>JWT</td><td>Izin milik user sendiri (role + boolean tiap aksi)</td></tr>
            <tr><td><code className="inline">/api/roles/permissions/:role</code></td><td>PUT</td><td>JWT (per hierarki)</td><td>Set izin sebuah role, mis. <code className="inline">{`{"devices_edit": true}`}</code>. super_admin mengatur admin &amp; agent; admin hanya agent; izin super_admin terkunci (selalu penuh)</td></tr>
            <tr><td><code className="inline">/api/cron/redial</code></td><td>GET / POST</td><td>CRON_SECRET</td><td>Redial device yang tidak online via scheduler (<code className="inline">?token=</code>; opsional <code className="inline">?id=</code> atau <code className="inline">?key=</code> untuk satu device)</td></tr>
          </tbody>
        </table>
      </section>

      <section className="card docs-card">
        <h2>Integrasi cepat (Node.js)</h2>
        <Code>{`const BASE = "https://wa.contoh.com";
const KEY = process.env.WA_API_KEY;

async function kirim(text, tujuan) {
  const res = await fetch(BASE + "/api/message/queue", {
    method: "POST",
    headers: { "X-Api-Key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ id: tujuan, message: text }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.message);
  return json.data; // job antrean
}`}</Code>
      </section>
    </div>
  );
}
