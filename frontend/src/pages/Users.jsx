import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

// Halaman Users (khusus admin): kelola akun dashboard & penugasan device (ACL).
// deviceMode: "all" = semua device (hanya admin), "none" = tidak ada device, "select" = pilih tertentu
const emptyForm = { name: "", email: "", password: "", role: "agent", device_ids: [], deviceMode: "none" };

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | user object
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [list, deviceList] = await Promise.all([api.listUsers(), api.listDevices()]);
      setUsers(list);
      setDevices(deviceList);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setForm(emptyForm);
    setEditing("new");
  };
  const openEdit = (user) => {
    // Tentukan deviceMode berdasarkan device_ids dan role
    let deviceMode = "select";
    if (user.role === "admin" && (!user.device_ids || user.device_ids.length === 0)) {
      deviceMode = "all"; // admin tanpa device = akses penuh
    } else if ((!user.device_ids || user.device_ids.length === 0) && user.role === "agent") {
      deviceMode = "none"; // agent tanpa device = tidak ada akses
    } else {
      deviceMode = "select";
    }
    setForm({ name: user.name, email: user.email, password: "", role: user.role, device_ids: user.device_ids || [], deviceMode });
    setEditing(user);
  };

  const toggleDevice = (id) => {
    setForm((f) => ({
      ...f,
      device_ids: f.device_ids.includes(id) ? f.device_ids.filter((d) => d !== id) : [...f.device_ids, id],
    }));
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = {
        name: form.name,
        role: form.role,
        device_ids: form.device_ids,
      };
      if (editing === "new") {
        payload.email = form.email;
        payload.password = form.password;
        await api.createUser(payload);
        setNotice("User dibuat");
      } else {
        if (form.password) payload.password = form.password;
        await api.updateUser(editing.id, payload);
        setNotice("User diperbarui");
      }
      setEditing(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (user) => {
    if (!window.confirm(`Hapus user ${user.email}?`)) return;
    try {
      await api.deleteUser(user.id);
      setNotice("User dihapus");
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const deviceName = (id) => devices.find((d) => d.id === id)?.name || id.slice(0, 8);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Pengguna</h1>
          <p className="muted">
            Kelola akun dashboard. <b>Agent</b> hanya bisa melihat chat dan antrian device yang ditugaskan kepadanya.
            <b>Admin</b> bisa memilih: <b>Semua device</b> (akses penuh), <b>Tidak ada device</b>, atau <b>Pilih device tertentu</b>.
            Device bisa dibagikan ke beberapa user (admin/agent).
          </p>
        </div>
        <button className="btn" onClick={openNew}>
          Tambah user
        </button>
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert">{notice}</div>}

      <div className="card table-card">
        {loading ? (
          <div className="empty">Memuat…</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Email</th>
                <th>Role</th>
                <th>Device</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.name}
                    {u.id === me?.id && <span className="muted small"> (Anda)</span>}
                  </td>
                  <td className="mono">{u.email}</td>
                  <td>
                    <span className={`badge badge-${u.role === "admin" ? "sent" : "pending"}`}>{u.role}</span>
                  </td>
                  <td className="muted small">
                    {u.role === "admin" && (!u.device_ids || u.device_ids.length === 0)
                      ? <span className="badge badge-sent">Semua device</span>
                      : u.device_ids && u.device_ids.length > 0
                        ? u.device_ids.map(deviceName).join(", ")
                        : <span className="badge badge-pending">Tidak ada device</span>}
                  </td>
                  <td className="right actions">
                    <button className="btn btn-sm" onClick={() => openEdit(u)}>
                      Edit
                    </button>
                    {u.id !== me?.id && (
                      <button className="btn btn-sm btn-danger" onClick={() => remove(u)}>
                        Hapus
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <div className="modal-backdrop" onClick={() => !busy && setEditing(null)}>
          <form className="modal card" onSubmit={save} onClick={(e) => e.stopPropagation()}>
            <h2>{editing === "new" ? "Tambah user" : `Edit ${editing.name}`}</h2>
            <label className="field">
              <span>Nama</span>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            {editing === "new" && (
              <>
                <label className="field">
                  <span>Email</span>
                  <input
                    className="input"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                  />
                </label>
                <label className="field">
                  <span>Password (min. 8 karakter)</span>
                  <input
                    className="input"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                    minLength={8}
                  />
                </label>
              </>
            )}
            {editing !== "new" && (
              <label className="field">
                <span>Password baru (kosongkan bila tidak diubah)</span>
                <input
                  className="input"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  minLength={8}
                />
              </label>
            )}
            <label className="field">
              <span>Role</span>
              <select className="select" value={form.role} onChange={(e) => {
                const newRole = e.target.value;
                setForm(prev => {
                  // Reset deviceMode saat ganti role
                  let newDeviceMode = prev.deviceMode;
                  if (newRole === "admin" && prev.deviceMode === "none") {
                    newDeviceMode = "all"; // admin default ke "all"
                  } else if (newRole === "agent" && prev.deviceMode === "all") {
                    newDeviceMode = "none"; // agent tidak bisa "all", default ke "none"
                  }
                  return { ...prev, role: newRole, deviceMode: newDeviceMode, device_ids: newDeviceMode === "select" ? prev.device_ids : [] };
                });
              }}>
                <option value="agent">agent</option>
                <option value="admin">admin</option>
              </select>
            </label>

            <div className="field">
              <span>Akses Device</span>
              <div className="check-list" style={{ flexDirection: 'column', gap: '8px' }}>
                <label className="check-item radio-item">
                  <input
                    type="radio"
                    name="deviceMode"
                    checked={form.deviceMode === "all"}
                    onChange={() => {
                      if (form.role === "admin") {
                        setForm({ ...form, deviceMode: "all", device_ids: [] });
                      }
                    }}
                    disabled={form.role !== "admin"}
                  />
                  <span>
                    <strong>Semua device</strong> (akses penuh ke semua device, termasuk device baru di masa depan)
                    {form.role !== "admin" && <span className="muted small"> — hanya untuk admin</span>}
                  </span>
                </label>
                <label className="check-item radio-item">
                  <input
                    type="radio"
                    name="deviceMode"
                    checked={form.deviceMode === "none"}
                    onChange={() => setForm({ ...form, deviceMode: "none", device_ids: [] })}
                  />
                  <span>
                    <strong>Tidak ada device</strong> (tidak bisa melihat/mengelola device manapun)
                  </span>
                </label>
                <label className="check-item radio-item">
                  <input
                    type="radio"
                    name="deviceMode"
                    checked={form.deviceMode === "select"}
                    onChange={() => setForm({ ...form, deviceMode: "select" })}
                  />
                  <span><strong>Pilih device tertentu</strong> (hanya device yang dicentang di bawah)</span>
                </label>
              </div>
            </div>

            {form.deviceMode === "select" && (
              <div className="field">
                <span>Device yang dipilih ({form.device_ids.length})</span>
                <div className="check-list">
                  {devices.length === 0 && <span className="muted small">Belum ada device</span>}
                  {devices.map((d) => (
                    <label key={d.id} className="check-item">
                      <input type="checkbox" checked={form.device_ids.includes(d.id)} onChange={() => toggleDevice(d.id)} />
                      <span>{d.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="right actions">
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setEditing(null)}>
                Batal
              </button>
              <button className="btn" disabled={busy}>
                {busy ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
