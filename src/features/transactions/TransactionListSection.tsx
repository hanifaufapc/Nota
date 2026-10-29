import { useId, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowUpDown,
  Filter,
  ListFilter,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import {
  type CashAccount,
  DEFAULT_CASH_ACCOUNT_TUNAI_ID,
  DEFAULT_FUND_OPERASIONAL_ID,
  type Fund,
} from '../../domain/mosque';
import {
  type TransactionFilterCriteria,
  type TransactionSortOrder,
  filterTransactions,
  sortTransactions,
} from '../../domain/summaries';
import type {
  Category,
  Transaction,
  TransactionType,
} from '../../domain/transaction';
import type { DateRangePeriod } from '../../lib/date';
import { formatIDR, formatLocalDateID } from '../../lib/format';

export type PeriodFilterMode = 'all' | 'selected-month';

export interface TransactionListSectionProps {
  transactions: readonly Transaction[];
  categories: readonly Category[];
  accounts?: readonly CashAccount[];
  funds?: readonly Fund[];
  selectedPeriod: DateRangePeriod;
  periodLabel: string;
  onEditTransaction: (transaction: Transaction) => void;
  onDeleteTransaction: (transactionId: string) => Promise<void>;
  onAddIncome: () => void;
  onAddExpense: () => void;
}

export function TransactionListSection({
  transactions,
  categories,
  accounts = [],
  funds = [],
  selectedPeriod,
  periodLabel,
  onEditTransaction,
  onDeleteTransaction,
  onAddIncome,
  onAddExpense,
}: TransactionListSectionProps) {
  const searchInputId = useId();
  const periodFilterId = useId();
  const typeFilterId = useId();
  const categoryFilterId = useId();
  const fundFilterId = useId();
  const accountFilterId = useId();
  const sortOrderId = useId();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [periodMode, setPeriodMode] = useState<PeriodFilterMode>('all');
  const [typeFilter, setTypeFilter] = useState<TransactionType | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [fundFilter, setFundFilter] = useState<string>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<TransactionSortOrder>('newest');

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const categoryMap = useMemo(
    () =>
      new Map(
        categories.map((cat) => [
          cat.id,
          { name: cat.name, type: cat.type, isArchived: Boolean(cat.archivedAt) },
        ]),
      ),
    [categories],
  );

  const accountMap = useMemo(
    () =>
      new Map(
        accounts.map((acc) => [
          acc.id,
          { name: acc.name, kind: acc.kind, isArchived: Boolean(acc.archivedAt) },
        ]),
      ),
    [accounts],
  );

  const fundMap = useMemo(
    () =>
      new Map(
        funds.map((fund) => [
          fund.id,
          {
            name: fund.name,
            restriction: fund.restriction,
            isArchived: Boolean(fund.archivedAt),
          },
        ]),
      ),
    [funds],
  );

  const filterableCategories = useMemo(() => {
    if (typeFilter === 'all') {
      return categories;
    }
    return categories.filter((cat) => cat.type === typeFilter);
  }, [categories, typeFilter]);

  const effectiveCategoryFilter = useMemo(() => {
    if (categoryFilter === 'all') {
      return undefined;
    }
    const stillInScope = filterableCategories.some(
      (cat) => cat.id === categoryFilter,
    );
    return stillInScope ? categoryFilter : undefined;
  }, [categoryFilter, filterableCategories]);

  const filteredAndSortedTransactions = useMemo(() => {
    const criteria: TransactionFilterCriteria = {
      period: periodMode === 'selected-month' ? selectedPeriod : undefined,
      type: typeFilter === 'all' ? undefined : typeFilter,
      categoryId: effectiveCategoryFilter,
      fundId: fundFilter === 'all' ? undefined : fundFilter,
      accountId: accountFilter === 'all' ? undefined : accountFilter,
      searchQuery: searchQuery.trim() ? searchQuery : undefined,
    };

    const filtered = filterTransactions(transactions, criteria, categories);
    return sortTransactions(filtered, sortOrder);
  }, [
    transactions,
    categories,
    periodMode,
    selectedPeriod,
    typeFilter,
    effectiveCategoryFilter,
    fundFilter,
    accountFilter,
    searchQuery,
    sortOrder,
  ]);

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    periodMode !== 'all' ||
    typeFilter !== 'all' ||
    effectiveCategoryFilter !== undefined ||
    fundFilter !== 'all' ||
    accountFilter !== 'all' ||
    sortOrder !== 'newest';

  function handleResetFilters() {
    setSearchQuery('');
    setPeriodMode('all');
    setTypeFilter('all');
    setCategoryFilter('all');
    setFundFilter('all');
    setAccountFilter('all');
    setSortOrder('newest');
  }

  async function handleConfirmDelete(transactionId: string) {
    if (isDeleting) {
      return;
    }
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteTransaction(transactionId);
      setConfirmDeleteId(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : 'Gagal menghapus transaksi dari penyimpanan lokal.',
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <section
      id="daftar-transaksi"
      aria-label="Manajemen dan daftar transaksi"
      className="rounded-hero bg-nota-surface p-6 sm:p-7 border border-nota-border/70 space-y-5"
    >
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-control border border-nota-border bg-nota-bg text-nota-ink">
            <ListFilter className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-nota-ink">
              Daftar Transaksi
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            data-testid="filtered-transaction-count"
            className="rounded-control border border-nota-border bg-nota-bg px-3 py-1 text-xs font-medium text-nota-muted tabular-nums"
          >
            {filteredAndSortedTransactions.length} dari {transactions.length}{' '}
            transaksi
          </span>

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 rounded-control border border-nota-border bg-nota-bg px-2.5 py-1 text-xs font-medium text-nota-emerald hover:bg-nota-soft-green/50 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Reset filter
            </button>
          ) : null}
        </div>
      </div>

      {/* Search, Filter, and Sort Controls */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
        {/* Keyword Search */}
        <div className="sm:col-span-2 lg:col-span-4">
          <label htmlFor={searchInputId} className="sr-only">
            Cari transaksi
          </label>
          <div className="relative flex items-center">
            <Search
              className="pointer-events-none absolute left-3 h-4 w-4 text-nota-muted"
              aria-hidden="true"
            />
            <input
              id={searchInputId}
              type="search"
              placeholder="Cari catatan, donatur, bukti, atau kategori..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-control border border-nota-border bg-nota-bg py-2 pl-9 pr-3 text-xs sm:text-sm text-nota-ink placeholder:text-nota-muted/70 focus:border-nota-emerald focus:bg-nota-surface"
            />
          </div>
        </div>

        {/* Period Filter */}
        <div className="lg:col-span-2">
          <label htmlFor={periodFilterId} className="sr-only">
            Filter periode
          </label>
          <select
            id={periodFilterId}
            aria-label="Filter periode"
            value={periodMode}
            onChange={(e) =>
              setPeriodMode(e.target.value as PeriodFilterMode)
            }
            className="w-full rounded-control border border-nota-border bg-nota-bg px-3 py-2 text-xs sm:text-sm font-medium text-nota-ink focus:border-nota-emerald focus:bg-nota-surface"
          >
            <option value="all">Semua periode</option>
            <option value="selected-month">Bulan terpilih ({periodLabel})</option>
          </select>
        </div>

        {/* Type Filter */}
        <div className="lg:col-span-2">
          <label htmlFor={typeFilterId} className="sr-only">
            Filter jenis transaksi
          </label>
          <div className="relative flex items-center">
            <Filter
              className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-nota-muted"
              aria-hidden="true"
            />
            <select
              id={typeFilterId}
              aria-label="Filter jenis transaksi"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as TransactionType | 'all');
                setCategoryFilter('all');
              }}
              className="w-full rounded-control border border-nota-border bg-nota-bg py-2 pl-8 pr-2.5 text-xs sm:text-sm font-medium text-nota-ink focus:border-nota-emerald focus:bg-nota-surface"
            >
              <option value="all">Semua jenis</option>
              <option value="income">Pemasukan</option>
              <option value="expense">Pengeluaran</option>
            </select>
          </div>
        </div>

        {/* Category Filter */}
        <div className="lg:col-span-2">
          <label htmlFor={categoryFilterId} className="sr-only">
            Filter kategori
          </label>
          <select
            id={categoryFilterId}
            aria-label="Filter kategori"
            value={effectiveCategoryFilter ?? 'all'}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full rounded-control border border-nota-border bg-nota-bg px-3 py-2 text-xs sm:text-sm font-medium text-nota-ink focus:border-nota-emerald focus:bg-nota-surface"
          >
            <option value="all">Semua kategori</option>
            {filterableCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
                {cat.archivedAt ? ' (Arsip)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Sort Order */}
        <div className="lg:col-span-2">
          <label htmlFor={sortOrderId} className="sr-only">
            Urutan transaksi
          </label>
          <div className="relative flex items-center">
            <ArrowUpDown
              className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-nota-muted"
              aria-hidden="true"
            />
            <select
              id={sortOrderId}
              aria-label="Urutan transaksi"
              value={sortOrder}
              onChange={(e) =>
                setSortOrder(e.target.value as TransactionSortOrder)
              }
              className="w-full rounded-control border border-nota-border bg-nota-bg py-2 pl-8 pr-2.5 text-xs sm:text-sm font-medium text-nota-ink focus:border-nota-emerald focus:bg-nota-surface"
            >
              <option value="newest">Terbaru</option>
              <option value="oldest">Terlama</option>
            </select>
          </div>
        </div>

        {/* Mosque Fund & Cash Account Filters */}
        {funds.length > 0 || accounts.length > 0 ? (
          <>
            {funds.length > 0 ? (
              <div className="lg:col-span-6">
                <label htmlFor={fundFilterId} className="sr-only">
                  Filter dana masjid
                </label>
                <select
                  id={fundFilterId}
                  aria-label="Filter dana masjid"
                  value={fundFilter}
                  onChange={(e) => setFundFilter(e.target.value)}
                  className="w-full rounded-control border border-nota-border bg-nota-bg px-3 py-2 text-xs sm:text-sm font-medium text-nota-ink focus:border-nota-emerald focus:bg-nota-surface"
                >
                  <option value="all">Semua dana masjid</option>
                  {funds.map((fund) => (
                    <option key={fund.id} value={fund.id}>
                      {fund.name}
                      {fund.restriction === 'restricted'
                        ? ' (Dana Terikat)'
                        : ' (Dana Umum)'}
                      {fund.archivedAt ? ' (Arsip)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {accounts.length > 0 ? (
              <div className="lg:col-span-6">
                <label htmlFor={accountFilterId} className="sr-only">
                  Filter lokasi kas
                </label>
                <select
                  id={accountFilterId}
                  aria-label="Filter lokasi kas"
                  value={accountFilter}
                  onChange={(e) => setAccountFilter(e.target.value)}
                  className="w-full rounded-control border border-nota-border bg-nota-bg px-3 py-2 text-xs sm:text-sm font-medium text-nota-ink focus:border-nota-emerald focus:bg-nota-surface"
                >
                  <option value="all">Semua lokasi kas</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                      {acc.archivedAt ? ' (Arsip)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {/* Transaction List or Empty States */}
      {transactions.length === 0 ? (
        <div className="rounded-panel bg-nota-bg/80 px-5 py-8 text-center space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-nota-ink">
              Belum ada transaksi yang tercatat
            </p>
            <p className="text-xs text-nota-muted max-w-sm mx-auto leading-relaxed">
              Mulai catat pemasukan atau pengeluaran pertama Anda untuk melihat
              riwayat lengkap dan perkembangan saldo.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={onAddIncome}
              className="inline-flex items-center gap-1.5 rounded-control bg-nota-emerald px-4 py-2 text-xs font-semibold text-white hover:bg-nota-emerald-hover transition-colors cursor-pointer"
            >
              <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Catat pemasukan
            </button>
            <button
              type="button"
              onClick={onAddExpense}
              className="inline-flex items-center gap-1.5 rounded-control border border-nota-border bg-nota-surface px-4 py-2 text-xs font-medium text-nota-ink hover:bg-nota-soft-green/50 transition-colors cursor-pointer"
            >
              <ArrowUpRight
                className="h-3.5 w-3.5 text-nota-expense"
                aria-hidden="true"
              />
              Catat pengeluaran
            </button>
          </div>
        </div>
      ) : filteredAndSortedTransactions.length === 0 ? (
        <div className="rounded-panel bg-nota-bg/80 px-5 py-8 text-center space-y-2.5">
          <p className="text-sm font-medium text-nota-ink">
            Tidak ada transaksi yang cocok dengan filter
          </p>
          <p className="text-xs text-nota-muted max-w-xs mx-auto">
            Coba ubah kata kunci pencarian, kategori, atau periode yang dipilih.
          </p>
          <div>
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 rounded-control border border-nota-border bg-nota-surface px-3.5 py-1.5 text-xs font-medium text-nota-ink hover:bg-nota-soft-green/50 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5 text-nota-emerald" aria-hidden="true" />
              Tampilkan semua transaksi
            </button>
          </div>
        </div>
      ) : (
        <ul
          aria-label="Daftar seluruh transaksi"
          className="divide-y divide-nota-border/60 rounded-panel bg-nota-bg/60 px-4 py-1"
        >
          {filteredAndSortedTransactions.map((tx) => {
            const categoryInfo = categoryMap.get(tx.categoryId);
            const categoryName =
              categoryInfo?.name ?? 'Kategori tidak dikenal';
            const fundInfo = fundMap.get(
              tx.fundId ?? DEFAULT_FUND_OPERASIONAL_ID,
            );
            const accountInfo = accountMap.get(
              tx.accountId ?? DEFAULT_CASH_ACCOUNT_TUNAI_ID,
            );
            const isIncome = tx.type === 'income';
            const isConfirmingDelete = confirmDeleteId === tx.id;

            return (
              <li key={tx.id} className="py-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Left: Icon, Category, Mosque Badges, Date, Note */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-control ${
                        isIncome
                          ? 'bg-nota-soft-green text-nota-emerald'
                          : 'bg-nota-expense-soft text-nota-expense'
                      }`}
                      aria-hidden="true"
                    >
                      {isIncome ? (
                        <ArrowDownLeft className="h-4 w-4" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium text-nota-ink truncate">
                          {categoryName}
                        </span>
                        {categoryInfo?.isArchived ? (
                          <span className="rounded-control border border-nota-border bg-nota-surface px-1.5 py-0.5 text-[10px] font-medium text-nota-muted shrink-0">
                            Arsip
                          </span>
                        ) : null}
                        {fundInfo ? (
                          <span
                            className={`rounded-control px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${
                              fundInfo.restriction === 'restricted'
                                ? 'border border-nota-ink/20 bg-nota-surface text-nota-ink'
                                : 'bg-nota-soft-green text-nota-emerald'
                            }`}
                          >
                            {fundInfo.name}
                          </span>
                        ) : null}
                        {accountInfo ? (
                          <span className="rounded-control border border-nota-border bg-nota-surface px-1.5 py-0.5 text-[10px] font-medium text-nota-muted shrink-0">
                            {accountInfo.name}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-nota-muted truncate">
                        <span>{formatLocalDateID(tx.occurredAt)}</span>
                        {tx.donorOrPayee ? (
                          <span> · {tx.donorOrPayee}</span>
                        ) : null}
                        {tx.referenceNo ? (
                          <span> · #{tx.referenceNo}</span>
                        ) : null}
                        {tx.note ? <span> · {tx.note}</span> : null}
                      </p>
                    </div>
                  </div>

                  {/* Right: Signed Amount + Edit/Delete Actions */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`text-sm sm:text-base font-semibold tabular-nums ${
                        isIncome ? 'text-nota-emerald' : 'text-nota-expense'
                      }`}
                    >
                      {isIncome
                        ? `+${formatIDR(tx.amount)}`
                        : `−${formatIDR(tx.amount)}`}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDeleteId(null);
                          setDeleteError(null);
                          onEditTransaction(tx);
                        }}
                        aria-label={`Edit transaksi ${categoryName}${tx.note ? ` ${tx.note}` : ''}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-control border border-nota-border bg-nota-surface text-nota-muted hover:text-nota-ink hover:bg-nota-soft-green/50 transition-colors cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setConfirmDeleteId(
                            isConfirmingDelete ? null : tx.id,
                          );
                        }}
                        aria-label={`Hapus transaksi ${categoryName}${tx.note ? ` ${tx.note}` : ''}`}
                        aria-expanded={isConfirmingDelete}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-control border border-nota-border bg-nota-surface text-nota-muted hover:text-nota-expense hover:bg-nota-expense-soft transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Explicit Delete Confirmation Dialog Bar */}
                {isConfirmingDelete ? (
                  <div
                    role="region"
                    aria-label="Konfirmasi hapus transaksi"
                    className="rounded-panel border border-nota-expense/30 bg-nota-expense-soft/75 p-3 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium text-nota-ink">
                        Hapus catatan{' '}
                        <strong className="font-semibold">
                          {categoryName} ({formatIDR(tx.amount)})
                        </strong>
                        ? Saldo dan ringkasan akan langsung diperbarui.
                      </p>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => {
                            setConfirmDeleteId(null);
                            setDeleteError(null);
                          }}
                          className="rounded-control border border-nota-border bg-nota-surface px-3 py-1 text-xs font-medium text-nota-ink hover:bg-nota-bg transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => void handleConfirmDelete(tx.id)}
                          className="rounded-control bg-nota-expense px-3 py-1 text-xs font-semibold text-white hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-55"
                        >
                          {isDeleting ? 'Menghapus...' : 'Ya, hapus'}
                        </button>
                      </div>
                    </div>

                    {deleteError ? (
                      <div
                        role="alert"
                        className="flex items-center gap-1.5 text-xs font-medium text-nota-expense"
                      >
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>{deleteError}</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

