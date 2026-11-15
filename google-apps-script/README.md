# Setup Google Apps Script untuk Upload Folder Google Drive WHOOPS!

Ikuti 4 langkah ini sekali saja di akun Google Drive studio:

1. Buka [https://script.google.com](https://script.google.com) dan klik **New project**.
2. Hapus seluruh isi default di `Code.gs`, lalu salin-tempel seluruh isi file [`Code.gs`](./Code.gs).
   - *(Opsional)* Isi `SCRIPT_SECRET` jika ingin memproteksi endpoint dengan password tambahan.
   - *(Opsional)* Isi `DEFAULT_ROOT_FOLDER_ID` dengan ID folder induk di Google Drive (bagian akhir URL folder Google Drive `.../folders/<ID_FOLDER>`).
3. Klik **Deploy -> New deployment**:
   - **Select type:** `Web app`
   - **Execute as:** `Me` (akun Google Drive Anda)
   - **Who has access:** `Anyone` *(wajib agar browser Kasir/Admin dapat mengunggah otomatis)*
4. Salin **Web app URL** (`https://script.google.com/macros/s/.../exec`) lalu tempel di halaman **Admin Dashboard (`/?admin=1`) -> Tab Harga, Paket & Voucher -> Integrasi Google Drive**.
