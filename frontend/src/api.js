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

async function request(path, { method = "GET", body } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
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
  createDevice: (name, phone_number) =>
    request("/api/devices", {
      method: "POST",
      body: { name, phone_number: phone_number || undefined },
    }).then(data),
  deleteDevice: (id) => request(`/api/devices/${id}`, { method: "DELETE" }),
  // -> { status, qr (data URL PNG | null), pairing_code | null }. Memulai instance bila belum jalan.
  deviceQr: (id) => request(`/api/devices/${id}/qr`).then(data),

  // --- chat
  listChats: (deviceId) => request(`/api/devices/${deviceId}/chats`).then(data),
  listMessages: (chatId, limit = 200) =>
    request(`/api/chats/${chatId}/messages?limit=${limit}`).then(data),
  sendMessage: (chatId, text) =>
    request(`/api/chats/${chatId}/messages`, { method: "POST", body: { text } }).then(data),
  markRead: (chatId) => request(`/api/chats/${chatId}/read`, { method: "POST" }).then(data),

  // --- auto-reply
  listRules: (deviceId) => request(`/api/devices/${deviceId}/rules`).then(data),
  createRule: (deviceId, rule) =>
    request(`/api/devices/${deviceId}/rules`, { method: "POST", body: rule }).then(data),
  updateRule: (id, patch) => request(`/api/rules/${id}`, { method: "PUT", body: patch }).then(data),
  deleteRule: (id) => request(`/api/rules/${id}`, { method: "DELETE" }),
};
