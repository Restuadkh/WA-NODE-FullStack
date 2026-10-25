import { useState } from "react";
import { api } from "../api";

// Edit nama + webhook per device. Kosongkan URL untuk mematikan webhook,
// kosongkan secret untuk menghapus secret (signature tidak lagi dikirim).
export default function DeviceEditModal({ device, onClose, onSaved }) {
  const [name, setName] = useState(device.name || "");
  const [url, setUrl] = useState(device.webhook_url || "");
  const [secret, setSecret] = useState(device.webhook_secret || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.updateDevice(device.id, {
        name: name.trim(),
        webhook_url: url.trim(),
        webhook_secret: secret,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal wide" role="dialog" aria-modal="true" aria-label="Edit device" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <h2>Edit device</h2>
            <p className="muted small">Ubah nama dan webhook yang dipakai device ini.</p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Tutup
          </button>
        </div>

        <label className="field">
          <span>Nama device</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required autoFocus />
        </label>

        <label className="field">
          <span>Webhook URL (opsional)</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://contoh.com/webhook/whatsapp"
            inputMode="url"
            maxLength={500}
          />
          <small className="muted">
            Server akan POST event <code>messages</code> dan <code>connection</code> ke URL ini.
            Kosongkan untuk mematikan webhook device.
          </small>
        </label>

        <label className="field">
          <span>Webhook secret (opsional)</span>
          <input
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="string acak panjang"
            type="password"
            autoComplete="new-password"
            maxLength={255}
          />
          <small className="muted">
            Jika diisi, setiap request membawa header <code>X-Signature</code> (HMAC-SHA256).
            Kosongkan untuk menghapus secret.
          </small>
        </label>

        {device.instance_key && (
          <p className="muted small">
            Kunci API: <code>{device.instance_key}</code>
          </p>
        )}

        {error && <div className="alert alert-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Batal
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </form>
    </div>
  );
}
