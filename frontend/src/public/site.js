// Satu sumber kebenaran untuk identitas dan metadata halaman publik.
// Hanya memakai informasi yang benar-benar ditemukan di proyek (package.json, README.md, dan source code).
export const site = {
  name: "WA Dashboard",
  description:
    "WA Dashboard adalah dashboard web untuk mengelola device WhatsApp, membalas percakapan secara realtime, dan mengirim pesan melalui API.",
  developer: "Restuadkh",
  effectiveDate: "27 November 2026",
  // Belum ditemukan di source code. TODO: lengkapi oleh pemilik situs sebelum submit ke payment gateway.
  contact: {
    legalName: null,
    address: null,
    email: null,
    phone: null,
    whatsapp: null,
    hours: null,
  },
};

const meta = (path, title, description, h1) => ({ path, title, description, h1 });

export const pages = {
  home: meta(
    "/",
    "WA Dashboard — Gateway WhatsApp & Dashboard Pesan",
    "Dashboard web untuk mengelola device WhatsApp, membalas chat bersama tim secara realtime, dan mengirim pesan lewat API.",
    "Gateway WhatsApp yang rapi untuk tim Anda",
  ),
  about: meta(
    "/tentang-kami",
    "Tentang Kami — WA Dashboard",
    "Profil WA Dashboard: layanan dashboard gateway WhatsApp untuk pengelolaan device, inbox tim, dan API pesan.",
    "Tentang WA Dashboard",
  ),
  privacy: meta(
    "/kebijakan-privasi",
    "Kebijakan Privasi — WA Dashboard",
    "Kebijakan privasi WA Dashboard mengenai data akun, percakapan WhatsApp, formulir kontak, dan hak data sesuai UU PDP No. 27 Tahun 2022.",
    "Kebijakan Privasi",
  ),
  terms: meta(
    "/syarat-ketentuan",
    "Syarat & Ketentuan — WA Dashboard",
    "Syarat dan ketentuan penggunaan WA Dashboard, akun, device, inbox, API pengirim pesan, dan webhook.",
    "Syarat & Ketentuan",
  ),
  refund: meta(
    "/kebijakan-refund",
    "Kebijakan Pengembalian Dana — WA Dashboard",
    "Kebijakan pengembalian dana WA Dashboard, termasuk transaksi ganda dan pembayaran gagal namun saldo terpotong.",
    "Kebijakan Pengembalian Dana",
  ),
  cancellation: meta(
    "/kebijakan-pembatalan",
    "Kebijakan Pembatalan — WA Dashboard",
    "Ketentuan pembatalan penggunaan layanan dan penghapusan device pada WA Dashboard serta hubungannya dengan kebijakan refund.",
    "Kebijakan Pembatalan",
  ),
  contact: meta(
    "/hubungi-kami",
    "Hubungi Kami — WA Dashboard",
    "Hubungi WA Dashboard melalui formulir kontak untuk pertanyaan layanan, privacy, atau pengajuan pengembalian dana.",
    "Hubungi Kami",
  ),
  faq: meta(
    "/faq",
    "FAQ — Pertanyaan Umum WA Dashboard",
    "Jawaban atas pertanyaan umum seputar pemesanan, pembayaran, status, pengiriman pesan, refund, dan dukungan WA Dashboard.",
    "Pertanyaan yang Sering Diajukan",
  ),
  notFound: meta(
    "/404",
    "Halaman Tidak Ditemukan — WA Dashboard",
    "Halaman yang Anda cari tidak tersedia di WA Dashboard.",
    "Halaman tidak ditemukan",
  ),
};

export const footerColumns = [
  {
    title: "Informasi Perusahaan",
    links: [
      { to: "/tentang-kami", label: "Tentang Kami" },
      { to: "/hubungi-kami", label: "Kontak Kami" },
    ],
  },
  {
    title: "Informasi Legal",
    links: [
      { to: "/kebijakan-privasi", label: "Kebijakan Privasi" },
      { to: "/syarat-ketentuan", label: "Syarat & Ketentuan" },
      { to: "/kebijakan-refund", label: "Kebijakan Refund" },
      { to: "/kebijakan-pembatalan", label: "Kebijakan Pembatalan" },
    ],
  },
  {
    title: "Bantuan",
    links: [
      { to: "/faq", label: "FAQ" },
      { to: "/hubungi-kami", label: "Customer Service" },
    ],
  },
];
