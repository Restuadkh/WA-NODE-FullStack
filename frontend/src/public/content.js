import { site } from "./site";

const TIDAK_TERSEDIA =
  "Belum tersedia di source code proyek. Informasi ini perlu dilengkapi oleh pemilik situs sebelum digunakan sebagai data resmi usaha.";

// Tentang Kami -------------------------------------------------------------
export const aboutPage = {
  eyebrow: "Profil",
  title: "Tentang WA Dashboard",
  lead: "WA Dashboard adalah perangkat lunak dashboard web untuk mengelola koneksi WhatsApp, membalas percakapan bersama tim secara realtime, dan menyediakan API pengirim pesan bagi aplikasi lain.",
  updated: null,
  sections: [
    {
      id: "identitas",
      title: "Identitas & Brand",
      paragraphs: [
        `Nama brand yang digunakan dalam proyek ini adalah ${site.name}. Nama tersebut dipakai secara konsisten pada antarmuka dashboard, dokumentasi, dan halaman publik.`,
        `Pengembang yang tercantum pada metadata paket (package.json) adalah ${site.developer}.`,
      ],
      note: {
        type: "notice",
        title: "Data yang belum tersedia",
        text: TIDAK_TERSEDIA,
      },
      items: [
        { label: "Nama brand", text: site.name },
        { label: "Pengembang (metadata paket)", text: site.developer },
        { label: "Badan hukum / nama usaha resmi", text: "Belum tersedia" },
      ],
    },
    {
      id: "latar-belakang",
      title: "Latar Belakang & Tujuan",
      paragraphs: [
        "WhatsApp banyak dipakai sebagai kanal komunikasi dengan pelanggan. Saat beberapa orang menangani percakapan yang sama, tanpa dashboard yang terpusat percakapan mudah terlewat dan riwayatnya tersebar di beberapa perangkat.",
        "WA Dashboard dibangun untuk menyatukan pengelolaan device, inbox bersama, dan pengiriman pesan melalui API dalam satu aplikasi web. Tujuan ini mengikuti deskripsi yang memang tersedia di dokumentasi proyek; tidak ada klaim pendirian usaha, tahun berdiri, atau pencapaian tertentu yang ditambahkan pada halaman ini.",
      ],
    },
    {
      id: "tujuan",
      title: "Tujuan Pengembangan",
      items: [
        "Memudahkan tim memantau dan membalas percakapan WhatsApp dari satu antarmuka.",
        "Menyediakan pengelolaan beberapa device dengan status koneksi yang terlihat secara realtime.",
        "Memungkinkan aplikasi lain mengirim pesan melalui API yang terdokumentasi.",
        "Menyediakan webhook keluar opsional agar sistem lain dapat menerima peristiwa pesan dan koneksi.",
      ],
    },
    {
      id: "layanan",
      title: "Bidang Usaha, Produk & Layanan",
      paragraphs: [
        "Bidang yang tercermin dari source code adalah perangkat lunak gateway WhatsApp dan dashboard layanan pesan, bukan penjualan barang fisik.",
      ],
      items: [
        { label: "Dashboard & device", text: "Menautkan nomor melalui QR, memantau status, menghubungkan ulang, dan menghapus device." },
        { label: "Inbox tim", text: "Menerima dan membalas chat teks serta media (gambar, video, stiker, audio, dokumen) secara realtime, termasuk indikator status pesan." },
        { label: "API pesan", text: "Endpoint pengirim teks dan media untuk aplikasi lain dengan kunci device (instance_key), pembatasan laju request, dan dokumentasi di dalam dashboard." },
        { label: "Webhook", text: "Pengiriman peristiwa pesan, pembaruan status, dan koneksi ke sistem eksternal, dengan tanda tangan HMAC opsional." },
        { label: "Manajemen pengguna", text: "Dua peran sederhana: admin (mengelola device dan pengguna) serta agent (membalas chat)." },
      ],
      note: {
        type: "notice",
        title: "Harga dan paket",
        text: "Source code tidak memuat daftar produk berharga, paket langganan, mekanisme checkout, atau integrasi payment gateway. Karena itu halaman ini tidak menampilkan harga, dan tidak ada klaim pembayaran online.",
      },
    },
    {
      id: "keunggulan",
      title: "Keunggulan Layanan",
      items: [
        "Status device dan pesan diperbarui secara realtime melalui socket.io.",
        "Satu sesi yang terputus tidak memutus sesi device lain; tersedia reconnect otomatis per sesi.",
        "Media disimpan di folder server dan diakses melalui URL bertanda tangan HMAC yang memiliki masa berlaku.",
        "Webhook dapat diatur per device dengan fallback global, serta didukung tanda tangan HMAC-SHA256.",
        "Akses API dapat diproteksi dengan header dan pembatasan jumlah request per menit.",
      ],
    },
    {
      id: "wilayah",
      title: "Wilayah Operasional & Kontak",
      paragraphs: [
        "WA Dashboard adalah layanan berbasis web sehingga dapat diakses melalui jaringan internet. Batas wilayah operasional, jam layanan, dan data kontak resmi belum didefinisikan secara tertulis di dalam proyek.",
      ],
      items: [
        { label: "Wilayah operasional", text: "Belum ditetapkan secara tertulis" },
        { label: "Email resmi", text: "Belum tersedia — lengkapi oleh pemilik situs" },
        { label: "Telepon / WhatsApp", text: "Belum tersedia — lengkapi oleh pemilik situs" },
        { label: "Alamat usaha", text: "Belum tersedia — lengkapi oleh pemilik situs" },
      ],
      paragraphsAfter: [
        "Untuk pertanyaan atau pengajuan, gunakan formulir pada halaman Hubungi Kami. Formulir tersebut benar-benar memproses data dan menyimpan pesan di server; tidak ada alamat email atau nomor telepon yang ditambahkan secara fiktif.",
      ],
    },
  ],
};

// Halaman legal ------------------------------------------------------------
export const legalPages = {
  privacy: {
    eyebrow: "Informasi Legal",
    title: "Kebijakan Privasi",
    lead: "Kebijakan ini menjelaskan data yang diproses oleh WA Dashboard, tujuan penggunaannya, dan hak Anda atas data pribadi. Kebijakan ini disusun berdasarkan implementasi yang memang ada di source code proyek pada tanggal berlaku di bawah ini.",
    updated: site.effectiveDate,
    sections: [
      {
        id: "pendahuluan",
        title: "1. Pendahuluan",
        paragraphs: [
          `Kebijakan Privasi ini berlaku untuk situs ${site.name} dan dashboard yang disajikan pada domain yang sama. Dengan menggunakan situs atau dashboard, Anda memahami cara data Anda diproses sebagaimana dijelaskan di sini.`,
          "Dokumen ini tidak menyatakan hal yang tidak didukung implementasi. Bila suatu fitur belum tersedia, hal tersebut dinyatakan apa adanya.",
        ],
      },
      {
        id: "data-pribadi",
        title: "2. Informasi Pribadi yang Dikumpulkan",
        paragraphs: ["Data pribadi yang diproses berasal dari informasi yang Anda berikan saat menggunakan dashboard dan formulir kontak."],
        items: [
          { label: "Data akun", text: "Nama, alamat email, peran (admin atau agent), dan kata sandi dalam bentuk hash (bcrypt). Kata sandi plaintext tidak disimpan." },
          { label: "Data perangkat", text: "Nama device, kunci device (instance_key), status koneksi, dan URL webhook yang Anda isi." },
          { label: "Data kontak", text: "Nomor atau JID WhatsApp, nama kontak, serta metadata percakapan yang tersimpan di database saat device terhubung." },
          { label: "Data formulir kontak", text: "Nama, alamat email, subjek, isi pesan, waktu pengiriman, dan hash alamat IP (bukan IP mentah)." },
        ],
      },
      {
        id: "data-transaksi",
        title: "3. Informasi Transaksi",
        paragraphs: [
          "Saat ini WA Dashboard tidak memiliki katalog produk berharga, keranjang, checkout, atau integrasi payment gateway. Karena itu, tidak ada data kartu pembayaran, nomor rekening, atau bukti transfer yang dikumpulkan oleh situs ini.",
          "Jika di masa depan fitur pembayaran ditambahkan, jenis data transaksi yang dikumpulkan akan dijelaskan terlebih dahulu pada pembaruan kebijakan ini.",
        ],
      },
      {
        id: "tujuan",
        title: "4. Tujuan Pengumpulan Data",
        items: [
          "Membuat dan mengelola akun serta sesi login dashboard.",
          "Menampilkan daftar device, status koneksi, dan riwayat percakapan kepada pengguna yang berwenang.",
          "Mengirim pesan melalui API dan menyampaikan peristiwa melalui webhook sesuai konfigurasi pengguna.",
          "Menanggapi pesan yang dikirimkan melalui formulir kontak.",
          "Membatasi penyalahgunaan endpoint publik melalui pembatasan laju request.",
          "Menyelidiki gangguan teknis dan menjaga keamanan layanan.",
        ],
      },
      {
        id: "penggunaan",
        title: "5. Penggunaan Data Pelanggan",
        paragraphs: [
          "Data digunakan hanya untuk operasional dashboard, dukungan, dan keamanan layanan. Data akun dipakai untuk autentikasi dengan token JWT; data device dan pesan dipakai untuk menampilkan inbox serta mengirim balasan; data formulir kontak dipakai untuk menindaklanjuti pertanyaan Anda.",
          "Kami tidak menjual data pribadi dan tidak menggunakan data percakapan untuk iklan. Tidak ada modul analitik pihak ketiga yang ditemukan pada source code situs ini.",
        ],
      },
      {
        id: "penyimpanan",
        title: "6. Penyimpanan & Perlindungan Data",
        paragraphs: [
          "Data akun, device, chat, dan pesan disimpan pada basis data MySQL/MariaDB (atau SQLite untuk kebutuhan pengembangan dan pengujian). File media disimpan pada folder server yang dikonfigurasi melalui MEDIA_DIR. Kredensial sesi WhatsApp disimpan pada folder AUTH_DIR. Pesan formulir kontak disimpan sebagai berkas JSONL pada folder CONTACT_DIR yang tidak termasuk folder statis situs.",
          "Akses dashboard memakai token JWT, kunci device diperiksa pada endpoint API, tautan media memakai tanda tangan HMAC dengan masa berlaku, dan respons server dilengkapi header keamanan melalui helmet. Pengiriman data sebaiknya memakai HTTPS yang dikonfigurasi di lapisan hosting/proxy.",
          "Kebijakan ini tidak menyatakan bahwa data dienkripsi saat disimpan (enkripsi at-rest), karena hal tersebut tidak diterapkan di level aplikasi. Perlindungan tambahan bergantung pada konfigurasi server dan hosting yang digunakan.",
        ],
      },
      {
        id: "cookies",
        title: "7. Cookies & Penyimpanan Browser",
        paragraphs: [
          "Situs ini tidak memakai cookie analitik atau cookie iklan. Sesi login disimpan pada localStorage browser dalam bentuk token JWT, dan preferensi ukuran font disimpan pada localStorage dengan kunci wa_font_small.",
          "Anda dapat menghapus data tersebut kapan saja melalui pengaturan browser atau dengan keluar dari dashboard. Menghapus penyimpanan lokal akan mengharuskan login ulang.",
        ],
      },
      {
        id: "pihak-ketiga",
        title: "8. Integrasi Pihak Ketiga",
        paragraphs: [
          "Koneksi WhatsApp dibangun dengan Baileys, yaitu implementasi tidak resmi dari protokol WhatsApp. Percakapan dan pesan yang dikirim melewati jaringan WhatsApp/Meta sesuai dengan cara kerja protokol tersebut.",
          "Layanan hosting, basis data, atau penyedia jaringan yang digunakan untuk menjalankan aplikasi juga dapat memproses data sebagai bagian dari infrastruktur. Selain itu, belum ada integrasi analitik, iklan, atau pihak ketiga lain yang ditemukan pada source code proyek ini.",
        ],
      },
      {
        id: "payment-gateway",
        title: "9. Pembagian Data kepada Payment Gateway",
        paragraphs: [
          "Hingga tanggal berlaku kebijakan ini, situs belum memiliki integrasi dengan Tripay, Midtrans, Xendit, atau payment gateway lainnya. Oleh karena itu, tidak ada data yang dikirimkan ke penyedia layanan tersebut dari situs ini.",
          "Apabila integrasi pembayaran ditambahkan, data yang dibagikan dibatasi pada informasi yang diperlukan untuk transaksi, dan kebijakan ini akan diperbarui sebelum fitur tersebut digunakan.",
        ],
      },
      {
        id: "hak-pengguna",
        title: "10. Hak Pengguna atas Data Pribadi",
        paragraphs: [
          "Sesuai Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP), Anda memiliki hak antara lain untuk:",
        ],
        items: [
          "Memperoleh informasi dan akses atas data pribadi Anda.",
          "Meminta pembetulan atau koreksi data yang tidak tepat.",
          "Meminta penghapusan data pribadi dalam batas yang diizinkan hukum dan kebutuhan operasional.",
          "Menarik persetujuan penggunaan data yang sebelumnya diberikan.",
          "Menyampaikan keberatan atas pemrosesan data dan meminta pertimbangan pengganti keputusan otomatis, bila relevan.",
          "Meminta portabilitas data ke penyedia lain, sepanjang memungkinkan secara teknis.",
          "Mengajukan kompensasi atas kerugian akibat pelanggaran privasi sesuai peraturan perundang-undangan.",
        ],
      },
      {
        id: "permintaan-data",
        title: "11. Permintaan Perubahan atau Penghapusan Data",
        paragraphs: [
          "Permintaan akses, koreksi, atau penghapusan data dapat dikirimkan melalui formulir pada halaman Hubungi Kami dengan subjek yang jelas. Untuk menjaga keamanan, kami dapat meminta informasi tambahan guna memastikan bahwa permintaan berasal dari pemilik data.",
          "Belum ada batas waktu layanan (SLA) resmi yang dijanjikan untuk penyelesaian permintaan tersebut; peninjauan dilakukan sesuai kemampuan operasional. Penghapusan data tidak dapat dilakukan bila data wajib disimpan berdasarkan kewajiban hukum atau keperluan keamanan yang masih berlaku.",
        ],
      },
      {
        id: "retensi",
        title: "12. Retensi Data",
        paragraphs: [
          "Data disimpan selama diperlukan untuk menjalankan dashboard, menjaga riwayat percakapan, dan memproses permintaan Anda. Proyek ini belum memiliki jadwal penghapusan otomatis atau kebijakan retensi tertentu selain penghapusan yang dilakukan pengguna melalui fitur yang tersedia (misalnya penghapusan device).",
          "Salinan cadangan (backup) dapat menyimpan data untuk jangka waktu tertentu sebelum akhirnya ditimpa atau dihapus sesuai prosedur hosting.",
        ],
      },
      {
        id: "uu-pdp",
        title: "13. Pelindungan Data Pribadi sesuai Peraturan Indonesia",
        paragraphs: [
          "Kebijakan ini mengacu pada Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi dan peraturan pelaksananya. Pemrosesan data dilakukan dengan memperhatikan asas keabsahan, keterbukaan, keterbatasan tujuan, dan keamanan.",
          "Belum ada unit atau pejabat pelindungan data pribadi (DPO) yang ditunjuk secara tertulis dalam proyek. Untuk saat ini, semua permintaan terkait data pribadi disalurkan melalui kanal kontak yang tersedia di situs.",
        ],
      },
      {
        id: "kontak-privasi",
        title: "14. Kontak Terkait Privasi",
        paragraphs: [
          "Gunakan halaman Hubungi Kami untuk pertanyaan, permintaan akses, koreksi, atau penghapusan data. Alamat email dan nomor telepon resmi belum tersedia di source code proyek dan perlu dilengkapi oleh pemilik situs agar kanal kontak dapat diverifikasi secara publik.",
        ],
      },
      {
        id: "pembaruan",
        title: "15. Tanggal Berlaku & Pembaruan Kebijakan",
        paragraphs: [
          `Kebijakan ini mulai berlaku pada ${site.effectiveDate}. Pembaruan dapat dilakukan apabila fitur, integrasi, atau proses bisnis berubah. Versi terbaru selalu tersedia pada halaman ini.`,
        ],
      },
    ],
  },

  terms: {
    eyebrow: "Informasi Legal",
    title: "Syarat & Ketentuan",
    lead: "Syarat dan ketentuan berikut mengatur penggunaan situs dan dashboard WA Dashboard. Silakan baca sebelum mendaftar, menautkan device, atau memakai API pengirim pesan.",
    updated: site.effectiveDate,
    sections: [
      {
        id: "ketentuan-umum",
        title: "1. Ketentuan Penggunaan Website",
        paragraphs: [
          "Dengan mengakses situs ini Anda menyetujui syarat dan ketentuan ini. Jika Anda menggunakan situs atas nama organisasi, Anda menyatakan bahwa Anda berwenang mewakili organisasi tersebut.",
          "Situs dan dashboard hanya boleh dipakai untuk tujuan yang sah dan tidak boleh dipakai untuk mengganggu operasional pihak lain.",
        ],
      },
      {
        id: "syarat-pengguna",
        title: "2. Persyaratan Pengguna",
        paragraphs: ["Pengguna dashboard harus:",],
        items: [
          "Mempunyai akun yang dibuat oleh administrator layanan.",
          "Menyediakan alamat email yang valid dan dapat diakses.",
          "Diharapkan berusia minimal 18 tahun atau memiliki izin dari wali yang sah.",
          "Memahami bahwa koneksi WhatsApp memakai implementasi tidak resmi (Baileys) dan risikonya tetap ada.",
        ],
      },
      {
        id: "akun",
        title: "3. Pendaftaran & Pengelolaan Akun",
        paragraphs: [
          "Akun dibuat oleh pengguna berperan admin melalui halaman Pengguna. Terdapat dua peran: admin yang mengelola device dan pengguna, serta agent yang membalas percakapan. Sesi login menggunakan token JWT yang berlaku selama konfigurasi JWT_EXPIRES_IN (default 8 jam).",
          "Pengguna bertanggung jawab menjaga kerahasiaan kata sandi dan tidak membagikan akunnya. Perubahan data akun dapat dilakukan oleh admin melalui dashboard.",
        ],
      },
      {
        id: "hak-kewajiban",
        title: "4. Hak & Kewajiban Pelanggan",
        items: [
          { label: "Hak", text: "Menggunakan fitur yang tersedia sesuai peran akun, memperoleh dukungan melalui formulir kontak, dan mengajukan permintaan terkait data pribadi." },
          { label: "Kewajiban", text: "Menggunakan data pelanggan secara bertanggung jawab, tidak menyalahgunakan API, serta menjaga kerahasiaan kunci device dan kredensial akun." },
        ],
      },
      {
        id: "pemesanan",
        title: "5. Ketentuan Pemesanan & Pengaktifan Layanan",
        paragraphs: [
          "Saat ini situs tidak menyediakan katalog produk, keranjang, atau pemesanan online. Pengaktifan penggunaan dimulai ketika administrator membuat akun dan pengguna menautkan device WhatsApp melalui kode QR di dashboard.",
          "Device yang belum dipindai atau sedang terputus tidak dapat mengirim pesan melalui API. Status device ditampilkan pada dashboard.",
        ],
      },
      {
        id: "harga",
        title: "6. Harga & Mata Uang Transaksi",
        paragraphs: [
          "Belum ada harga produk, paket langganan, atau daftar biaya yang ditampilkan di situs ini. Karena itu tidak ada transaksi yang dapat dianggap disetujui berdasarkan harga di halaman mana pun.",
          "Apabila paket berbayar ditambahkan, harga akan ditampilkan dalam Rupiah (IDR) dan syaratnya akan diperbarui pada halaman ini sebelum transaksi dibuka.",
        ],
      },
      {
        id: "pembayaran",
        title: "7. Ketentuan Pembayaran & Status Pembayaran",
        paragraphs: [
          "Situs ini belum memiliki integrasi payment gateway dan tidak memproses pembayaran online. Status pembayaran dengan demikian tidak tersedia untuk diverifikasi di dashboard.",
          "Jika pembayaran di masa depan diintegrasikan, status pembayaran akan mengikuti konfirmasi dari penyedia pembayaran yang digunakan, bukan asumsi dari tampilan situs.",
        ],
      },
      {
        id: "aktivasi",
        title: "8. Proses Pengiriman atau Aktivasi Produk",
        paragraphs: [
          "Layanan ini berupa perangkat lunak berbasis web, sehingga tidak ada pengiriman barang fisik. Aktivasi terjadi setelah akun dibuat dan device berhasil ditautkan melalui QR. Pesan yang dikirim melalui API akan tampil pada inbox setelah proses pengiriman selesai.",
        ],
      },
      {
        id: "penggunaan-layanan",
        title: "9. Penggunaan Layanan",
        paragraphs: [
          "Fitur yang tersedia meliputi pengelolaan device, inbox bersama, pengiriman pesan teks dan media melalui dashboard maupun API, serta webhook keluar. Dokumentasi endpoint tersedia pada halaman Dok API di dalam dashboard.",
          "Kunci device (instance_key) berfungsi sebagai kredensial API. Simpan kunci tersebut dan gunakan header X-Api-Key sesuai dokumentasi.",
        ],
      },
      {
        id: "larangan",
        title: "10. Larangan Penyalahgunaan Layanan",
        paragraphs: ["Pengguna dilarang:"],
        items: [
          "Mengirim pesan massal tidak diminta, spam, penipuan, atau konten melanggar hukum.",
          "Menggunakan nomor atau data kontak tanpa hak atau persetujuan yang sah.",
          "Mencoba membobol, memindahtangankan, atau menyalahgunakan kunci API, token, webhook, maupun akun pengguna lain.",
          "Melakukan serangan terhadap infrastruktur, termasuk request berlebihan yang melewati batas yang ditetapkan.",
          "Mengaku sebagai pihak resmi WhatsApp/Meta atau menyatakan afiliasi yang tidak ada.",
        ],
      },
      {
        id: "tanggung-jawab",
        title: "11. Pembatasan Tanggung Jawab",
        paragraphs: [
          "WA Dashboard memakai Baileys, yaitu implementasi tidak resmi dari protokol WhatsApp. Gangguan pada layanan WhatsApp, pemblokiran nomor, atau perubahan protokol dapat memengaruhi koneksi dan pengiriman pesan di luar kendali aplikasi ini.",
          "Sejauh diizinkan hukum, layanan tidak menjamin bahwa pesan selalu terkirim dalam waktu tertentu. Tanggung jawab atas isi pesan dan penerimanya berada pada pengguna yang mengirimkannya.",
        ],
      },
      {
        id: "perselisihan",
        title: "12. Penyelesaian Perselisihan",
        paragraphs: [
          "Jika terjadi perselisihan, kedua pihak diharapkan menghubungi kanal kontak yang tersedia untuk mencari solusi bersama. Hukum yang berlaku adalah hukum Negara Kesatuan Republik Indonesia, kecuali peraturan yang lebih spesifik mengatur hal lain.",
        ],
      },
      {
        id: "perubahan",
        title: "13. Perubahan Ketentuan",
        paragraphs: [
          "Syarat dan ketentuan ini dapat diperbarui seiring perubahan fitur atau proses bisnis. Versi terbaru akan ditampilkan pada halaman ini beserta tanggal pembaruan.",
        ],
      },
      {
        id: "kontak",
        title: "14. Informasi Kontak",
        paragraphs: [
          "Pertanyaan terkait syarat dan ketentuan dapat dikirimkan melalui halaman Hubungi Kami. Data kontak resmi belum tersedia di source code proyek dan perlu dilengkapi oleh pemilik situs.",
        ],
      },
    ],
  },

  refund: {
    eyebrow: "Informasi Legal",
    title: "Kebijakan Pengembalian Dana",
    lead: "Kebijakan ini menjelaskan bagaimana pengajuan pengembalian dana diproses. Karena situs ini belum memiliki pembayaran online, seluruh ketentuan yang berkaitan dengan transaksi bersifat kondisional dan akan diperbarui bila fitur pembayaran tersedia.",
    updated: site.effectiveDate,
    sections: [
      {
        id: "ruang-lingkup",
        title: "1. Ruang Lingkup & Kondisi Saat Ini",
        paragraphs: [
          "Hingga tanggal berlaku kebijakan ini, WA Dashboard tidak menyediakan produk berharga, checkout, atau payment gateway. Karena itu tidak ada pembayaran yang dipungut melalui situs dan tidak tersedia proses refund otomatis.",
          "Jika Anda memiliki transaksi yang dilakukan di luar situs ini (misalnya transfer langsung ke pihak tertentu), pengembalian dananya menjadi tanggung jawab pihak yang menerima dana tersebut.",
        ],
      },
      {
        id: "memenuhi-syarat",
        title: "2. Kondisi yang Dapat Diajukan untuk Refund",
        paragraphs: [
          "Apabila fitur pembayaran di masa depan diintegrasikan, pengajuan dapat dipertimbangkan pada kondisi-kondisi berikut setelah dilakukan verifikasi:",
        ],
        items: [
          "Pembayaran ganda untuk satu pesanan atau invoice yang sama.",
          "Pembayaran gagal di sistem tetapi saldo pelanggan terpotong dan dana diterima oleh pihak layanan.",
          "Layanan tidak diaktifkan karena kesalahan pada sistem layanan, bukan karena data yang diberikan pengguna.",
          "Kesalahan nominal atau pengiriman dana ke rekening/VA yang keliru akibat kesalahan sistem, sesuai verifikasi penyedia pembayaran.",
        ],
        note: {
          type: "notice",
          title: "Catatan",
          text: "Daftar di atas adalah kriteria pengajuan, bukan jaminan persetujuan. Setiap kasus tetap diperiksa berdasarkan bukti dan data yang tersedia.",
        },
      },
      {
        id: "tidak-dapat",
        title: "3. Kondisi yang Tidak Dapat Diajukan",
        items: [
          "Layanan telah diaktifkan dan digunakan sesuai permintaan pengguna.",
          "Kesalahan pengisian data oleh pengguna, termasuk salah nomor atau salah pilih produk.",
          "Kendala teknis pada perangkat, jaringan, atau akun WhatsApp pengguna di luar kendali layanan.",
          "Pemblokiran nomor oleh WhatsApp karena penggunaan yang melanggar ketentuan.",
          "Permintaan tanpa bukti transaksi yang dapat diverifikasi.",
        ],
      },
      {
        id: "prosedur",
        title: "4. Prosedur Pengajuan",
        paragraphs: [
          "Kirim pengajuan melalui formulir pada halaman Hubungi Kami dengan subjek \"Pengajuan Refund\". Sertakan informasi berikut agar pengajuan dapat diperiksa:",
        ],
        items: [
          "Nama dan alamat email yang dipakai saat transaksi.",
          "Nomor referensi, invoice, atau ID transaksi dari payment gateway (bila ada).",
          "Tanggal dan nominal pembayaran.",
          "Metode pembayaran yang digunakan.",
          "Kronologi masalah dan bukti pendukung (misalnya bukti transfer atau tangkapan layar status pembayaran).",
        ],
      },
      {
        id: "waktu-pemeriksaan",
        title: "5. Waktu Pemeriksaan & Estimasi Pengembalian",
        paragraphs: [
          "Belum ada batas waktu pemeriksaan atau estimasi pengembalian yang dijanjikan di dalam proyek. Pengajuan akan ditinjau setelah data dan bukti dinyatakan lengkap; informasi lebih lanjut akan disampaikan melalui kanal kontak yang sama.",
          "Karena belum ada integrasi payment gateway, tidak ada jadwal pengembalian otomatis yang dapat ditampilkan pada halaman ini.",
        ],
      },
      {
        id: "pembayaran-ganda",
        title: "6. Ketentuan Pembayaran Ganda",
        paragraphs: [
          "Untuk pembayaran ganda, pengajuan harus memuat bukti kedua transaksi dan nomor pesanan/invoice yang sama. Pengembalian hanya dapat diproses untuk jumlah yang benar-benar diterima oleh pihak layanan dan belum dikembalikan melalui mekanisme payment gateway.",
        ],
      },
      {
        id: "gagal-terpotong",
        title: "7. Transaksi Gagal namun Saldo Terpotong",
        paragraphs: [
          "Jika status di situs menunjukkan gagal tetapi saldo pelanggan terpotong, sertakan bukti potongan dan waktu transaksi. Data tersebut perlu dicocokkan dengan catatan penyedia pembayaran sebelum penentuan tindak lanjut.",
        ],
      },
      {
        id: "mekanisme",
        title: "8. Mekanisme Pengembalian",
        paragraphs: [
          "Apabila pengajuan disetujui dan integrasi pembayaran tersedia, pengembalian akan diarahkan kembali ke metode pembayaran yang sama atau mengikuti prosedur yang ditentukan penyedia pembayaran. Pengembalian ke rekening/nomor lain hanya dapat dipertimbangkan bila diizinkan oleh penyedia tersebut.",
          "Biaya atau potongan yang dikenakan oleh bank/penyedia pembayaran mengikuti ketentuan masing-masing pihak.",
        ],
      },
      {
        id: "kontak-refund",
        title: "9. Kontak",
        paragraphs: [
          "Seluruh pengajuan dikirimkan melalui halaman Hubungi Kami. Alamat email dan nomor telepon resmi belum tersedia di source code proyek dan perlu dilengkapi oleh pemilik situs.",
        ],
      },
    ],
  },

  cancellation: {
    eyebrow: "Informasi Legal",
    title: "Kebijakan Pembatalan",
    lead: "Kebijakan ini menjelaskan pembatalan penggunaan layanan WA Dashboard. Karena saat ini tidak ada pemesanan atau pembayaran online, ketentuan yang menyangkut pesanan berbayar dinyatakan secara kondisional.",
    updated: site.effectiveDate,
    sections: [
      {
        id: "ruang-lingkup",
        title: "1. Ruang Lingkup",
        paragraphs: [
          "Yang dapat dibatalkan saat ini adalah penggunaan akun, device, atau permintaan dukungan yang masih diproses. Tidak ada pesanan produk fisik atau langganan berbayar yang dapat dibatalkan melalui situs ini.",
        ],
      },
      {
        id: "batas-waktu",
        title: "2. Batas Waktu Pembatalan",
        paragraphs: [
          "Belum ada batas waktu resmi yang ditetapkan untuk pembatalan. Pembatalan device dapat dilakukan kapan saja oleh administrator melalui dashboard; penghapusan device akan memutus koneksi WhatsApp lokal device tersebut.",
        ],
      },
      {
        id: "cara",
        title: "3. Cara Mengajukan Pembatalan",
        items: [
          { label: "Device", text: "Gunakan fitur hapus device pada halaman Devices di dashboard (memerlukan peran admin)." },
          { label: "Akun", text: "Hubungi administrator layanan atau kirim permintaan melalui formulir Hubungi Kami." },
          { label: "Permintaan lain", text: "Kirim keterangan melalui formulir Hubungi Kami dengan subjek \"Pembatalan\"." },
        ],
      },
      {
        id: "sebelum-pembayaran",
        title: "4. Pembatalan Sebelum Pembayaran",
        paragraphs: [
          "Karena tidak ada alur pemesanan berbayar pada situs ini, kondisi sebelum pembayaran belum tersedia. Bila fitur tersebut ditambahkan, ketentuan pembatalan sebelum pembayaran akan dijelaskan pada pembaruan kebijakan ini.",
        ],
      },
      {
        id: "sesudah-pembayaran",
        title: "5. Pembatalan Sesudah Pembayaran",
        paragraphs: [
          "Saat ini tidak ada pembayaran yang diproses situs, sehingga tidak ada pembatalan pasca-pembayaran. Jika integrasi pembayaran ditambahkan, pembatalan akan mengikuti status transaksi pada payment gateway dan kebijakan refund yang berlaku.",
        ],
      },
      {
        id: "setelah-diproses",
        title: "6. Pembatalan Setelah Layanan Diproses",
        paragraphs: [
          "Menghapus device setelah layanan berjalan akan memutus sesi WhatsApp tersimpan pada perangkat server dan menghentikan penerimaan pesan bagi device tersebut. Riwayat percakapan yang tersimpan di database tidak otomatis hilang dengan penghapusan device; penghapusan data pribadi dapat diajukan melalui kanal kontak dan diproses sesuai Kebijakan Privasi.",
        ],
      },
      {
        id: "hubungan-refund",
        title: "7. Hubungan dengan Kebijakan Refund",
        paragraphs: [
          "Pembatalan tidak otomatis menghasilkan pengembalian dana, dan pengembalian dana tidak otomatis membatalkan layanan. Keduanya diproses terpisah. Karena belum ada transaksi pembayaran di situs ini, tidak ada pengembalian dana yang dapat dijalankan saat ini; ketentuan lebih lanjut ada pada Kebijakan Pengembalian Dana.",
        ],
      },
      {
        id: "kontak-pembatalan",
        title: "8. Kontak",
        paragraphs: [
          "Gunakan halaman Hubungi Kami untuk permintaan pembatalan akun atau pertanyaan lebih lanjut. Informasi kontak resmi belum tersedia di source code proyek dan perlu dilengkapi oleh pemilik situs.",
        ],
      },
    ],
  },
};

// FAQ ----------------------------------------------------------------------
export const faqGroups = [
  {
    title: "Pemesanan & Pembayaran",
    items: [
      {
        q: "Bagaimana cara melakukan pemesanan?",
        a: "Saat ini situs ini tidak menyediakan katalog produk atau pemesanan online. Penggunaan dimulai ketika administrator membuat akun dan Anda menautkan device WhatsApp melalui QR di dashboard. Bila paket berbayar tersedia di masa depan, alur pemesanan akan dijelaskan di sini.",
      },
      {
        q: "Bagaimana cara melakukan pembayaran?",
        a: "Belum tersedia. Tidak ada integrasi payment gateway atau instruksi pembayaran pada source code proyek ini. Jika Anda memiliki transaksi di luar situs, hubungi pihak yang menerima dana tersebut.",
      },
      {
        q: "Metode pembayaran apa yang tersedia?",
        a: "Belum ada metode pembayaran yang dipampilkan atau diproses oleh situs ini. Informasi metode pembayaran baru dapat ditampilkan setelah integrasi pembayaran benar-benar diterapkan.",
      },
    ],
  },
  {
    title: "Penggunaan Layanan",
    items: [
      {
        q: "Bagaimana saya mulai menggunakan dashboard?",
        a: "Masuk dengan akun yang dibuat administrator, lalu buka menu Devices untuk menautkan nomor WhatsApp melalui kode QR. Setelah status device terhubung, pesan masuk akan tampil di Inbox.",
      },
      {
        q: "Bagaimana cara mengirim pesan lewat API?",
        a: "Gunakan kunci device (instance_key) sebagai header X-Api-Key pada endpoint /api/message/*. Dokumentasi lengkap dan contoh request tersedia pada halaman Dok API di dashboard.",
      },
      {
        q: "Apakah pesan media didukung?",
        a: "Ya. Dashboard dan API mendukung teks, gambar, video, audio, voice note, stiker, dan dokumen sesuai batas ukuran yang dikonfigurasi (MEDIA_MAX_MB).",
      },
    ],
  },
  {
    title: "Status, Kendala & Dukungan",
    items: [
      {
        q: "Bagaimana cara memeriksa status pembayaran?",
        a: "Fitur status pembayaran belum tersedia karena situs belum memproses pembayaran. Untuk status pembayaran eksternal, periksa kanal resmi penyedia pembayaran yang Anda gunakan.",
      },
      {
        q: "Apa yang harus dilakukan jika pengiriman pesan gagal?",
        a: "Periksa status device pada menu Devices. Device harus online dan tersambung. Jika masih gagal, periksa koneksi server dan sertakan waktu serta pesan error saat menghubungi dukungan.",
      },
      {
        q: "Bagaimana jika pesan berhasil dikirim tetapi tidak tampil di Inbox?",
        a: "Pesan yang dikirim melalui API ikut tampil di Inbox setelah proses pengiriman selesai. Bila tidak muncul, muat ulang Inbox dan periksa status pesan. Jika tetap bermasalah, kirim detail waktu dan nomor tujuan melalui formulir kontak.",
      },
      {
        q: "Bagaimana cara mengajukan refund?",
        a: "Buka halaman Kebijakan Pengembalian Dana untuk melihat kriteria dan data yang harus disertakan, lalu kirim pengajuan melalui formulir di halaman Hubungi Kami. Karena belum ada transaksi online di situs ini, semua pengajuan tetap diverifikasi manual.",
      },
      {
        q: "Bagaimana cara menghubungi customer service?",
        a: "Gunakan formulir pada halaman Hubungi Kami. Pesan yang Anda kirim akan tersimpan di server dan mendapat nomor referensi. Data email dan telepon resmi belum tersedia di source code proyek dan perlu dilengkapi oleh pemilik situs.",
      },
    ],
  },
];
