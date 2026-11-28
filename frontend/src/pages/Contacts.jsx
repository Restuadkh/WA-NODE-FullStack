import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

const DEVICE_KEY = "wa_selected_device";
const fmt = (d) => (d ? new Date(d).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-");

function SendModal({ deviceId, contact, onClose }) {
  const [mode, setMode] = useState("text"); // text | image | video | audio | document
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const accept = useMemo(() => {
    if (mode === "image") return "image/*";
    if (mode === "video") return "video/*";
    if (mode === "audio") return "audio/*";
    if (mode === "document") return ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,*/*";
    return undefined;
  }, [mode]);

  const submit = async (e) => {
    e.preventDefault();
    if (sending) return;
    setError("");
    setOk("");
    try {
      setSending(true);
      const chat = await api.openContactChat(deviceId, contact.id);
      const chatId = chat?.chat_id;
      if (!chatId) throw new Error("Chat tidak ditemukan");
      if (mode === "text") {
        const body = text.trim();
        if (!body) throw new Error("Isi pesan wajib diisi");
        await api.sendMessage(chatId, body);
      } else {
        if (!file) throw new Error("Pilih file dulu");
        await api.sendMedia(chatId, file, { caption: text.trim(), type: mode });
      }
      setOk("Pesan berhasil dikirim.");
      setText("");
      setFile(null);
    } catch (err) {
      setError(err.message || "Gagal mengirim pesan");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal wide" role="dialog" aria-modal="true" aria-label="Kirim pesan" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <h2>Kirim Pesan</h2>
            <p className="muted small">
              {contact.notify || "Kontak"} {contact.phone ? `· ${contact.phone}` : ""} {contact.lid ? `· ${contact.lid}` : ""}
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Tutup</button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {ok && <div className="alert" style={{ background: "var(--ok-bg,#ecfdf3)", color: "var(--ok-text,#166534)" }}>{ok}</div>}

        <label className="field">
          <span>Tipe pesan</span>
          <select className="select" value={mode} onChange={(e) => { setMode(e.target.value); setFile(null); }}>
            <option value="text">Text</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="audio">Audio</option>
            <option value="document">Document</option>
          </select>
        </label>

        {mode !== "text" && (
          <label className="field">
            <span>File {mode}</span>
            <input className="input" type="file" accept={accept} onChange={(e) => setFile(e.target.files?.[0] || null)} />
            {file && <span className="muted small">{file.name}</span>}
          </label>
        )}

        <label className="field">
          <span>{mode === "text" ? "Pesan" : "Caption (opsional)"}</span>
          <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === "text" ? "Tulis pesan..." : "Tulis caption..."} />
        </label>

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Batal</button>
          <button className="btn btn-primary" disabled={sending}>{sending ? "Mengirim..." : "Kirim"}</button>
        </div>
      </form>
    </div>
  );
}

export default function Contacts() {
  const nav = useNavigate();
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(() => localStorage.getItem(DEVICE_KEY) || "");
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sendContact, setSendContact] = useState(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    api.listDevices().then((list) => {
      setDevices(list || []);
      setDeviceId((cur) => (list.some((d) => d.id === cur) ? cur : list[0]?.id || ""));
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (deviceId) localStorage.setItem(DEVICE_KEY, deviceId); }, [deviceId]);

  const load = useCallback(async () => {
    if (!deviceId) { setRows([]); return; }
    setLoading(true);
    try {
      const data = await api.listContacts(deviceId, q.trim());
      setRows(Array.isArray(data) ? data : []);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [deviceId, q]);

  useEffect(() => { load(); }, [load]);

  const openChat = async (c) => {
    try {
      const res = await api.openContactChat(deviceId, c.id);
      if (res?.chat_id) nav(`/dashboard?chat=${encodeURIComponent(res.chat_id)}`);
    } catch (e) {
      setError(e.message);
    }
  };

  const device = devices.find((d) => d.id === deviceId);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Kontak</h1>
          <p className="muted">Kontak tersinkron dari WhatsApp/device. Klik Chat untuk buka inbox, atau Kirim untuk kirim cepat.</p>
        </div>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card form-row" style={{ marginBottom: 16 }}>
        <label className="field grow">
          <span>Device</span>
          <select className="select" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            {devices.map((d) => <option key={d.id} value={d.id}>{d.name}{d.phone_number ? ` · ${d.phone_number}` : ""}</option>)}
          </select>
        </label>
        <label className="field grow">
          <span>Cari</span>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nama, nomor, atau LID" />
        </label>
        <label className="btn" style={{ marginBottom: 0, cursor: importing ? "wait" : "pointer" }}>
          {importing ? "Import..." : "Import VCF"}
          <input
            type="file"
            accept=".vcf,text/vcard,text/x-vcard"
            hidden
            disabled={importing || !deviceId}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file || !deviceId) return;
              setImporting(true);
              setError("");
              try {
                const r = await api.importContactsVcf(deviceId, file);
                await load();
                alert(`Import VCF selesai. Total: ${r.total}, dibuat: ${r.created}, diproses: ${r.processed}, dilewati: ${r.skipped}.`);
              } catch (err) {
                setError(err.message);
              } finally {
                setImporting(false);
              }
            }}
          />
        </label>
        <button className="btn" onClick={load} disabled={loading}>{loading ? "Memuat..." : "Refresh"}</button>
      </div>

      <div className="table-card card">
        <table className="table">
          <thead>
            <tr>
              <th>Notify/Nama</th>
              <th>Nomor</th>
              <th>LID</th>
              <th>Updated</th>
              <th style={{ textAlign: "right" }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="muted">Belum ada kontak tersinkron untuk device ini.</td></tr>
            )}
            {rows.map((c) => (
              <tr key={c.id}>
                <td>
                  <div className="strong">{c.notify || "-"}</div>
                  <div className="muted small">{device?.name || ""}</div>
                </td>
                <td className="mono">{c.phone || "-"}</td>
                <td className="mono small muted">{c.lid || "-"}</td>
                <td className="small muted">{fmt(c.updated_at || c.created_at)}</td>
                <td>
                  <div className="actions">
                    <button className="btn btn-sm" onClick={() => openChat(c)}>Chat</button>
                    <button className="btn btn-primary btn-sm" onClick={() => setSendContact(c)}>Kirim</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sendContact && <SendModal deviceId={deviceId} contact={sendContact} onClose={() => setSendContact(null)} />}
    </div>
  );
}
