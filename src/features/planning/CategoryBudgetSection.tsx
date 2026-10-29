import { type FormEvent, useEffect, useId, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  PencilLine,
  PieChart,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  type BudgetUsageStatus,
  type CategoryBudget,
  calculateBudgetOverview,
  validateCategoryBudgetInput,
} from '../../domain/budget';
import {
  type Category,
  type Transaction,
  getSelectableCategories,
} from '../../domain/transaction';
import type { DateRangePeriod } from '../../lib/date';
import {
  formatIDR,
  formatIdrDigits,
  parseIdrInputDigits,
} from '../../lib/format';

interface CategoryBudgetSectionProps {
  budgets: readonly CategoryBudget[];
  transactions: readonly Transaction[];
  categories: readonly Category[];
  selectedPeriod: DateRangePeriod;
  periodLabel: string;
  onSaveBudget: (input: {
    categoryId: string;
    monthlyLimit: number;
  }) => Promise<void>;
  onDeleteBudget: (categoryId: string) => Promise<void>;
}

function getStatusBadgeMeta(status: BudgetUsageStatus): {
  label: string;
  badgeClassName: string;
  barClassName: string;
} {
  switch (status) {
    case 'exceeded':
      return {
        label: 'Melebihi anggaran',
        badgeClassName:
          'border border-nota-expense/30 bg-nota-expense-soft text-nota-expense',
        barClassName: 'bg-nota-expense',
      };
    case 'near-limit':
      return {
        label: 'Mendekati batas',
        badgeClassName:
          'border border-nota-border bg-nota-lime text-nota-ink',
        barClassName: 'bg-nota-ink',
      };
    case 'safe':
    default:
      return {
        label: 'Dalam anggaran',
        badgeClassName:
          'border border-nota-emerald/25 bg-nota-soft-green text-nota-emerald',
        barClassName: 'bg-nota-emerald',
      };
  }
}

export function CategoryBudgetSection({
  budgets,
  transactions,
  categories,
  selectedPeriod,
  periodLabel,
  onSaveBudget,
  onDeleteBudget,
}: CategoryBudgetSectionProps) {
  const categorySelectId = useId();
  const limitInputId = useId();
  const errorId = useId();

  const budgetOverview = useMemo(
    () =>
      calculateBudgetOverview(
        budgets,
        transactions,
        categories,
        selectedPeriod,
      ),
    [budgets, transactions, categories, selectedPeriod],
  );

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [rawLimitInput, setRawLimitInput] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [pendingDeleteCategoryId, setPendingDeleteCategoryId] = useState<
    string | null
  >(null);
  const [isDeletingCategoryId, setIsDeletingCategoryId] = useState<
    string | null
  >(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const selectableExpenseCategories = useMemo(
    () =>
      getSelectableCategories(
        categories,
        'expense',
        editingCategoryId ?? undefined,
      ),
    [categories, editingCategoryId],
  );

  const existingBudgetByCategoryId = useMemo(
    () => new Map(budgets.map((b) => [b.categoryId, b])),
    [budgets],
  );

  useEffect(() => {
    if (!isFormOpen) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSubmitting) {
        event.preventDefault();
        setIsFormOpen(false);
        setEditingCategoryId(null);
        setFormError(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFormOpen, isSubmitting]);

  function openNewBudgetForm() {
    const firstUnbudgeted = selectableExpenseCategories.find(
      (cat) => !existingBudgetByCategoryId.has(cat.id),
    );
    const defaultCatId =
      firstUnbudgeted?.id ?? selectableExpenseCategories[0]?.id ?? '';
    const existingForDefault = existingBudgetByCategoryId.get(defaultCatId);

    setEditingCategoryId(null);
    setSelectedCategoryId(defaultCatId);
    setRawLimitInput(
      existingForDefault
        ? formatIdrDigits(existingForDefault.monthlyLimit)
        : '',
    );
    setFormError(null);
    setIsFormOpen(true);
  }

  function openEditBudgetForm(categoryId: string, currentLimit: number) {
    setEditingCategoryId(categoryId);
    setSelectedCategoryId(categoryId);
    setRawLimitInput(formatIdrDigits(currentLimit));
    setFormError(null);
    setIsFormOpen(true);
  }

  function closeForm() {
    if (isSubmitting) {
      return;
    }
    setIsFormOpen(false);
    setEditingCategoryId(null);
    setFormError(null);
  }

  function handleCategorySelectionChange(nextCategoryId: string) {
    setSelectedCategoryId(nextCategoryId);
    setFormError(null);
    const existing = existingBudgetByCategoryId.get(nextCategoryId);
    if (existing && !editingCategoryId) {
      setRawLimitInput(formatIdrDigits(existing.monthlyLimit));
    }
  }

  function handleLimitInputChange(rawValue: string) {
    setFormError(null);
    const digitsOnly = rawValue.replace(/\D/g, '');
    if (!digitsOnly) {
      setRawLimitInput('');
      return;
    }
    const parsed = Number(digitsOnly);
    if (Number.isSafeInteger(parsed)) {
      setRawLimitInput(formatIdrDigits(parsed));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const parsedLimit = parseIdrInputDigits(rawLimitInput);
    if (parsedLimit === null || parsedLimit <= 0) {
      setFormError(
        'Masukkan batas anggaran bulanan dalam bilangan bulat Rupiah lebih dari Rp 0.',
      );
      return;
    }

    const validation = validateCategoryBudgetInput(
      {
        categoryId: selectedCategoryId,
        monthlyLimit: parsedLimit,
      },
      categories,
      editingCategoryId
        ? { allowArchivedCategoryId: editingCategoryId }
        : undefined,
    );

    if (!validation.valid) {
      setFormError(validation.errors[0]);
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      await onSaveBudget({
        categoryId: selectedCategoryId,
        monthlyLimit: parsedLimit,
      });
      setIsFormOpen(false);
      setEditingCategoryId(null);
      setRawLimitInput('');
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Gagal menyimpan batas anggaran kategori.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmDelete(categoryId: string) {
    if (isDeletingCategoryId) {
      return;
    }
    setIsDeletingCategoryId(categoryId);
    setDeleteError(null);
    try {
      await onDeleteBudget(categoryId);
      setPendingDeleteCategoryId(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : 'Gagal menghapus anggaran kategori.',
      );
    } finally {
      setIsDeletingCategoryId(null);
    }
  }

  return (
    <section
      aria-label="Anggaran Bulanan per Kategori"
      className="rounded-hero bg-nota-surface p-6 sm:p-7 border border-nota-border/70 space-y-6"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-control border border-nota-border bg-nota-bg text-nota-emerald">
            <PieChart className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-semibold text-nota-ink">
                Anggaran Bulanan per Kategori
              </h2>
              <span className="rounded-control border border-nota-border bg-nota-bg px-2.5 py-0.5 text-xs font-medium text-nota-muted">
                {periodLabel}
              </span>
            </div>
            <p className="text-xs text-nota-muted">
              Pantau batas pengeluaran bulanan per kategori tanpa mengubah saldo
              tercatat.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openNewBudgetForm}
          className="inline-flex items-center gap-1.5 rounded-control bg-nota-emerald px-3.5 py-2 text-xs sm:text-sm font-medium text-white hover:bg-nota-emerald-hover transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Atur anggaran
        </button>
      </div>

      {/* Inline Add / Edit Budget Form */}
      {isFormOpen ? (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          noValidate
          aria-label="Formulir anggaran kategori"
          className="rounded-panel border border-nota-border bg-nota-bg p-4 sm:p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-nota-ink">
              {editingCategoryId
                ? 'Ubah batas anggaran kategori'
                : 'Atur batas anggaran kategori'}
            </h3>
            <button
              type="button"
              onClick={closeForm}
              disabled={isSubmitting}
              aria-label="Tutup formulir anggaran"
              className="inline-flex h-7 w-7 items-center justify-center rounded-control text-nota-muted hover:bg-nota-surface hover:text-nota-ink transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Category Select */}
            <div className="space-y-1.5">
              <label
                htmlFor={categorySelectId}
                className="block text-xs font-medium text-nota-ink"
              >
                Kategori pengeluaran
              </label>
              <select
                id={categorySelectId}
                value={selectedCategoryId}
                disabled={Boolean(editingCategoryId) || isSubmitting}
                onChange={(e) => handleCategorySelectionChange(e.target.value)}
                className="w-full rounded-control border border-nota-border bg-nota-surface px-3.5 py-2 text-sm text-nota-ink disabled:opacity-60"
              >
                {selectableExpenseCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                    {cat.archivedAt ? ' (Arsip)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Monthly Limit Input */}
            <div className="space-y-1.5">
              <label
                htmlFor={limitInputId}
                className="block text-xs font-medium text-nota-ink"
              >
                Batas anggaran bulanan (IDR)
              </label>
              <div className="relative flex items-center">
                <span
                  className="pointer-events-none absolute left-3.5 text-sm font-medium text-nota-muted select-none"
                  aria-hidden="true"
                >
                  Rp
                </span>
                <input
                  id={limitInputId}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Contoh: 1.500.000"
                  value={rawLimitInput}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(formError)}
                  aria-describedby={formError ? errorId : undefined}
                  onChange={(e) => handleLimitInputChange(e.target.value)}
                  className="w-full rounded-control border border-nota-border bg-nota-surface py-2 pl-10 pr-3.5 text-sm font-medium text-nota-ink tabular-nums placeholder:text-nota-muted/60"
                />
              </div>
            </div>
          </div>

          {formError ? (
            <div
              id={errorId}
              role="alert"
              className="flex items-start gap-2 rounded-control border border-nota-expense/30 bg-nota-expense-soft px-3.5 py-2.5 text-xs font-medium text-nota-expense"
            >
              <AlertCircle
                className="h-4 w-4 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <span>{formError}</span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={closeForm}
              disabled={isSubmitting}
              className="rounded-control border border-nota-border bg-nota-surface px-4 py-2 text-xs sm:text-sm font-medium text-nota-ink hover:bg-nota-soft-green/40 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-control bg-nota-emerald px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-nota-emerald-hover transition-colors cursor-pointer disabled:opacity-55"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {isSubmitting ? 'Menyimpan...' : 'Simpan anggaran'}
            </button>
          </div>
        </form>
      ) : null}

      {deleteError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-control border border-nota-expense/30 bg-nota-expense-soft px-3.5 py-2.5 text-xs font-medium text-nota-expense"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{deleteError}</span>
        </div>
      ) : null}

      {/* Empty State or Budget Overview & List */}
      {budgetOverview.items.length === 0 ? (
        <div className="rounded-panel bg-nota-bg/80 px-5 py-8 text-center space-y-2">
          <p className="text-sm font-medium text-nota-ink">
            Belum ada anggaran kategori
          </p>
          <p className="text-xs text-nota-muted max-w-md mx-auto leading-relaxed">
            Tetapkan batas pengeluaran bulanan untuk kategori seperti Makanan &
            Minuman atau Transportasi agar penggunaan anggaran pada{' '}
            {periodLabel} terpantau dengan jelas.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Aggregate Summary Strip */}
          <div
            data-testid="budget-summary-strip"
            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          >
            <div className="rounded-panel bg-nota-bg/75 p-4 border border-nota-border/60">
              <span className="text-xs font-medium text-nota-muted block">
                Total anggaran kategori
              </span>
              <span
                data-testid="budget-total-limit"
                className="mt-1 block text-base sm:text-lg font-semibold text-nota-ink tabular-nums"
              >
                {formatIDR(budgetOverview.totalBudgetedLimit)}
              </span>
            </div>

            <div className="rounded-panel bg-nota-bg/75 p-4 border border-nota-border/60">
              <span className="text-xs font-medium text-nota-muted block">
                Terpakai ({periodLabel})
              </span>
              <span
                data-testid="budget-total-spent"
                className="mt-1 block text-base sm:text-lg font-semibold text-nota-ink tabular-nums"
              >
                {formatIDR(budgetOverview.totalBudgetedSpent)}{' '}
                <span className="text-xs font-normal text-nota-muted">
                  (
                  {budgetOverview.totalBudgetedLimit > 0
                    ? Math.round(
                        (budgetOverview.totalBudgetedSpent /
                          budgetOverview.totalBudgetedLimit) *
                          100,
                      )
                    : 0}
                  %)
                </span>
              </span>
            </div>

            <div className="rounded-panel bg-nota-bg/75 p-4 border border-nota-border/60">
              <span className="text-xs font-medium text-nota-muted block">
                Sisa dari batas kategori
              </span>
              <span
                data-testid="budget-total-remaining"
                className="mt-1 block text-base sm:text-lg font-semibold text-nota-emerald tabular-nums"
              >
                {formatIDR(budgetOverview.totalRemaining)}
              </span>
            </div>
          </div>

          {/* Per-Category Budget Progress List */}
          <ul
            aria-label="Daftar anggaran kategori"
            className="space-y-3"
          >
            {budgetOverview.items.map((item) => {
              const statusMeta = getStatusBadgeMeta(item.status);
              const isConfirmingDelete =
                pendingDeleteCategoryId === item.categoryId;
              const isDeletingThis = isDeletingCategoryId === item.categoryId;
              const barWidthPercent = Math.min(
                100,
                item.spentAmount > 0 ? Math.max(item.usagePercent, 4) : 0,
              );

              return (
                <li
                  key={item.id}
                  data-testid={`budget-item-${item.categoryId}`}
                  className="rounded-panel border border-nota-border/70 bg-nota-bg/65 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-nota-ink">
                          {item.categoryName}
                        </span>
                        {item.isArchived ? (
                          <span className="rounded-control border border-nota-border bg-nota-surface px-1.5 py-0.5 text-[10px] font-medium text-nota-muted">
                            Arsip
                          </span>
                        ) : null}
                        <span
                          className={`rounded-control px-2 py-0.5 text-[11px] font-medium ${statusMeta.badgeClassName}`}
                        >
                          {statusMeta.label}
                        </span>
                      </div>

                      <p className="text-xs text-nota-muted tabular-nums">
                        Terpakai{' '}
                        <strong className="font-semibold text-nota-ink">
                          {formatIDR(item.spentAmount)}
                        </strong>{' '}
                        dari{' '}
                        <strong className="font-semibold text-nota-ink">
                          {formatIDR(item.monthlyLimit)}
                        </strong>{' '}
                        ({item.usagePercent}%)
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-xs font-semibold tabular-nums ${
                          item.overAmount > 0
                            ? 'text-nota-expense'
                            : 'text-nota-emerald'
                        }`}
                      >
                        {item.overAmount > 0
                          ? `Lewat ${formatIDR(item.overAmount)}`
                          : `Sisa ${formatIDR(item.remainingAmount)}`}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          openEditBudgetForm(
                            item.categoryId,
                            item.monthlyLimit,
                          )
                        }
                        aria-label={`Ubah anggaran ${item.categoryName}`}
                        className="inline-flex items-center gap-1 rounded-control border border-nota-border bg-nota-surface px-2.5 py-1 text-xs font-medium text-nota-ink hover:bg-nota-soft-green/50 transition-colors cursor-pointer"
                      >
                        <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
                        Ubah
                      </button>

                      {!isConfirmingDelete ? (
                        <button
                          type="button"
                          onClick={() =>
                            setPendingDeleteCategoryId(item.categoryId)
                          }
                          aria-label={`Hapus anggaran ${item.categoryName}`}
                          className="inline-flex items-center gap-1 rounded-control border border-nota-border bg-nota-surface px-2.5 py-1 text-xs font-medium text-nota-expense hover:bg-nota-expense-soft transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Hapus
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div
                    role="progressbar"
                    aria-label={`Penggunaan anggaran ${item.categoryName}`}
                    aria-valuenow={Math.min(100, item.usagePercent)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-2 w-full overflow-hidden rounded-control bg-nota-border/60"
                  >
                    {barWidthPercent > 0 ? (
                      <div
                        style={{ width: `${barWidthPercent}%` }}
                        className={`h-full rounded-control transition-all ${statusMeta.barClassName}`}
                      />
                    ) : null}
                  </div>

                  {/* Inline Delete Confirmation */}
                  {isConfirmingDelete ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-nota-expense/30 bg-nota-expense-soft/70 px-3 py-2 text-xs">
                      <span className="font-medium text-nota-ink">
                        Hapus batas anggaran untuk{' '}
                        <strong>{item.categoryName}</strong>? Transaksi yang
                        tercatat tidak akan terhapus.
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isDeletingThis}
                          onClick={() => setPendingDeleteCategoryId(null)}
                          className="rounded-control border border-nota-border bg-nota-surface px-2.5 py-1 text-xs font-medium text-nota-ink hover:bg-nota-bg transition-colors cursor-pointer"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          disabled={isDeletingThis}
                          onClick={() =>
                            void handleConfirmDelete(item.categoryId)
                          }
                          className="rounded-control bg-nota-expense px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-55"
                        >
                          {isDeletingThis
                            ? 'Menghapus...'
                            : 'Ya, hapus anggaran'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
