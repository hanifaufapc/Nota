# Nota Masjid — Panduan Milestone Implementasi

Gunakan panduan milestone ini secara berurutan sesuai [`IMPLEMENTATION_PLAN.md`](file:///d:/Nota/IMPLEMENTATION_PLAN.md).

## Aturan Operasi Global

1. Baca `AGENTS.md`, `PRD.md`, `DESIGN_BRIEF.md`, `ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`, dan `HANDOFF.md` sebelum memulai setiap milestone.
2. **Nota** adalah aplikasi manajemen keuangan masjid *local-first* tanpa login, tanpa server, tanpa integrasi bank/QRIS otomatis, dan tanpa ketergantungan AI.
3. Jaga pemisahan tegas antara **Lokasi Penyimpanan Kas (`CashAccount`)** dan **Peruntukan Amanah Dana (`Fund`)**.
4. Semua nominal uang menggunakan bilangan bulat Rupiah (`integer IDR`).
5. Terapkan mekanisme **Soft Guard (Peringatan Tegas dengan Konfirmasi Bendahara)** ketika pengeluaran melebihi saldo Dana/Kas atau membebani Dana Terikat (`restricted`) di luar peruntukannya.
6. Navigasi utama memiliki 6 tab dengan tanggung jawab unik: `Ringkasan`, `Transaksi`, `Kas & Dana`, `Anggaran / RAB`, `Laporan`, dan `Pengaturan`.
7. Ekspor & pemulihan cadangan data lokal hanya ditempatkan di `Pengaturan → Data & Cadangan`.

---

## Ringkasan Urutan Milestone

- **Milestone M1**: Model Domain Keuangan Masjid (`CashAccount`, `Fund`, `CashTransfer`, `BudgetPlan`, `MosqueReport`, *Soft Guard*), Skema Dexie `v5`, Repositori, & Backup `v1–v5`.
- **Milestone M2**: Kerangka Navigasi 6-Tab (`AppShell`), Onboarding Masjid, & Halaman `Kas & Dana` (termasuk Mutasi Antar-Kas).
- **Milestone M3**: Dashboard `Ringkasan` Masjid & Jurnal `Transaksi` (Filter Kas/Dana & Konfirmasi *Soft Guard*).
- **Milestone M4**: Halaman `Anggaran / RAB` (Anggaran Operasional Bulanan & RAB Kegiatan Multi-Pos vs Realisasi).
- **Milestone M5**: Halaman `Laporan` Pertanggungjawaban Jamaah (Preset Jumat/7 Hari, Bulanan, Kustom, Cetak `@media print`, CSV) & Halaman `Pengaturan` (`Profil Masjid`, `Kategori`, `Data & Cadangan`).
