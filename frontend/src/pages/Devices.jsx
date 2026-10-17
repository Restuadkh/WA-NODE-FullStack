import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { getSocket } from "../socket";
import StatusBadge from "../components/StatusBadge";
import QrModal from "../components/QrModal";

const fmt = (d) => (d ? new Date(d).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-");

export default function Devices() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [qrDevice, setQrDevice] = useState(null);

  const load = useCallback(async () => {
    try {
      setDevices(await api.listDevices());
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const socket = getSocket();
    const onStatus = ({ device_id, status }) =>
      setDevices((list) => list.map((d) => (d.id === device_id ? { ...d, status } : d)));
    socket.on("device:status", onStatus);
    const poll = setInterval(load, 15000); // cadangan bila socket tidak tersambung
    return () => {
      socket.off("device:status", onStatus);
      clearInterval(poll);
    };
  }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const device = await api.createDevice(name.trim(), phone.trim());
      setName("");
      setPhone("");
      setShowForm(false);
      await load();
      setQrDevice(device); // langsung tampilkan QR / kode pairing
    } catch (e2) {
      setError(e2.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (d) => {
    const ok = window.confirm(
      `Hapus device “${d.name}”?\n\nWhatsApp akan di-logout dan semua chat, pesan, serta rule auto-reply device ini ikut terhapus. Tindakan ini tidak bisa dibatalkan.`,
    );
    if (!ok) return;
    try {
      await api.deleteDevice(d.id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Devices</h1>
          <p className="muted">Nomor WhatsApp yang tertaut ke gateway.</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Batal" : "+ Tambah device"}
          </button>
        )}
      </header>

      {showForm && (
        <form className="card form-row" onSubmit={create}>
          <label className="field grow">
            <span>Nama device</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. CS Fokus.Net" maxLength={100} required autoFocus />
          </label>
          <label className="field grow">
            <span>Nomor (opsional, untuk kode pairing tanpa QR)</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="628123456789" inputMode="numeric" />
          </label>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Membuat…" : "Buat & tautkan"}
          </button>
        </form>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card table-card">
        {loading ? (
          <div className="empty">Memuat…</div>
        ) : devices.length === 0 ? (
          <div className="empty">
            {isAdmin ? "Belum ada device. Klik “Tambah device” untuk mulai." : "Belum ada device. Minta admin untuk menambahkan."}
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Nomor</th>
                <th>Status</th>
                <th>Terakhir terhubung</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div className="strong">{d.name}</div>
                    {d.instance_key && <div className="muted small mono">key: {d.instance_key}</div>}
                  </td>
                  <td className="mono">{d.phone_number || "-"}</td>
                  <td>
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="muted">{fmt(d.last_connected_at)}</td>
                  <td className="right actions">
                    {d.status !== "connected" && (
                      <button className="btn btn-sm" onClick={() => setQrDevice(d)}>
                        Tautkan
                      </button>
                    )}
                    {isAdmin && (
                      <button className="btn btn-sm btn-danger" onClick={() => remove(d)}>
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

      {isAdmin && devices.length > 0 && (
        <p className="muted small">
          <code>key</code> dipakai aplikasi lain untuk mengirim pesan lewat <code>POST /api/message/text?key=…</code>.
          Hanya admin yang dapat melihatnya.
        </p>
      )}

      {qrDevice && (
        <QrModal
          device={qrDevice}
          onClose={() => {
            setQrDevice(null);
            load();
          }}
          onConnected={load}
        />
      )}
    </div>
  );
}
