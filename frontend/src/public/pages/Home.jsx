import { Link } from "react-router-dom";
import { footerColumns, pages } from "../site";
import { usePageMeta } from "../usePageMeta";

const features = [
  {
    title: "Device WhatsApp",
    text: "Tautkan nomor melalui QR, pantau status koneksi, dan kelola beberapa device dalam satu dashboard.",
  },
  {
    title: "Inbox Bersama",
    text: "Terima dan balas chat teks maupun media secara realtime dengan indikator status pesan.",
  },
  {
    title: "API Pesan",
    text: "Kirim teks, gambar, video, audio, stiker, dan dokumen dari aplikasi lain lewat endpoint yang terdokumentasi.",
  },
  {
    title: "Webhook",
    text: "Terima peristiwa pesan dan koneksi ke sistem Anda, dengan tanda tangan HMAC opsional.",
  },
];

export default function Home() {
  usePageMeta(pages.home);

  return (
    <>
      <section className="site-hero-home">
        <div className="site-container site-hero-grid">
          <div>
            <p className="site-eyebrow">Gateway WhatsApp · Dashboard Pesan</p>
            <h1>{pages.home.h1}</h1>
            <p className="site-lead">
              Kelola device, inbox tim, dan API pengirim pesan dalam satu aplikasi web yang rapi dan mudah dipakai.
            </p>
            <div className="site-actions">
              <Link className="btn btn-primary" to="/login">Masuk Dashboard</Link>
              <Link className="btn" to="/tentang-kami">Tentang Kami</Link>
            </div>
          </div>
          <div className="site-hero-panel" aria-hidden="true">
            <div className="site-hero-panel-head"><span /><span /><span /></div>
            <div className="site-hero-panel-row"><span className="site-dot ok" /> Device terhubung</div>
            <div className="site-hero-panel-row"><span className="site-dot ok" /> Inbox realtime</div>
            <div className="site-hero-panel-row"><span className="site-dot ok" /> API & webhook</div>
          </div>
        </div>
      </section>

      <div className="site-container site-home-content">
        <section aria-labelledby="fitur-heading">
          <p className="site-eyebrow">Layanan</p>
          <h2 id="fitur-heading">Yang dapat Anda lakukan</h2>
          <div className="site-feature-grid">
            {features.map((feature) => (
              <article className="site-feature" key={feature.title}>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="site-info-box" aria-labelledby="info-heading">
          <h2 id="info-heading">Informasi penting</h2>
          <p>
            Situs ini saat ini tidak menampilkan daftar harga, paket langganan, keranjang, atau pembayaran online.
            Informasi produk dan transaksi akan diperbarui pada halaman terkait apabila fitur tersebut tersedia.
          </p>
          <p className="small muted">
            Untuk pertanyaan seputar layanan, privasi, atau pengajuan refund, gunakan halaman Hubungi Kami.
          </p>
        </section>

        <section aria-labelledby="tautan-heading">
          <h2 id="tautan-heading">Tautan informasi</h2>
          <div className="site-link-grid">
            {footerColumns.flatMap((column) => column.links).map((link) => (
              <Link key={link.label} to={link.to}>{link.label}</Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
