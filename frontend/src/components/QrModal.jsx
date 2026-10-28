import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { getSocket } from "../socket";
import StatusBadge from "./StatusBadge";

// Menampilkan QR (atau pairing code) untuk satu device dan memantau status sampai terhubung.
// Setiap polling juga membuat backend memulai ulang instance yang terputus / QR-nya kedaluwarsa.
export default function QrModal({ device, onClose, onConnected }) {
  const [info, setInfo] = useState(null); // { status, qr, pairing_code }
  const [status, setStatus] = useState(device.status);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const connectedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    let timer;

    const tick = async () => {
      try {
        const d = await api.deviceQr(device.id);
        if (!alive) return;
        setInfo(d);
        setStatus(d.status);
        setError("");
        if (d.status === "connected") {
          if (!connectedRef.current) {
            connectedRef.current = true;
            onConnected?.();
          }
          return; // berhenti polling
        }
      } catch (e) {
        if (alive) setError(e.message);
      }
      if (alive) {
        setLoading(false);
        timer = setTimeout(tick, 3000);
      }
    };
    tick();

    const socket = getSocket();
    const onStatus = (p) => {
      if (p.device_id === device.id) setStatus(p.status);
    };
    socket.on("device:status", onStatus);

    return () => {
      alive = false;
      clearTimeout(timer);
      socket.off("device:status", onStatus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.id]);

  const connected = status === "connected";
  const pairing = info?.pairing_code;
  const retrying = info?.attempts;
  const cooldown = info?.cooldown_ms;

  // Keterangan koneksi otomatis: sedang mencoba (x/N), menunggu cooldown, atau menunggu QR.
  const retryNote = connected
    ? null
    : cooldown
      ? `Gagal terhubung setelah ${retrying?.attempts_max || 3} percobaan. Coba lagi dalam ${Math.ceil(cooldown / 1000)} detik.`
      : retrying
        ? `Menghubungkan ulang otomatis… percobaan ${retrying.attempts_used + 1}/${retrying.attempts_max}`
        : null;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Tautkan device">
        <div className="modal-head">
          <div>
            <h2>{device.name}</h2>
            <StatusBadge status={status} />
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Tutup
          </button>
        </div>

        <div className="qr-area">
          {connected ? (
            <div className="qr-done">
              <div className="qr-check">✓</div>
              <p>Device berhasil terhubung.</p>
            </div>
          ) : loading ? (
            <div className="qr-placeholder">Memuat…</div>
          ) : pairing ? (
            <div className="qr-done pairing">
              <div className="muted small">Kode pairing</div>
              <div className="pairing-code">{pairing}</div>
            </div>
          ) : info?.qr ? (
            <img src={info.qr} alt="QR WhatsApp" className="qr-img" />
          ) : (
            <div className="qr-placeholder">{error || "Menunggu QR dari WhatsApp…"}</div>
          )}
        </div>

        {!connected && (
          <ol className="qr-steps">
            <li>Buka WhatsApp di ponsel</li>
            <li>Pengaturan → Perangkat tertaut → Tautkan perangkat</li>
            {pairing ? (
              <li>Pilih “Tautkan dengan nomor telepon”, lalu masukkan kode di atas</li>
            ) : (
              <li>Arahkan kamera ke QR di atas (QR diperbarui otomatis)</li>
            )}
          </ol>
        )}
        {!connected && retryNote && <p className="muted small">{retryNote}</p>}
        {!connected && error && info && <p className="muted small">{error}</p>}
      </div>
    </div>
  );
}
