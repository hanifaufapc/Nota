# Architecture Decision Record: Nota — Manajemen Keuangan Masjid

**Status:** Disetujui untuk implementasi Nota Masjid  
**Prinsip:** SPA *local-first* tanpa backend untuk fungsi inti, memisahkan lokasi penyimpanan kas (`CashAccount`) dari peruntukan amanah dana (`Fund`).

---

## 1. Stack Teknologi

| Lapisan | Pilihan | Alasan |
|---|---|---|
| Web App | React 19 + TypeScript (`~5.8.3`) | Tipe ketat menjaga integritas perhitungan kas, dana, mutasi, dan RAB. |
| Build / Dev | Vite (`^6.3.1`) | Build SPA statis cepat, HMR responsif, dan ukuran bundle terkontrol. |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) | Token desain terpusat di `src/styles/tokens.css` + dukungan `@media print` (`print:...`) untuk lembar Laporan Kas Masjid. |
| Icons | Lucide React | Ikon konsisten dan ringan. |
| Local Database | IndexedDB melalui Dexie (`^4.0.11`) | Mendukung multi-tabel (`accounts`, `funds`, `transactions`, `cashTransfers`, `budgetPlans`, `categories`, `settings`), indeks kueri, migrasi skema berversi, dan transaksi atomik `'rw'`. |
| Pengujian | Vitest + Testing Library + `fake-indexeddb` | Pengujian unit domain murni, integrasi repositori IndexedDB, dan pengujian antarmuka pengguna. |

---

## 2. Arsitektur Penyimpanan Lokal (IndexedDB + Dexie Schema v5)

Seluruh data finansial masjid disimpan di IndexedDB (`nota_local_db`) dan diakses **hanya** melalui lapisan repositori (`src/data/repositories/notaRepository.ts`). Komponen React dilarang memanggil Dexie secara langsung.

### Tabel Data Store (`NOTA_SCHEMA_VERSION = 5`)

1. **`settings`**:
   - Primary key: `id` (`'app-settings'`).
   - Menyimpan `MosqueSettings` (`mosqueName`, `mosqueAddress`, `chairpersonName`, `treasurerName`, `openingBalance`, `currency: 'IDR'`, `onboardingCompleted`, `updatedAt`).
2. **`accounts`** (`CashAccount` — Lokasi Penyimpanan Kas):
   - Indeks: `'id, kind, isDefault'`.
   - Default seeded:
     - `'acc-kas-tunai'` (`Kas Tunai`, `kind: 'cash'`)
     - `'acc-bank-masjid'` (`Rekening Bank Tercatat`, `kind: 'bank_recorded'`)
3. **`funds`** (`Fund` — Peruntukan Amanah Dana):
   - Indeks: `'id, restriction, isDefault'`.
   - Default seeded:
     - `'fund-operasional'` (`Dana Operasional Umum`, `restriction: 'unrestricted'`)
     - `'fund-pembangunan'` (`Dana Pembangunan`, `restriction: 'restricted'`)
     - `'fund-sosial-zakat'` (`Dana Sosial / Zakat`, `restriction: 'restricted'`)
4. **`categories`** (`Category` — Kategori Penerimaan & Pengeluaran Masjid):
   - Indeks: `'id, type, defaultFundId, isDefault'`.
5. **`transactions`** (`Transaction` — Jurnal Penerimaan & Pengeluaran):
   - Indeks: `'id, occurredAt, type, accountId, fundId, categoryId, budgetPlanId, createdAt'`.
6. **`cashTransfers`** (`CashTransfer` — Mutasi Antar-Kas Internal):
   - Indeks: `'id, occurredAt, fromAccountId, toAccountId, createdAt'`.
7. **`budgetPlans`** (`BudgetPlan` — Anggaran Operasional Bulanan & RAB Kegiatan beserta `items: BudgetLineItem[]`):
   - Indeks: `'id, kind, periodStart, periodEnd, fundId, createdAt'`.
8. *(Kompatibilitas Skema Lama `v2–v4`)*:
   - Tabel lama (`budgets`, `savingsGoals`, `debtRecords`) tetap dikenali pada skema Dexie agar upgrade dari `v1–v4` ke `v5` berjalan mulus tanpa error migrasi IndexedDB.
   - Saat migrasi ke `v5`, transaksi lama yang belum memiliki `accountId` atau `fundId` otomatis dipetakan ke `'acc-kas-tunai'` dan `'fund-operasional'`, serta `settings.openingBalance` lama diselaraskan ke saldo awal `'acc-kas-tunai'` / `'fund-operasional'`.

---

## 3. Model Keuangan & Fungsi Domain Murni (`src/domain/`)

Seluruh perhitungan keuangan wajib berada di fungsi domain murni yang teruji unit test:

### 3.1 Perhitungan Saldo Kas (`CashAccount`) vs Saldo Dana (`Fund`)
- **Saldo Lokasi Kas (`calculateAccountBalances`)**:
  $$\text{balance}(acc) = acc.\text{openingBalance} + \sum_{tx \in \text{income}(acc)} tx.\text{amount} - \sum_{tx \in \text{expense}(acc)} tx.\text{amount} + \sum_{tr \in \text{in}(acc)} tr.\text{amount} - \sum_{tr \in \text{out}(acc)} tr.\text{amount}$$
- **Saldo Dana (`calculateFundBalances`)**:
  $$\text{balance}(fund) = fund.\text{openingBalance} + \sum_{tx \in \text{income}(fund)} tx.\text{amount} - \sum_{tx \in \text{expense}(fund)} tx.\text{amount}$$
- **Total Kas Masjid**:
  - $\text{Total Kas} = \sum \text{balance}(acc)$
  - Dipilah menjadi **Saldo Dana Umum (`unrestrictedBalance`)** dan **Saldo Dana Terikat (`restrictedBalance`)**.

### 3.2 Evaluasi Pengamanan Dana Terikat (`evaluateTransactionSoftGuard`)
Fungsi domain murni yang memeriksa draft transaksi pengeluaran sebelum disimpan:
1. **Peringatan Saldo Dana Tidak Cukup**: jika `tx.type === 'expense'` dan `tx.amount > currentFundBalance(tx.fundId)`.
2. **Peringatan Saldo Lokasi Kas Tidak Cukup**: jika `tx.type === 'expense'` dan `tx.amount > currentAccountBalance(tx.accountId)`.
3. **Peringatan Lintas Peruntukan Dana Terikat**: jika `fund.restriction === 'restricted'` dan `category.defaultFundId` merujuk ke dana lain (mis. kategori *Listrik, Air & Internet Masjid* dibebankan ke *Dana Sosial / Zakat*).
- Mengembalikan daftar peringatan (`warnings: string[]`). Jika `warnings.length > 0`, UI menampilkan banner konfirmasi **Soft Guard** kepada bendahara sebelum benar-benar menyimpan transaksi.

### 3.3 Perhitungan Realisasi RAB (`calculateBudgetPlanOverview`)
- Menghitung rencana penerimaan/pengeluaran per pos (`BudgetLineItem`) dibandingkan dengan transaksi aktual dalam rentang `[periodStart, periodEnd]` (atau yang tertaut via `budgetPlanId` / `categoryId`), lengkap dengan persentase serapan dan sisa anggaran.

### 3.4 Generator Laporan Pertanggungjawaban (`generateMosqueFinancialReport`)
- Menerima `period: DateRangePeriod` (preset Jumat/7 Hari, Bulanan, atau Rentang Tanggal Kustom) serta filter opsional `fundId` / `accountId`.
- Menghitung secara presisi:
  - `openingBalance` pada awal `period.startDate` (saldo awal + seluruh transaksi sebelum `period.startDate`),
  - rincian penerimaan & pengeluaran per Dana dan per Kategori selama periode,
  - posisi akhir tiap `Fund` dan tiap `CashAccount` pada `period.endDate`.

---

## 4. Struktur Folder Target

```text
src/
  app/
    App.tsx
  components/
    layout/
      AppShell.tsx          # 6-tab navigation: Ringkasan, Transaksi, Kas & Dana, Anggaran/RAB, Laporan, Pengaturan
  domain/
    money.ts                # Integer IDR arithmetic & validation
    mosque.ts               # CashAccount, Fund, CashTransfer, MosqueSettings, Soft-Guard rules
    transaction.ts          # Mosque Transaction & Category domain + default mosque categories
    budgetPlan.ts           # RAB / BudgetPlan & BudgetLineItem domain calculations
    report.ts               # Mosque financial report generator (Jumat/Mingguan, Bulanan, Per Dana)
    summaries.ts            # Period cashflow, account/fund balances, category totals
    validation.ts           # Input validators
  data/
    db.ts                   # Dexie schema v1–v5
    backup/
      notaBackup.ts         # Versioned JSON backup (v1–v5 compatible) & CSV export
    repositories/
      notaRepository.ts     # Single repository boundary for all stores
  features/
    overview/               # Tab 1: Ringkasan Masjid & First-run Mosque Onboarding
    transactions/           # Tab 2: Jurnal Transaksi Masjid & Quick-Entry Modal (with Soft Guard)
    cashAndFunds/           # Tab 3: Kas & Dana + Mutasi Antar-Kas
    rab/                    # Tab 4: Anggaran / RAB Masjid
    reports/                # Tab 5: Laporan Kas Masjid (Print/PDF & CSV)
    settings/               # Tab 6: Pengaturan (Profil Masjid, Kategori, Data & Cadangan)
  lib/
    date.ts                 # Local date helpers (including 7-day / Friday-to-Friday preset)
    format.ts               # IDR & Indonesian date formatters
  styles/
    tokens.css              # Design tokens + @media print rules
  test/
```

---

## 5. Cadangan & Pemulihan Atomik (`Pengaturan → Data & Cadangan`)

- File cadangan JSON menggunakan `schemaVersion: 5` dan menyertakan: `settings`, `accounts`, `funds`, `categories`, `transactions`, `cashTransfers`, dan `budgetPlans`.
- Impor cadangan mendukung kompatibilitas mundur (`schemaVersion` `1..5`), memvalidasi keutuhan referensi (`accountId`, `fundId`, `categoryId`) sebelum menyentuh database, menampilkan ringkasan pratinjau, dan melakukan *replace* secara atomik dalam satu transaksi Dexie `'rw'` setelah konfirmasi eksplisit.
