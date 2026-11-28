// Cache baca in-process (TTL sederhana berbasis Map) — mempercepat query panas
// yang sama berulang-ulang (ACL device, izin role/user, pemetaan nomor).
// Tidak butuh dependency tambahan seperti Redis; cocok untuk 1 proses Node.
//   wrap(key, ttlMs, fn)  -> ambil dari cache, atau jalankan fn() lalu simpan
//   invalidate(key)       -> hapus satu entri (dipakai setelah tulis yang terkait)
//   invalidatePrefix(pfx) -> hapus semua entri dengan awalan tertentu
//   stats()               -> jumlah entri (debug)

const store = new Map(); // key -> { value, expires }
const MAX_ENTRIES = 5000;

function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expires < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

function set(key, value, ttlMs) {
  if (store.size >= MAX_ENTRIES) {
    // Buang entri kedaluwarsa dulu; kalau masih penuh, kosongkan (cache, bukan data).
    const now = Date.now();
    for (const [k, e] of store) if (e.expires < now) store.delete(k);
    if (store.size >= MAX_ENTRIES) store.clear();
  }
  store.set(key, { value, expires: Date.now() + ttlMs });
}

// Undefined dianggap "tidak ada" — nilai ter-cache yang valid tidak boleh undefined.
async function wrap(key, ttlMs, fn) {
  const hit = get(key);
  if (hit !== undefined) return hit;
  const value = await fn();
  if (value !== undefined) set(key, value, ttlMs);
  return value;
}

function invalidate(key) {
  store.delete(key);
}

function invalidatePrefix(prefix) {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}

function invalidateMatching(predicate) {
  for (const k of store.keys()) if (predicate(k)) store.delete(k);
}

function stats() {
  return { entries: store.size };
}

module.exports = { get, set, wrap, invalidate, invalidatePrefix, invalidateMatching, stats };
