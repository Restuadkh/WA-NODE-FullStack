import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

const DEVICE_KEY = "wa_selected_device";
const EMPTY = { name: "", phone: "" };

export default function Contacts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  // Import/hapus mengikuti izin contacts_import per role (super_admin selalu boleh).
  const canManage = Boolean(user?.permissions?.contacts_import);

  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(() => localStorage.getItem(DEVICE_KEY) || "");
  const [contacts, setContacts] = useState([]);
  const [q, setQ] = useState("");
  const [manual, setManual] = useState(EMPTY);
  const [jsonText, setJsonText] = useState("");
  const [bcText, setBcText] = useState("");
  const [bcResult, setBcResult] = useState(null);
  const [result, setResult] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

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
    if (!deviceId) return setContacts([]);
    try {
      setContacts(await api.listContacts(deviceId, q));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [deviceId, q]);

  useEffect(() => {
    if (deviceId) localStorage.setItem(DEVICE_KEY, deviceId);
    const t = setTimeout(load, q ? 300 : 0); // debounce pencarian
    return () => clearTimeout(t);
  }, [deviceId, q, load]);

  const setM = (k) => (e) => setManual((f) => ({ ...f, [k]: e.target.value }));

  // Import satu kontak lewat form manual.
  const addManual = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const r = await api.importContacts(deviceId, { contacts: [{ phone: manual.phone, name: manual.name }] });
      setResult(r);
      setManual(EMPTY);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Import banyak kontak lewat file CSV.
  const importCsv = async (e) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Pilih file .csv dulu");
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const r = await api.importContacts(deviceId, { file });
      setResult(r);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Import banyak kontak lewat JSON mentah.
  const importJson = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const contacts = JSON.parse(jsonText);
      const r = await api.importContacts(deviceId, { contacts });
      setResult(r);
      setJsonText("");
      await load();
    } catch (err) {
      setError(err instanceof SyntaxError ? "JSON tidak valid" : err.message);
    } finally {
      setBusy(false);
    }
  };

  // Broadcast ke kontak yang sedang tampil (ikut filter pencarian) lewat antrean anti-ban.
  const broadcast = async (e) => {
    e.preventDefault();
    const targets = contacts.filter((c) => c.phone);
    if (!targets.length) return setError("Tidak ada kontak yang bisa dituju");
    if (!window.confirm(`Kirim broadcast ke ${targets.length} kontak lewat antrean?`)) return;
    setBusy(true);
    setError("");
    setBcResult(null);
    try {
      const r = await api.broadcastContacts(deviceId, { text: bcText, contact_ids: targets.map((c) => c.id) });
      setBcResult(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Buka chat kontak di Inbox: pastikan Chat-nya ada di server, lalu navigasi ?chat=<id>.
  const openChat = async (c) => {
    setError("");
    try {
      const r = await api.openContact(deviceId, c.id);
      localStorage.setItem(DEVICE_KEY, deviceId); // Inbox memakai device yang sama
      navigate(`/?chat=${r.chat_id}`);
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`Hapus kontak ${c.name || c.phone} dari daftar kontak?`)) return;
    try {
      await api.deleteContact(deviceId, c.id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const downloadTemplate = () => {
    const csv = "phone,name,lid\n081234567890,Budi\n+62 812-3456-7891,Siti,2454645745634534\n6281234567892,Agus";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "template-kontak.csv";
    a.click();
    URL.revokeObjectURL(url);
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
          <h1>Kontak</h1>
          <p className="muted">
            Daftar nomor tersimpan per device. Kontak bisa diimport dari CSV/JSON dan langsung muncul di Inbox.
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

      {canManage && (
        <div className="card">
          <div className="form-row tight">
            <form onSubmit={addManual} className="form-row tight grow">
              <label className="field narrow">
                <span>Nomor</span>
                <input value={manual.phone} onChange={setM("phone")} placeholder="08123456789" required />
              </label>
              <label className="field grow">
                <span>Nama (opsional)</span>
                <input value={manual.name} onChange={setM("name")} placeholder="Nama kontak" maxLength={120} />
              </label>
              <button className="btn btn-primary" disabled={busy}>
                + Tambah
              </button>
            </form>
          </div>

          <div className="form-row tight">
            <form onSubmit={importCsv} className="form-row tight grow">
              <label className="field grow">
                <span>Import file CSV (Excel: simpan sebagai CSV UTF-8)</span>
                <input ref={fileRef} type="file" accept=".csv,text/csv" />
              </label>
              <button className="btn" disabled={busy} type="submit">
                Import CSV
              </button>
              <button className="btn btn-ghost" type="button" onClick={downloadTemplate}>
                Unduh template
              </button>
            </form>
          </div>

          <details>
            <summary className="muted small">Import lewat JSON</summary>
            <form onSubmit={importJson}>
              <label className="field">
                <span>Array kontak: [{"{"} &quot;phone&quot;: &quot;0812…&quot;, &quot;name&quot;: &quot;Budi&quot; {"}"}]</span>
                <textarea
                  rows={4}
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  placeholder={'[\n  { "phone": "08123456789", "name": "Budi" },\n  { "phone": "08123456790", "name": "Siti", "lid": "2454645745634534" }\n]'}
                />
              </label>
              <button className="btn" disabled={busy || !jsonText.trim()}>
                Import JSON
              </button>
            </form>
          </details>

          {bcResult && (
            <div className="alert alert-success small">
              Broadcast masuk antrean: {bcResult.queued} terjadwal{bcResult.failed > 0 ? ` · ${bcResult.failed} gagal: ${bcResult.errors.slice(0, 3).map((e) => `${e.phone} (${e.message})`).join(", ")}` : ""} — pengiriman mengikuti jeda anti-ban & kuota harian.
            </div>
          )}
          {result && (
            <div className="alert alert-success small">
              {result.total} baris diproses · {result.imported} baru · {result.updated} diperbarui
              {result.errors?.length > 0 && ` · ${result.errors.length} gagal: ${result.errors.slice(0, 3).map((e) => `${e.phone} (${e.message})`).join(", ")}`}
            </div>
          )}
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {canManage && (
        <form className="card" onSubmit={broadcast}>
          <label className="field">
            <span>Broadcast — pesan ke kontak yang tampil di bawah (tempelan: {"{{nama}}"} dan {"{{nomor}}"})</span>
            <textarea
              rows={3}
              value={bcText}
              onChange={(e) => setBcText(e.target.value)}
              maxLength={4096}
              placeholder={"Halo {{nama}}, ini info dari kami…"}
              required
            />
          </label>
          <button className="btn btn-primary" disabled={busy || !bcText.trim()}>
            Kirim broadcast ke {contacts.filter((c) => c.phone).length} kontak
          </button>
          <p className="muted small">
            Terkirim lewat antrean (jeda acak antar pesan, kuota harian, jam aktif) supaya aman dari ban.
            Gunakan kotak pencarian untuk membatasi target.
          </p>
        </form>
      )}

      <div className="card table-card">
        <div className="form-row tight">
          <label className="field grow">
            <span>Cari</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau nomor…" />
          </label>
        </div>
        {contacts.length === 0 ? (
          <div className="empty">Belum ada kontak untuk device ini.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Nomor</th>
                <th>LID</th>
                <th>Pesan terakhir</th>
                {canManage && <th />}
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td className="strong">{c.name || <span className="muted">—</span>}</td>
                  <td className="mono">{c.phone}</td>
                  <td className="mono muted small">{c.lid || "—"}</td>
                  <td className="muted small">{c.last_message_at ? new Date(c.last_message_at).toLocaleString() : "—"}</td>
                  {canManage && (
                    <td className="right">
                      <button className="btn btn-sm" onClick={() => openChat(c)} title="Buka chat & kirim pesan">
                        Pesan
                      </button>{" "}
                      <button className="btn btn-sm btn-danger" onClick={() => remove(c)}>
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
