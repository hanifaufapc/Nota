import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ShieldAlert,
  X,
} from 'lucide-react';
import type { BudgetPlan } from '../../domain/budgetPlan';
import {
  type CashAccount,
  type CashTransfer,
  DEFAULT_CASH_ACCOUNT_TUNAI_ID,
  DEFAULT_FUND_OPERASIONAL_ID,
  type Fund,
  evaluateTransactionSoftGuard,
  getSelectableCashAccounts,
  getSelectableFunds,
} from '../../domain/mosque';
import {
  MAX_DONOR_OR_PAYEE_LENGTH,
  MAX_REFERENCE_NO_LENGTH,
  MAX_TRANSACTION_NOTE_LENGTH,
  type Category,
  type Transaction,
  type TransactionDraft,
  type TransactionPatch,
  type TransactionType,
  getSelectableCategories,
} from '../../domain/transaction';
import { validateTransactionDraft } from '../../domain/validation';
import { toLocalDateString } from '../../lib/date';
import { formatIdrDigits, parseIdrInputDigits } from '../../lib/format';

export interface TransactionFormModalProps {
  mode: 'create' | 'edit';
  initialType?: TransactionType;
  editingTransaction?: Transaction;
  categories: readonly Category[];
  accounts?: readonly CashAccount[];
  funds?: readonly Fund[];
  transactions?: readonly Transaction[];
  cashTransfers?: readonly CashTransfer[];
  budgetPlans?: readonly BudgetPlan[];
  onCreate: (draft: TransactionDraft) => Promise<void>;
  onUpdate: (transactionId: string, patch: TransactionPatch) => Promise<void>;
  onClose: () => void;
}

function generateTransactionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `tx-${crypto.randomUUID()}`;
  }
  return `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function TransactionFormModal({
  mode,
  initialType = 'expense',
  editingTransaction,
  categories,
  accounts = [],
  funds = [],
  transactions = [],
  cashTransfers = [],
  budgetPlans = [],
  onCreate,
  onUpdate,
  onClose,
}: TransactionFormModalProps) {
  const formTitleId = useId();
  const amountInputId = useId();
  const categorySelectId = useId();
  const accountSelectId = useId();
  const fundSelectId = useId();
  const budgetPlanSelectId = useId();
  const dateInputId = useId();
  const donorOrPayeeInputId = useId();
  const referenceNoInputId = useId();
  const noteInputId = useId();
  const errorAlertId = useId();
  const softGuardCheckboxId = useId();

  const amountInputRef = useRef<HTMLInputElement | null>(null);

  const [type, setType] = useState<TransactionType>(() =>
    mode === 'edit' && editingTransaction
      ? editingTransaction.type
      : initialType,
  );

  const selectableCategories = useMemo(
    () =>
      getSelectableCategories(
        categories,
        type,
        mode === 'edit' ? editingTransaction?.categoryId : undefined,
      ),
    [categories, type, mode, editingTransaction?.categoryId],
  );

  const selectableAccounts = useMemo(
    () =>
      getSelectableCashAccounts(
        accounts,
        mode === 'edit' ? editingTransaction?.accountId : undefined,
      ),
    [accounts, mode, editingTransaction?.accountId],
  );

  const selectableFunds = useMemo(
    () =>
      getSelectableFunds(
        funds,
        mode === 'edit' ? editingTransaction?.fundId : undefined,
      ),
    [funds, mode, editingTransaction?.fundId],
  );

  const [amountInput, setAmountInput] = useState<string>(() =>
    mode === 'edit' && editingTransaction
      ? formatIdrDigits(editingTransaction.amount)
      : '',
  );

  const [categoryId, setCategoryId] = useState<string>(() => {
    if (mode === 'edit' && editingTransaction) {
      return editingTransaction.categoryId;
    }
    const initialCats = getSelectableCategories(categories, initialType);
    return initialCats[0]?.id ?? '';
  });

  const [accountId, setAccountId] = useState<string>(() => {
    if (mode === 'edit' && editingTransaction?.accountId) {
      return editingTransaction.accountId;
    }
    const initialAccounts = getSelectableCashAccounts(accounts);
    const defaultTunai = initialAccounts.find(
      (acc) => acc.id === DEFAULT_CASH_ACCOUNT_TUNAI_ID,
    );
    return (
      defaultTunai?.id ??
      initialAccounts[0]?.id ??
      DEFAULT_CASH_ACCOUNT_TUNAI_ID
    );
  });

  const [fundId, setFundId] = useState<string>(() => {
    if (mode === 'edit' && editingTransaction?.fundId) {
      return editingTransaction.fundId;
    }
    const initialCats = getSelectableCategories(categories, initialType);
    const defaultFromCat = initialCats[0]?.defaultFundId;
    const initialFunds = getSelectableFunds(funds);
    if (
      defaultFromCat &&
      (initialFunds.length === 0 ||
        initialFunds.some((f) => f.id === defaultFromCat))
    ) {
      return defaultFromCat;
    }
    return initialFunds[0]?.id ?? DEFAULT_FUND_OPERASIONAL_ID;
  });

  const [budgetPlanId, setBudgetPlanId] = useState<string>(() =>
    mode === 'edit' && editingTransaction?.budgetPlanId
      ? editingTransaction.budgetPlanId
      : '',
  );

  const [occurredAt, setOccurredAt] = useState<string>(() =>
    mode === 'edit' && editingTransaction
      ? editingTransaction.occurredAt
      : toLocalDateString(new Date()),
  );

  const [donorOrPayee, setDonorOrPayee] = useState<string>(() =>
    mode === 'edit' && editingTransaction
      ? (editingTransaction.donorOrPayee ?? '')
      : '',
  );

  const [referenceNo, setReferenceNo] = useState<string>(() =>
    mode === 'edit' && editingTransaction
      ? (editingTransaction.referenceNo ?? '')
      : '',
  );

  const [note, setNote] = useState<string>(() =>
    mode === 'edit' && editingTransaction
      ? (editingTransaction.note ?? '')
      : '',
  );

  const [softGuardConfirmed, setSoftGuardConfirmed] = useState<boolean>(false);
  const [softGuardPrompted, setSoftGuardPrompted] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    amountInputRef.current?.focus();
  }, []);

  const parsedAmount = useMemo(
    () => parseIdrInputDigits(amountInput),
    [amountInput],
  );

  const softGuardEvaluation = useMemo(() => {
    if (
      type !== 'expense' ||
      parsedAmount === null ||
      parsedAmount <= 0 ||
      accounts.length === 0 ||
      funds.length === 0
    ) {
      return { requiresConfirmation: false, warnings: [] };
    }
    return evaluateTransactionSoftGuard(
      {
        type,
        amount: parsedAmount,
        accountId,
        fundId,
        categoryId,
      },
      {
        accounts,
        funds,
        categories,
        transactions,
        transfers: cashTransfers,
        editingTransactionId:
          mode === 'edit' ? editingTransaction?.id : undefined,
      },
    );
  }, [
    type,
    parsedAmount,
    accountId,
    fundId,
    categoryId,
    accounts,
    funds,
    categories,
    transactions,
    cashTransfers,
    mode,
    editingTransaction?.id,
  ]);

  function resetSoftGuardConfirmation() {
    setSoftGuardConfirmed(false);
    setSoftGuardPrompted(false);
  }

  function applyCategoryDefaultFund(nextCategoryId: string) {
    const selectedCat = categories.find((cat) => cat.id === nextCategoryId);
    if (
      selectedCat?.defaultFundId &&
      (selectableFunds.length === 0 ||
        selectableFunds.some((f) => f.id === selectedCat.defaultFundId))
    ) {
      setFundId(selectedCat.defaultFundId);
    }
  }

  function handleTypeChange(nextType: TransactionType) {
    if (nextType === type || isSubmitting) {
      return;
    }
    setType(nextType);
    setErrorMessage(null);
    resetSoftGuardConfirmation();

    const nextSelectable = getSelectableCategories(
      categories,
      nextType,
      mode === 'edit' ? editingTransaction?.categoryId : undefined,
    );
    const stillValid = nextSelectable.some((cat) => cat.id === categoryId);
    if (!stillValid) {
      const nextCatId = nextSelectable[0]?.id ?? '';
      setCategoryId(nextCatId);
      applyCategoryDefaultFund(nextCatId);
    }
  }

  function handleAmountChange(rawValue: string) {
    setErrorMessage(null);
    resetSoftGuardConfirmation();
    const parsed = parseIdrInputDigits(rawValue);
    if (parsed === null) {
      setAmountInput('');
      return;
    }
    setAmountInput(formatIdrDigits(parsed));
  }

  async function persistTransaction(overrideSoftGuard = false) {
    if (isSubmitting) {
      return;
    }

    setErrorMessage(null);
    const currentParsedAmount = parseIdrInputDigits(amountInput);

    const candidateId =
      mode === 'edit' && editingTransaction
        ? editingTransaction.id
        : generateTransactionId();

    const candidateDraft: Partial<TransactionDraft> = {
      id: candidateId,
      type,
      amount: currentParsedAmount ?? 0,
      accountId,
      fundId,
      categoryId,
      ...(type === 'expense' && budgetPlanId ? { budgetPlanId } : {}),
      occurredAt,
      donorOrPayee,
      referenceNo,
      note,
    };

    const validation = validateTransactionDraft(candidateDraft, categories, {
      allowArchivedCategoryId:
        mode === 'edit' ? editingTransaction?.categoryId : undefined,
      accounts: accounts.length > 0 ? accounts : undefined,
      allowArchivedAccountId:
        mode === 'edit' ? editingTransaction?.accountId : undefined,
      funds: funds.length > 0 ? funds : undefined,
      allowArchivedFundId:
        mode === 'edit' ? editingTransaction?.fundId : undefined,
    });

    if (!validation.valid) {
      setErrorMessage(validation.errors[0]);
      return;
    }

    // Soft Guard check for Mosque Expense governance (PRD.md §7.4)
    if (
      softGuardEvaluation.requiresConfirmation &&
      !softGuardConfirmed &&
      !overrideSoftGuard
    ) {
      setSoftGuardPrompted(true);
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'edit' && editingTransaction) {
        await onUpdate(editingTransaction.id, {
          type,
          amount: currentParsedAmount!,
          accountId,
          fundId,
          categoryId,
          budgetPlanId: type === 'expense' ? budgetPlanId : '',
          occurredAt,
          donorOrPayee,
          referenceNo,
          note,
        });
      } else {
        await onCreate({
          id: candidateId,
          type,
          amount: currentParsedAmount!,
          accountId,
          fundId,
          categoryId,
          ...(type === 'expense' && budgetPlanId ? { budgetPlanId } : {}),
          occurredAt,
          donorOrPayee,
          referenceNo,
          note,
        });
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Gagal menyimpan transaksi ke penyimpanan lokal.',
      );
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await persistTransaction(false);
  }

  const isEditMode = mode === 'edit';
  const headingText = isEditMode
    ? 'Edit transaksi'
    : type === 'income'
      ? 'Tambah pemasukan'
      : 'Tambah pengeluaran';

  return (
    <section
      aria-labelledby={formTitleId}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !isSubmitting) {
          e.stopPropagation();
          onClose();
        }
      }}
      className="rounded-hero border border-nota-emerald/30 bg-nota-surface p-5 sm:p-6 space-y-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2
            id={formTitleId}
            className="text-base sm:text-lg font-semibold tracking-tight text-nota-ink"
          >
            {headingText}
          </h2>
          <p className="text-xs text-nota-muted">
            {isEditMode
              ? 'Perbarui detail transaksi masjid. Perubahan akan langsung memperbarui saldo kas, dana amanah, dan ringkasan.'
              : 'Catat penerimaan atau pengeluaran kas masjid dalam Rupiah (IDR).'}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="Tutup formulir transaksi"
          className="inline-flex h-8 w-8 items-center justify-center rounded-control border border-nota-border bg-nota-bg text-nota-muted hover:text-nota-ink transition-colors cursor-pointer disabled:opacity-50"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Transaction Type Selector */}
        <fieldset className="space-y-1.5">
          <legend className="block text-xs font-medium text-nota-ink">
            Jenis transaksi
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:max-w-xs">
            <button
              type="button"
              onClick={() => handleTypeChange('income')}
              aria-pressed={type === 'income'}
              disabled={isSubmitting}
              className={`inline-flex items-center justify-center gap-1.5 rounded-control border px-3.5 py-2 text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                type === 'income'
                  ? 'border-nota-emerald bg-nota-soft-green text-nota-emerald font-semibold'
                  : 'border-nota-border bg-nota-bg text-nota-muted hover:text-nota-ink'
              }`}
            >
              <ArrowDownLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
              Pemasukan
            </button>

            <button
              type="button"
              onClick={() => handleTypeChange('expense')}
              aria-pressed={type === 'expense'}
              disabled={isSubmitting}
              className={`inline-flex items-center justify-center gap-1.5 rounded-control border px-3.5 py-2 text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                type === 'expense'
                  ? 'border-nota-expense/50 bg-nota-expense-soft text-nota-expense font-semibold'
                  : 'border-nota-border bg-nota-bg text-nota-muted hover:text-nota-ink'
              }`}
            >
              <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              Pengeluaran
            </button>
          </div>
        </fieldset>

        {/* Main Fields Grid: Amount, Category, Date */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
          {/* Amount (IDR) */}
          <div className="sm:col-span-5 space-y-1.5">
            <label
              htmlFor={amountInputId}
              className="block text-xs font-medium text-nota-ink"
            >
              Nominal transaksi (IDR)
            </label>
            <div className="relative flex items-center">
              <span
                className="pointer-events-none absolute left-3.5 text-sm font-semibold text-nota-muted select-none"
                aria-hidden="true"
              >
                Rp
              </span>
              <input
                ref={amountInputRef}
                id={amountInputId}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                value={amountInput}
                onChange={(e) => handleAmountChange(e.target.value)}
                disabled={isSubmitting}
                aria-invalid={errorMessage ? 'true' : 'false'}
                aria-describedby={errorMessage ? errorAlertId : undefined}
                className="w-full rounded-control border border-nota-border bg-nota-bg py-2.5 pl-10 pr-3.5 text-base font-semibold text-nota-ink tabular-nums placeholder:text-nota-muted/50 focus:border-nota-emerald focus:bg-nota-surface"
              />
            </div>
          </div>

          {/* Category */}
          <div className="sm:col-span-4 space-y-1.5">
            <label
              htmlFor={categorySelectId}
              className="block text-xs font-medium text-nota-ink"
            >
              Kategori transaksi
            </label>
            <select
              id={categorySelectId}
              value={categoryId}
              onChange={(e) => {
                setErrorMessage(null);
                resetSoftGuardConfirmation();
                const nextCatId = e.target.value;
                setCategoryId(nextCatId);
                applyCategoryDefaultFund(nextCatId);
              }}
              disabled={isSubmitting}
              className="w-full rounded-control border border-nota-border bg-nota-bg px-3.5 py-2.5 text-sm font-medium text-nota-ink focus:border-nota-emerald focus:bg-nota-surface"
            >
              {selectableCategories.length === 0 ? (
                <option value="">Pilih kategori</option>
              ) : null}
              {selectableCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                  {cat.archivedAt ? ' (Diarsipkan)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div className="sm:col-span-3 space-y-1.5">
            <label
              htmlFor={dateInputId}
              className="block text-xs font-medium text-nota-ink"
            >
              Tanggal transaksi
            </label>
            <input
              id={dateInputId}
              type="date"
              value={occurredAt}
              onChange={(e) => {
                setErrorMessage(null);
                setOccurredAt(e.target.value);
              }}
              disabled={isSubmitting}
              className="w-full rounded-control border border-nota-border bg-nota-bg px-3.5 py-2.5 text-sm font-medium text-nota-ink tabular-nums focus:border-nota-emerald focus:bg-nota-surface"
            />
          </div>
        </div>

        {/* Mosque Dimensions Grid: Lokasi Kas (Account), Dana Masjid (Fund), & Optional RAB */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
          {/* Lokasi Kas (CashAccount) */}
          <div
            className={
              type === 'expense' && budgetPlans.length > 0
                ? 'sm:col-span-4 space-y-1.5'
                : 'sm:col-span-6 space-y-1.5'
            }
          >
            <label
              htmlFor={accountSelectId}
              className="block text-xs font-medium text-nota-ink"
            >
              Lokasi kas transaksi
            </label>
            <select
              id={accountSelectId}
              value={accountId}
              onChange={(e) => {
                setErrorMessage(null);
                resetSoftGuardConfirmation();
                setAccountId(e.target.value);
              }}
              disabled={isSubmitting}
              className="w-full rounded-control border border-nota-border bg-nota-bg px-3.5 py-2 text-sm font-medium text-nota-ink focus:border-nota-emerald focus:bg-nota-surface"
            >
              {selectableAccounts.length === 0 ? (
                <option value={DEFAULT_CASH_ACCOUNT_TUNAI_ID}>Kas Tunai</option>
              ) : (
                selectableAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                    {acc.archivedAt ? ' (Diarsipkan)' : ''}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Dana Masjid (Fund) */}
          <div
            className={
              type === 'expense' && budgetPlans.length > 0
                ? 'sm:col-span-4 space-y-1.5'
                : 'sm:col-span-6 space-y-1.5'
            }
          >
            <label
              htmlFor={fundSelectId}
              className="block text-xs font-medium text-nota-ink"
            >
              Dana masjid (Amanah)
            </label>
            <select
              id={fundSelectId}
              value={fundId}
              onChange={(e) => {
                setErrorMessage(null);
                resetSoftGuardConfirmation();
                setFundId(e.target.value);
              }}
              disabled={isSubmitting}
              className="w-full rounded-control border border-nota-border bg-nota-bg px-3.5 py-2 text-sm font-medium text-nota-ink focus:border-nota-emerald focus:bg-nota-surface"
            >
              {selectableFunds.length === 0 ? (
                <option value={DEFAULT_FUND_OPERASIONAL_ID}>
                  Dana Operasional Umum
                </option>
              ) : (
                selectableFunds.map((fund) => (
                  <option key={fund.id} value={fund.id}>
                    {fund.name}
                    {fund.restriction === 'restricted'
                      ? ' (Dana Terikat)'
                      : ' (Dana Umum)'}
                    {fund.archivedAt ? ' (Diarsipkan)' : ''}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Optional Pos RAB / Anggaran (for expenses when budgetPlans exist) */}
          {type === 'expense' && budgetPlans.length > 0 ? (
            <div className="sm:col-span-4 space-y-1.5">
              <label
                htmlFor={budgetPlanSelectId}
                className="block text-xs font-medium text-nota-ink"
              >
                Pos RAB / Anggaran (opsional)
              </label>
              <select
                id={budgetPlanSelectId}
                value={budgetPlanId}
                onChange={(e) => {
                  setErrorMessage(null);
                  setBudgetPlanId(e.target.value);
                }}
                disabled={isSubmitting}
                className="w-full rounded-control border border-nota-border bg-nota-bg px-3.5 py-2 text-sm font-medium text-nota-ink focus:border-nota-emerald focus:bg-nota-surface"
              >
                <option value="">Tanpa pos RAB</option>
                {budgetPlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {/* Optional Mosque Metadata: Donatur / Penerima & Nomor Bukti / Referensi */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
          <div className="sm:col-span-7 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor={donorOrPayeeInputId}
                className="block text-xs font-medium text-nota-ink"
              >
                Donatur / Penerima (opsional)
              </label>
              <span className="text-[11px] text-nota-muted tabular-nums">
                {donorOrPayee.trim().length}/{MAX_DONOR_OR_PAYEE_LENGTH}
              </span>
            </div>
            <input
              id={donorOrPayeeInputId}
              type="text"
              placeholder={
                type === 'income'
                  ? 'Contoh: Hamba Allah, Jamaah Jumat, Bpk. Ahmad...'
                  : 'Contoh: PLN, Toko Bangunan Berkah, Ustadz...'
              }
              value={donorOrPayee}
              onChange={(e) => {
                setErrorMessage(null);
                setDonorOrPayee(e.target.value);
              }}
              disabled={isSubmitting}
              className="w-full rounded-control border border-nota-border bg-nota-bg px-3.5 py-2 text-sm text-nota-ink placeholder:text-nota-muted/60 focus:border-nota-emerald focus:bg-nota-surface"
            />
          </div>

          <div className="sm:col-span-5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor={referenceNoInputId}
                className="block text-xs font-medium text-nota-ink"
              >
                Nomor bukti / referensi (opsional)
              </label>
              <span className="text-[11px] text-nota-muted tabular-nums">
                {referenceNo.trim().length}/{MAX_REFERENCE_NO_LENGTH}
              </span>
            </div>
            <input
              id={referenceNoInputId}
              type="text"
              placeholder="Contoh: KW-2026-014, INV-08..."
              value={referenceNo}
              onChange={(e) => {
                setErrorMessage(null);
                setReferenceNo(e.target.value);
              }}
              disabled={isSubmitting}
              className="w-full rounded-control border border-nota-border bg-nota-bg px-3.5 py-2 text-sm text-nota-ink placeholder:text-nota-muted/60 focus:border-nota-emerald focus:bg-nota-surface"
            />
          </div>
        </div>

        {/* Optional Note */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor={noteInputId}
              className="block text-xs font-medium text-nota-ink"
            >
              Catatan transaksi (opsional)
            </label>
            <span className="text-[11px] text-nota-muted tabular-nums">
              {note.trim().length}/{MAX_TRANSACTION_NOTE_LENGTH}
            </span>
          </div>
          <input
            id={noteInputId}
            type="text"
            placeholder="Contoh: Infak Jumat pekan ke-2, Pembelian lampu teras masjid..."
            value={note}
            onChange={(e) => {
              setErrorMessage(null);
              setNote(e.target.value);
            }}
            disabled={isSubmitting}
            className="w-full rounded-control border border-nota-border bg-nota-bg px-3.5 py-2 text-sm text-nota-ink placeholder:text-nota-muted/60 focus:border-nota-emerald focus:bg-nota-surface"
          />
        </div>

        {/* Mosque Soft Guard Warning Banner (PRD.md §7.4) */}
        {softGuardEvaluation.requiresConfirmation ? (
          <div
            role="region"
            aria-label="Peringatan Soft Guard Kas & Dana"
            data-testid="soft-guard-warning-banner"
            className={`rounded-panel border p-4 space-y-3 ${
              softGuardPrompted
                ? 'border-nota-expense bg-nota-expense-soft'
                : 'border-nota-warning/40 bg-nota-warning-soft'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <ShieldAlert
                className={`h-5 w-5 shrink-0 mt-0.5 ${
                  softGuardPrompted ? 'text-nota-expense' : 'text-nota-warning'
                }`}
                aria-hidden="true"
              />
              <div className="space-y-1.5 flex-1">
                <p className="text-xs sm:text-sm font-semibold text-nota-ink">
                  Perhatian Bendahara — Konfirmasi Pengeluaran Diperlukan
                </p>
                <ul className="space-y-1.5 text-xs text-nota-ink/90 list-disc pl-4">
                  {softGuardEvaluation.warnings.map((warning) => (
                    <li
                      key={warning.code}
                      data-testid={`soft-guard-warning-${warning.code}`}
                    >
                      <strong className="font-semibold">
                        {warning.title}:
                      </strong>{' '}
                      {warning.message}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-nota-border/60">
              <label
                htmlFor={softGuardCheckboxId}
                className="inline-flex items-center gap-2 text-xs font-medium text-nota-ink cursor-pointer select-none"
              >
                <input
                  id={softGuardCheckboxId}
                  data-testid="soft-guard-confirm-checkbox"
                  type="checkbox"
                  checked={softGuardConfirmed}
                  onChange={(e) => {
                    setSoftGuardConfirmed(e.target.checked);
                    if (e.target.checked) {
                      setSoftGuardPrompted(false);
                    }
                  }}
                  disabled={isSubmitting}
                  className="h-4 w-4 rounded border-nota-border text-nota-emerald focus:ring-nota-emerald cursor-pointer"
                />
                <span>
                  Konfirmasi bendahara: saya memahami peringatan ini dan tetap
                  ingin menyimpan pengeluaran
                </span>
              </label>

              {softGuardPrompted && !softGuardConfirmed ? (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setSoftGuardConfirmed(true);
                    setSoftGuardPrompted(false);
                    void persistTransaction(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-control bg-nota-expense px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-55"
                >
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  Ya, konfirmasi & simpan pengeluaran
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Validation or Storage Error Feedback */}
        {errorMessage ? (
          <div
            id={errorAlertId}
            role="alert"
            className="flex items-start gap-2 rounded-panel border border-nota-expense/30 bg-nota-expense-soft px-3.5 py-2.5 text-xs text-nota-expense"
          >
            <AlertCircle
              className="h-4 w-4 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex items-center justify-center rounded-control border border-nota-border bg-nota-bg px-4 py-2 text-xs sm:text-sm font-medium text-nota-ink hover:bg-nota-surface transition-colors cursor-pointer disabled:opacity-50"
          >
            Batal
          </button>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center gap-1.5 rounded-control bg-nota-emerald px-5 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-nota-emerald-hover transition-colors cursor-pointer disabled:opacity-55"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            {isSubmitting
              ? 'Menyimpan...'
              : isEditMode
                ? 'Simpan perubahan'
                : 'Simpan transaksi'}
          </button>
        </div>
      </form>
    </section>
  );
}

