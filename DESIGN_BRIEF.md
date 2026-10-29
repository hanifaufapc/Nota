# Design Brief: Nota — Manajemen Keuangan Masjid

**Status:** Arah visual utama untuk seluruh halaman Nota Masjid  
**Referensi utama:** `references/nota-visual-reference.png`

---

## 1. Karakter Desain

Nota untuk pengelolaan keuangan masjid memadukan ketenangan ruang kerja modern dengan wibawa dan keterbukaan pembukuan publik jamaah: bersih, terang, jujur, dan sangat mudah dipindai oleh pengurus DKM maupun jamaah.

Palet hijau zamrud (`--nota-emerald`), aksen *lime* (`--nota-lime`), permukaan hijau lembut (`--nota-soft-green`), dan latar *warm off-white* (`--nota-bg`) dari referensi visual dipertahankan penuh karena memberikan kesan sejuk, amanah, dan profesional tanpa terlihat seperti template dashboard admin generik.

### Kata Kunci
- **Amanah & Transparan** — angka, peruntukan dana, dan saldo kas terbaca jelas tanpa kerancuan.
- **Premium namun Bersahaja** — tipografi tajam, ruang kosong lega, tanpa dekorasi berlebihan.
- **Tegas Membedakan Konteks** — jelas membedakan *Lokasi Kas* (tempat uang disimpan) dan *Dana Masjid* (peruntukan amanah).
- **Siap Diumumkan** — halaman `Laporan` dapat langsung dicetak menjadi lembar pengumuman kas masjid yang rapi.

---

## 2. Token Visual

### Warna
- `--nota-emerald: #176B52` — warna identitas utama, tindakan primer, indikator penerimaan, dan *Dana Operasional Umum*.
- `--nota-lime: #A8EB68` — aksen terang khusus untuk **satu** area fokus per tampilan (mis. kartu arus kas periode pada `Ringkasan` atau indikator tab aktif).
- `--nota-soft-green: #DDECE4` — permukaan lembut untuk *badge* positif, ringkasan aman, dan latar informasi pendukung.
- `--nota-bg: #F7F7F2` — latar kanvas aplikasi *warm off-white*.
- `--nota-surface: #FFFFFF` — permukaan kartu/panel konten utama.
- `--nota-ink: #222824` — teks utama kontras tinggi.
- `--nota-muted: #747D76` — teks sekunder dan label penjelas.
- `--nota-border: #E6E9E4` — garis pemisah halus.
- `--nota-expense: #B42318` (beserta permukaan lembut `--nota-expense-soft`) — pengeluaran, defisit, dan peringatan tegas (*Soft Guard*).

### Pembeda Visual Dana Umum vs Dana Terikat
- **Dana Operasional Umum (`unrestricted`)**: menggunakan *badge* bernuansa `nota-soft-green` dengan teks `nota-emerald` (`Dana Umum`).
- **Dana Terikat / Amanah (`restricted` — Pembangunan, Sosial/Zakat)**: menggunakan *badge* tegas berbingkai `nota-ink/20` atau aksen khusus (`Dana Terikat · Amanah`) agar bendahara selalu sadar bahwa dana tersebut memiliki peruntukan khusus.

### Tipografi & Angka
- Gunakan *system sans-serif stack* yang cepat dan bersih.
- Semua angka nominal Rupiah wajib memakai `tabular-nums` agar rata kanan/kolom sejajar sempurna pada daftar transaksi dan tabel laporan.
- Jangan menyingkat nominal laporan menjadi `"Rp 1,5 Jt"` pada tabel pembukuan atau laporan jamaah; tampilkan angka Rupiah utuh (`Rp 1.500.000`).

---

## 3. Arsitektur Visual 6 Halaman Utama (Anti-Duplikasi)

Setiap halaman utama dalam navigasi (`Ringkasan`, `Transaksi`, `Kas & Dana`, `Anggaran / RAB`, `Laporan`, `Pengaturan`) wajib memiliki komposisi visual yang berbeda sesuai fungsinya:

1. **`Ringkasan` (Executive Mosque Overview)**
   - **Atas (Hero 2-Kolom Asimetris)**:
     - Kiri (7 kolom): **Total Kas Masjid Saat Ini** dengan rincian terpilah antara *Dana Operasional Umum* dan *Total Dana Terikat (Pembangunan & Sosial/Zakat)*, disertai tombol cepat `+ Catat Penerimaan` dan `− Catat Pengeluaran`.
     - Kanan (5 kolom, Aksen Lime): **Arus Kas Periode Ini** (`Selisih Periode`, `Total Penerimaan`, `Total Pengeluaran`).
   - **Tengah**: Ringkasan Posisi Kas (`Kas Tunai` vs `Rekening Bank Tercatat`) & Posisi 3 Dana Masjid berdampingan dengan proporsi arus kas kategori.
   - **Bawah**: Pratinjau 5 Transaksi Terakhir dengan pintasan ke `Transaksi` dan `Laporan`.

2. **`Transaksi` (Buku Jurnal Kas Masjid)**
   - Tidak mengulang kartu Hero besar.
   - Dibuka langsung dengan **Bar Konteks Ringkas** (1 baris) dan **Panel Pencarian & Filter Multi-Dimensi** (Periode, Jenis, Lokasi Kas, Dana, Kategori, Urutan).
   - Tabel/daftar baris transaksi menampilkan: Tanggal, Kategori, Badge Dana, Badge Lokasi Kas, Catatan/Donatur/No. Bukti, Nominal (`+`/`−`), serta tombol Edit & Hapus.

3. **`Kas & Dana` (Manajemen Tempat Uang & Amanah Dana)**
   - **Area 1 — Lokasi Penyimpanan Kas (`CashAccount`)**: Kartu posisi *Kas Tunai* dan *Rekening Bank Tercatat* beserta saldo awal, total mutasi, dan saldo akhir masing-masing.
   - **Area 2 — Dana Masjid (`Fund`)**: Kartu posisi *Dana Operasional Umum*, *Dana Pembangunan*, dan *Dana Sosial / Zakat* lengkap dengan status *Umum* vs *Terikat*.
   - **Area 3 — Mutasi Antar-Kas (`CashTransfer`)**: Form dan riwayat perpindahan uang antar-lokasi kas (mis. setor tunai kotak Jumat ke rekening bank tercatat).

4. **`Anggaran / RAB` (Rencana Anggaran Biaya Operasional & Kegiatan)**
   - Menampilkan daftar RAB aktif (mis. *Anggaran Operasional Bulanan* atau *RAB Kegiatan Ramadan / Idul Adha / Renovasi*).
   - Menyajikan perbandingan visual antara **Rencana Anggaran**, **Realisasi Aktual**, dan **Sisa / Selisih Anggaran** per pos (`BudgetLineItem`) menggunakan *progress bar* yang informatif.

5. **`Laporan` (Lembar Pertanggungjawaban Jamaah — Siap Cetak)**
   - **Bar Kontrol Laporan (Tidak ikut tercetak saat `@media print`)**: Pemilih preset periode (*Laporan Kas Jumat / 7 Hari*, *Laporan Bulanan*, *Rentang Tanggal Kustom*), filter Dana, tombol `Cetak / Simpan PDF`, dan `Ekspor CSV Laporan`.
   - **Kertas Kerja Laporan Masjid**:
     - Kop Identitas Masjid (Nama Masjid, Alamat, Judul Laporan, dan Periode Tanggal).
     - Ringkasan Eksekutif: `Saldo Awal Periode`, `Total Penerimaan`, `Total Pengeluaran`, dan `Saldo Akhir Periode`.
     - Tabel Rincian Posisi per Dana (*Saldo Awal → Penerimaan → Pengeluaran → Saldo Akhir* untuk tiap Dana).
     - Tabel Rincian Penerimaan & Pengeluaran per Kategori.
     - Rincian Posisi Penyimpanan Kas Akhir (*Kas Tunai* + *Rekening Bank Tercatat*).
     - Blok Tanda Tangan Pengesahan (`Mengetahui, Ketua DKM` dan `Dibuat oleh, Bendahara`).

6. **`Pengaturan` (`Profil Masjid`, `Kategori`, `Data & Cadangan`)**
   - Tersusun bersih menjadi 3 panel administratif:
     1. **Profil & Pengurus Masjid** (Nama Masjid, Alamat, Nama Ketua DKM, Nama Bendahara).
     2. **Manajemen Kategori Masjid** (Daftar kategori penerimaan & pengeluaran beserta dana bawaannya).
     3. **Data & Cadangan (`BackupRestoreSection`)**: satu-satunya lokasi untuk ekspor/impor cadangan JSON dan ekspor CSV seluruh data.

---

## 4. Aturan Responsif & Cetak (`@media print`)

- **Mobile (`320px–767px`)**: Navigasi 6 item harus tetap nyaman dijangkau (menggunakan *scrollable/wrapping pill bar* yang rapi tanpa memotong teks), dan tabel laporan/transaksi beradaptasi tanpa *horizontal page overflow*.
- **Mode Cetak (`@media print`)**: Saat pengguna menekan `Cetak / Simpan PDF` pada halaman `Laporan`, sembunyikan header navigasi aplikasi, tombol filter, dan elemen kontrol (`print:hidden`), serta tampilkan lembar laporan kas masjid dengan latar putih bersih, tipografi tajam, dan tabel berbingkai rapi siap tempel di papan informasi masjid atau dibagikan sebagai PDF.

---

## 5. Microcopy Bahasa Indonesia yang Konsisten

Gunakan istilah yang akrab bagi pengurus DKM dan jamaah:
- `Total Kas Masjid`
- `Dana Operasional Umum` / `Dana Terikat (Amanah)`
- `Kas Tunai` / `Rekening Bank Tercatat`
- `Catat Penerimaan` / `Catat Pengeluaran`
- `Mutasi Antar-Kas`
- `Anggaran / RAB`
- `Laporan Kas Jumat (7 Hari)` / `Laporan Kas Bulanan`
- `Cetak / Simpan PDF`
- `Peringatan Penggunaan Dana Terikat` (*Soft Guard*)

Hindari istilah perbankan otomatis seperti `Hubungkan Rekening`, `Top Up Wallet`, `Transfer Antar-Bank Online`, atau `Klaim Reward`.
