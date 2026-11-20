# WHOOPS! Photobooth & Admin Studio

Aplikasi web photobooth untuk **WHOOPS! Photobooth Studio** (`@artisticwaves.ra`). Terdiri dari tiga tampilan dalam satu aplikasi:

- **Mode Booth (`/`)**: Dipakai di iPad/tablet di dalam booth untuk pilih frame, ambil foto, edit slot, preview 4R, pilih paket/voucher, lalu kirim pesanan ke antrean kasir.
- **Mode Kasir & Admin (`/?admin=1`)**: Dipakai di laptop/tablet meja penjaga untuk verifikasi pembayaran, memantau antrean doodle & cetak 4R, membuka QR unduh pelanggan, mengelola harga/paket/voucher/frame, serta melihat rekap omzet harian dan export CSV.
- **Halaman Unduh Pelanggan (`/?download=<orderId>`)**: Halaman fallback saat pelanggan memindai QR pesanan.

## Menjalankan Secara Lokal

Prasyarat: Node.js 18+ (atau Bun).

```bash
npm install
npm run dev
```

Perintah lain:

```bash
npm run lint   # Cek tipe TypeScript (tsc --noEmit)
npm run build  # Build produksi ke folder dist/
npm run preview
```

## Konfigurasi Firebase & Google Drive

1. **Firebase**: Konfigurasi default dibaca dari `firebase-applet-config.json` dan dapat ditimpa lewat variabel lingkungan `VITE_FIREBASE_*` (lihat `.env.example`).
2. **Firestore Security Rules**: Simpan dan deploy `firestore.rules` di Firebase Console agar aturan akses admin dan pesanan aktif.
3. **Google Drive Uploader (Apps Script)**:
   - Pasang `google-apps-script/Code.gs` di `https://script.google.com` memakai akun Google Drive studio, lalu deploy sebagai Web App (`Execute as: Me`, `Who has access: Anyone`).
   - Tempel URL Web App (dan opsional Root Folder ID) di tab **Harga, Paket & Voucher** pada Admin Dashboard.
   - Folder hasil pelanggan di Drive disetel *Anyone with the link can view* agar pelanggan bisa langsung mengunduh lewat QR tanpa login. Pastikan klien memahami bahwa foto di tautan tersebut dapat dilihat oleh siapa pun yang memegang link QR-nya.

## Checklist Uji Coba Sebelum Buka Event

1. **Uji end-to-end dengan Wi-Fi diputus**:
   - Lakukan sesi foto penuh dari booth sampai halaman Checkout.
   - Matikan Wi-Fi di perangkat booth, lalu klik **SELESAI & KIRIM KE KASIR**. Pastikan muncul pesan galat jaringan, pesanan tidak dianggap terkirim, dan foto tetap utuh.
   - Nyalakan Wi-Fi kembali, klik **COBA KIRIM ULANG KE KASIR**, pastikan pesanan muncul di meja kasir, lalu lanjutkan verifikasi, QR, dan unduh di HP pelanggan.
2. **Konfirmasi Console Firebase & Apps Script**:
   - Pastikan kuota Firestore (Spark/Blaze), email admin di `firestore.rules` / koleksi `admins`, dan deployment terbaru `Code.gs` sudah sesuai akun produksi.
3. **Catatan Skala Usaha**:
   - Untuk satu booth di acara pop-up, penjaga kasir tetap perlu mencocokkan nominal tagihan dengan paket yang dipilih (dashboard memberi penanda jika nominal di bawah harga paket tanpa voucher).
   - Jika berkembang menjadi usaha permanen atau multi-booth, aktifkan Firebase App Check, pindahkan validasi harga/voucher ke backend (Cloud Functions), dan terapkan `SCRIPT_SECRET` pada Apps Script.
