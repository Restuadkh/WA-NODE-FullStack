import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

const DEVICE_KEY = "wa_selected_device";
const MATCH = { contains: "Mengandung", exact: "Sama persis", starts_with: "Diawali" };
const EMPTY = { keyword: "", match_type: "contains", reply_text: "", priority: 0 };

export default function Rules() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(() => localStorage.getItem(DEVICE_KEY) || "");
  const [rules, setRules] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .listDevices()
      .then((list) => {
        setDevices(list);
        setDeviceId((cur) => (list.some((d) => d.id === cur) ? cur : list[0]?.id || ""));
      })
      .catch((e) => setError(e.message))
      .finally(() => setReady(true));
  }, []);

  const load = useCallback(async () => {
    if (!deviceId) return setRules([]);
    try {
      setRules(await api.listRules(deviceId));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [deviceId]);

  useEffect(() => {
    if (deviceId) localStorage.setItem(DEVICE_KEY, deviceId);
    load();
  }, [deviceId, load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.createRule(deviceId, { ...form, priority: Number(form.priority) || 0 });
      setForm(EMPTY);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (r) => {
    try {
      await api.updateRule(r.id, { is_active: !r.is_active });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`Hapus rule “${r.keyword}”?`)) return;
    try {
      await api.deleteRule(r.id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!ready) return <div className="page muted">Memuat…</div>;
  if (devices.length === 0) {
    return (
      <div className="page">
        <div className="card empty">
          Belum ada device. <Link to="/devices">Tambahkan device</Link> dulu.
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Auto-reply</h1>
          <p className="muted">
            Balasan otomatis untuk chat pribadi (grup diabaikan). Rule dengan prioritas tertinggi yang cocok akan dipakai; satu chat dibalas maksimal sekali per 5 detik.
          </p>
        </div>
        <select className="select select-inline" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} aria-label="Pilih device">
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </header>

      {isAdmin && (
        <form className="card rule-form" onSubmit={create}>
          <div className="form-row tight">
            <label className="field grow">
              <span>Kata kunci (gunakan * untuk semua pesan)</span>
              <input value={form.keyword} onChange={set("keyword")} placeholder="mis. harga" maxLength={255} required />
            </label>
            <label className="field">
              <span>Pencocokan</span>
              <select className="select" value={form.match_type} onChange={set("match_type")}>
                {Object.entries(MATCH).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="field narrow">
              <span>Prioritas</span>
              <input type="number" step="1" value={form.priority} onChange={set("priority")} />
            </label>
          </div>
          <label className="field">
            <span>Isi balasan</span>
            <textarea rows={3} value={form.reply_text} onChange={set("reply_text")} maxLength={4096} required />
          </label>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Menyimpan…" : "+ Tambah rule"}
          </button>
        </form>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card table-card">
        {rules.length === 0 ? (
          <div className="empty">Belum ada rule untuk device ini.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Kata kunci</th>
                <th>Balasan</th>
                <th>Prioritas</th>
                <th>Aktif</th>
                {isAdmin && <th />}
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className={r.is_active ? "" : "row-off"}>
                  <td>
                    <div className="strong mono">{r.keyword}</div>
                    <div className="muted small">{MATCH[r.match_type]}</div>
                  </td>
                  <td className="reply-cell">{r.reply_text}</td>
                  <td>{r.priority}</td>
                  <td>
                    <label className="switch" title={isAdmin ? "Aktif / nonaktif" : ""}>
                      <input type="checkbox" checked={r.is_active} disabled={!isAdmin} onChange={() => toggle(r)} />
                      <span />
                    </label>
                  </td>
                  {isAdmin && (
                    <td className="right">
                      <button className="btn btn-sm btn-danger" onClick={() => remove(r)}>
                        Hapus
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
