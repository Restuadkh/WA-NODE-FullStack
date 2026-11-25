import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

const emptyForm = { id: null, name: "", email: "", password: "", role: "agent" };

// Manajemen akun dashboard: admin mengelola admin & agent.
export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setUsers(await api.listUsers());
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (form.id) {
        const patch = { name: form.name, role: form.role };
        if (form.password) patch.password = form.password;
        await api.updateUser(form.id, patch);
      } else {
        await api.createUser({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
        });
      }
      setForm(null);
      await load();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (u) => {
    if (!window.confirm(`Hapus akun “${u.name}” (${u.email})?`)) return;
    try {
      await api.deleteUser(u.id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Pengguna</h1>
          <p className="muted">Akun dashboard. Admin mengelola device & pengguna; agent membalas chat.</p>
        </div>
        {!form && (
          <button className="btn btn-primary" onClick={() => setForm({ ...emptyForm })}>
            + Tambah pengguna
          </button>
        )}
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {form && (
        <form className="card form-row" onSubmit={save}>
          <label className="field grow">
            <span>Nama</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoFocus
            />
          </label>
          <label className="field grow">
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={!!form.id}
              required
            />
          </label>
          <label className="field grow">
            <span>{form.id ? "Password baru (opsional)" : "Password"}</span>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              minLength={8}
              required={!form.id}
              autoComplete="new-password"
            />
          </label>
          <label className="field">
            <span>Role</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="agent">agent</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Menyimpan…" : "Simpan"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>
            Batal
          </button>
        </form>
      )}

      <div className="card table-card">
        {loading ? (
          <div className="empty">Memuat…</div>
        ) : users.length === 0 ? (
          <div className="empty">Belum ada pengguna.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Email</th>
                <th>Role</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="strong">{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <span className={`badge ${u.role === "admin" ? "badge-info" : "badge-pending"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="right actions">
                    <button
                      className="btn btn-sm"
                      onClick={() =>
                        setForm({
                          id: u.id,
                          name: u.name,
                          email: u.email,
                          password: "",
                          role: u.role,
                        })
                      }
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => remove(u)}
                      disabled={u.id === me?.id}
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
