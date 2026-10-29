# HANDOFF — Nota (Manajemen Keuangan Masjid)

## Current status

- **Date / Milestone:** 2026-10-29 — **Final Integration & Release-Readiness Audit Completed (Milestones M1–M5)**.
- **Product name:** Nota (Manajemen Keuangan Masjid Local-First).
- **Phase:** Seluruh milestone (**M1–M5**) dan audit integrasi akhir telah selesai. Keenam tab utama (`Ringkasan`, `Transaksi`, `Kas & Dana`, `Anggaran / RAB`, `Laporan`, `Pengaturan`) berfungsi penuh dan konsisten secara finansial di tingkat domain, repositori Dexie `v5`, dan pengujian komponen/integrasi. Verifikasi browser nyata (real-browser manual acceptance testing) direkomendasikan sebagai langkah penerimaan akhir sebelum rilis produksi ke pengurus DKM.
- **Toolchain recorded:** Node `v26.12.1`, npm `12.2.1`, React `^19.1.0`, Vite `^6.3.1` (resolved `6.4.5`), Tailwind CSS v4 (`@tailwindcss/vite` `^4.1.4`), TypeScript `~5.8.3`, Dexie `^4.0.11`, Vitest `^3.1.1` (resolved `3.2.7`), `fake-indexeddb` `^6.0.0`, Lucide React `^1.0.0`.

## Pekerjaan yang Selesai pada Audit Integrasi & Kesiapan Rilis

1. **Perbaikan Validasi Pemulihan Cadangan untuk Mutasi Kas dengan Lokasi Kas Diarsipkan (`src/domain/mosque.ts` & `src/data/backup/notaBackup.ts`)**:
   - Menambahkan opsi `{ allowArchivedAccounts?: boolean }` pada `validateCashTransferInput` dan `createCashTransfer` sehingga input mutasi baru di UI tetap menolak lokasi kas yang sudah diarsipkan, namun validasi pemulihan cadangan (`validateBackupObject`) mengizinkan riwayat `CashTransfer` yang merujuk ke `CashAccount` yang kemudian diarsipkan.
2. **Validasi Keutuhan Referensi `fundId` pada `BudgetPlan` saat Pemulihan Cadangan (`src/data/backup/notaBackup.ts`)**:
   - Memastikan bahwa jika objek `BudgetPlan` di dalam cadangan memiliki `fundId`, maka `fundId` tersebut wajib merujuk ke dana yang ada di dalam `completeFunds` sebelum transaksi pemulihan menyentuh database.
3. **Normalisasi Atribusi Default untuk Transaksi Warisan/Migrasi (`src/domain/summaries.ts` & `src/domain/budgetPlan.ts`)**:
   - Menormalisasi `tx.accountId || DEFAULT_CASH_ACCOUNT_TUNAI_ID` dan `tx.fundId || DEFAULT_FUND_OPERASIONAL_ID` pada `filterTransactions` dan `calculateBudgetPlanOverview`, agar selaras dengan `calculateAccountBalances`, `calculateFundBalances`, dan `generateMosqueFinancialReport`.
4. **Penyempurnaan Stylesheet Cetak `@media print` (`src/styles/tokens.css`)**:
   - Menambahkan aturan cetak `.nota-print-sheet [role="region"], .nota-print-sheet .overflow-x-auto { overflow: visible !important; }`, `.nota-print-sheet thead { display: table-header-group; }`, `.nota-print-sheet tfoot { display: table-footer-group; }`, dan `.nota-print-sheet footer { break-inside: avoid-page; page-break-inside: avoid; }` guna mencegah tabel terpotong secara horizontal dan memastikan header tabel berulang di setiap halaman cetak.
5. **Pencegahan Race Condition Sinkronisasi State Awal Form Profil Masjid (`src/features/settings/MosqueSettingsSection.tsx`)**:
   - Menggunakan `prevSettingsRef` di `MosqueSettingsSection` agar `useEffect` hanya menyinkronkan ulang state input apabila prop `settings` benar-benar berubah setelah mount, mencegah penimpaan input pertama saat efek pasif React dieksekusi.
6. **Penambahan Suite Pengujian Regresi Audit Rilis (`src/test/releaseAudit.test.tsx`)**:
   - Menguji ekspor & pemulihan cadangan dengan `CashAccount` terarsip yang dirujuk oleh `CashTransfer` historis.
   - Menguji penolakan cadangan saat `BudgetPlan` merujuk ke `fundId` yang tidak valid serta menjamin keutuhan data lama (atomic rollback/pre-validation).
   - Menguji konsistensi filter dan realisasi RAB untuk transaksi tanpa `accountId`/`fundId` eksplisit.
   - Menguji invarian finansial menyeluruh pada pembuatan/pengubahan/penghapusan transaksi, ketidakberubahan saldo kas/dana oleh RAB, dan akurasi saldo awal bergulir pada laporan periode.

## File yang Dibuat / Dimodifikasi

- `src/domain/mosque.ts` (dimodifikasi — Opsi `allowArchivedAccounts` pada `validateCashTransferInput` & `createCashTransfer`)
- `src/data/backup/notaBackup.ts` (dimodifikasi — Dukungan `allowArchivedAccounts: true` untuk `cashTransfers` historis & validasi referensi `plan.fundId`)
- `src/domain/summaries.ts` (dimodifikasi — Normalisasi fallback `DEFAULT_CASH_ACCOUNT_TUNAI_ID` & `DEFAULT_FUND_OPERASIONAL_ID` pada `filterTransactions`)
- `src/domain/budgetPlan.ts` (dimodifikasi — Normalisasi fallback `DEFAULT_FUND_OPERASIONAL_ID` pada `calculateBudgetPlanOverview`)
- `src/styles/tokens.css` (dimodifikasi — Aturan `@media print` untuk mencegah tabel terpotong & mengulang `thead`)
- `src/features/settings/MosqueSettingsSection.tsx` (dimodifikasi — Penjaga `prevSettingsRef` pada sinkronisasi `settings`)
- `src/features/planning/BudgetPlanSection.tsx` (dibuat pada M4)
- `src/features/reports/MosqueReportSection.tsx` (dibuat pada M5)
- `src/features/overview/OverviewFoundationPage.tsx` (dimodifikasi pada M4/M5)
- `src/app/App.tsx` (dimodifikasi pada M5)
- `index.html` (dimodifikasi pada M5)
- `src/test/budgetPlan.test.tsx` (dibuat pada M4)
- `src/test/mosqueReportsAndSettings.test.tsx` (dibuat pada M5)
- `src/test/releaseAudit.test.tsx` (dibuat pada Audit Rilis — 4 pengujian regresi & invarian finansial)
- `HANDOFF.md` (dimodifikasi)

## Pengujian & Verifikasi yang Dijalankan

- `npm run typecheck` (`tsc -b --noEmit`) — **LULUS (exit code 0)**.
- `npm run lint` (`eslint .`) — **LULUS (exit code 0)**.
- `npm test -- --run` (`vitest run --run`) — **LULUS (16 file uji, 74 pengujian lulus)**.
- `npm run build` (`tsc -b && vite build`) — **LULUS (exit code 0)**.

## Risiko Kebijakan Akuntansi Masjid & Pemeriksaan Manual Browser

- Lihat bagian **Risks that require a human accounting or policy decision** dan **Manual browser checks still required** pada laporan audit akhir untuk keputusan kebijakan DKM (seperti pengeditan independen saldo awal kas vs dana pasca-onboarding, efek retroaktif perubahan nama kategori/dana pada laporan historis, serta pencocokan realisasi RAB berbasis kategori+periode) dan daftar uji terima di browser nyata.
