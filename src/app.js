const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const config = require("./config/config");
const routes = require("./api/routes");
const mediaRoutes = require("./api/routes/media");
const { notFound, errorHandler } = require("./api/middlewares/error");

const app = express();

app.set("trust proxy", config.trustProxy);
app.set("x-powered-by", false);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "img-src": ["'self'", "data:", "blob:"], // QR code (data URL) & preview media lokal
        "media-src": ["'self'", "blob:"], // audio/video dari /media & pratinjau sebelum kirim
        "connect-src": ["'self'", "ws:", "wss:"], // socket.io
        "upgrade-insecure-requests": null, // dashboard sering diakses lewat http di jaringan internal
      },
    },
    crossOriginEmbedderPolicy: false,
    // HSTS hanya di production (aman bila di belakang Nginx dengan HTTPS)
    strictTransportSecurity: config.isProduction,
  }),
);
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Media WhatsApp (gambar/video/stiker/audio/dokumen) dengan URL bertanda tangan HMAC.
app.use("/media", mediaRoutes);

app.use("/api", routes);
app.use("/api", notFound);

// SEO teknis: robots.txt dan sitemap.xml mengikuti domain yang dipakai pengunjung,
// sehingga tidak perlu menyimpan domain fiktif di dalam source code.
const publicPaths = [
  "/",
  "/tentang-kami",
  "/kebijakan-privasi",
  "/syarat-ketentuan",
  "/kebijakan-refund",
  "/kebijakan-pembatalan",
  "/hubungi-kami",
  "/faq",
];

function publicBaseUrl(req) {
  const rawHost = String(req.get("host") || `localhost:${config.port}`);
  const host = /^[a-z0-9.-]+(?::\d{1,5})?$/i.test(rawHost) ? rawHost : `localhost:${config.port}`;
  const protocol = config.isProduction ? "https" : req.protocol;
  return `${protocol}://${host}`;
}

const escapeXml = (value) =>
  value.replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]);

app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(
    ["User-agent: *", "Allow: /", `Sitemap: ${publicBaseUrl(req)}/sitemap.xml`, ""].join("\n"),
  );
});

app.get("/sitemap.xml", (req, res) => {
  const base = publicBaseUrl(req);
  const entries = publicPaths
    .map((route) => `  <url><loc>${escapeXml(base + route)}</loc></url>`)
    .join("\n");
  res.type("application/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`,
  );
});

// Sajikan frontend hasil build (frontend/dist) bila ada, sehingga cukup satu proses/port
const dist = path.join(__dirname, "../frontend/dist");
if (fs.existsSync(path.join(dist, "index.html"))) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/|socket\.io\/).*/, (req, res) => res.sendFile(path.join(dist, "index.html")));
} else {
  app.get("/", (req, res) => res.json({ status: "wa-dashboard-backend running" }));
}

app.use(errorHandler);

module.exports = app;
