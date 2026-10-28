// Klien API tipis di atas fetch. Semua endpoint backend membalas { error, data }.

export const API_BASE = import.meta.env.VITE_API_URL || "";
const TOKEN_KEY = "wa_token";
const USER_KEY = "wa_user";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
};
export const saveSession = (token, user) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};
export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

async function request(path, { method = "GET", body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (form) {
    // FormData: browser menetapkan Content-Type multipart beserta boundary sendiri.
    payload = form;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: payload,
    });
  } catch {
    throw new Error("Tidak bisa terhubung ke server. Pastikan backend berjalan.");
  }

  const json = await res.json().catch(() => ({}));
  // 401 pada request ber-token = token kedaluwarsa. 401 saat login (tanpa token) = password salah.
  if (res.status === 401 && token) onUnauthorized();
  if (!res.ok || json.error) {
    throw new Error(json.message || `Permintaan gagal (${res.status})`);
  }
  return json;
}

const data = (r) => r.data;

export const api = {
  login: (email, password) =>
    request("/api/auth/login", { method: "POST", body: { email, password } }),

  // --- device
  listDevices: () => request("/api/devices").then(data),
  createDevice: (name, phone_number, extra = {}) =>
    request("/api/devices", {
      method: "POST",
      body: { name, phone_number: phone_number || undefined, ...extra },
    }).then(data),
  // patch: { name?, webhook_url?, webhook_secret? } — "" mengosongkan webhook/secret.
  updateDevice: (id, patch) =>
    request(`/api/devices/${id}`, { method: "PUT", body: patch }).then(data),
  deleteDevice: (id) => request(`/api/devices/${id}`, { method: "DELETE" }),
  // -> { status, qr (data URL PNG | null), pairing_code | null,
  //      attempts: { attempts_used, attempts_max } | null, cooldown_ms | null }.
  // Device offline/disconnected dicoba ulang otomatis maksimal 3x (DEVICE_QR_START_ATTEMPTS).
  deviceQr: (id) => request(`/api/devices/${id}/qr`).then(data),

  // --- chat
  listChats: (deviceId) => request(`/api/devices/${deviceId}/chats`).then(data),
  listMessages: (chatId, limit = 200) =>
    request(`/api/chats/${chatId}/messages?limit=${limit}`).then(data),
  sendMessage: (chatId, text) =>
    request(`/api/chats/${chatId}/messages`, { method: "POST", body: { text } }).then(data),
  // Kirim media: file (File/Blob), caption, type (image|video|audio|sticker|document), ptt (voice note)
  sendMedia: (chatId, file, { caption = "", type, ptt = false, filename } = {}) => {
    const form = new FormData();
    form.append("file", file, filename || file.name || "file");
    if (caption) form.append("caption", caption);
    if (type) form.append("type", type);
    if (ptt) form.append("ptt", "true");
    return request(`/api/chats/${chatId}/messages`, { method: "POST", form }).then(data);
  },
  markRead: (chatId) => request(`/api/chats/${chatId}/read`, { method: "POST" }).then(data),

  // --- auto-reply
  listRules: (deviceId) => request(`/api/devices/${deviceId}/rules`).then(data),
  createRule: (deviceId, rule) =>
    request(`/api/devices/${deviceId}/rules`, { method: "POST", body: rule }).then(data),
  updateRule: (id, patch) => request(`/api/rules/${id}`, { method: "PUT", body: patch }).then(data),
  deleteRule: (id) => request(`/api/rules/${id}`, { method: "DELETE" }),

  // --- antrean pesan
  listJobs: (deviceId, { status = "", limit = 100, offset = 0 } = {}) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    return request(`/api/devices/${deviceId}/jobs?${params}`);
  },
  jobStats: (deviceId) => request(`/api/devices/${deviceId}/jobs/stats`).then(data),
  cancelJob: (id) => request(`/api/jobs/${id}`, { method: "DELETE" }).then(data),
  retryJob: (id) => request(`/api/jobs/${id}/retry`, { method: "POST" }).then(data),

  // --- manajemen user (admin)
  listUsers: () => request("/api/users").then(data),
  createUser: (payload) => request("/api/users", { method: "POST", body: payload }).then(data),
  updateUser: (id, patch) => request(`/api/users/${id}`, { method: "PUT", body: patch }).then(data),
  deleteUser: (id) => request(`/api/users/${id}`, { method: "DELETE" }),
};
