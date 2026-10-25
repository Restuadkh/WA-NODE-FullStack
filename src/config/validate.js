// Validasi konfigurasi saat server start.
// errors   -> server TIDAK boleh jalan
// warnings -> server jalan, tetapi dicatat di log
function validateConfig(config) {
  const errors = [];
  const warnings = [];

  const secret = config.jwt.secret;
  if (!secret || secret.length < 16) {
    errors.push("JWT_SECRET belum diisi atau kurang dari 16 karakter. Buat dengan: openssl rand -hex 48");
  }

  if (config.gatewayApi.protect && !config.gatewayApi.token) {
    errors.push("PROTECT_ROUTES=true tetapi TOKEN kosong. Isi TOKEN atau set PROTECT_ROUTES=false.");
  }

  if (config.isProduction) {
    if (!config.gatewayApi.protect) {
      warnings.push(
        "PROTECT_ROUTES=false: API /api/message/* hanya dijaga instance_key. Disarankan PROTECT_ROUTES=true dan isi TOKEN.",
      );
    }
    if (config.gatewayApi.allowQueryKey) {
      warnings.push(
        "GATEWAY_ALLOW_QUERY_KEY=true: key lewat ?key= tercatat di log Nginx/proxy. Pindahkan aplikasi klien ke header X-Api-Key lalu set false.",
      );
    }
    if (config.corsOrigin === "*") {
      warnings.push("CORS_ORIGIN kosong: semua origin diizinkan. Isi dengan domain dashboard Anda.");
    }
    if (config.webhook.url && !config.webhook.secret) {
      warnings.push("WEBHOOK_URL diisi tanpa WEBHOOK_SECRET: webhook tidak ditandatangani.");
    }
    if (config.webhook.includeKey) {
      warnings.push("WEBHOOK_INCLUDE_KEY=true: instance_key (kredensial API) ikut terkirim ke penerima webhook.");
    }
  }

  return { errors, warnings };
}

module.exports = { validateConfig };
