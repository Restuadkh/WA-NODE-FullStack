import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { footerColumns, pages, site } from "./site";

const publicNav = [
  { to: "/", label: "Beranda", key: "home", end: true },
  { to: "/tentang-kami", label: "Tentang Kami", key: "about" },
  { to: "/faq", label: "FAQ", key: "faq" },
  { to: "/hubungi-kami", label: "Kontak", key: "contact" },
];

const legalNav = [
  { to: "/kebijakan-privasi", label: "Kebijakan Privasi" },
  { to: "/syarat-ketentuan", label: "Syarat & Ketentuan" },
  { to: "/kebijakan-refund", label: "Kebijakan Refund" },
  { to: "/kebijakan-pembatalan", label: "Kebijakan Pembatalan" },
];

function BrandMark() {
  return (
    <span className="site-brand-mark" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20l1.4-4.2A8 8 0 1 1 8.2 18.6z" />
      </svg>
    </span>
  );
}

export default function PublicLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  const isHome = location.pathname === "/";

  // Tutup menu saat berpindah halaman atau menekan Escape.
  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // Hanya beranda yang boleh scroll; halaman publik lain dikunci fullscreen.
  useEffect(() => {
    document.body.classList.toggle("public-lock", !isHome);
    return () => document.body.classList.remove("public-lock");
  }, [isHome]);

  const current = Object.entries(pages).find(([, value]) => value.path === location.pathname);
  const breadcrumbLabel = current?.[1]?.h1;

  return (
    <div className={`site-shell ${isHome ? "site-home" : "site-locked"}`}>
      <a className="site-skip" href="#main">Lewati ke konten</a>

      <header className="site-header">
        <div className="site-header-inner">
          <Link to="/" className="site-brand" aria-label={`${site.name} — Beranda`}>
            <BrandMark />
            <span>{site.name}</span>
          </Link>

          <button
            type="button"
            className="site-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="site-navigation"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span aria-hidden="true">☰</span> Menu
          </button>

          <nav id="site-navigation" className={`site-nav ${menuOpen ? "open" : ""}`} aria-label="Navigasi utama">
            {publicNav.map((item) => (
              <NavLink
                key={item.key}
                to={item.to}
                end={item.end}
                className={({ isActive }) => (isActive ? "site-nav-link active" : "site-nav-link")}
              >
                {item.label}
              </NavLink>
            ))}
            <details className="site-nav-group">
              <summary className="site-nav-link">Informasi Legal</summary>
              <div className="site-nav-group-menu">
                {legalNav.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => (isActive ? "site-nav-link active" : "site-nav-link")}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </details>
          </nav>

          <Link className="btn btn-primary site-login" to="/login">Masuk Dashboard</Link>
        </div>
      </header>

      {breadcrumbLabel && location.pathname !== "/" && (
        <nav className="site-breadcrumb" aria-label="Breadcrumb">
          <div className="site-container">
            <Link to="/">Beranda</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{breadcrumbLabel}</span>
          </div>
        </nav>
      )}

      <main id="main" className="site-main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="site-container">
          <div className="site-footer-top">
            <div className="site-footer-brand">
              <div className="site-brand">
                <BrandMark />
                <span>{site.name}</span>
              </div>
              <p>{site.description}</p>
              <p className="site-footer-hint">
                Informasi kontak resmi belum tersedia di konfigurasi proyek.
                Gunakan <Link to="/hubungi-kami">formulir kontak</Link>.
              </p>
            </div>
            {footerColumns.map((column) => (
              <nav key={column.title} className="site-footer-col" aria-label={column.title}>
                <h2>{column.title}</h2>
                <ul>
                  {column.links.map((link) => (
                    <li key={link.to}>
                      <Link to={link.to}>{link.label}</Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
          <div className="site-footer-bottom">
            <span>© {new Date().getFullYear()} {site.name}. Seluruh hak dilindungi.</span>
            <Link to="/kebijakan-privasi">Kebijakan Privasi</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
