import { useId, useMemo, useState } from 'react';
import {
  Building2,
  Calendar,
  Download,
  FileSpreadsheet,
  Filter,
  Printer,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { serializeMosqueReportToCsv } from '../../data/backup/notaBackup';
import type { CashAccount, CashTransfer, Fund } from '../../domain/mosque';
import { generateMosqueFinancialReport } from '../../domain/report';
import type {
  AppSettings,
  Category,
  Transaction,
} from '../../domain/transaction';
import {
  type DateRangePeriod,
  getRollingDaysPeriod,
  isValidDateRangePeriod,
} from '../../lib/date';
import {
  formatIDR,
  formatLocalDateID,
  formatSignedIDR,
} from '../../lib/format';

export type ReportPresetMode = 'weekly_friday' | 'monthly' | 'custom';

interface MosqueReportSectionProps {
  settings: AppSettings;
  accounts: readonly CashAccount[];
  funds: readonly Fund[];
  categories: readonly Category[];
  transactions: readonly Transaction[];
  cashTransfers: readonly CashTransfer[];
  selectedPeriod: DateRangePeriod;
  periodLabel: string;
}

export function MosqueReportSection({
  settings,
  accounts,
  funds,
  categories,
  transactions,
  cashTransfers,
  selectedPeriod,
  periodLabel,
}: MosqueReportSectionProps) {
  const fundFilterSelectId = useId();
  const fridayEndDateInputId = useId();
  const customStartInputId = useId();
  const customEndInputId = useId();

  const [presetMode, setPresetMode] = useState<ReportPresetMode>('monthly');
  const [fridayAnchorDate, setFridayAnchorDate] = useState<string>(
    selectedPeriod.endDate,
  );
  const [customStartDate, setCustomStartDate] = useState<string>(
    selectedPeriod.startDate,
  );
  const [customEndDate, setCustomEndDate] = useState<string>(
    selectedPeriod.endDate,
  );
  const [filterFundId, setFilterFundId] = useState<string>('');
  const [csvFeedback, setCsvFeedback] = useState<string | null>(null);

  const activePeriod = useMemo<DateRangePeriod>(() => {
    if (presetMode === 'weekly_friday') {
      const validAnchor =
        fridayAnchorDate && /^\d{4}-\d{2}-\d{2}$/.test(fridayAnchorDate)
          ? fridayAnchorDate
          : selectedPeriod.endDate;
      return getRollingDaysPeriod(validAnchor, 7);
    }
    if (presetMode === 'custom') {
      const candidate = {
        startDate: customStartDate,
        endDate: customEndDate,
      };
      if (isValidDateRangePeriod(candidate)) {
        return candidate;
      }
    }
    return selectedPeriod;
  }, [
    presetMode,
    fridayAnchorDate,
    customStartDate,
    customEndDate,
    selectedPeriod,
  ]);

  const isCustomRangeInvalid =
    presetMode === 'custom' &&
    !isValidDateRangePeriod({
      startDate: customStartDate,
      endDate: customEndDate,
    });

  const report = useMemo(
    () =>
      generateMosqueFinancialReport({
        period: activePeriod,
        accounts,
        funds,
        categories,
        transactions,
        transfers: cashTransfers,
        filterFundId: filterFundId || undefined,
      }),
    [
      activePeriod,
      accounts,
      funds,
      categories,
      transactions,
      cashTransfers,
      filterFundId,
    ],
  );

  const selectedFundName = useMemo(() => {
    if (!filterFundId) {
      return 'Semua Dana Masjid';
    }
    return funds.find((f) => f.id === filterFundId)?.name ?? 'Dana Terpilih';
  }, [filterFundId, funds]);

  const reportPeriodSubtitle = useMemo(() => {
    if (presetMode === 'monthly') {
      return `Periode Bulanan: ${periodLabel} (${formatLocalDateID(activePeriod.startDate)} – ${formatLocalDateID(activePeriod.endDate)})`;
    }
    if (presetMode === 'weekly_friday') {
      return `Laporan Kas Jumat / 7 Hari: ${formatLocalDateID(activePeriod.startDate)} – ${formatLocalDateID(activePeriod.endDate)}`;
    }
    return `Periode Kustom: ${formatLocalDateID(activePeriod.startDate)} – ${formatLocalDateID(activePeriod.endDate)}`;
  }, [presetMode, periodLabel, activePeriod]);

  function handlePrintReport() {
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  }

  function handleExportReportCsv() {
    const csvContent = serializeMosqueReportToCsv(report, {
      accounts,
      funds,
      categories,
    });
    const fileName = `laporan-kas-masjid-${activePeriod.startDate}-sd-${activePeriod.endDate}.csv`;

    if (
      typeof window !== 'undefined' &&
      typeof URL !== 'undefined' &&
      typeof URL.createObjectURL === 'function'
    ) {
      try {
        const blob = new Blob([csvContent], {
          type: 'text/csv;charset=utf-8;',
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      } catch {
        // Fallback in test/headless environments
      }
    }

    setCsvFeedback(
      `Berhasil menyiapkan CSV laporan (${report.periodTransactions.length} transaksi) untuk periode ${activePeriod.startDate} s/d ${activePeriod.endDate}.`,
    );
  }

  const displayMosqueName =
    settings.mosqueName?.trim() || 'Masjid / Musholla (Nama Belum Diatur)';
  const displayMosqueAddress =
    settings.mosqueAddress?.trim() ||
    'Laporan Pertanggungjawaban Keuangan Jamaah';
  const displayChairperson =
    settings.chairpersonName?.trim() || '( Ketua DKM / Takmir )';
  const displayTreasurer =
    settings.treasurerName?.trim() || '( Bendahara Masjid )';

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Control Bar — Hidden during @media print */}
      <section
        aria-label="Kontrol periode dan aksi laporan masjid"
        className="print:hidden rounded-hero bg-nota-surface p-5 sm:p-6 border border-nota-border/70 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base sm:text-lg font-semibold text-nota-ink">
              Pengaturan Lembar Laporan Jamaah
            </h2>
            <p className="text-xs sm:text-sm text-nota-muted">
              Pilih preset periode pengumuman kas masjid, saring per dana bila
              diperlukan, lalu cetak ke PDF/kertas atau ekspor CSV.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportReportCsv}
              className="inline-flex items-center gap-1.5 rounded-control border border-nota-border bg-nota-bg px-4 py-2 text-xs sm:text-sm font-medium text-nota-ink hover:bg-nota-soft-green/50 transition-colors cursor-pointer"
            >
              <FileSpreadsheet
                className="h-4 w-4 text-nota-emerald"
                aria-hidden="true"
              />
              Ekspor CSV Laporan
            </button>
            <button
              type="button"
              onClick={handlePrintReport}
              className="inline-flex items-center gap-1.5 rounded-control bg-nota-emerald px-4 py-2 text-xs sm:text-sm font-medium text-white hover:bg-nota-emerald-hover transition-colors cursor-pointer"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              Cetak / Simpan PDF
            </button>
          </div>
        </div>

        {/* Preset Radio Group (3 options -> visible radio pills per modern-web-guidance `forms`) */}
        <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-12 sm:items-end border-t border-nota-border/60">
          <fieldset className="sm:col-span-7 space-y-1.5">
            <legend className="block text-xs font-medium text-nota-ink">
              Preset Periode Laporan
            </legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(
                [
                  {
                    value: 'weekly_friday',
                    label: 'Laporan Kas Jumat (7 Hari)',
                  },
                  {
                    value: 'monthly',
                    label: 'Laporan Kas Bulanan',
                  },
                  {
                    value: 'custom',
                    label: 'Rentang Tanggal Kustom',
                  },
                ] as const
              ).map((option) => {
                const isSelected = presetMode === option.value;
                return (
                  <label
                    key={option.value}
                    className={`flex items-center gap-2 rounded-control border px-3 py-2 text-xs font-medium cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-nota-emerald bg-nota-soft-green text-nota-emerald'
                        : 'border-nota-border bg-nota-bg text-nota-ink hover:bg-nota-soft-green/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="reportPresetMode"
                      value={option.value}
                      checked={isSelected}
                      onChange={() => {
                        setPresetMode(option.value);
                        setCsvFeedback(null);
                      }}
                      className="accent-nota-emerald"
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="sm:col-span-5 space-y-1.5">
            <label
              htmlFor={fundFilterSelectId}
              className="flex items-center gap-1.5 text-xs font-medium text-nota-ink"
            >
              <Filter
                className="h-3.5 w-3.5 text-nota-emerald"
                aria-hidden="true"
              />
              Filter Dana Amanah
            </label>
            <select
              id={fundFilterSelectId}
              name="filterFundId"
              value={filterFundId}
              onChange={(e) => {
                setFilterFundId(e.target.value);
                setCsvFeedback(null);
              }}
              className="w-full rounded-control border border-nota-border bg-nota-bg px-3.5 py-2 text-xs sm:text-sm font-medium text-nota-ink"
            >
              <option value="">Semua Dana Masjid (Gabungan)</option>
              {funds.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {fund.name} (
                  {fund.restriction === 'restricted'
                    ? 'Dana Terikat'
                    : 'Dana Umum'}
                  )
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Conditional Date Inputs for Weekly Friday or Custom Range */}
        {presetMode === 'weekly_friday' ? (
          <div className="flex flex-wrap items-end gap-4 rounded-panel border border-nota-border/70 bg-nota-bg/60 p-3.5">
            <div className="space-y-1">
              <label
                htmlFor={fridayEndDateInputId}
                className="block text-xs font-medium text-nota-ink"
              >
                Tanggal Akhir Laporan Jumat (7 hari ke belakang)
              </label>
              <input
                id={fridayEndDateInputId}
                type="date"
                value={fridayAnchorDate}
                onChange={(e) => setFridayAnchorDate(e.target.value)}
                className="rounded-badge border border-nota-border bg-nota-surface px-3 py-1.5 text-xs text-nota-ink"
              />
            </div>
            <p className="text-xs text-nota-muted">
              Menampilkan rekapitulasi 7 hari penuh:{' '}
              <strong className="font-semibold text-nota-ink">
                {formatLocalDateID(activePeriod.startDate)} –{' '}
                {formatLocalDateID(activePeriod.endDate)}
              </strong>
            </p>
          </div>
        ) : null}

        {presetMode === 'custom' ? (
          <div className="space-y-2 rounded-panel border border-nota-border/70 bg-nota-bg/60 p-3.5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label
                  htmlFor={customStartInputId}
                  className="block text-xs font-medium text-nota-ink"
                >
                  Dari Tanggal
                </label>
                <input
                  id={customStartInputId}
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full rounded-badge border border-nota-border bg-nota-surface px-3 py-1.5 text-xs text-nota-ink"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor={customEndInputId}
                  className="block text-xs font-medium text-nota-ink"
                >
                  Sampai Tanggal
                </label>
                <input
                  id={customEndInputId}
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full rounded-badge border border-nota-border bg-nota-surface px-3 py-1.5 text-xs text-nota-ink"
                />
              </div>
            </div>
            {isCustomRangeInvalid ? (
              <p role="alert" className="text-xs text-nota-expense">
                Tanggal mulai harus sebelum atau sama dengan tanggal selesai.
              </p>
            ) : null}
          </div>
        ) : null}

        {csvFeedback ? (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 rounded-badge border border-nota-emerald/30 bg-nota-soft-green px-3.5 py-2 text-xs font-medium text-nota-emerald"
          >
            <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{csvFeedback}</span>
          </div>
        ) : null}
      </section>

      {/* Printable Mosque Financial Report Sheet */}
      <article
        aria-label="Ringkasan laporan keuangan masjid"
        className="nota-print-sheet rounded-hero bg-nota-surface p-6 sm:p-8 border border-nota-border/80 space-y-6"
      >
        {/* Kop Identitas Masjid */}
        <header className="border-b-2 border-nota-ink/80 pb-5 text-center space-y-1.5">
          <div className="inline-flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider text-nota-emerald">
            <Building2 className="h-4 w-4" aria-hidden="true" />
            <span>Laporan Pertanggungjawaban Keuangan Masjid</span>
          </div>
          <h2
            data-testid="report-mosque-name"
            className="text-xl sm:text-2xl font-bold tracking-tight text-nota-ink"
          >
            {displayMosqueName}
          </h2>
          <p className="text-xs sm:text-sm text-nota-muted">
            {displayMosqueAddress}
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-2 text-xs font-medium text-nota-ink">
            <span className="inline-flex items-center gap-1 rounded-control border border-nota-border bg-nota-bg px-3 py-1">
              <Calendar
                className="h-3.5 w-3.5 text-nota-emerald"
                aria-hidden="true"
              />
              {reportPeriodSubtitle}
            </span>
            <span className="inline-flex items-center gap-1 rounded-control border border-nota-border bg-nota-soft-green/60 px-3 py-1 text-nota-emerald">
              Lingkup: {selectedFundName}
            </span>
          </div>
        </header>

        {/* Ringkasan Eksekutif: Saldo Awal -> Penerimaan -> Pengeluaran -> Saldo Akhir */}
        <section aria-label="Ringkasan eksekutif arus kas periode">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-nota-muted mb-3">
            1. Ringkasan Eksekutif Periode
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="rounded-panel border border-nota-border bg-nota-bg/60 p-4">
              <span className="text-xs font-medium text-nota-muted block">
                Saldo Awal Periode
              </span>
              <strong
                data-testid="report-opening-balance"
                className="mt-1 block text-base sm:text-lg font-semibold text-nota-ink tabular-nums"
              >
                {formatIDR(report.openingBalance)}
              </strong>
            </div>

            <div className="rounded-panel border border-nota-border bg-nota-bg/60 p-4">
              <span className="text-xs font-medium text-nota-muted block">
                Total Penerimaan
              </span>
              <strong
                data-testid="report-period-income"
                className="mt-1 block text-base sm:text-lg font-semibold text-nota-emerald tabular-nums"
              >
                +{formatIDR(report.periodIncome)}
              </strong>
            </div>

            <div className="rounded-panel border border-nota-border bg-nota-bg/60 p-4">
              <span className="text-xs font-medium text-nota-muted block">
                Total Pengeluaran
              </span>
              <strong
                data-testid="report-period-expense"
                className="mt-1 block text-base sm:text-lg font-semibold text-nota-expense tabular-nums"
              >
                −{formatIDR(report.periodExpense)}
              </strong>
            </div>

            <div className="rounded-panel border border-nota-emerald/35 bg-nota-soft-green/50 p-4">
              <span className="text-xs font-medium text-nota-emerald block">
                Saldo Akhir Periode
              </span>
              <strong
                data-testid="report-closing-balance"
                className="mt-1 block text-base sm:text-lg font-bold text-nota-ink tabular-nums"
              >
                {formatIDR(report.closingBalance)}
              </strong>
              <span className="mt-0.5 block text-[11px] text-nota-muted tabular-nums">
                Selisih periode: {formatSignedIDR(report.periodNetCashFlow)}
              </span>
            </div>
          </div>
        </section>

        {/* Tabel Rincian Posisi per Dana Masjid */}
        <section aria-label="Tabel posisi per dana masjid">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-nota-muted mb-3">
            2. Rincian Posisi per Dana Amanah Masjid
          </h3>
          <div
            tabIndex={0}
            role="region"
            aria-label="Tabel rincian posisi per dana"
            className="overflow-x-auto rounded-panel border border-nota-border"
          >
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-nota-border bg-nota-bg text-[11px] font-semibold text-nota-muted">
                  <th scope="col" className="py-2.5 px-3.5">
                    Nama Dana Masjid
                  </th>
                  <th scope="col" className="py-2.5 px-3.5">
                    Sifat Peruntukan
                  </th>
                  <th scope="col" className="py-2.5 px-3.5 text-right">
                    Saldo Awal
                  </th>
                  <th scope="col" className="py-2.5 px-3.5 text-right">
                    Penerimaan
                  </th>
                  <th scope="col" className="py-2.5 px-3.5 text-right">
                    Pengeluaran
                  </th>
                  <th scope="col" className="py-2.5 px-3.5 text-right">
                    Saldo Akhir
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-nota-border/70">
                {report.fundRows.map((row) => (
                  <tr
                    key={row.fundId}
                    data-testid={`report-fund-row-${row.fundId}`}
                  >
                    <th
                      scope="row"
                      className="py-2.5 px-3.5 font-semibold text-nota-ink"
                    >
                      {row.fundName}
                    </th>
                    <td className="py-2.5 px-3.5">
                      {row.restriction === 'restricted' ? (
                        <span className="inline-flex items-center gap-1 rounded-control border border-nota-ink/20 bg-nota-bg px-2.5 py-0.5 text-[11px] font-medium text-nota-ink">
                          <ShieldAlert
                            className="h-3 w-3 text-nota-ink"
                            aria-hidden="true"
                          />
                          Dana Terikat · Amanah
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-control border border-nota-emerald/25 bg-nota-soft-green px-2.5 py-0.5 text-[11px] font-medium text-nota-emerald">
                          <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                          Dana Umum
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3.5 text-right tabular-nums whitespace-nowrap">
                      {formatIDR(row.openingBalance)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-medium text-nota-emerald tabular-nums whitespace-nowrap">
                      +{formatIDR(row.periodIncome)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-medium text-nota-expense tabular-nums whitespace-nowrap">
                      −{formatIDR(row.periodExpense)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-bold text-nota-ink tabular-nums whitespace-nowrap">
                      {formatIDR(row.closingBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Tabel Rincian Penerimaan & Pengeluaran per Kategori */}
        <section aria-label="Rincian arus kas per kategori">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-nota-muted mb-3">
            3. Rincian Penerimaan & Pengeluaran per Kategori
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Kategori Penerimaan */}
            <div
              tabIndex={0}
              role="region"
              aria-label="Tabel kategori penerimaan"
              className="overflow-x-auto rounded-panel border border-nota-border"
            >
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-nota-border bg-nota-bg text-[11px] font-semibold text-nota-muted">
                    <th scope="col" className="py-2.5 px-3.5">
                      Kategori Penerimaan
                    </th>
                    <th scope="col" className="py-2.5 px-3.5 text-right">
                      Jml
                    </th>
                    <th scope="col" className="py-2.5 px-3.5 text-right">
                      Total (IDR)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-nota-border/70">
                  {report.incomeCategoryRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="py-4 px-3.5 text-center text-nota-muted"
                      >
                        Tidak ada penerimaan pada periode ini.
                      </td>
                    </tr>
                  ) : (
                    report.incomeCategoryRows.map((cat) => (
                      <tr key={cat.categoryId}>
                        <th
                          scope="row"
                          className="py-2 px-3.5 font-medium text-nota-ink"
                        >
                          {cat.categoryName}
                        </th>
                        <td className="py-2 px-3.5 text-right text-nota-muted tabular-nums">
                          {cat.transactionCount}x
                        </td>
                        <td className="py-2 px-3.5 text-right font-semibold text-nota-emerald tabular-nums whitespace-nowrap">
                          +{formatIDR(cat.totalAmount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Kategori Pengeluaran */}
            <div
              tabIndex={0}
              role="region"
              aria-label="Tabel kategori pengeluaran"
              className="overflow-x-auto rounded-panel border border-nota-border"
            >
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-nota-border bg-nota-bg text-[11px] font-semibold text-nota-muted">
                    <th scope="col" className="py-2.5 px-3.5">
                      Kategori Pengeluaran
                    </th>
                    <th scope="col" className="py-2.5 px-3.5 text-right">
                      Jml
                    </th>
                    <th scope="col" className="py-2.5 px-3.5 text-right">
                      Total (IDR)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-nota-border/70">
                  {report.expenseCategoryRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="py-4 px-3.5 text-center text-nota-muted"
                      >
                        Tidak ada pengeluaran pada periode ini.
                      </td>
                    </tr>
                  ) : (
                    report.expenseCategoryRows.map((cat) => (
                      <tr key={cat.categoryId}>
                        <th
                          scope="row"
                          className="py-2 px-3.5 font-medium text-nota-ink"
                        >
                          {cat.categoryName}
                        </th>
                        <td className="py-2 px-3.5 text-right text-nota-muted tabular-nums">
                          {cat.transactionCount}x
                        </td>
                        <td className="py-2 px-3.5 text-right font-semibold text-nota-expense tabular-nums whitespace-nowrap">
                          −{formatIDR(cat.totalAmount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Posisi Penyimpanan Kas Akhir */}
        <section aria-label="Posisi penyimpanan kas akhir">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-nota-muted mb-3">
            4. Posisi Tempat Penyimpanan Kas Akhir
          </h3>
          <div
            tabIndex={0}
            role="region"
            aria-label="Tabel posisi penyimpanan kas akhir"
            className="overflow-x-auto rounded-panel border border-nota-border"
          >
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-nota-border bg-nota-bg text-[11px] font-semibold text-nota-muted">
                  <th scope="col" className="py-2.5 px-3.5">
                    Lokasi Penyimpanan Kas
                  </th>
                  <th scope="col" className="py-2.5 px-3.5 text-right">
                    Saldo Awal
                  </th>
                  <th scope="col" className="py-2.5 px-3.5 text-right">
                    Penerimaan
                  </th>
                  <th scope="col" className="py-2.5 px-3.5 text-right">
                    Pengeluaran
                  </th>
                  <th scope="col" className="py-2.5 px-3.5 text-right">
                    Mutasi Bersih
                  </th>
                  <th scope="col" className="py-2.5 px-3.5 text-right">
                    Saldo Akhir Kas
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-nota-border/70">
                {report.accountRows.map((acc) => {
                  const netTransfer =
                    acc.periodTransfersIn - acc.periodTransfersOut;
                  return (
                    <tr
                      key={acc.accountId}
                      data-testid={`report-account-row-${acc.accountId}`}
                    >
                      <th
                        scope="row"
                        className="py-2.5 px-3.5 font-semibold text-nota-ink"
                      >
                        {acc.accountName}
                      </th>
                      <td className="py-2.5 px-3.5 text-right tabular-nums whitespace-nowrap">
                        {formatIDR(acc.openingBalance)}
                      </td>
                      <td className="py-2.5 px-3.5 text-right text-nota-emerald tabular-nums whitespace-nowrap">
                        +{formatIDR(acc.periodIncome)}
                      </td>
                      <td className="py-2.5 px-3.5 text-right text-nota-expense tabular-nums whitespace-nowrap">
                        −{formatIDR(acc.periodExpense)}
                      </td>
                      <td className="py-2.5 px-3.5 text-right text-nota-muted tabular-nums whitespace-nowrap">
                        {formatSignedIDR(netTransfer)}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-bold text-nota-ink tabular-nums whitespace-nowrap">
                        {formatIDR(acc.closingBalance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Blok Tanda Tangan Pengesahan DKM */}
        <footer
          aria-label="Pengesahan pengurus DKM"
          className="grid grid-cols-2 gap-6 pt-6 border-t border-nota-border text-center text-xs"
        >
          <div className="space-y-12">
            <div>
              <p className="text-nota-muted">Mengetahui,</p>
              <p className="font-semibold text-nota-ink">Ketua DKM / Takmir</p>
            </div>
            <p
              data-testid="report-chairperson-name"
              className="font-semibold text-nota-ink underline underline-offset-4"
            >
              {displayChairperson}
            </p>
          </div>

          <div className="space-y-12">
            <div>
              <p className="text-nota-muted">Dibuat oleh,</p>
              <p className="font-semibold text-nota-ink">Bendahara Masjid</p>
            </div>
            <p
              data-testid="report-treasurer-name"
              className="font-semibold text-nota-ink underline underline-offset-4"
            >
              {displayTreasurer}
            </p>
          </div>
        </footer>
      </article>
    </div>
  );
}
