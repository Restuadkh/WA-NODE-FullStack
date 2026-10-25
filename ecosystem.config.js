// Konfigurasi PM2 untuk Windows/Linux.
//
// PENTING: aplikasi ini WAJIB berjalan sebagai SATU proses (fork, instances: 1).
// Instance WhatsApp, socket, dan worker antrean hidup di memori proses ini.
// Jangan memakai mode "cluster" atau menaikkan instances — sesi akan saling berebut
// (connectionReplaced) dan job antrean bisa dikirim ganda.
module.exports = {
  apps: [
    {
      name: "wa-dashboard",
      script: "src/server.js",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "700M",
      restart_delay: 3000,
      // Beri waktu shutdown untuk menyelesaikan job antrean & menutup socket WA.
      kill_timeout: 20000,
      time: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
