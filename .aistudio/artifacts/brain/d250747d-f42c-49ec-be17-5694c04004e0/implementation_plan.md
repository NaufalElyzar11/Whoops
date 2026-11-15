# WHOOPS! — Korean Retro Photobooth & Admin Studio

Aplikasi web photobooth interaktif bergaya Korean retro 6-cut yang terhubung real-time antara **Booth Pelanggan** dan **Admin Dashboard** menggunakan Firebase Cloud Firestore, lengkap dengan kanvas gambar doodle bawaan, unggah PNG, ekspor cetak 4R 300 DPI, serta halaman unduh via kode QR yang dapat dipindai dari ponsel.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Pilihan arsitektur dan pengalaman pengguna berikut telah dikonfirmasi berdasarkan jawaban Anda pada tahap klarifikasi dan menjadi acuan utama implementasi:

- **Sinkronisasi Cloud Lintas Perangkat**: Menggunakan **Firebase Firestore** dan **Firebase Authentication (Google Login)** agar pesanan dari perangkat Booth langsung muncul secara real-time di perangkat Kasir / Artist / Admin, serta dapat diakses oleh halaman unduh QR pelanggan.
- **Pemenuhan Doodle Custom**: Tab *Doodle Queue* di Admin Dashboard menyediakan **Kanvas Gambar Doodle Bawaan** (kuas freehand, pilihan warna, ukuran goresan, penghapus, *undo*, serta stempel stiker lucu) sekaligus **Unggah File PNG** (overlay transparan atau hasil jadi).
- **Output Akhir Pelanggan**: Setelah pembayaran terverifikasi (dan doodle selesai untuk paket doodle), pelanggan memperoleh **Kode QR yang dapat dipindai** menuju halaman unduh khusus yang responsif di ponsel, serta tombol unduh langsung **PNG 4R 300 DPI (`1205 × 1795 px`)**.
- **Bahasa Antarmuka**: Seluruh antarmuka Booth, halaman unduh QR, dan Admin Dashboard menggunakan **Bahasa Indonesia** sesuai prototipe **WHOOPS!**.

---

## 1. Overview & Core Concept

- **What It Does**: Mengubah prototipe statis **WHOOPS!** menjadi platform operasional photobooth yang lengkap dan persisten. Pelanggan memilih paket dan frame 6-slot, memotret atau memakai pose demo, menyusun foto ke 6 slot beserta filter/kecerahan/mirror, membayar via QRIS statis, lalu menunggu verifikasi real-time hingga foto 300 DPI 4R siap diunduh lewat scan QR. Di sisi lain, Admin memverifikasi pembayaran, menggambar atau mengunggah doodle di atas foto asli pelanggan, mengekspor file siap cetak 4R, serta mengelola harga paket dan koleksi frame.
- **Target Audience / Persona**:
  1. **Pelanggan Photobooth**: Pengguna di booth/kios layar sentuh maupun desktop yang menginginkan alur foto cepat, menyenangkan, dan hasil cetak/digital instan.
  2. **Kasir & Operator Studio (Admin)**: Staf yang memantau pesanan masuk, memverifikasi mutasi QRIS, mengelola antrean cetak 4R, serta mengatur katalog paket dan frame.
  3. **Doodle Artist (Admin)**: Ilustrator yang mengunduh foto asli 300 DPI atau langsung menggambar doodle custom di kanvas bawaan di atas foto pelanggan.
- **Key Value**: Menghilangkan jeda sinkronisasi antarperangkat, mempercepat pengerjaan *Photo + Doodle* tanpa harus keluar dari dashboard untuk menggambar sederhana, dan memberikan pengalaman unduh QR yang nyata pada ponsel pelanggan.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Alur Booth Pelanggan (Bahasa Indonesia)**:
   - **Welcome**: Identitas visual *wordmark* miring warna-warni **w-h-o-o-p-s!**, slogan *"oops, we made a memory."*, tombol utama `START PHOTO SESSION`, dan ringkasan 4 langkah layanan di bagian bawah.
   - **Pilih Paket**: Memuat daftar paket aktif (`PHOTO ONLY`, `PHOTO + DOODLE`, `PHOTO + DOODLE + PRINT`) dan biaya tambahan cetak 4R secara *live* dari Firestore.
   - **Pilih Frame**: Menampilkan galeri frame 6-slot aktif (frame vektor bawaan maupun frame PNG custom yang diunggah Admin) dengan rasio presisi 4R (`1205:1795`).
   - **Kamera & Jepret**: Akses webcam langsung (`getUserMedia`) dengan opsi *Mirror Layar*, *Simpan Mirrored*, hitung mundur 3 detik, serta tombol `+ Ambil Pose Demo` dan `Isi Cepat 6 Pose Demo` agar tetap dapat diuji tanpa perangkat kamera fisik.
   - **Editor 6-Slot**: Kanvas 6-slot di sisi kiri dan baki foto + panel edit di sisi kanan. Mendukung *drag-and-drop* dari galeri ke slot, tukar foto antarslot dengan menyeret, serta mode ketuk (*tap-to-assign*) untuk layar sentuh. Setiap slot memiliki 8 pilihan filter, *slider* kecerahan (`-40` s.d. `+40`), *mirror* per slot, *reset*, dan hapus.
   - **Final Preview & Checkout QRIS**: Merender pratinjau komposit resolusi penuh, menyediakan *add-on* cetak 4R untuk `PHOTO ONLY`, kolom catatan tema doodle untuk paket doodle, serta tampilan QRIS statis. Menekan `SUDAH BAYAR` mengirim pesanan ke Firestore dan menampilkan layar status *real-time*.
   - **Layar Selesai & Kode QR**: Saat status terverifikasi dan selesai, sistem menampilkan kode QR nyata yang mengarah ke URL aplikasi dengan parameter unduhan pesanan, disertai tombol unduh langsung `PNG 300 DPI (1205×1795)`.

2. **Halaman Unduh QR Pelanggan (Mobile-First)**:
   - Saat kode QR dipindai dari ponsel pelanggan, aplikasi langsung membuka tampilan unduh khusus untuk kode pesanan tersebut tanpa perlu login, menampilkan hasil akhir foto 4R dan tombol satu ketukan untuk menyimpan file PNG.

3. **Alur Admin Dashboard (Login Google)**:
   - **Orders**: Tabel pesanan *real-time* dengan pencarian kode pesanan, filter status pembayaran, angka tabular untuk nominal Rupiah dan waktu, serta aksi `VERIFIKASI` / `TOLAK`.
   - **Doodle Queue & Upload**: Daftar pesanan doodle terverifikasi lengkap dengan catatan permintaan pelanggan. Menyediakan tombol unduh foto asli 300 DPI, **Studio Kanvas Doodle Bawaan** (menggambar langsung di atas pratinjau foto dengan kuas, warna, stiker bintang/hati/pita, *undo*, dan bersihkan), serta **Unggah PNG** untuk menimpa *layer* doodle di atas foto asli dan memperbarui status otomatis.
   - **Print Queue**: Antrean cetak 4R terverifikasi dengan tombol ekspor file siap cetak `1205×1795 px` (300 DPI) dan konfirmasi `Sudah Dicetak`.
   - **Service & Packages**: Pengaturan biaya tambahan cetak 4R, nama paket, label promo, deskripsi, harga digital, dan sakelar aktif/nonaktif.
   - **Frames**: Pengelolaan frame aktif/nonaktif serta formulir tambah frame baru (kustomisasi warna vektor atau unggah bingkai PNG transparan 6-slot).

### Visual Identity & Theme

- **Aesthetic Direction**: Korean Retro Photobooth Studio — hangat, taktil, bermain-main di sisi Booth, namun rapi, terstruktur, dan berdensitas informasi tinggi di sisi Admin Dashboard.
- **Color Palette & Mood (60-30-10)**:
  - *60% Dominant Neutral Canvas*: Cream kertas hangat (`#FDF7EE`) sebagai latar utama.
  - *30% Structural Surfaces*: Beige lembut (`#EFE2CE`) dan Dusty Pink Soft (`#F3D2DB`) untuk permukaan panel, header tabel, dan kontrol sekunder, dibatasi garis tegas Dark Brown (`#3A231E`).
  - *10% Focal Accent*: Burgundy (`#6D1D3A`) untuk tombol aksi utama, indikator aktif, dan penekanan harga; dipadukan status semantik berlabel teks eksplisit (hijau untuk terverifikasi, kuning/amber untuk menunggu, merah/burgundy untuk ditolak).
- **Typography & Hierarchy**:
  - *Display*: `Fredoka` (tebal, membulat, ramah untuk judul langkah dan tombol).
  - *Body*: `DM Sans` (bersih dan terbaca di ukuran 13px–16px).
  - *Handwritten Accent*: `Gaegu` untuk slogan dan detail retro di frame.
  - *Tabular Figures*: `tabular-nums` pada seluruh nominal Rupiah, kode pesanan, dan stempel waktu di Admin Dashboard agar kolom sejajar presisi.
- **Component Styling & Anti-Slop Discipline**:
  - Top bar bersih satu baris dengan merek **whoops!**, navigasi/status langkah ringkas tanpa tumpukan *pill* dekoratif, dan satu tombol pengalih mode / masuk Admin.
  - Metadata kartu menggunakan pemisah tipografi halus (`·`), tanpa tumpukan kartu bersarang (*nested bordered cards*), tanpa titik status berkedip dekoratif, dan memastikan setiap tombol berlabel bahasa manusia yang jelas serta berfungsi penuh.
- **Interactive Feedback & Motion**: Transisi antarlangkah terasa responsif ($\le 200\text{ms}$ dengan properti compositor `transform`/`opacity`), hitung mundur kamera yang tegas dengan efek *shutter flash* singkat, *skeleton/loading state* saat menyinkronkan data cloud, serta notifikasi ringkas saat verifikasi, simpan paket, atau pengunggahan doodle berhasil.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Penyimpanan Media Resolusi Tinggi 300 DPI di Firestore (Chunked Media Subcollection)**
  - *Chosen Approach*: Data pesanan, status, paket, dan frame disimpan di koleksi utama Firestore agar sinkron instan, sedangkan aset gambar beresolusi 300 DPI (`originalImage` dan `finalImage`, ukuran $\pm 800\text{KB}$–$2\text{MB}$) dipecah menjadi potongan kecil ($\le 400\text{KB}$ per dokumen) dalam subkoleksi media pesanan, disertai pratinjau terkompresi ringan pada dokumen induk.
  - *Why*: Dokumen tunggal Firestore memiliki batas maksimal $1\text{MB}$. Dengan memecah biner base64 beresolusi 300 DPI ke subkoleksi media, aplikasi tetap 100% persisten di cloud dan dapat diunduh dari perangkat ponsel pelanggan lewat QR code tanpa memerlukan layanan penyimpanan eksternal terpisah.
  - *Alternatives Considered*: Menyimpan gambar di `localStorage` (gagal saat dipindai dari ponsel lain) atau menurunkan resolusi ke thumbnail kecil (mengorbankan kualitas cetak 4R 300 DPI).

- **Decision 2 — Kanvas Doodle Dual-Mode (Gambar Bawaan + Unggah PNG)**
  - *Chosen Approach*: Di dalam modal pengerjaan doodle Admin, foto asli pelanggan dijadikan lapisan dasar (*background layer*), sedangkan goresan kuas dan stiker artist digambar pada *overlay canvas* transparan di atasnya. Artist juga dapat mengunggah file PNG eksternal (baik PNG overlay transparan maupun PNG hasil jadi) yang langsung digabungkan ke kanvas 300 DPI (`1205 × 1795`).
  - *Why*: Memberi fleksibilitas penuh—doodle ringan dapat diselesaikan langsung di browser dalam hitungan detik, sementara ilustrasi rumit dari tablet gambar/Procreate tetap bisa diunggah sebagai PNG berkualitas tinggi.

- **Decision 3 — Akses Booth Kiosk vs Keamanan Admin Dashboard**
  - *Chosen Approach*: **Admin Dashboard** wajib login menggunakan Google (`signInWithPopup`) dan divalidasi oleh aturan keamanan Firestore terhadap daftar admin terverifikasi (termasuk email admin bawaan). Sementara itu, **Booth Pelanggan** dan **Halaman Unduh QR** beroperasi tanpa memaksa pelanggan login Google, dengan aturan Firestore yang membatasi pelanggan hanya dapat *membuat* pesanan baru berstatus awal `PENDING_VERIFICATION` dan *membaca satu dokumen* pesanan spesifik miliknya (tanpa akses `list` ke daftar pesanan pelanggan lain).
  - *Why*: Pelanggan di photobooth atau yang memindai QR di ponselnya tidak mungkin diminta login akun Google terlebih dahulu, namun data operasional, daftar pesanan seluruh pelanggan, verifikasi pembayaran, dan konfigurasi harga tetap terlindungi penuh oleh autentikasi Admin.

- **Decision 4 — Kode QR Scannable Tanpa Ketergantungan API Eksternal**
  - *Chosen Approach*: Menghasilkan matriks kode QR standar ISO secara lokal di sisi klien (library generator QR ringan atau modul SVG/Canvas deterministik) yang mengarah ke URL aplikasi aktif (`window.location.origin + '/?download=' + orderId`).
  - *Why*: Menjamin QR code selalu terender instan bahkan di jaringan lambat tanpa bergantung pada layanan pihak ketiga yang berisiko terblokir.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                      WHOOPS! WEB APPLICATION (React + TS)                 │
├─────────────────────────────┬──────────────────────┬──────────────────────┤
│   PHOTOBOOTH KIOSK FLOW     │  QR DOWNLOAD VIEW    │   ADMIN DASHBOARD    │
│   (Public Customer Mode)    │  (?download=<id>)    │   (Google Auth)      │
│                             │                      │                      │
│  Welcome ──▶ Paket & Frame  │  Fetch Order &       │  Orders (Verify/Rej) │
│     │                       │  Reassemble 300 DPI  │  Doodle Canvas + PNG │
│     ▼                       │  4R Composite        │  Print Queue (4R)    │
│  Kamera (Webcam / Demo)     │     │                │  Packages & Pricing  │
│     │                       │     ▼                │  Frame Manager       │
│     ▼                       │  1-Tap Save PNG      │                      │
│  Editor 6-Slot & Filter     │                      │                      │
│     │                       │                      │                      │
│     ▼                       │                      │                      │
│  Preview 300 DPI & QRIS     │                      │                      │
│  ──▶ Live Status + QR Code  │                      │                      │
└──────────────┬──────────────┴──────────┬───────────┴──────────┬───────────┘
               │                         │                      │
               ▼                         ▼                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│              CLIENT CANVAS ENGINE & QR GENERATOR (In-Browser)             │
│  • 4R 300 DPI Renderer (1205×1795)   • Doodle Layer Compositor (Canvas)   │
│  • 6-Slot Filter/Brightness/Mirror   • Local QR Code Matrix SVG/Canvas    │
└────────────────────────────────────────┬──────────────────────────────────┘
                                         │
                                         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                 FIREBASE CLOUD (Firestore + Google Auth)                  │
│  • /settings/store      (printAddonPrice, store metadata)                 │
│  • /packages/{pkgId}    (paket layanan, harga digital, promo, aktif)      │
│  • /frames/{frameId}    (koleksi frame vektor / PNG overlay, aktif)       │
│  • /orders/{orderId}    (kode pesanan, status bayar, workflow, preview)   │
│    └─ /media/{chunkId}  (potongan gambar 300 DPI asli & hasil doodle)     │
│  • /admins/{uid}        (hak akses admin terverifikasi)                   │
└───────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

- **Settings (`settings/store`)**: Menyimpan `printAddonPrice` (angka), diperbarui Admin dan dibaca secara *real-time* saat Booth menghitung harga paket dan *checkout*.
- **Packages (`packages/{pkgId}`)**: Menyimpan `code`, `name`, `description`, `promoText`, `digitalPrice`, `includesDoodle`, `includesPrint`, `isActive`, `sortOrder`. Disediakan *seeding* awal otomatis oleh Admin/inisialisasi apabila koleksi masih kosong agar langsung siap pakai.
- **Frames (`frames/{frameId}`)**: Menyimpan `name`, `category`, `type` (`vector` | `image`), warna tema (`bg`, `trim`, `labelColor`) atau `overlayImageData`, daftar koordinat 6 slot, serta status `active`.
- **Orders (`orders/{orderId}`)**: Menyimpan `orderCode` (mis. `WHP-4821`), `packageId`, `packageName`, `frameId`, `includesDoodle`, `wantsPrint`, `doodleNotes`, `totalAmount`, `paymentStatus` (`PENDING_VERIFICATION` | `VERIFIED` | `REJECTED`), `printStatus` (`NOT_APPLICABLE` | `QUEUED` | `PRINTED`), `workflowStatus`, `previewThumbUrl` (thumbnail ringan untuk tabel/antrean), `doodleDone`, `createdAt`, dan `updatedAt`.
- **Order Media Subcollection (`orders/{orderId}/media/{chunkId}`)**: Menyimpan potongan base64 resolusi 300 DPI (`kind`: `'original'` | `'final'`, `index`, `totalChunks`, `data`) sehingga proses unduh QR maupun ekspor cetak Admin selalu menghasilkan gambar tajam `1205 × 1795 px`.

### Interactive Component & State Mapping

- **Routing & Mode Switching**: Aplikasi memeriksa parameter query `?download=<orderId>` saat dimuat untuk langsung membuka halaman unduh QR pelanggan secara mandiri. Navigasi header memungkinkan peralihan antara mode *Booth* dan *Admin Dashboard* (yang meminta login Google terverifikasi jika belum masuk).
- **Real-Time Listeners (`onSnapshot`)**:
  - Booth berlangganan koleksi `packages` (aktif) dan `frames` (aktif), serta dokumen tunggal `orders/{currentOrderId}` setelah `SUDAH BAYAR` ditekan agar layar berubah otomatis begitu Admin melakukan verifikasi atau menyelesaikan doodle.
  - Admin berlangganan koleksi `orders`, `packages`, `frames`, dan `settings/store` sehingga setiap pesanan baru muncul tanpa *refresh* halaman.
- **Error Handling & Resilience**: Seluruh operasi baca/tulis Firestore dibungkus *error handler* terstruktur sesuai standar Firebase, dilengkapi status muat (*loading state*), keadaan kosong (*empty state*), serta pesan kesalahan ramah dalam Bahasa Indonesia apabila akses ditolak atau koneksi terganggu.
- **Firebase Provisioning & Security Rules**: Setelah rencana ini disetujui, langkah awal eksekusi adalah memproses penyediaan proyek Firebase (Firestore + Google Auth), menyusun `firebase-blueprint.json` dan aturan keamanan `firestore.rules` dengan validasi tipe, batas ukuran string, dan perlindungan PII/admin, lalu memvalidasinya sebelum implementasi UI dimulai.
