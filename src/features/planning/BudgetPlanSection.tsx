import { type FormEvent, useEffect, useId, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ClipboardList,
  PencilLine,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  type BudgetItemStatus,
  type BudgetLineItemInput,
  type BudgetPlan,
  type BudgetPlanInput,
  type BudgetPlanKind,
  type BudgetPlanPatch,
  MAX_BUDGET_LINE_DESC_LENGTH,
  MAX_BUDGET_PLAN_NOTE_LENGTH,
  MAX_BUDGET_PLAN_TITLE_LENGTH,
  calculateBudgetPlanOverview,
  validateBudgetPlanInput,
} from '../../domain/budgetPlan';
import { MAX_IDR_AMOUNT } from '../../domain/money';
import type { Fund } from '../../domain/mosque';
import {
  type Category,
  type Transaction,
  type TransactionType,
  getSelectableCategories,
} from '../../domain/transaction';
import type { DateRangePeriod } from '../../lib/date';
import {
  formatIDR,
  formatIdrDigits,
  formatLocalDateID,
  parseIdrInputDigits,
} from '../../lib/format';

interface BudgetPlanSectionProps {
  budgetPlans: readonly BudgetPlan[];
  transactions: readonly Transaction[];
  categories: readonly Category[];
  funds: readonly Fund[];
  selectedPeriod: DateRangePeriod;
  periodLabel: string;
  onCreateBudgetPlan: (input: BudgetPlanInput) => Promise<void>;
  onUpdateBudgetPlan: (planId: string, patch: BudgetPlanPatch) => Promise<void>;
  onDeleteBudgetPlan: (planId: string) => Promise<void>;
}

interface DraftLineItem {
  key: string;
  id?: string;
  type: TransactionType;
  categoryId: string;
  description: string;
  rawAmount: string;
}

function getLineStatusMeta(
  status: BudgetItemStatus,
  type: TransactionType,
): {
  label: string;
  badgeClassName: string;
  barClassName: string;
} {
  if (type === 'income') {
    if (status === 'exceeded' || status === 'near_limit') {
      return {
        label: status === 'exceeded' ? 'Melampaui target' : 'Mendekati target',
        badgeClassName:
          'border border-nota-emerald/30 bg-nota-soft-green text-nota-emerald',
        barClassName: 'bg-nota-emerald',
      };
    }
    return {
      label: 'Dalam penggalangan',
      badgeClassName: 'border border-nota-border bg-nota-bg text-nota-muted',
      barClassName: 'bg-nota-emerald/75',
    };
  }

  switch (status) {
    case 'exceeded':
      return {
        label: 'Melebihi anggaran',
        badgeClassName:
          'border border-nota-expense/30 bg-nota-expense-soft text-nota-expense',
        barClassName: 'bg-nota-expense',
      };
    case 'near_limit':
      return {
        label: 'Mendekati batas',
        badgeClassName: 'border border-nota-border bg-nota-lime text-nota-ink',
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

export function BudgetPlanSection({
  budgetPlans,
  transactions,
  categories,
  funds,
  selectedPeriod,
  periodLabel,
  onCreateBudgetPlan,
  onUpdateBudgetPlan,
  onDeleteBudgetPlan,
}: BudgetPlanSectionProps) {
  const titleInputId = useId();
  const startInputId = useId();
  const endInputId = useId();
  const fundSelectId = useId();
  const noteInputId = useId();
  const errorAlertId = useId();

  const [kindFilter, setKindFilter] = useState<'all' | BudgetPlanKind>('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<BudgetPlanKind>('activity_rab');
  const [periodStart, setPeriodStart] = useState(selectedPeriod.startDate);
  const [periodEnd, setPeriodEnd] = useState(selectedPeriod.endDate);
  const [fundId, setFundId] = useState('');
  const [note, setNote] = useState('');
  const [draftItems, setDraftItems] = useState<DraftLineItem[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [pendingDeletePlanId, setPendingDeletePlanId] = useState<string | null>(
    null,
  );
  const [isDeletingPlanId, setIsDeletingPlanId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fundNameMap = useMemo(
    () => new Map(funds.map((f) => [f.id, f.name])),
    [funds],
  );

  const selectableExpenseCategories = useMemo(
    () => getSelectableCategories(categories, 'expense'),
    [categories],
  );
  const selectableIncomeCategories = useMemo(
    () => getSelectableCategories(categories, 'income'),
    [categories],
  );

  const planOverviews = useMemo(
    () =>
      budgetPlans
        .filter((plan) =>
          kindFilter === 'all' ? true : plan.kind === kindFilter,
        )
        .map((plan) =>
          calculateBudgetPlanOverview(plan, transactions, categories),
        ),
    [budgetPlans, transactions, categories, kindFilter],
  );

  const aggregateStats = useMemo(() => {
    let plannedExpense = 0;
    let actualExpense = 0;
    let plannedIncome = 0;
    let actualIncome = 0;
    for (const ov of planOverviews) {
      plannedExpense += ov.totalPlannedExpense;
      actualExpense += ov.totalActualExpense;
      plannedIncome += ov.totalPlannedIncome;
      actualIncome += ov.totalActualIncome;
    }
    return {
      plannedExpense,
      actualExpense,
      remainingExpense: plannedExpense - actualExpense,
      plannedIncome,
      actualIncome,
    };
  }, [planOverviews]);

  useEffect(() => {
    if (!isFormOpen) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSubmitting) {
        event.preventDefault();
        setIsFormOpen(false);
        setEditingPlanId(null);
        setFormError(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFormOpen, isSubmitting]);

  function createEmptyDraftLine(
    type: TransactionType = 'expense',
    indexSuffix: number = Date.now(),
  ): DraftLineItem {
    const defaultCat =
      type === 'expense'
        ? selectableExpenseCategories[0]?.id ?? ''
        : selectableIncomeCategories[0]?.id ?? '';
    return {
      key: `line-${indexSuffix}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      categoryId: defaultCat,
      description: '',
      rawAmount: '',
    };
  }

  function openCreateForm(initialKind: BudgetPlanKind = 'activity_rab') {
    setEditingPlanId(null);
    setKind(initialKind);
    setTitle(
      initialKind === 'monthly_operational'
        ? `Anggaran Operasional ${periodLabel}`
        : '',
    );
    setPeriodStart(selectedPeriod.startDate);
    setPeriodEnd(selectedPeriod.endDate);
    setFundId('');
    setNote('');
    setDraftItems([createEmptyDraftLine('expense', 1)]);
    setFormError(null);
    setIsFormOpen(true);
  }

  function openEditForm(plan: BudgetPlan) {
    setEditingPlanId(plan.id);
    setTitle(plan.title);
    setKind(plan.kind);
    setPeriodStart(plan.periodStart);
    setPeriodEnd(plan.periodEnd);
    setFundId(plan.fundId ?? '');
    setNote(plan.note ?? '');
    setDraftItems(
      plan.items.map((item, idx) => ({
        key: item.id || `line-edit-${idx}`,
        id: item.id,
        type: item.type,
        categoryId: item.categoryId,
        description: item.description,
        rawAmount: formatIdrDigits(item.plannedAmount),
      })),
    );
    setFormError(null);
    setIsFormOpen(true);
  }

  function closeForm() {
    if (isSubmitting) {
      return;
    }
    setIsFormOpen(false);
    setEditingPlanId(null);
    setFormError(null);
  }

  function handleUpdateLine(
    key: string,
    patch: Partial<Omit<DraftLineItem, 'key'>>,
  ) {
    setFormError(null);
    setDraftItems((prev) =>
      prev.map((line) => {
        if (line.key !== key) {
          return line;
        }
        const nextLine = { ...line, ...patch };
        if (patch.type && patch.type !== line.type) {
          const validList =
            patch.type === 'expense'
              ? selectableExpenseCategories
              : selectableIncomeCategories;
          nextLine.categoryId = validList[0]?.id ?? '';
        }
        return nextLine;
      }),
    );
  }

  function handleLineAmountChange(key: string, rawValue: string) {
    setFormError(null);
    const digitsOnly = rawValue.replace(/\D/g, '');
    if (!digitsOnly) {
      handleUpdateLine(key, { rawAmount: '' });
      return;
    }
    const numeric = Number(digitsOnly);
    if (Number.isSafeInteger(numeric) && numeric <= MAX_IDR_AMOUNT) {
      handleUpdateLine(key, { rawAmount: formatIdrDigits(numeric) });
    }
  }

  function handleAddLineItem(type: TransactionType = 'expense') {
    setFormError(null);
    setDraftItems((prev) => [
      ...prev,
      createEmptyDraftLine(type, prev.length + 1),
    ]);
  }

  function handleRemoveLineItem(key: string) {
    setFormError(null);
    setDraftItems((prev) =>
      prev.length > 1 ? prev.filter((item) => item.key !== key) : prev,
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const parsedItems: BudgetLineItemInput[] = [];
    for (let i = 0; i < draftItems.length; i += 1) {
      const line = draftItems[i];
      const parsedAmount = parseIdrInputDigits(line.rawAmount);
      parsedItems.push({
        ...(line.id ? { id: line.id } : {}),
        type: line.type,
        categoryId: line.categoryId,
        description: line.description,
        plannedAmount: parsedAmount ?? 0,
      });
    }

    const candidateInput: BudgetPlanInput = {
      title,
      kind,
      periodStart,
      periodEnd,
      fundId: fundId.trim() || undefined,
      note: note.trim() || undefined,
      items: parsedItems,
    };

    const validation = validateBudgetPlanInput(candidateInput, categories);
    if (!validation.valid) {
      setFormError(validation.errors[0]);
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      if (editingPlanId) {
        await onUpdateBudgetPlan(editingPlanId, {
          title: candidateInput.title,
          kind: candidateInput.kind,
          periodStart: candidateInput.periodStart,
          periodEnd: candidateInput.periodEnd,
          fundId: fundId.trim(),
          note: note.trim(),
          items: candidateInput.items,
        });
      } else {
        await onCreateBudgetPlan(candidateInput);
      }
      setIsFormOpen(false);
      setEditingPlanId(null);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Gagal menyimpan dokumen RAB / anggaran masjid.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmDelete(planId: string) {
    if (isDeletingPlanId) {
      return;
    }
    setIsDeletingPlanId(planId);
    setDeleteError(null);
    try {
      await onDeleteBudgetPlan(planId);
      setPendingDeletePlanId(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : 'Gagal menghapus dokumen RAB / anggaran.',
      );
    } finally {
      setIsDeletingPlanId(null);
    }
  }

  return (
    <section
      aria-label="Anggaran Operasional & RAB Kegiatan Masjid"
      className="rounded-hero bg-nota-surface p-6 sm:p-7 border border-nota-border/70 space-y-6"
    >
      {/* Header & Primary Action */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-nota-border bg-nota-soft-green text-nota-emerald">
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-semibold text-nota-ink">
                Anggaran Operasional & RAB Kegiatan Masjid
              </h2>
              <span className="rounded-control border border-nota-border bg-nota-bg px-2.5 py-0.5 text-xs font-medium text-nota-muted">
                {budgetPlans.length} dokumen RAB
              </span>
            </div>
            <p className="text-xs sm:text-sm text-nota-muted max-w-2xl">
              Susun Rencana Anggaran Biaya (RAB) kepanitiaan maupun operasional
              bulanan masjid, lalu pantau realisasi aktualnya dari transaksi
              tercatat tanpa mengubah saldo kas atau dana.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openCreateForm('activity_rab')}
            className="inline-flex items-center gap-1.5 rounded-control bg-nota-emerald px-4 py-2 text-xs sm:text-sm font-medium text-white hover:bg-nota-emerald-hover transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Buat RAB / Anggaran
          </button>
        </div>
      </div>

      {/* Filter Pills */}
      {budgetPlans.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-nota-border/60 pt-4">
          <div
            role="group"
            aria-label="Filter jenis RAB"
            className="inline-flex flex-wrap items-center gap-1.5 rounded-control border border-nota-border bg-nota-bg p-1"
          >
            {(
              [
                { value: 'all', label: 'Semua Rencana' },
                { value: 'activity_rab', label: 'RAB Kegiatan' },
                { value: 'monthly_operational', label: 'Operasional Bulanan' },
              ] as const
            ).map((tab) => {
              const isActive = kindFilter === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setKindFilter(tab.value)}
                  aria-pressed={isActive}
                  className={`rounded-control px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-nota-emerald text-white'
                      : 'text-nota-muted hover:text-nota-ink'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-nota-muted">
            <span>
              Total Anggaran Belanja:{' '}
              <strong className="font-semibold text-nota-ink tabular-nums">
                {formatIDR(aggregateStats.plannedExpense)}
              </strong>
            </span>
            <span>
              Realisasi Belanja:{' '}
              <strong className="font-semibold text-nota-expense tabular-nums">
                {formatIDR(aggregateStats.actualExpense)}
              </strong>
            </span>
            <span>
              Sisa Anggaran:{' '}
              <strong
                className={`font-semibold tabular-nums ${
                  aggregateStats.remainingExpense < 0
                    ? 'text-nota-expense'
                    : 'text-nota-emerald'
                }`}
              >
                {formatIDR(aggregateStats.remainingExpense)}
              </strong>
            </span>
          </div>
        </div>
      ) : null}

      {/* Create / Edit RAB Form */}
      {isFormOpen ? (
        <form
          onSubmit={handleSubmit}
          noValidate
          aria-label={
            editingPlanId ? 'Formulir ubah RAB' : 'Formulir buat RAB baru'
          }
          className="rounded-panel border border-nota-border bg-nota-bg/70 p-4 sm:p-5 space-y-5"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm sm:text-base font-semibold text-nota-ink">
              {editingPlanId
                ? 'Ubah Dokumen RAB / Anggaran'
                : 'Susun Dokumen RAB / Anggaran Baru'}
            </h3>
            <button
              type="button"
              onClick={closeForm}
              aria-label="Tutup formulir RAB"
              className="inline-flex h-7 w-7 items-center justify-center rounded-control text-nota-muted hover:bg-nota-surface hover:text-nota-ink transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {formError ? (
            <div
              id={errorAlertId}
              role="alert"
              aria-live="polite"
              className="flex items-start gap-2 rounded-badge border border-nota-expense/30 bg-nota-expense-soft px-3.5 py-2.5 text-xs text-nota-expense"
            >
              <AlertCircle
                className="h-4 w-4 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <span>{formError}</span>
            </div>
          ) : null}

          {/* Radio selection for BudgetPlanKind (2 options -> visible radios per modern-web-guidance `forms`) */}
          <fieldset className="space-y-2">
            <legend className="block text-xs font-medium text-nota-ink">
              Jenis Dokumen Perencanaan
            </legend>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <label
                className={`flex items-start gap-2.5 rounded-panel border p-3 text-xs cursor-pointer transition-colors ${
                  kind === 'activity_rab'
                    ? 'border-nota-emerald bg-nota-soft-green/60 text-nota-ink'
                    : 'border-nota-border bg-nota-surface text-nota-muted hover:text-nota-ink'
                }`}
              >
                <input
                  type="radio"
                  name="budgetPlanKind"
                  value="activity_rab"
                  checked={kind === 'activity_rab'}
                  onChange={() => {
                    setKind('activity_rab');
                    setFormError(null);
                  }}
                  className="mt-0.5 accent-nota-emerald"
                />
                <div>
                  <span className="font-semibold text-nota-ink block">
                    RAB Kegiatan / Kepanitiaan
                  </span>
                  <span className="text-[11px] text-nota-muted">
                    Untuk program khusus seperti Ramadhan, Qurban, Santunan,
                    atau Proyek Renovasi.
                  </span>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 rounded-panel border p-3 text-xs cursor-pointer transition-colors ${
                  kind === 'monthly_operational'
                    ? 'border-nota-emerald bg-nota-soft-green/60 text-nota-ink'
                    : 'border-nota-border bg-nota-surface text-nota-muted hover:text-nota-ink'
                }`}
              >
                <input
                  type="radio"
                  name="budgetPlanKind"
                  value="monthly_operational"
                  checked={kind === 'monthly_operational'}
                  onChange={() => {
                    setKind('monthly_operational');
                    setFormError(null);
                  }}
                  className="mt-0.5 accent-nota-emerald"
                />
                <div>
                  <span className="font-semibold text-nota-ink block">
                    Anggaran Operasional Bulanan
                  </span>
                  <span className="text-[11px] text-nota-muted">
                    Untuk kebutuhan rutin bulanan masjid (listrik, air,
                    kebersihan, bisyaroh).
                  </span>
                </div>
              </label>
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label
                htmlFor={titleInputId}
                className="block text-xs font-medium text-nota-ink"
              >
                Judul RAB / Anggaran
              </label>
              <input
                id={titleInputId}
                name="title"
                type="text"
                maxLength={MAX_BUDGET_PLAN_TITLE_LENGTH}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setFormError(null);
                }}
                placeholder="Contoh: RAB Kegiatan Ramadhan 1448 H"
                aria-invalid={formError ? 'true' : 'false'}
                aria-describedby={formError ? errorAlertId : undefined}
                className="w-full rounded-badge border border-nota-border bg-nota-surface px-3 py-2 text-sm text-nota-ink"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor={startInputId}
                className="block text-xs font-medium text-nota-ink"
              >
                Tanggal mulai periode
              </label>
              <input
                id={startInputId}
                name="periodStart"
                type="date"
                value={periodStart}
                onChange={(e) => {
                  setPeriodStart(e.target.value);
                  setFormError(null);
                }}
                className="w-full rounded-badge border border-nota-border bg-nota-surface px-3 py-2 text-sm text-nota-ink"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor={endInputId}
                className="block text-xs font-medium text-nota-ink"
              >
                Tanggal selesai periode
              </label>
              <input
                id={endInputId}
                name="periodEnd"
                type="date"
                value={periodEnd}
                onChange={(e) => {
                  setPeriodEnd(e.target.value);
                  setFormError(null);
                }}
                className="w-full rounded-badge border border-nota-border bg-nota-surface px-3 py-2 text-sm text-nota-ink"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor={fundSelectId}
                className="block text-xs font-medium text-nota-ink"
              >
                Kaitkan ke Dana Masjid (opsional)
              </label>
              <select
                id={fundSelectId}
                name="fundId"
                value={fundId}
                onChange={(e) => {
                  setFundId(e.target.value);
                  setFormError(null);
                }}
                className="w-full rounded-badge border border-nota-border bg-nota-surface px-3 py-2 text-sm text-nota-ink"
              >
                <option value="">Semua Dana Masjid (Lintas Dana)</option>
                {funds
                  .filter((f) => !f.archivedAt || f.id === fundId)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} (
                      {f.restriction === 'restricted'
                        ? 'Dana Terikat'
                        : 'Dana Umum'}
                      )
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor={noteInputId}
                className="block text-xs font-medium text-nota-ink"
              >
                Catatan / Keterangan Kepanitiaan (opsional)
              </label>
              <input
                id={noteInputId}
                name="note"
                type="text"
                maxLength={MAX_BUDGET_PLAN_NOTE_LENGTH}
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  setFormError(null);
                }}
                placeholder="Contoh: Disetujui rapat DKM tanggal 1 Oktober"
                className="w-full rounded-badge border border-nota-border bg-nota-surface px-3 py-2 text-sm text-nota-ink"
              />
            </div>
          </div>

          {/* Line Items Builder */}
          <div className="space-y-3 border-t border-nota-border/70 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs sm:text-sm font-semibold text-nota-ink">
                  Rincian Pos Anggaran (Baris Item RAB)
                </h4>
                <p className="text-xs text-nota-muted">
                  Tambahkan pos rencana pengeluaran maupun target penerimaan
                  per kategori.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAddLineItem('expense')}
                  className="inline-flex items-center gap-1 rounded-control border border-nota-border bg-nota-surface px-3 py-1.5 text-xs font-medium text-nota-ink hover:bg-nota-soft-green/50 transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5 text-nota-expense" />
                  Tambah Pos Pengeluaran
                </button>
                <button
                  type="button"
                  onClick={() => handleAddLineItem('income')}
                  className="inline-flex items-center gap-1 rounded-control border border-nota-border bg-nota-surface px-3 py-1.5 text-xs font-medium text-nota-ink hover:bg-nota-soft-green/50 transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5 text-nota-emerald" />
                  Tambah Target Penerimaan
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              {draftItems.map((line, index) => {
                const categoryOptions =
                  line.type === 'expense'
                    ? getSelectableCategories(
                        categories,
                        'expense',
                        line.categoryId,
                      )
                    : getSelectableCategories(
                        categories,
                        'income',
                        line.categoryId,
                      );

                return (
                  <div
                    key={line.key}
                    data-testid={`rab-draft-line-${index}`}
                    className="grid grid-cols-1 gap-2.5 rounded-panel border border-nota-border/80 bg-nota-surface p-3 sm:grid-cols-12 sm:items-end"
                  >
                    <div className="space-y-1 sm:col-span-2">
                      <label
                        htmlFor={`line-type-${line.key}`}
                        className="block text-[11px] font-medium text-nota-muted"
                      >
                        Jenis Pos #{index + 1}
                      </label>
                      <select
                        id={`line-type-${line.key}`}
                        name={`lineType-${index}`}
                        value={line.type}
                        onChange={(e) =>
                          handleUpdateLine(line.key, {
                            type: e.target.value as TransactionType,
                          })
                        }
                        className="w-full rounded-badge border border-nota-border bg-nota-bg px-2.5 py-1.5 text-xs text-nota-ink"
                      >
                        <option value="expense">Pengeluaran</option>
                        <option value="income">Penerimaan</option>
                      </select>
                    </div>

                    <div className="space-y-1 sm:col-span-3">
                      <label
                        htmlFor={`line-cat-${line.key}`}
                        className="block text-[11px] font-medium text-nota-muted"
                      >
                        Kategori Pos #{index + 1}
                      </label>
                      <select
                        id={`line-cat-${line.key}`}
                        name={`lineCategory-${index}`}
                        value={line.categoryId}
                        onChange={(e) =>
                          handleUpdateLine(line.key, {
                            categoryId: e.target.value,
                          })
                        }
                        className="w-full rounded-badge border border-nota-border bg-nota-bg px-2.5 py-1.5 text-xs text-nota-ink"
                      >
                        {categoryOptions.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1 sm:col-span-4">
                      <label
                        htmlFor={`line-desc-${line.key}`}
                        className="block text-[11px] font-medium text-nota-muted"
                      >
                        Uraian Pos #{index + 1}
                      </label>
                      <input
                        id={`line-desc-${line.key}`}
                        name={`lineDescription-${index}`}
                        type="text"
                        maxLength={MAX_BUDGET_LINE_DESC_LENGTH}
                        value={line.description}
                        onChange={(e) =>
                          handleUpdateLine(line.key, {
                            description: e.target.value,
                          })
                        }
                        placeholder="Contoh: Konsumsi buka puasa jamaah"
                        className="w-full rounded-badge border border-nota-border bg-nota-bg px-2.5 py-1.5 text-xs text-nota-ink"
                      />
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <label
                        htmlFor={`line-amt-${line.key}`}
                        className="block text-[11px] font-medium text-nota-muted"
                      >
                        Nominal Rencana (IDR) #{index + 1}
                      </label>
                      <div className="relative">
                        <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-[11px] font-medium text-nota-muted">
                          Rp
                        </span>
                        <input
                          id={`line-amt-${line.key}`}
                          name={`lineAmount-${index}`}
                          type="text"
                          inputMode="numeric"
                          value={line.rawAmount}
                          onChange={(e) =>
                            handleLineAmountChange(line.key, e.target.value)
                          }
                          placeholder="1.500.000"
                          className="w-full rounded-badge border border-nota-border bg-nota-bg pl-8 pr-2.5 py-1.5 text-xs font-medium text-nota-ink tabular-nums"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end sm:col-span-1">
                      <button
                        type="button"
                        disabled={draftItems.length <= 1}
                        onClick={() => handleRemoveLineItem(line.key)}
                        aria-label={`Hapus pos #${index + 1}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-badge border border-nota-border text-nota-muted hover:border-nota-expense/40 hover:bg-nota-expense-soft hover:text-nota-expense disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={closeForm}
              disabled={isSubmitting}
              className="rounded-control border border-nota-border bg-nota-surface px-4 py-2 text-xs font-medium text-nota-ink hover:bg-nota-bg transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-control bg-nota-emerald px-4 py-2 text-xs font-medium text-white hover:bg-nota-emerald-hover transition-colors cursor-pointer"
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              {isSubmitting ? 'Menyimpan...' : 'Simpan RAB'}
            </button>
          </div>
        </form>
      ) : null}

      {deleteError ? (
        <div
          role="alert"
          className="rounded-badge border border-nota-expense/30 bg-nota-expense-soft px-3.5 py-2.5 text-xs text-nota-expense"
        >
          {deleteError}
        </div>
      ) : null}

      {/* RAB Cards List */}
      {planOverviews.length === 0 ? (
        <div className="rounded-panel border border-dashed border-nota-border bg-nota-bg/50 p-6 text-center space-y-2">
          <p className="text-sm font-medium text-nota-ink">
            Belum ada dokumen RAB / anggaran masjid
          </p>
          <p className="text-xs text-nota-muted max-w-md mx-auto">
            Klik tombol <strong>Buat RAB / Anggaran</strong> di atas untuk
            menyusun RAB Kegiatan (Ramadhan, Idul Adha, Renovasi) atau Anggaran
            Operasional Bulanan beserta pemantauan realisasinya.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {planOverviews.map((overview) => {
            const { plan } = overview;
            const linkedFundName = plan.fundId
              ? fundNameMap.get(plan.fundId) ?? 'Dana Masjid'
              : 'Semua Dana Masjid';
            const isConfirmingDelete = pendingDeletePlanId === plan.id;
            const clampedExpensePct = Math.min(
              100,
              Math.max(0, overview.expenseUsagePercent),
            );

            return (
              <article
                key={plan.id}
                data-testid={`budget-plan-card-${plan.id}`}
                className="rounded-panel border border-nota-border bg-nota-bg/40 p-4 sm:p-5 space-y-4"
              >
                {/* Plan Card Header */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm sm:text-base font-semibold text-nota-ink">
                        {plan.title}
                      </h3>
                      <span
                        className={`rounded-control px-2.5 py-0.5 text-[11px] font-medium ${
                          plan.kind === 'activity_rab'
                            ? 'border border-nota-ink/20 bg-nota-surface text-nota-ink'
                            : 'border border-nota-emerald/25 bg-nota-soft-green text-nota-emerald'
                        }`}
                      >
                        {plan.kind === 'activity_rab'
                          ? 'RAB Kegiatan'
                          : 'Operasional Bulanan'}
                      </span>
                      <span className="rounded-control border border-nota-border bg-nota-surface px-2.5 py-0.5 text-[11px] font-medium text-nota-muted">
                        {linkedFundName}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-nota-muted">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                        {formatLocalDateID(plan.periodStart)} –{' '}
                        {formatLocalDateID(plan.periodEnd)}
                      </span>
                      {plan.note ? <span>• {plan.note}</span> : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditForm(plan)}
                      aria-label={`Ubah RAB ${plan.title}`}
                      className="inline-flex items-center gap-1 rounded-control border border-nota-border bg-nota-surface px-3 py-1.5 text-xs font-medium text-nota-ink hover:bg-nota-soft-green/50 transition-colors cursor-pointer"
                    >
                      <PencilLine className="h-3.5 w-3.5 text-nota-emerald" />
                      Ubah
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeletePlanId(plan.id)}
                      aria-label={`Hapus RAB ${plan.title}`}
                      className="inline-flex items-center gap-1 rounded-control border border-nota-border bg-nota-surface px-3 py-1.5 text-xs font-medium text-nota-muted hover:border-nota-expense/40 hover:bg-nota-expense-soft hover:text-nota-expense transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Hapus
                    </button>
                  </div>
                </div>

                {isConfirmingDelete ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-badge border border-nota-expense/30 bg-nota-expense-soft p-3 text-xs">
                    <span className="font-medium text-nota-expense">
                      Hapus dokumen &ldquo;{plan.title}&rdquo;? Transaksi kas
                      masjid yang sudah tercatat tidak akan ikut terhapus.
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPendingDeletePlanId(null)}
                        className="rounded-control border border-nota-border bg-nota-surface px-3 py-1 font-medium text-nota-ink cursor-pointer"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        disabled={isDeletingPlanId === plan.id}
                        onClick={() => void handleConfirmDelete(plan.id)}
                        className="rounded-control bg-nota-expense px-3 py-1 font-medium text-white cursor-pointer"
                      >
                        Ya, hapus RAB
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* Summary Strip for this Plan */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 rounded-panel border border-nota-border/70 bg-nota-surface p-3.5">
                  <div>
                    <span className="block text-[11px] font-medium text-nota-muted">
                      Rencana vs Realisasi Belanja
                    </span>
                    <span className="mt-0.5 block text-sm font-semibold text-nota-ink tabular-nums">
                      {formatIDR(overview.totalActualExpense)}{' '}
                      <span className="text-xs font-normal text-nota-muted">
                        dari {formatIDR(overview.totalPlannedExpense)} (
                        {overview.expenseUsagePercent}%)
                      </span>
                    </span>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-control bg-nota-bg">
                      <div
                        className={`h-full rounded-control transition-all ${
                          overview.totalActualExpense >
                          overview.totalPlannedExpense
                            ? 'bg-nota-expense'
                            : overview.expenseUsagePercent >= 80
                              ? 'bg-nota-ink'
                              : 'bg-nota-emerald'
                        }`}
                        style={{ width: `${clampedExpensePct}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <span className="block text-[11px] font-medium text-nota-muted">
                      {overview.remainingExpenseBudget >= 0
                        ? 'Sisa Anggaran Belanja'
                        : 'Selisih Melebihi Anggaran'}
                    </span>
                    <span
                      className={`mt-0.5 block text-sm font-semibold tabular-nums ${
                        overview.remainingExpenseBudget < 0
                          ? 'text-nota-expense'
                          : 'text-nota-emerald'
                      }`}
                    >
                      {overview.remainingExpenseBudget < 0
                        ? `Lewat ${formatIDR(Math.abs(overview.remainingExpenseBudget))}`
                        : `Sisa ${formatIDR(overview.remainingExpenseBudget)}`}
                    </span>
                  </div>

                  <div>
                    <span className="block text-[11px] font-medium text-nota-muted">
                      Target vs Realisasi Penerimaan
                    </span>
                    <span className="mt-0.5 block text-sm font-semibold text-nota-emerald tabular-nums">
                      {overview.totalPlannedIncome > 0
                        ? `${formatIDR(overview.totalActualIncome)} dari ${formatIDR(overview.totalPlannedIncome)}`
                        : 'Tidak ada target penerimaan'}
                    </span>
                  </div>
                </div>

                {/* Keyboard-scrollable Accessible Table Wrapper per `responsive-table` guidance */}
                <div
                  tabIndex={0}
                  role="region"
                  aria-label={`Rincian pos ${plan.title}`}
                  className="overflow-x-auto rounded-panel border border-nota-border/80 bg-nota-surface"
                >
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-nota-border bg-nota-bg/80 text-[11px] font-semibold text-nota-muted">
                        <th scope="col" className="py-2.5 px-3">
                          Pos Anggaran & Kategori
                        </th>
                        <th scope="col" className="py-2.5 px-3 text-right">
                          Rencana (IDR)
                        </th>
                        <th scope="col" className="py-2.5 px-3 text-right">
                          Realisasi Aktual
                        </th>
                        <th scope="col" className="py-2.5 px-3 text-right">
                          Sisa / Selisih
                        </th>
                        <th scope="col" className="py-2.5 px-3">
                          Progres & Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-nota-border/60">
                      {overview.lineRealizations.map((item) => {
                        const meta = getLineStatusMeta(item.status, item.type);
                        return (
                          <tr
                            key={item.id}
                            data-testid={`rab-line-${item.id}`}
                            className="hover:bg-nota-bg/40"
                          >
                            <th
                              scope="row"
                              className="py-2.5 px-3 font-medium text-nota-ink"
                            >
                              <div className="font-semibold text-nota-ink">
                                {item.description}
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-normal text-nota-muted">
                                <span>{item.categoryName}</span>
                                <span>•</span>
                                <span
                                  className={
                                    item.type === 'income'
                                      ? 'text-nota-emerald font-medium'
                                      : 'text-nota-expense font-medium'
                                  }
                                >
                                  {item.type === 'income'
                                    ? 'Target Penerimaan'
                                    : 'Pos Pengeluaran'}
                                </span>
                              </div>
                            </th>
                            <td className="py-2.5 px-3 text-right font-medium text-nota-ink tabular-nums whitespace-nowrap">
                              {formatIDR(item.plannedAmount)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold text-nota-ink tabular-nums whitespace-nowrap">
                              {formatIDR(item.actualAmount)}
                            </td>
                            <td
                              className={`py-2.5 px-3 text-right font-medium tabular-nums whitespace-nowrap ${
                                item.type === 'expense' &&
                                item.varianceAmount < 0
                                  ? 'text-nota-expense'
                                  : 'text-nota-muted'
                              }`}
                            >
                              {item.varianceAmount >= 0
                                ? `Sisa ${formatIDR(item.varianceAmount)}`
                                : `Lewat ${formatIDR(Math.abs(item.varianceAmount))}`}
                            </td>
                            <td className="py-2.5 px-3 min-w-[160px]">
                              <div className="flex items-center justify-between gap-2">
                                <span
                                  className={`inline-flex rounded-control px-2 py-0.5 text-[10px] font-medium ${meta.badgeClassName}`}
                                >
                                  {meta.label}
                                </span>
                                <span className="text-[11px] font-semibold text-nota-ink tabular-nums">
                                  {item.usagePercent}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
