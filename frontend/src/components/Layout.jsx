import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../auth";

const Icon = ({ d }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const FONT_KEY = "wa_font_small";

export default function Layout() {
  const { user, logout } = useAuth();
  // Mode font kecil (A-) — pilihan tersimpan dan diterapkan ke seluruh halaman.
  const [smallFont, setSmallFont] = useState(() => localStorage.getItem(FONT_KEY) === "1");

  useEffect(() => {
    document.documentElement.classList.toggle("font-small", smallFont);
    localStorage.setItem(FONT_KEY, smallFont ? "1" : "0");
  }, [smallFont]);

  // Sidebar drawer di smartphone: dibuka lewat tombol hamburger di bar atas,
  // ditutup dengan menyentuh backdrop / memilih menu / menekan Esc.
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e) => e.key === "Escape" && setNavOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <div className="shell">
      <header className="topbar">
        <button
          className="btn btn-ghost btn-sm hamburger icon-btn"
          onClick={() => setNavOpen(true)}
          aria-label="Buka menu"
        >
          ☰
        </button>
        <span className="topbar-title">WA Dashboard</span>
      </header>

      {navOpen && <div className="backdrop" onClick={() => setNavOpen(false)} />}

      <aside
        className={`sidebar ${navOpen ? "open" : ""}`}
        onClick={(e) => {
          // Tutup drawer setelah menu dipilih (klik di batang nav).
          if (e.target.closest(".nav")) setNavOpen(false);
        }}
      >
        <div className="brand">
          <span className="brand-mark">
            <Icon d="M4 20l1.4-4.2A8 8 0 1 1 8.2 18.6z" />
          </span>
          <span>WA Dashboard</span>
        </div>

        <nav className="nav">
          <NavLink to="/" end aria-label="Inbox" title="Inbox" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
            <Icon d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
            <span>Inbox</span>
          </NavLink>
          <NavLink to="/devices" aria-label="Devices" title="Devices" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
            <Icon d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 18h.01" />
            <span>Devices</span>
          </NavLink>
          <NavLink to="/queue" aria-label="Antrian" title="Antrian" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
            <Icon d="M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
            <span>Antrian</span>
          </NavLink>
          <NavLink to="/rules" aria-label="Auto-reply" title="Auto-reply" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
            <Icon d="M13 2L3 14h8l-1 8 10-12h-8z" />
            <span>Auto-reply</span>
          </NavLink>
          {(user?.role === "admin" || user?.role === "super_admin") && (
            <NavLink to="/users" aria-label="Pengguna" title="Pengguna" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
              <Icon d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              <span>Pengguna</span>
            </NavLink>
          )}
          <NavLink to="/api-docs" aria-label="API" title="Dokumentasi API" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
            <Icon d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            <span>Dok API</span>
          </NavLink>
        </nav>

        <div className="sidebar-foot">
          <div className="who">
            <div className="who-name">{user?.name}</div>
            <div className="who-meta">
              {user?.email} · {user?.role}
            </div>
          </div>
          <div className="foot-actions">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setSmallFont((v) => !v)}
              title={smallFont ? "Kembalikan ukuran font normal" : "Perkecil ukuran font"}
              aria-label={smallFont ? "Font normal" : "Font kecil"}
            >
              {smallFont ? "A+" : "A−"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={logout}>
              Keluar
            </button>
          </div>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
