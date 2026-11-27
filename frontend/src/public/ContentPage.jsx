import { Link } from "react-router-dom";
import { usePageMeta } from "./usePageMeta";

function SectionItem({ item }) {
  if (typeof item === "string") return <li>{item}</li>;
  return (
    <li>
      <strong>{item.label}:</strong> {item.text}
    </li>
  );
}

function Section({ section }) {
  return (
    <section className="site-section" id={section.id} aria-labelledby={`${section.id}-heading`}>
      <h2 id={`${section.id}-heading`}>{section.title}</h2>
      {section.paragraphs?.map((paragraph, i) => <p key={`p-${i}`}>{paragraph}</p>)}
      {section.items?.length > 0 && (
        <ul className="site-list">
          {section.items.map((item, i) => <SectionItem key={`i-${i}`} item={item} />)}
        </ul>
      )}
      {section.paragraphsAfter?.map((paragraph, i) => <p key={`pa-${i}`}>{paragraph}</p>)}
      {section.note && (
        <aside className={`site-note site-note-${section.note.type || "notice"}`}>
          <strong>{section.note.title}</strong>
          <p>{section.note.text}</p>
        </aside>
      )}
    </section>
  );
}

export default function ContentPage({ content, meta }) {
  usePageMeta(meta);

  return (
    <div className="site-container">
      <header className="site-page-head">
        <p className="site-eyebrow">{content.eyebrow}</p>
        <h1>{content.title}</h1>
        <p className="site-lead">{content.lead}</p>
        {content.updated && <p className="site-updated">Berlaku sejak {content.updated}</p>}
      </header>

      <div className="site-layout">
        <article className="site-article">
          {content.sections.map((section) => <Section key={section.id} section={section} />)}
        </article>

        <aside className="site-aside" aria-label="Navigasi halaman">
          <nav className="site-aside-card">
            <h2>Daftar Isi</h2>
            <ol>
              {content.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.title}</a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="site-aside-card">
            <h2>Butuh Bantuan?</h2>
            <p>Untuk pertanyaan atau pengajuan, silakan gunakan formulir kontak kami.</p>
            <Link className="btn btn-primary btn-block" to="/hubungi-kami">Hubungi Kami</Link>
            <Link className="site-aside-link" to="/faq">Lihat FAQ</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
