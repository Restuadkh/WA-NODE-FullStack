const LABELS = {
  connected: "Terhubung",
  pending_qr: "Menunggu scan QR",
  disconnected: "Terputus",
  logged_out: "Logout",
};

export default function StatusBadge({ status }) {
  return (
    <span className={`badge badge-${status || "unknown"}`}>
      <span className="dot" />
      {LABELS[status] || status || "-"}
    </span>
  );
}
