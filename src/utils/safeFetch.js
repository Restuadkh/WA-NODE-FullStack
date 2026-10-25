// Pengunduh media dari URL yang aman dari SSRF.
//
// Pertahanan berlapis:
//   1. Hanya http/https, tanpa user:password di URL.
//   2. Alamat IP DIPERIKSA SAAT KONEKSI (custom `lookup`), bukan hanya sebelum request,
//      sehingga DNS rebinding tidak bisa menyelundupkan IP internal.
//   3. IP literal (mis. http://127.0.0.1/, http://[::1]/) diperiksa sebelum request,
//      karena Node tidak memanggil `lookup` untuk IP literal.
//   4. Setiap redirect divalidasi ulang (maks 3).
//   5. Batas ukuran dan waktu total.
//   6. Opsional: allowlist host (MEDIA_URL_ALLOWED_HOSTS).
const dns = require("dns");
const http = require("http");
const https = require("https");
const net = require("net");
const path = require("path");
const config = require("../config/config");

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const MAX_REDIRECTS = 3;
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

// Alamat yang tidak boleh dijangkau dari server: loopback, privat, link-local (termasuk
// metadata cloud 169.254.169.254), multicast, dan rentang khusus lainnya.
const blockList = new net.BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]) {
  blockList.addSubnet(addr, prefix, "ipv4");
}
for (const [addr, prefix] of [
  ["::", 128],
  ["::1", 128],
  // IPv4-mapped (::ffff:127.0.0.1) TIDAK perlu aturan sendiri: BlockList Node memetakannya ke aturan IPv4.
  // (Menambah ::ffff:0:0/96 justru membuat SEMUA IPv4 terblokir.)
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 32], // Teredo
  ["2001:db8::", 32],
  ["2002::", 16], // 6to4
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
]) {
  blockList.addSubnet(addr, prefix, "ipv6");
}

function isBlockedAddress(ip) {
  const family = net.isIP(ip);
  if (!family) return true; // tidak dikenali = tolak
  return blockList.check(ip, family === 4 ? "ipv4" : "ipv6");
}

const blockedError = () => httpError("URL mengarah ke alamat internal dan tidak diizinkan", 400);

const bareHost = (hostname) => hostname.replace(/^\[|\]$/g, "").toLowerCase();

function parseUrl(raw) {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    throw httpError("URL tidak valid", 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw httpError("url harus diawali http:// atau https://", 400);
  }
  if (url.username || url.password) throw httpError("URL tidak boleh memuat user:password", 400);
  return url;
}

function assertAllowed(url, { isBlocked, allowedHosts }) {
  const host = bareHost(url.hostname);
  if (allowedHosts.length) {
    const ok = allowedHosts.some((h) => host === h.toLowerCase() || host.endsWith(`.${h.toLowerCase()}`));
    if (!ok) throw httpError("Host URL tidak ada di daftar yang diizinkan", 400);
  }
  if (net.isIP(host) && isBlocked(host)) throw blockedError();
}

// `lookup` untuk http(s).request: tolak bila SALAH SATU alamat hasil resolve diblokir.
function makeLookup(isBlocked) {
  return (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true, verbatim: true }, (err, addresses) => {
      if (err) return callback(err);
      if (addresses.some((a) => isBlocked(a.address))) return callback(blockedError());
      if (options && options.all) return callback(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

function requestOnce(url, { isBlocked, timeoutMs, maxBytes }) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    let settled = false;
    const done = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      fn(value);
    };

    const req = lib.request(
      url,
      {
        method: "GET",
        agent: false,
        lookup: makeLookup(isBlocked),
        timeout: timeoutMs, // idle socket
        headers: { "User-Agent": "wa-dashboard-media-fetch/2.1", Accept: "*/*" },
      },
      (res) => {
        const status = res.statusCode;

        if (REDIRECT_STATUS.has(status) && res.headers.location) {
          res.resume();
          return done(resolve, { redirect: res.headers.location });
        }
        if (status !== 200) {
          res.resume();
          return done(reject, httpError(`Gagal mengunduh media (HTTP ${status})`, 502));
        }

        const declared = Number(res.headers["content-length"]);
        if (declared > maxBytes) {
          req.destroy();
          return done(reject, httpError("Ukuran media melebihi batas", 413));
        }

        const chunks = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy();
            return done(reject, httpError("Ukuran media melebihi batas", 413));
          }
          chunks.push(chunk);
        });
        res.on("end", () => done(resolve, { buffer: Buffer.concat(chunks), headers: res.headers }));
        res.on("error", (err) => done(reject, httpError(`Gagal mengunduh media: ${err.code || err.message}`, 502)));
      },
    );

    // Batas waktu total (bukan hanya idle)
    const deadline = setTimeout(() => {
      req.destroy();
      done(reject, httpError("Waktu unduh media habis", 504));
    }, timeoutMs);

    req.on("timeout", () => {
      req.destroy();
      done(reject, httpError("Waktu unduh media habis", 504));
    });
    req.on("error", (err) =>
      done(reject, err.statusCode ? err : httpError(`Gagal mengunduh media: ${err.code || err.message}`, 502)),
    );
    req.end();
  });
}

function filenameFrom(url) {
  try {
    const name = decodeURIComponent(path.posix.basename(url.pathname));
    return name && name !== "/" ? name : null;
  } catch {
    return null;
  }
}

/**
 * Buat fungsi pengunduh. `overrides` dipakai test (mis. isBlocked palsu agar bisa
 * mengunduh dari server lokal). Opsi lain dibaca dari config setiap kali dipanggil.
 */
function createMediaFetcher(overrides = {}) {
  return async function fetchRemoteMedia(rawUrl) {
    const opts = {
      isBlocked: isBlockedAddress,
      maxBytes: config.media.maxBytes,
      timeoutMs: config.media.timeoutMs,
      allowedHosts: config.media.allowedHosts,
      ...overrides,
    };

    let url = parseUrl(rawUrl);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      assertAllowed(url, opts);
      const out = await requestOnce(url, opts);
      if (out.redirect) {
        url = parseUrl(new URL(out.redirect, url).toString());
        continue;
      }
      return {
        buffer: out.buffer,
        mimetype: String(out.headers["content-type"] || "").split(";")[0].trim() || null,
        filename: filenameFrom(url),
      };
    }
    throw httpError("Terlalu banyak redirect", 502);
  };
}

module.exports = {
  fetchRemoteMedia: createMediaFetcher(),
  createMediaFetcher,
  isBlockedAddress,
};
