# PRD: Nota — Manajemen Keuangan Masjid Local-First

**Versi:** 2.0 (Arah Produk Keuangan Masjid)  
**Status:** Disetujui untuk implementasi bertahap  
**Nama produk:** Nota  
**Kategori:** Local-first mosque financial management web app  
**Bahasa antarmuka:** Bahasa Indonesia  
**Mata uang:** Rupiah Indonesia (IDR — bilangan bulat positif)

---

## 1. Ringkasan produk

**Nota** adalah aplikasi web *local-first* untuk membantu pengurus dan bendahara masjid (DKM / Takmir) mencatat, mengelompokkan, merencanakan (RAB), dan melaporkan keuangan masjid secara transparan kepada jamaah tanpa proses rumit.

Nota memisahkan **lokasi penyimpanan uang (`Kas / Rekening Tercatat`)** dari **peruntukan amanah dana (`Dana Masjid / Fund`)**, menyajikan ringkasan kas periode, jurnal transaksi, mutasi antar-kas, Rencana Anggaran Biaya (RAB), serta lembar laporan pertanggungjawaban siap cetak dengan desain premium minimalis yang tenang dan mudah dipahami.

Nota bukan aplikasi perbankan. Semua data kas dan rekening bank yang ada di dalam aplikasi adalah catatan pembukuan manual yang dimasukkan oleh pengurus. Produk inti berjalan sepenuhnya di perangkat/browser tanpa akun login, tanpa server, tanpa integrasi bank/QRIS otomatis, dan tanpa ketergantungan AI.

---

## 2. Masalah pengguna (Pengurus & Bendahara Masjid)

1. **Tercampurnya dana amanah**: Uang kas operasional harian sering tercampur dalam satu catatan dengan dana terikat seperti *Dana Pembangunan* atau *Dana Sosial/Zakat*, sehingga pengurus sulit mengetahui berapa saldo bebas yang benar-benar bisa dipakai untuk tagihan operasional masjid.
2. **Perpindahan uang tunai ke rekening bank**: Uang kotak infak Jumat diterima secara tunai lalu disetorkan ke rekening bank masjid; pada pencatatan sederhana hal ini sering salah dicatat sebagai pemasukan baru sehingga menggandakan laporan penerimaan.
3. **Penyusunan Laporan Kas Jumat & Bulanan memakan waktu**: Bendahara harus merekap ulang saldo awal, rincian penerimaan, rincian pengeluaran, dan posisi kas akhir setiap pekan/bulan untuk ditempel di papan pengumuman atau dibagikan ke jamaah.
4. **Pemantauan RAB Kegiatan**: Saat ada kegiatan besar (Ramadan, Idul Adha, PHBI, atau renovasi), panitia membutuhkan perbandingan jelas antara rencana anggaran (RAB) dan realisasi pengeluaran aktual.

---

## 3. Sasaran dan prinsip produk

### Sasaran
1. Pengurus memahami total kas masjid, pemisahan saldo *Dana Umum* vs *Dana Terikat*, serta arus kas periode berjalan dalam hitungan detik saat membuka `Ringkasan`.
2. Bendahara dapat mencatat penerimaan atau pengeluaran kas masjid dengan cepat beserta atribusi Lokasi Kas, Dana, Kategori, Tanggal, dan Catatan/Donatur.
3. Mutasi uang antar-lokasi kas (mis. dari *Kas Tunai* ke *Rekening Bank Tercatat*) memperbarui saldo masing-masing lokasi kas tanpa mengubah saldo Dana atau menggandakan pemasukan/pengeluaran.
4. Laporan pertanggungjawaban jamaah (Laporan Kas Jumat/Mingguan, Laporan Bulanan, dan Rentang Tanggal Kustom) dapat langsung dilihat, dicetak (`Print / PDF`), atau diekspor ke CSV.
5. Seluruh data tersimpan secara lokal di browser/perangkat (IndexedDB) dan dapat dicadangkan/dipulihkan melalui file JSON berversi secara atomik.

### Bukan sasaran (Explicit Non-Goals)
- Login, registrasi multi-user, sinkronisasi cloud otomatis, atau manajemen hak akses berbasis server.
- Koneksi API ke rekening bank asli, mutasi bank otomatis, kartu, e-wallet, atau payment gateway/QRIS.
- Kalkulator fikih/fatwa otomatis (nisab zakat personal, waris, dsb.); aplikasi berfokus pada **pembukuan penerimaan, penyimpanan, dan penyaluran dana masjid** secara transparan.
- CRM/database jamaah per kepala keluarga di luar kolom opsional nama donatur/penerima pada transaksi.
- AI sebagai syarat berjalannya fitur inti.

---

## 4. Pengguna utama

Bendahara, Ketua, atau pengurus DKM / Takmir Masjid dan Musholla yang mengelola pembukuan kas masjid pada satu perangkat kerja dan membutuhkan transparansi laporan tanpa kerumitan software akuntansi korporat.

---

## 5. Navigasi Utama & Tanggung Jawab Halaman

Aplikasi memiliki **6 destinasi navigasi utama**, masing-masing dengan tujuan, aksi primer, dan hierarki informasi yang unik:

1. **`Ringkasan`**:
   - **Tujuan**: Gambaran cepat posisi keuangan masjid saat ini.
   - **Konten Utama**: Total Kas Masjid Saat Ini (dipilah: *Dana Operasional Umum* vs *Dana Terikat*), Arus Kas Periode Terpilih (Penerimaan, Pengeluaran, Selisih), ringkasan posisi tiap Lokasi Kas & tiap Dana, serta 5 transaksi terbaru.
   - **Aksi Primer**: `+ Catat Penerimaan` dan `− Catat Pengeluaran`.
2. **`Transaksi`**:
   - **Tujuan**: Jurnal kas utama untuk mencatat, mencari, menyaring, mengedit, dan menghapus transaksi penerimaan serta pengeluaran masjid.
   - **Konten Utama**: Bar pencarian & filter multi-dimensi (Periode, Jenis, Lokasi Kas, Dana, Kategori), ringkasan padat hasil filter, dan tabel/daftar transaksi lengkap.
   - **Aksi Primer**: `+ Catat Penerimaan` dan `− Catat Pengeluaran`.
3. **`Kas & Dana`**:
   - **Tujuan**: Mengelola lokasi penyimpanan uang (`CashAccount`), peruntukan amanah dana (`Fund`), serta perpindahan uang antar-kas (`CashTransfer`).
   - **Konten Utama**: Daftar Lokasi Kas beserta saldo masing-masing, daftar Dana Masjid beserta sifatnya (*Umum* vs *Terikat*) dan saldonya, serta formulir & riwayat Mutasi Antar-Kas.
   - **Aksi Primer**: `+ Mutasi Antar-Kas`, `+ Tambah Lokasi Kas`, dan `+ Tambah Dana`.
4. **`Anggaran / RAB`**:
   - **Tujuan**: Menyusun dan memantau Anggaran Operasional Bulanan maupun Rencana Anggaran Biaya (RAB) Kegiatan/Kepanitiaan masjid terhadap realisasi transaksi aktual.
   - **Konten Utama**: Daftar dokumen RAB / Anggaran Bulanan, ringkasan target vs realisasi aktual vs sisa anggaran, serta rincian baris pos anggaran (`BudgetLineItem`).
   - **Aksi Primer**: `+ Buat RAB / Anggaran` dan `+ Tambah Pos Anggaran`.
5. **`Laporan`**:
   - **Tujuan**: Menghasilkan lembar laporan pertanggungjawaban keuangan masjid yang siap diumumkan kepada jamaah, dicetak (`@media print` / PDF), atau diekspor ke CSV.
   - **Konten Utama**: Pemilih preset periode (*Laporan Kas Jumat / 7 Hari*, *Laporan Bulanan*, *Rentang Tanggal Kustom*), filter Dana/Kas, lembar laporan terstruktur (Kop Identitas Masjid, Saldo Awal Periode, Rincian Penerimaan, Rincian Pengeluaran, Saldo Akhir per Kas & per Dana, serta kolom tanda tangan Ketua & Bendahara).
   - **Aksi Primer**: `Cetak / Simpan PDF` dan `Ekspor CSV Laporan`.
6. **`Pengaturan`**:
   - **Tujuan**: Mengelola identitas masjid, daftar kategori penerimaan/pengeluaran, serta pemeliharaan & pencadangan data lokal.
   - **Konten Utama**:
     - **Profil Masjid**: Nama Masjid/Musholla, alamat singkat, nama Ketua DKM, dan nama Bendahara (ditampilkan pada kop & pengesahan laporan).
     - **Kategori Transaksi**: Tambah, ubah nama, dan arsipkan kategori penerimaan/pengeluaran masjid.
     - **Data & Cadangan**: Satu-satunya tempat untuk Ekspor Cadangan JSON, Ekspor CSV seluruh transaksi, dan Pemulihan Cadangan JSON dengan pratinjau & konfirmasi eksplisit.

---

## 6. Model Data Konseptual

### 6.1 `MosqueSettings` (Pengaturan & Identitas Masjid)
- `mosqueName`: string (default: `"Masjid Al-Ikhlas"` atau diisi saat onboarding).
- `mosqueAddress?`: string opsional.
- `chairpersonName?`: string opsional (Ketua DKM / Takmir).
- `treasurerName?`: string opsional (Bendahara).
- `currency`: `'IDR'`.
- `onboardingCompleted`: boolean.

### 6.2 `CashAccount` (Lokasi Penyimpanan Kas / Rekening Tercatat)
- `id`: ID unik lokal.
- `name`: nama lokasi kas (contoh bawaan: `"Kas Tunai"`, `"Rekening Bank Tercatat"`).
- `kind`: `'cash' | 'bank_recorded'`.
- `openingBalance`: integer IDR `>= 0`.
- `isDefault`: boolean.
- `archivedAt?`: ISO timestamp opsional.

### 6.3 `Fund` (Dana Masjid / Peruntukan Amanah)
- `id`: ID unik lokal.
- `name`: nama dana.
- `restriction`: `'unrestricted' | 'restricted'` (*Dana Umum/Bebas* vs *Dana Terikat/Amanah*).
- `openingBalance`: integer IDR `>= 0`.
- `description?`: string opsional.
- `isDefault`: boolean.
- `archivedAt?`: ISO timestamp opsional.
- **3 Dana Bawaan (Default Funds)**:
  1. `Dana Operasional Umum` (`unrestricted`) — untuk operasional rutin, listrik, kebersihan, insentif imam/marbot, dan kegiatan umum.
  2. `Dana Pembangunan` (`restricted`) — khusus pembangunan, renovasi, dan pengadaan fasilitas/inventaris masjid.
  3. `Dana Sosial / Zakat` (`restricted`) — khusus penerimaan dan penyaluran sosial, santunan yatim/dhuafa, serta zakat.

### 6.4 `Category` (Kategori Penerimaan & Pengeluaran Masjid)
- `id`, `name`, `type: 'income' | 'expense'`, `defaultFundId?`, `color`, `iconKey?`, `isDefault`, `archivedAt?`.
- **Kategori Penerimaan Bawaan**:
  1. *Infak Kotak Jumat* (`defaultFundId`: `Dana Operasional Umum`)
  2. *Infak & Sedekah Harian* (`defaultFundId`: `Dana Operasional Umum`)
  3. *Donasi Pembangunan & Wakaf* (`defaultFundId`: `Dana Pembangunan`)
  4. *Penerimaan Zakat & Santunan Sosial* (`defaultFundId`: `Dana Sosial / Zakat`)
  5. *Donasi Kegiatan / PHBI / Ramadan* (`defaultFundId`: `Dana Operasional Umum`)
  6. *Penerimaan Masjid Lainnya* (`defaultFundId`: `Dana Operasional Umum`)
- **Kategori Pengeluaran Bawaan**:
  1. *Listrik, Air & Internet Masjid* (`defaultFundId`: `Dana Operasional Umum`)
  2. *Kebersihan & Pemeliharaan Fasilitas* (`defaultFundId`: `Dana Operasional Umum`)
  3. *Insentif / Bisyarah Imam, Khatib & Marbot* (`defaultFundId`: `Dana Operasional Umum`)
  4. *Kegiatan Ibadah, Kajian & PHBI* (`defaultFundId`: `Dana Operasional Umum`)
  5. *Pembangunan, Renovasi & Inventaris* (`defaultFundId`: `Dana Pembangunan`)
  6. *Penyaluran Zakat & Santunan Sosial* (`defaultFundId`: `Dana Sosial / Zakat`)
  7. *Operasional & Administrasi DKM* (`defaultFundId`: `Dana Operasional Umum`)

### 6.5 `Transaction` (Transaksi Penerimaan & Pengeluaran)
- `id`: ID unik lokal.
- `type`: `'income' | 'expense'`.
- `amount`: integer IDR positif (`> 0`).
- `accountId`: referensi ke `CashAccount.id`.
- `fundId`: referensi ke `Fund.id`.
- `categoryId`: referensi ke `Category.id`.
- `budgetPlanId?`: referensi opsional ke `BudgetPlan.id` (untuk mengaitkan pengeluaran/penerimaan ke RAB tertentu).
- `occurredAt`: tanggal lokal `YYYY-MM-DD`.
- `donorOrPayee?`: string opsional (nama donatur / `"Hamba Allah"` atau penerima dana).
- `referenceNo?`: string opsional (nomor bukti/kuitansi).
- `note?`: string opsional.
- `createdAt`, `updatedAt`: ISO timestamp.

### 6.6 `CashTransfer` (Mutasi Antar-Kas)
- `id`: ID unik lokal.
- `fromAccountId`: referensi `CashAccount.id` asal.
- `toAccountId`: referensi `CashAccount.id` tujuan (`fromAccountId !== toAccountId`).
- `amount`: integer IDR positif (`> 0`).
- `occurredAt`: tanggal lokal `YYYY-MM-DD`.
- `note?`: string opsional (contoh: `"Setor uang kotak Jumat ke rekening bank"`).
- `createdAt`, `updatedAt`: ISO timestamp.

### 6.7 `BudgetPlan` & `BudgetLineItem` (Anggaran Operasional & RAB Kegiatan)
- `BudgetPlan`:
  - `id`: ID unik lokal.
  - `title`: nama anggaran/RAB (contoh: `"Anggaran Operasional Oktober 2026"` atau `"RAB Kegiatan Ramadan 1448 H"`).
  - `kind`: `'monthly_operational' | 'activity_rab'`.
  - `periodStart`: `YYYY-MM-DD`.
  - `periodEnd`: `YYYY-MM-DD`.
  - `fundId?`: referensi opsional ke `Fund.id`.
  - `note?`: string opsional.
  - `items`: daftar `BudgetLineItem` (`id`, `type: 'income' | 'expense'`, `categoryId`, `description`, `plannedAmount`: integer IDR `> 0`).
  - `createdAt`, `updatedAt`: ISO timestamp.

---

## 7. Aturan Bisnis Keuangan Masjid

1. **Integer IDR Murni**: Semua nilai uang disimpan sebagai bilangan bulat Rupiah (`integer IDR`); tidak boleh menggunakan *floating-point* atau menyimpan string berformat `"Rp ..."`.
2. **Pemisahan Lokasi Kas (`CashAccount`) dan Peruntukan Dana (`Fund`)**:
   - Saldo Lokasi Kas = `openingBalance_kas + totalPenerimaan(accountId) - totalPengeluaran(accountId) + totalMutasiMasuk(toAccountId) - totalMutasiKeluar(fromAccountId)`.
   - Saldo Dana = `openingBalance_dana + totalPenerimaan(fundId) - totalPengeluaran(fundId)`.
   - Saldo awal bukan merupakan pemasukan periode berjalan.
3. **Mutasi Antar-Kas Tidak Menggandakan Arus Kas**:
   - `CashTransfer` hanya memindahkan posisi penyimpanan uang antar `CashAccount`.
   - `CashTransfer` **tidak** dihitung sebagai pemasukan maupun pengeluaran dalam laporan arus kas masjid dan **tidak** mengubah saldo `Fund`.
4. **Pengamanan Dana Terikat (Soft Guard dengan Konfirmasi Bendahara)**:
   - Apabila bendahara mencatat pengeluaran yang:
     a. Melebihi saldo tersedia pada `Fund` atau `CashAccount` yang dipilih, **atau**
     b. Menggunakan `Fund` terikat (`restricted`, seperti *Dana Pembangunan* atau *Dana Sosial / Zakat*) dengan kategori pengeluaran yang secara default milik dana lain (mis. membayar listrik operasional dari *Dana Sosial / Zakat*),
   - Maka sistem **wajib menampilkan peringatan tegas (Soft Guard)** yang menjelaskan ketidaksesuaian atau defisit saldo tersebut dan meminta konfirmasi eksplisit bendahara sebelum transaksi disimpan.
5. **Integritas Edit, Hapus, dan Arsip**:
   - Mengedit transaksi atau mutasi memperbarui record pada ID yang sama tanpa penghitungan ganda.
   - Menghapus transaksi atau mutasi langsung memperbarui seluruh ringkasan kas, dana, RAB, dan laporan.
   - Kategori, Kas, atau Dana yang sudah memiliki riwayat transaksi diarsipkan (`archivedAt`), bukan dihapus paksa, agar laporan historis tetap utuh dan bermakna.
6. **Perhitungan Laporan Periodik**:
   - Untuk periode laporan `[startDate, endDate]`:
     - `Saldo Awal Periode` = `Total Saldo Awal + Total Penerimaan (< startDate) - Total Pengeluaran (< startDate)`.
     - `Total Penerimaan Periode` = `Sum Penerimaan di dalam [startDate, endDate]`.
     - `Total Pengeluaran Periode` = `Sum Pengeluaran di dalam [startDate, endDate]`.
     - `Saldo Akhir Periode` = `Saldo Awal Periode + Total Penerimaan Periode - Total Pengeluaran Periode`.

---

## 8. Non-Functional Requirements & Risiko

- **Local-First & Offline-Ready**: Seluruh fitur berjalan tanpa koneksi internet.
- **Responsif & Siap Cetak**: Nyaman digunakan pada layar HP (`320px+`), tablet, dan laptop, serta memiliki aturan `@media print` khusus untuk mencetak lembar laporan kas masjid yang bersih tanpa elemen navigasi aplikasi.
- **Aksesibilitas**: Navigasi keyboard lengkap, *focus ring* jelas, label semantik pada seluruh form, dan penghormatan `prefers-reduced-motion`.
- **Kejujuran Penyimpanan Lokal**: IndexedDB browser tidak otomatis terenkripsi dan dapat terhapus jika data situs dibersihkan; edukasi ekspor cadangan JSON di `Pengaturan → Data & Cadangan` harus selalu jelas.
