# Setup Google Apps Script untuk Upload Folder Google Drive WHOOPS!

Ikuti langkah-langkah berikut sekali saja menggunakan akun Google Drive studio:

1. **Siapkan Folder Induk di Google Drive (Opsional tapi disarankan)**
   - Buka [https://drive.google.com](https://drive.google.com) dengan akun Google Drive studio.
   - Buat folder baru, misalnya `WHOOPS! Orders`.
   - Buka folder tersebut lalu salin URL atau ID foldernya (bagian setelah `/folders/...`, contoh: `1AbCdEfGhIjKlMnOpQrStUvWxYz`).

2. **Buat Project Google Apps Script**
   - Buka [https://script.google.com](https://script.google.com) dengan akun Google Drive yang sama, lalu klik **New project**.
   - Beri nama project, misalnya `WHOOPS Drive Uploader`.
   - Hapus seluruh isi default di `Code.gs`, lalu salin-tempel seluruh isi file [`Code.gs`](./Code.gs).
   - *(Opsional)* Isi `SCRIPT_SECRET` jika ingin membatasi akses dengan password tambahan (samakan nilainya di Admin Dashboard).
   - *(Opsional)* Isi `DEFAULT_ROOT_FOLDER_ID` dengan ID atau URL folder induk yang dibuat pada langkah 1.
   - Tekan **Save** (`Ctrl+S`).

3. **Deploy sebagai Web App dan Beri Izin Drive**
   - Klik **Deploy -> New deployment**.
   - Klik ikon gear di samping **Select type**, lalu pilih **Web app**.
   - Isi pengaturan:
     - **Description**: `WHOOPS Uploader v2`
     - **Execute as**: `Me (<email studio>)`
     - **Who has access**: `Anyone` *(wajib agar browser Kasir/Admin bisa upload otomatis tanpa login ulang ke Apps Script)*
   - Klik **Deploy**, lalu klik **Authorize access**.
   - Pilih akun Google studio. Jika muncul peringatan *"Google hasn't verified this app"*, klik **Advanced** -> **Go to WHOOPS Drive Uploader (unsafe)** -> **Allow**.

4. **Sambungkan ke Admin Dashboard WHOOPS!**
   - Salin **Web app URL** yang berakhiran `/exec` (`https://script.google.com/macros/s/.../exec`).
   - Buka **Admin Dashboard (`/?admin=1`) -> Tab Harga, Paket & Voucher -> Integrasi Google Drive**.
   - Tempel URL `/exec` ke kolom **URL Web App Google Apps Script**, isi **ID Folder Induk GDrive** (atau tempel URL foldernya langsung), lalu klik **Simpan URL Apps Script** dan tekan **Tes Koneksi Google Drive**.

> **Catatan jika memperbarui kode `Code.gs` di kemudian hari:**
> Setelah mengubah isi `Code.gs`, jangan hanya menekan Save. Klik **Deploy -> Manage deployments -> ikon pensil (Edit) -> Version: New version -> Deploy** agar perubahan langsung aktif pada URL `/exec` yang sama.
