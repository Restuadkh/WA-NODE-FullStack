import { useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../../api";
import { pages, site } from "../site";
import { usePageMeta } from "../usePageMeta";

const emptyForm = { name: "", email: "", subject: "", message: "", website: "" };

const contactRows = [
  { label: "Nama brand", value: site.name },
  { label: "Nama badan hukum / usaha", value: site.contact.legalName },
  { label: "Alamat usaha", value: site.contact.address },
  { label: "Email resmi", value: site.contact.email },
  { label: "Telepon", value: site.contact.phone },
  { label: "WhatsApp customer service", value: site.contact.whatsapp },
  { label: "Jam operasional", value: site.contact.hours },
];

const Missing = () => <span className="site-missing">Belum tersedia</span>;

export default function Contact() {
  usePageMeta(pages.contact);
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setStatus(null);
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || "Pesan gagal dikirim. Silakan coba lagi.");
      }
      setStatus({ ok: true, text: `${data.message} Nomor referensi: ${data.id}` });
      setForm(emptyForm);
    } catch (error) {
      setStatus({ ok: false, text: error.message || "Pesan gagal dikirim." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="site-container">
      <header className="site-page-head">
        <p className="site-eyebrow">Dukungan</p>
        <h1>{pages.contact.h1}</h1>
        <p className="site-lead">
          Kirim pertanyaan, permintaan data pribadi, atau pengajuan refund menggunakan formulir di bawah.
          Setiap pesan yang berhasil dikirim mendapat nomor referensi.
        </p>
      </header>

      <div className="site-layout site-layout-contact">
        <section className="site-card" aria-labelledby="form-heading">
          <h2 id="form-heading">Formulir Kontak</h2>
          <form onSubmit={submit} className="site-form">
            <label className="field">
              <span>Nama lengkap</span>
              <input name="name" value={form.name} onChange={update} minLength={2} maxLength={100} autoComplete="name" required />
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" name="email" value={form.email} onChange={update} maxLength={254} autoComplete="email" required />
            </label>
            <label className="field">
              <span>Subjek</span>
              <input name="subject" value={form.subject} onChange={update} minLength={3} maxLength={150} placeholder="Contoh: Pertanyaan layanan" required />
            </label>
            <label className="field">
              <span>Pesan</span>
              <textarea name="message" value={form.message} onChange={update} minLength={10} maxLength={2000} rows={6} required />
            </label>
            <div className="site-honeypot" aria-hidden="true">
              <label>
                Jangan isi kolom ini
                <input name="website" value={form.website} onChange={update} tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            {status && (
              <p className={`alert ${status.ok ? "alert-success" : "alert-error"}`} role="status">
                {status.text}
              </p>
            )}
            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {busy ? "Mengirim…" : "Kirim Pesan"}
            </button>
            <p className="small muted">
              Pesan disimpan di server untuk ditindaklanjuti. Tidak ada notifikasi email otomatis karena alamat email resmi belum dikonfigurasi.
            </p>
          </form>
        </section>

        <aside className="site-aside">
          <div className="site-card site-contact-card">
            <h2>Informasi Kontak</h2>
            <dl className="site-contact-list">
              {contactRows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value || <Missing />}</dd>
                </div>
              ))}
            </dl>
            <p className="site-note site-note-notice">
              Data kontak di atas belum ditemukan di source code proyek. Pemilik situs perlu mengisi data resmi
              sebelum informasi ini dipakai untuk verifikasi merchant. Peta lokasi tidak ditampilkan karena alamat usaha belum tersedia.
            </p>
          </div>
          <div className="site-card">
            <h2>Langkah Selanjutnya</h2>
            <p>Untuk pengajuan refund atau pembatalan, baca ketentuan terkait terlebih dahulu:</p>
            <p><Link to="/kebijakan-refund">Kebijakan Pengembalian Dana</Link></p>
            <p><Link to="/kebijakan-pembatalan">Kebijakan Pembatalan</Link></p>
          </div>
        </aside>
      </div>
    </div>
  );
}
