# WA Dashboard

Gateway WhatsApp (Baileys) dengan dashboard web: kelola nomor, balas chat bersama tim secara realtime, auto-reply, dan API kirim pesan untuk aplikasi lain.

- **Backend**: Node.js ≥ 20, Express 5, Sequelize (MySQL/MariaDB), socket.io, Baileys
- **Frontend**: React + Vite di `frontend/` (hasil build disajikan oleh backend, satu proses satu port)

## Fitur
- Login JWT, role `admin` (kelola device & rule) dan `agent` (balas chat)
- Device: tautkan lewat QR atau kode pairing, status realtime, hapus (logout + bersihkan data)
- Inbox: chat pribadi & grup, teks + label media, centang terkirim/diterima/dibaca, badge belum dibaca bersama
- Auto-reply berbasis kata kunci (exact / contains / starts_with / `*`), per device
- API kirim pesan untuk aplikasi lain: teks, gambar, video, audio, dokumen, media dari URL
- Webhook keluar (opsional) untuk pesan masuk dan status koneksi

## Instalasi
```bash
cp .env.example .env            # isi JWT_SECRET (openssl rand -hex 48) dan kredensial MySQL
npm install
npm run seed:admin -- admin@contoh.com "password-kuat" "Nama Admin"   # tabel dibuat otomatis (DB_AUTO_SYNC=true)

cd frontend && npm install && npm run build && cd ..   # membuat frontend/dist

npm start                       # dashboard + API di http://localhost:3000
```
Pengembangan: `npm run dev` (backend) dan `cd frontend && npm run dev` (Vite di :5173, proxy ke backend).

Server menolak start bila `JWT_SECRET` kosong atau kurang dari 16 karakter.

## Produksi
PM2:
```bash
pm2 start src/server.js --name wa-dashboard && pm2 save
```
Nginx (WebSocket wajib diteruskan):
```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```
Set `TRUST_PROXY=1` dan `CORS_ORIGIN=https://domain-anda` di `.env`. Folder sesi WhatsApp (`AUTH_DIR`, default `src/auth/`) harus ikut di-backup.

## API kirim pesan untuk aplikasi lain
`key` adalah `instance_key` device (admin dapat melihatnya di halaman Devices). Jika `PROTECT_ROUTES=true`, tambahkan header `Authorization: Bearer <TOKEN>`.
```bash
curl -X POST "https://wa.contoh.com/api/message/text?key=<instance_key>" \
  -H "Content-Type: application/json" \
  -d '{"id":"08123456789","message":"Halo dari sistem"}'
```
Nomor berawalan `0` otomatis diganti `DEFAULT_COUNTRY_CODE`. Endpoint lain: `/image`, `/video`, `/audio`, `/doc` (multipart, field `file`) dan `/mediaurl` (`url`, `type`, `mimetype`, `caption`). Pesan yang dikirim lewat API ikut tampil di Inbox.

## Perubahan dari versi sebelumnya
Dihapus karena tidak dipakai dashboard: manajemen grup, endpoint `misc`, pesan tombol/list/kontak/reaksi, tampilan QR berbasis EJS, Redis + Bull (auto-reply kini diproses langsung), backend sesi MongoDB, `test.js` dan `testcopy.js`. Folder sesi lama di `AUTH_DIR` otomatis diadopsi menjadi device saat server start.

## Tes
```bash
npm i --no-save sqlite3 && npm test    # tes integrasi (SQLite in-memory, WhatsApp palsu)
```
