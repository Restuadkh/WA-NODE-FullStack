import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";

const Icon = ({ d }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="shell">
      <aside className="sidebar">
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
        </nav>

        <div className="sidebar-foot">
          <div className="who">
            <div className="who-name">{user?.name}</div>
            <div className="who-meta">
              {user?.email} · {user?.role}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={logout}>
            Keluar
          </button>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
