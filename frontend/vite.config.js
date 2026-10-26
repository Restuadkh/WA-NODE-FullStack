import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Saat development, request /api dan /socket.io diteruskan ke backend
// sehingga tidak perlu mengatur CORS. Ubah BACKEND_URL di .env jika port berbeda.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backend = env.BACKEND_URL || "http://localhost:3000";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": { target: backend, changeOrigin: true },
        "/socket.io": { target: backend, ws: true, changeOrigin: true },
      },
    },
  };
});
