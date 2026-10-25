# Menjalankan 24/7 di Windows (PM2 / Service)

Panduan agar WhatsApp tetap terhubung dan penjadwalan ulang (reconnect) berjalan di Windows, termasuk saat terminal ditutup atau server reboot.

---

## 1. Kenapa reconnect “tidak jalan” tanpa PM2?

Logika reconnect **sudah berjalan di dalam aplikasi** (timer per instance, backoff, dan restore saat start). Yang sering terjadi adalah **proses Node-nya mati**, sehingga tidak ada yang bisa melakukan reconnect:

| Penyebab | Akibat |
|---|---|
| Terminal / Command Prompt ditutup | Proses Node ikut mati |
| Sesi RDP logout / user logoff | Proses ikut berhenti |
| Windows restart / update | Tidak ada yang menyalakan ulang aplikasi |
| Laptop sleep / hibernate | Koneksi & timer berhenti sementara |
| `Ctrl+C` atau menutup `npm run dev` | Proses berhenti |
| Menjalankan dua proses sekaligus | Sesi saling berebut → `connectionReplaced` (reconnect sengaja dihentikan) |

Jadi:

- **PM2 bukan memperbaiki bug reconnect.** PM2 membuat proses tetap hidup, restart otomatis saat crash, dan bisa dijalankan saat boot.
- Reconnect hanya bisa bekerja selama **proses aplikasi hidup**.
- Aplikasi ini **wajib satu proses** karena instance WhatsApp, socket, dan worker antrean hidup di memori.

> Jangan menjalankan `npm start` di terminal **dan** PM2/service secara bersamaan untuk nomor yang sama.

---

## 2. Checklist sebelum memasang service

Di `.env`:

```env
NODE_ENV=production
WHATSAPP_ENABLED=true
RESTORE_SESSIONS_ON_START_UP=true
# file (default) atau mysql
AUTH_STORE=file
WA_RECONNECT_BASE_MS=1000
WA_RECONNECT_MAX_MS=300000
WA_RECONNECT_MAX_ATTEMPTS=0
QUEUE_ENABLED=true
```

Pastikan:

1. `npm run build:frontend` (atau `npm --prefix frontend run build`) sudah dijalankan.
2. Database & folder `src/auth` (atau tabel Session) sudah siap.
3. Tidak ada proses lain yang memakai nomor/instance yang sama.
4. Windows **tidak sleep** saat server harus online (Settings → System → Power → Sleep = Never).

---

## 3. Opsi A — PM2 (paling cepat)

### 3.1 Install

```powershell
npm install -g pm2
```

### 3.2 Jalankan

Dari folder proyek:

```powershell
pm2 start ecosystem.config.js
pm2 status
pm2 logs wa-dashboard
```

`ecosystem.config.js` sudah diset:

- `exec_mode: "fork"`
- `instances: 1`
- `autorestart: true`
- `kill_timeout: 20s` (agar worker antrean & socket WA sempat ditutup)

**Jangan** memakai `pm2 start src/server.js -i max` atau mode cluster.

### 3.3 Simpan agar bisa dipulihkan

```powershell
pm2 save
```

### 3.4 Jalankan otomatis saat Windows boot

Di Windows, `pm2 startup` **tidak didukung** seperti di Linux. Pilih salah satu:

#### a) PM2 + Task Scheduler (tanpa install tambahan)

1. Buat file `pm2-resurrect.cmd` di folder proyek:

   ```bat
   @echo off
   cd /d D:\laragon\www\NODE-FULLSTACK
   pm2 resurrect
   ```

2. Buka **Task Scheduler** → **Create Task**:
   - **General**: Run whether user is logged on or not; Run with highest privileges.
   - **Triggers**: At startup (atau At log on).
   - **Actions**: Start a program → `D:\laragon\www\NODE-FULLSTACK\pm2-resurrect.cmd`.
   - **Settings**: Allow task to be run on demand; restart on failure bila tersedia.

Atau lewat PowerShell (sesuaikan path & user):

```powershell
schtasks /Create /TN "WA Dashboard PM2" /TR "D:\laragon\www\NODE-FULLSTACK\pm2-resurrect.cmd" /SC ONSTART /RU SYSTEM /RL HIGHEST /F
```

> Jika `pm2` tidak dikenali saat dijalankan sebagai SYSTEM, gunakan path lengkap `%APPDATA%\npm\pm2.cmd` atau jalankan task sebagai user yang meng-install PM2.

#### b) `pm2-windows-startup`

```powershell
npm install -g pm2-windows-startup
pm2-startup install
pm2 save
```

Setelah reboot, cek dengan `pm2 status`.

### 3.5 Perintah harian

```powershell
pm2 status
pm2 logs wa-dashboard --lines 100
pm2 restart wa-dashboard
pm2 stop wa-dashboard
pm2 delete wa-dashboard
```

Setelah mengubah `.env` atau kode:

```powershell
git pull
npm install
npm run build:frontend
pm2 restart wa-dashboard --update-env
```

---

## 4. Opsi B — Windows Service dengan NSSM (disarankan untuk produksi)

NSSM membuat aplikasi benar-benar berjalan sebagai service Windows (tanpa terminal, auto-start, auto-restart).

1. Unduh NSSM: https://nssm.cc/download → ekstrak, mis. ke `C:\nssm`.
2. Buka **Command Prompt sebagai Administrator**:

```bat
C:\nssm\win64\nssm.exe install WA-Dashboard "C:\Program Files\nodejs\node.exe" "D:\laragon\www\NODE-FULLSTACK\src\server.js"

C:\nssm\win64\nssm.exe set WA-Dashboard AppDirectory "D:\laragon\www\NODE-FULLSTACK"
C:\nssm\win64\nssm.exe set WA-Dashboard AppEnvironmentExtra NODE_ENV=production
C:\nssm\win64\nssm.exe set WA-Dashboard Start SERVICE_AUTO_START
C:\nssm\win64\nssm.exe set WA-Dashboard AppStdout "D:\laragon\www\NODE-FULLSTACK\logs\out.log"
C:\nssm\win64\nssm.exe set WA-Dashboard AppStderr "D:\laragon\www\NODE-FULLSTACK\logs\error.log"
C:\nssm\win64\nssm.exe set WA-Dashboard AppRotateFiles 1
C:\nssm\win64\nssm.exe set WA-Dashboard AppRotateBytes 10485760
C:\nssm\win64\nssm.exe set WA-Dashboard AppStopMethodConsole 20000

C:\nssm\win64\nssm.exe start WA-Dashboard
```

Buat folder `logs` terlebih dahulu:

```powershell
mkdir D:\laragon\www\NODE-FULLSTACK\logs
```

Perintah lain:

```bat
nssm restart WA-Dashboard
nssm stop WA-Dashboard
nssm edit WA-Dashboard
```

> Pastikan user service punya akses tulis ke folder proyek, `src/auth`, `src/media`, dan `logs`.
> Gunakan **satu** service saja untuk satu folder proyek.

---

## 5. Opsi C — Task Scheduler tanpa PM2/NSSM

Bisa, tetapi kurang nyaman:

1. **Task Scheduler** → **Create Task**.
2. **General**: Run whether user is logged on or not.
3. **Triggers**: At startup.
4. **Actions**: Start a program:
   - Program: `C:\Program Files\nodejs\node.exe`
   - Arguments: `src/server.js`
   - Start in: `D:\laragon\www\NODE-FULLSTACK`
5. **Settings**: centang “Restart the task if it fails”, restart every 1 minute.

Kekurangan: tidak ada manajemen proses/log semudah PM2, dan restart saat crash bergantung pada pengaturan task.

---

## 6. Setelah reboot, pastikan semuanya pulih

1. `pm2 status` (atau `Get-Service WA-Dashboard`) → status running.
2. Buka `http://localhost:3000/api/status` → `{ "status": "ok" }`.
3. Buka dashboard → Devices:
   - Status device kembali `connected` dalam beberapa detik hingga beberapa menit.
   - Jika `pending_qr`, buka QR dan tautkan ulang.
4. Cek log:
   ```powershell
   pm2 logs wa-dashboard --lines 200
   ```
   Cari pesan `Memulihkan N sesi WhatsApp` dan `Worker antrean pesan aktif`.

---

## 7. Catatan penting tentang multi-device

- Semua device berjalan di **satu proses**.
- Reconnect dijadwalkan **per instance** dengan timer terpisah, backoff, dan jitter.
- Restore saat startup di-stagger 150 ms agar satu sesi tidak menahan sesi lain.
- `connectionReplaced` **tidak** di-reconnect otomatis. Ini disengaja: artinya sesi yang sama dibuka di tempat lain. Logout/tautkan ulang secara sadar, dan pastikan tidak ada proses kedua.

---

## 8. FAQ

**Apakah PM2 efektif?**
Ya, untuk menjaga proses tetap hidup dan restart otomatis. Ia tidak menggantikan koneksi internet yang buruk, dan tidak memperbaiki sesi yang di-logout.

**Kenapa harus satu instance?**
Instance WhatsApp disimpan di memori proses (`Map`). Dua proses = dua socket untuk sesi yang sama → saling memutus (`connectionReplaced`) dan job antrean berisiko dobel.

**Kalau Windows sleep?**
Koneksi terputus dan timer berhenti. Set sleep = Never, atau gunakan mini PC/server yang selalu menyala. Setelah bangun, aplikasi akan mencoba reconnect; jika proses mati, PM2/service menyalakannya lagi.

**Apakah worker antrean ikut mati?**
Ya, worker berjalan di proses yang sama. Karena status job disimpan di database, job `pending` akan dilanjutkan setelah proses hidup lagi. Job yang sedang `sending` saat crash dikembalikan ke `pending` saat startup (lihat `QUEUE_*` di `QUEUE.md`).

**Boleh pakai Docker/WSL?**
Boleh, tetapi tetap satu container/proses. Jangan scale ke beberapa replika untuk sesi yang sama.
