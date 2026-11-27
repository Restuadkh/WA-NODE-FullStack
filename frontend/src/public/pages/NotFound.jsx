import { Link } from "react-router-dom";
import { pages } from "../site";
import { usePageMeta } from "../usePageMeta";

export default function NotFound() {
  usePageMeta(pages.notFound);

  return (
    <div className="site-container site-not-found">
      <p className="site-eyebrow">404</p>
      <h1>{pages.notFound.h1}</h1>
      <p className="site-lead">Alamat yang Anda buka tidak tersedia. Periksa kembali tautan atau gunakan navigasi di bawah.</p>
      <div className="site-actions">
        <Link className="btn btn-primary" to="/">Kembali ke Beranda</Link>
        <Link className="btn" to="/faq">Lihat FAQ</Link>
      </div>
    </div>
  );
}
