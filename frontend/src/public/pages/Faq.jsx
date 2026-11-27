import { Link } from "react-router-dom";
import { faqGroups } from "../content";
import { pages } from "../site";
import { usePageMeta } from "../usePageMeta";

export default function Faq() {
  usePageMeta(pages.faq);

  return (
    <div className="site-container">
      <header className="site-page-head">
        <p className="site-eyebrow">Bantuan</p>
        <h1>{pages.faq.h1}</h1>
        <p className="site-lead">
          Pertanyaan berikut dijawab berdasarkan fitur yang benar-benar tersedia di WA Dashboard saat ini.
        </p>
      </header>

      <div className="site-layout">
        <div className="site-article">
          {faqGroups.map((group) => (
            <section className="site-section" key={group.title} aria-labelledby={`faq-${group.title}`}>
              <h2 id={`faq-${group.title}`}>{group.title}</h2>
              <div className="site-faq-list">
                {group.items.map((item) => (
                  <details className="site-faq-item" key={item.q}>
                    <summary>{item.q}</summary>
                    <p>{item.a}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="site-aside">
          <div className="site-aside-card">
            <h2>Masih butuh bantuan?</h2>
            <p>Kirim pertanyaan Anda melalui formulir kontak. Setiap pesan mendapat nomor referensi.</p>
            <Link className="btn btn-primary btn-block" to="/hubungi-kami">Hubungi Kami</Link>
          </div>
          <div className="site-aside-card">
            <h2>Terkait</h2>
            <p><Link to="/syarat-ketentuan">Syarat & Ketentuan</Link></p>
            <p><Link to="/kebijakan-refund">Kebijakan Pengembalian Dana</Link></p>
          </div>
        </aside>
      </div>
    </div>
  );
}
