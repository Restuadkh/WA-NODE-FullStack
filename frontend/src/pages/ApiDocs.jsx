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
  const isAdmin = user?.role === "admin";
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
{ "error": false, "data": { ...pesan... } }

// gagal
{ "error": true, "message": "no key supplied (header X-Api-Key)" }`}</Code>
        <h3>Kode status</h3>
        <table className="table">
          <tbody>
            <tr><td>201</td><td>Pesan berhasil dibuat / dikirim</td></tr>
            <tr><td>400</td><td>Parameter salah (nomor tidak valid, message kosong, dst.)</td></tr>
            <tr><td>403</td><td>API key / Bearer token salah</td></tr>
            <tr><td>409</td><td>Device WhatsApp sedang tidak online (endpoint kirim langsung)</td></tr>
            <tr><td>422</td><td>Nomor tujuan tidak terdaftar di WhatsApp</td></tr>
            <tr><td>429</td><td>Lewat batas <code className="inline">GATEWAY_RATE_LIMIT_PER_MINUTE</code></td></tr>
          </tbody>
        </table>
        <p className="muted small">
          Nomor berawalan 0 otomatis pakai kode negara (<code className="inline">DEFAULT_COUNTRY_CODE</code>, default 62).
          Request dibatasi per IP lewat <code className="inline">GATEWAY_RATE_LIMIT_PER_MINUTE</code>.
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
  "user": { "id": "...", "name": "Admin", "email": "admin@contoh.com", "role": "admin" } }`}</Code>
        <p className="small">
          <b>Role &amp; akses:</b> <code className="inline">admin</code> mengelola device &amp; pengguna;{" "}
          <code className="inline">agent</code> membalas chat. Semua user boleh melihat semua device. Semua wajib
          JWT kecuali <code className="inline">/api/auth/login</code>.
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
            <tr><td><code className="inline">/api/devices</code></td><td>GET</td><td>JWT</td><td>Daftar device</td></tr>
            <tr><td><code className="inline">/api/devices</code></td><td>POST</td><td>JWT (admin)</td><td>Tambah device</td></tr>
            <tr><td><code className="inline">/api/devices/:id</code></td><td>PUT / PATCH</td><td>JWT (admin)</td><td>Ubah nama / webhook device</td></tr>
            <tr><td><code className="inline">/api/devices/:id/qr</code></td><td>GET</td><td>JWT (admin &amp; agent)</td><td>QR untuk menautkan WhatsApp</td></tr>
            <tr><td><code className="inline">/api/devices/:id/status</code></td><td>GET</td><td>JWT</td><td>Status &amp; nomor device</td></tr>
            <tr><td><code className="inline">/api/devices/:id/redial</code></td><td>POST</td><td>JWT (admin)</td><td>Redial paksa satu device</td></tr>
            <tr><td><code className="inline">/api/devices/:id</code></td><td>DELETE</td><td>JWT (admin)</td><td>Logout + hapus device beserta chat &amp; media</td></tr>
            <tr><td><code className="inline">/api/devices/:deviceId/chats</code></td><td>GET</td><td>JWT</td><td>Daftar chat pada device</td></tr>
            <tr><td><code className="inline">/api/chats/:chatId/messages</code></td><td>GET / POST</td><td>JWT</td><td>Riwayat pesan / kirim pesan dari inbox</td></tr>
            <tr><td><code className="inline">/api/chats/:chatId/read</code></td><td>POST</td><td>JWT</td><td>Tandai chat dibaca</td></tr>
            <tr><td><code className="inline">/api/users</code></td><td>GET / POST</td><td>JWT (admin)</td><td>Daftar / buat user</td></tr>
            <tr><td><code className="inline">/api/users/:id</code></td><td>PUT / PATCH / DELETE</td><td>JWT (admin)</td><td>Ubah profil/role/password, hapus user</td></tr>
          </tbody>
        </table>
      </section>

      <section className="card docs-card">
        <h2>Integrasi cepat (Node.js)</h2>
        <Code>{`const BASE = "https://wa.contoh.com";
const KEY = process.env.WA_API_KEY;

async function kirim(text, tujuan) {
  const res = await fetch(BASE + "/api/message/text", {
    method: "POST",
    headers: { "X-Api-Key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ id: tujuan, message: text }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.message);
  return json.data; // pesan tersimpan
}`}</Code>
      </section>
    </div>
  );
}
