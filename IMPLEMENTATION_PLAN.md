# Nota — Implementation Plan (Manajemen Keuangan Masjid)

Kerjakan secara berurutan sesuai tahapan milestone di bawah ini. Setiap milestone diakhiri dengan pemeriksaan pengujian otomatis (`typecheck`, `lint`, `test`, `build`) dan pembaruan `HANDOFF.md`.

---

## Milestone M1 — Model Domain Keuangan Masjid, Migrasi Skema v5, & Lapisan Repositori

### Ruang Lingkup
- Mendefinisikan tipe dan fungsi domain murni untuk **Keuangan Masjid** di `src/domain/`:
  - `MosqueSettings` (identitas masjid, alamat, nama Ketua DKM, nama Bendahara).
  - `CashAccount` (2 lokasi kas bawaan: *Kas Tunai* & *Rekening Bank Tercatat*).
  - `Fund` (3 dana bawaan: *Dana Operasional Umum* [`unrestricted`], *Dana Pembangunan* [`restricted`], dan *Dana Sosial / Zakat* [`restricted`]).
  - `Category` dengan kategori penerimaan & pengeluaran bawaan khas masjid beserta `defaultFundId`.
  - `Transaction` dengan atribusi `accountId`, `fundId`, `categoryId`, `budgetPlanId?`, `donorOrPayee?`, `referenceNo?`, `note?`.
  - `CashTransfer` (mutasi antar-kas yang memindahkan saldo antar `CashAccount` tanpa mengubah saldo `Fund` atau menggandakan arus kas).
  - `evaluateTransactionSoftGuard` (peringatan tegas saat pengeluaran melebihi saldo dana/kas atau lintas peruntukan dana terikat).
  - `BudgetPlan` & `BudgetLineItem` (Anggaran Operasional Bulanan & RAB Kegiatan).
  - `generateMosqueFinancialReport` (perhitungan laporan kas Jumat/7 Hari, Bulanan, dan Rentang Tanggal Kustom).
- Memperbarui Dexie (`src/data/db.ts`) ke `NOTA_SCHEMA_VERSION = 5` dengan migrasi aman dari `v1–v4`.
- Memperbarui `src/data/repositories/notaRepository.ts` dan `src/data/backup/notaBackup.ts` (`v1–v5` kompatibel).

### Acceptance Gate
- Unit test & repository test mencakup perhitungan saldo per Kas, saldo per Dana, mutasi antar-kas, *Soft Guard* dana terikat, realisasi RAB, perhitungan laporan periodik, dan kompatibilitas backup `v1–v5`.

---

## Milestone M2 — Navigasi 6-Tab (`AppShell`), Onboarding Masjid, & Halaman `Kas & Dana`

### Ruang Lingkup
- Memperbarui [`AppShell.tsx`](file:///d:/Nota/src/components/layout/AppShell.tsx) untuk mendukung 6 tab utama:
  1. `Ringkasan`
  2. `Transaksi`
  3. `Kas & Dana`
  4. `Anggaran / RAB`
  5. `Laporan`
  6. `Pengaturan`
- Memperbarui panel *onboarding* awal untuk mengisi Nama Masjid, saldo awal *Kas Tunai* & *Rekening Bank Tercatat*, serta alokasi saldo awal ke 3 Dana Masjid.
- Membangun halaman **`Kas & Dana`**:
  - Kartu posisi tiap Lokasi Kas (`CashAccount`) + tambah/edit lokasi kas.
  - Kartu posisi tiap Dana Masjid (`Fund`) dengan badge *Dana Umum* vs *Dana Terikat (Amanah)* + tambah/edit dana.
  - Formulir & riwayat **Mutasi Antar-Kas (`CashTransfer`)** (mis. setor tunai kotak Jumat ke rekening bank tercatat) lengkap dengan fitur hapus mutasi.

### Acceptance Gate
- Penambahan mutasi antar-kas mengubah saldo `Kas Tunai` dan `Rekening Bank Tercatat` secara akurat tanpa mengubah total kas masjid maupun saldo `Fund`.

---

## Milestone M3 — Halaman `Ringkasan` Masjid & Jurnal `Transaksi` dengan Soft Guard

### Ruang Lingkup
- Memperbarui halaman **`Ringkasan`**:
  - Hero 2-Kolom: Total Kas Masjid Saat Ini (terpilah menjadi *Dana Operasional Umum* vs *Dana Terikat*) + Arus Kas Periode Terpilih.
  - Ringkasan cepat posisi Lokasi Kas & Dana Masjid + visual arus kas kategori masjid.
  - 5 Transaksi Terakhir dengan badge Dana & Kas.
- Memperbarui halaman **`Transaksi`** dan modal **`TransactionFormModal`**:
  - Pilihan Lokasi Kas (`accountId`), Dana (`fundId` — otomatis terisi dari `defaultFundId` kategori namun dapat diubah), Kategori Masjid, Tanggal, Nominal IDR, Donatur/Penerima (`donorOrPayee`), Nomor Bukti (`referenceNo`), dan Catatan.
  - **Banner Konfirmasi Soft Guard**: tampil saat pengeluaran melebihi saldo Dana/Kas atau membebani Dana Terikat dengan kategori di luar peruntukannya, meminta konfirmasi eksplisit bendahara sebelum disimpan.
  - Filter multi-dimensi pada daftar transaksi: Periode, Jenis, Lokasi Kas, Dana, Kategori, dan Pencarian Kata Kunci.

### Acceptance Gate
- Alur tambah/edit/hapus transaksi masjid, pemfilteran per Dana & per Kas, serta konfirmasi *Soft Guard* berjalan akurat dan teruji.

---

## Milestone M4 — Halaman `Anggaran / RAB` Masjid

### Ruang Lingkup
- Membangun halaman khusus **`Anggaran / RAB`** (menggantikan tampilan perencanaan pribadi di UI):
  - Mendukung pembuatan **Anggaran Operasional Bulanan** maupun **RAB Kegiatan / Kepanitiaan** (mis. *RAB Ramadan*, *RAB Idul Adha*, *RAB Renovasi*).
  - Menambahkan rincian baris pos anggaran (`BudgetLineItem` rencana penerimaan/pengeluaran per kategori).
  - Menampilkan perbandingan **Rencana vs Realisasi Aktual vs Sisa Anggaran** secara visual tanpa menggandakan saldo kas masjid.

### Acceptance Gate
- Pembuatan, pembaruan, penambahan pos, dan penghapusan RAB berjalan lancar serta menghitung realisasi aktual dari transaksi yang sesuai.

---

## Milestone M5 — Halaman `Laporan` Pertanggungjawaban Jamaah & Halaman `Pengaturan`

### Ruang Lingkup
- Membangun halaman **`Laporan`**:
  - Pemilih preset periode: **Laporan Kas Jumat / 7 Hari Terakhir**, **Laporan Bulanan**, dan **Rentang Tanggal Kustom**, serta filter Dana.
  - Lembar laporan pertanggungjawaban lengkap: Kop Identitas Masjid, Ringkasan Saldo Awal → Penerimaan → Pengeluaran → Saldo Akhir, Tabel Posisi per Dana, Tabel Rincian per Kategori, Posisi Kas Akhir, dan Blok Tanda Tangan Ketua DKM & Bendahara.
  - Tombol `Cetak / Simpan PDF` (`window.print()` dengan aturan CSS `@media print` bersih) dan `Ekspor CSV Laporan`.
- Membangun halaman **`Pengaturan`**:
  - Panel **Profil & Pengurus Masjid** (Nama Masjid, Alamat, Ketua DKM, Bendahara).
  - Panel **Manajemen Kategori Masjid** (tambah, ubah nama, arsipkan kategori).
  - Panel **Data & Cadangan (`BackupRestoreSection`)**: satu-satunya lokasi untuk ekspor/impor cadangan JSON dan CSV.

### Acceptance Gate
- Seluruh 6 tab utama berfungsi penuh dengan identitas halaman yang berbeda, laporan kas siap cetak, backup/restore hanya ada di `Pengaturan → Data & Cadangan`, dan seluruh pengujian (`typecheck`, `lint`, `test`, `build`) lulus.
