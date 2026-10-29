# Nota — Aplikasi Manajemen Keuangan Masjid Local-First

**Nota** adalah aplikasi web *local-first* untuk membantu pengurus dan bendahara masjid (DKM / Takmir) mencatat, mengelola kas & dana amanah, menyusun Rencana Anggaran Biaya (RAB), serta mencetak laporan pertanggungjawaban keuangan masjid secara transparan kepada jamaah.

## Dokumen Sumber Kebenaran (Source of Truth)

- [`PRD.md`](PRD.md): Kebutuhan produk keuangan masjid, pemisahan Lokasi Kas (`CashAccount`) dan Dana Masjid (`Fund`), aturan *Soft Guard* dana terikat, RAB, serta spesifikasi Laporan Kas Jumat & Bulanan.
- [`DESIGN_BRIEF.md`](DESIGN_BRIEF.md): Arahan visual, arsitektur informasi 6 tab utama (`Ringkasan`, `Transaksi`, `Kas & Dana`, `Anggaran / RAB`, `Laporan`, `Pengaturan`), serta aturan cetak `@media print`.
- [`ARCHITECTURE.md`](ARCHITECTURE.md): Arsitektur teknis React + TypeScript + Vite + Tailwind CSS v4 + Dexie (`NOTA_SCHEMA_VERSION = 5`), batas repositori, dan rumus domain murni.
- [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md): Urutan implementasi Milestone M1 s.d. M5 beserta kriteria penerimaannya.
- [`MILESTONES.md`](MILESTONES.md): Panduan eksekusi bertahap untuk agen pengembang.
- [`AGENTS.md`](AGENTS.md): Instruksi persisten dan aturan rekayasa untuk coding agent.
- [`HANDOFF.md`](HANDOFF.md): Status faktual implementasi, keputusan yang telah dikunci, dan langkah berikutnya.

## Keputusan Utama Produk

1. **Local-First & Tanpa Server**: Berjalan penuh di browser menggunakan IndexedDB (Dexie) tanpa memerlukan akun login, server cloud, integrasi bank otomatis, atau provider AI.
2. **Pemisahan Lokasi Kas & Peruntukan Dana**:
   - **2 Lokasi Kas Bawaan (`CashAccount`)**: *Kas Tunai* dan *Rekening Bank Tercatat* (beserta dukungan Mutasi Antar-Kas).
   - **3 Dana Bawaan (`Fund`)**: *Dana Operasional Umum* (`unrestricted`), *Dana Pembangunan* (`restricted`), dan *Dana Sosial / Zakat* (`restricted`).
3. **Soft Guard Dana Terikat**: Memberikan peringatan tegas dengan konfirmasi bendahara apabila pengeluaran melebihi saldo dana/kas atau membebani dana terikat di luar peruntukannya.
4. **6 Tab Navigasi dengan Identitas Unik**: `Ringkasan`, `Transaksi`, `Kas & Dana`, `Anggaran / RAB`, `Laporan`, dan `Pengaturan` (`Profil Masjid`, `Kategori`, `Data & Cadangan`).
