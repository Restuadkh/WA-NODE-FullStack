import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

const STATUS_LABEL = {
  pending: "Menunggu",
  sending: "Mengirim",
  sent: "Terkirim",
  failed: "Gagal",
  cancelled: "Dibatalkan",
};

const fmt = (d) =>
  d ? new Date(d).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" }) : "-";

const previewOf = (job) =>
  job.payload?.text || job.payload?.caption || job.payload?.media?.filename || "-";

export default function Queue() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState("");
  const [status, setStatus] = useState("");
  const [jobs, setJobs] = useState([]);
  const [stats, setStats] = useState(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    api
      .listDevices()
      .then((list) => {
        setDevices(list);
        setDeviceId((prev) => prev || list[0]?.id || "");
      })
      .catch((e) => setError(e.message));
  }, []);

  const load = useCallback(async () => {
    if (!deviceId) {
      setJobs([]);
      setStats(null);
      setLoading(false);
      return;
    }
    try {
      const [list, info] = await Promise.all([
        api.listJobs(deviceId, { status, limit: 100 }),
        api.jobStats(deviceId),
      ]);
      setJobs(list.data);
      setTotal(list.total);
      setStats(info);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [deviceId, status]);

  useEffect(() => {
    setLoading(true);
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  const act = async (job, action) => {
    if (action === "cancel") {
      const ok = window.confirm(`Batalkan pesan ke ${job.to_jid}?`);
      if (!ok) return;
    }
    setBusyId(job.id);
    try {
      await (action === "cancel" ? api.cancelJob(job.id) : api.retryJob(job.id));
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId("");
    }
  };

  const counts = stats?.counts || {};

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Antrian pesan</h1>
          <p className="muted">
            Pesan keluar dikirim bertahap dengan jeda acak dan kuota per device. Bisa diisi lewat API{" "}
            <code>/api/message/queue</code>.
          </p>
        </div>
        <button className="btn" onClick={load} disabled={!deviceId}>
          Muat ulang
        </button>
      </header>

      <div className="form-row card">
        <label className="field grow">
          <span>Device</span>
          <select className="select" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            {devices.length === 0 && <option value="">Belum ada device</option>}
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select className="select select-inline" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Semua</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {stats && (
        <>
          <div className="stats-grid">
            <div className="stat">
              <div className="stat-label">Menunggu</div>
              <div className="stat-value">{counts.pending || 0}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Mengirim</div>
              <div className="stat-value">{counts.sending || 0}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Terkirim</div>
              <div className="stat-value">{counts.sent || 0}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Gagal</div>
              <div className="stat-value">{counts.failed || 0}</div>
            </div>
            <div className="stat">
              <div className="stat-label">1 jam terakhir</div>
              <div className="stat-value">
                {stats.usage.last_hour}
                {stats.limits.hourly > 0 && <span className="stat-limit"> / {stats.limits.hourly}</span>}
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">24 jam terakhir</div>
              <div className="stat-value">
                {stats.usage.last_day}
                {stats.limits.daily > 0 && <span className="stat-limit"> / {stats.limits.daily}</span>}
              </div>
            </div>
          </div>
          <p className="muted small">
            Jeda {Math.round(stats.limits.min_delay_ms / 1000)}–{Math.round(stats.limits.max_delay_ms / 1000)} detik ·
            jam kirim {stats.limits.active_hours} ({stats.limits.timezone}) · jadwal berikutnya{" "}
            {fmt(stats.next_scheduled_at)}
          </p>
        </>
      )}

      <div className="card table-card">
        {loading ? (
          <div className="empty">Memuat…</div>
        ) : !deviceId ? (
          <div className="empty">Tambahkan device terlebih dahulu.</div>
        ) : jobs.length === 0 ? (
          <div className="empty">
            Belum ada pesan di antrean. Kirim lewat <code>POST /api/message/queue</code>.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Jadwal</th>
                <th>Tujuan</th>
                <th>Isi</th>
                <th>Status</th>
                <th>Coba</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td className="muted">{fmt(job.scheduled_at)}</td>
                  <td className="mono job-target">{job.to_jid}</td>
                  <td>
                    <div className="job-text">{previewOf(job)}</div>
                    <div className="muted small">{job.type}</div>
                  </td>
                  <td>
                    <span className={`badge badge-${job.status}`}>{STATUS_LABEL[job.status] || job.status}</span>
                    {job.last_error && <div className="muted small job-error">{job.last_error}</div>}
                  </td>
                  <td className="muted">
                    {job.attempts}/{job.max_attempts}
                  </td>
                  <td className="right actions">
                    {isAdmin && ["pending", "failed"].includes(job.status) && (
                      <button
                        className="btn btn-sm btn-danger"
                        disabled={busyId === job.id}
                        onClick={() => act(job, "cancel")}
                      >
                        Batalkan
                      </button>
                    )}
                    {isAdmin && ["failed", "cancelled"].includes(job.status) && (
                      <button className="btn btn-sm" disabled={busyId === job.id} onClick={() => act(job, "retry")}>
                        Ulangi
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {total > jobs.length && (
        <p className="muted small">
          Menampilkan {jobs.length} dari {total} job. Filter status untuk mempersempit.
        </p>
      )}
    </div>
  );
}
