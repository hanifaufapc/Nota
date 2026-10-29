import { type FormEvent, useEffect, useId, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Handshake,
  PencilLine,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  type DebtDirection,
  type DebtRecord,
  type DebtRecordInput,
  type DebtRecordPatch,
  type DebtStatus,
  MAX_DEBT_NOTE_LENGTH,
  MAX_DEBT_PERSON_NAME_LENGTH,
  calculateDebtRecordsOverview,
  validateDebtRecordInput,
} from '../../domain/debtRecord';
import {
  formatIDR,
  formatIdrDigits,
  formatLocalDateID,
  formatSignedIDR,
  parseIdrInputDigits,
} from '../../lib/format';

type StatusFilter = 'all' | DebtStatus;

interface DebtRecordSectionProps {
  debtRecords: readonly DebtRecord[];
  onCreateDebtRecord: (input: DebtRecordInput) => Promise<void>;
  onUpdateDebtRecord: (
    debtId: string,
    patch: DebtRecordPatch,
  ) => Promise<void>;
  onSettleDebtRecord: (debtId: string) => Promise<void>;
  onDeleteDebtRecord: (debtId: string) => Promise<void>;
}

export function DebtRecordSection({
  debtRecords,
  onCreateDebtRecord,
  onUpdateDebtRecord,
  onSettleDebtRecord,
  onDeleteDebtRecord,
}: DebtRecordSectionProps) {
  const directionSelectId = useId();
  const personNameInputId = useId();
  const amountInputId = useId();
  const remainingInputId = useId();
  const dueDateInputId = useId();
  const noteInputId = useId();
  const errorAlertId = useId();

  const debtOverview = useMemo(
    () => calculateDebtRecordsOverview(debtRecords),
    [debtRecords],
  );

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null);
  const [directionInput, setDirectionInput] =
    useState<DebtDirection>('payable');
  const [personNameInput, setPersonNameInput] = useState('');
  const [rawAmountInput, setRawAmountInput] = useState('');
  const [rawRemainingInput, setRawRemainingInput] = useState('');
  const [hasCustomRemaining, setHasCustomRemaining] = useState(false);
  const [dueDateInput, setDueDateInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [settlingDebtId, setSettlingDebtId] = useState<string | null>(null);
  const [pendingDeleteDebtId, setPendingDeleteDebtId] = useState<string | null>(
    null,
  );
  const [isDeletingDebtId, setIsDeletingDebtId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    if (statusFilter === 'all') {
      return debtOverview.items;
    }
    return debtOverview.items.filter((item) => item.status === statusFilter);
  }, [debtOverview.items, statusFilter]);

  useEffect(() => {
    if (!isFormOpen) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSubmitting) {
        event.preventDefault();
        setIsFormOpen(false);
        setEditingDebtId(null);
        setFormError(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFormOpen, isSubmitting]);

  function openCreateForm() {
    setEditingDebtId(null);
    setDirectionInput('payable');
    setPersonNameInput('');
    setRawAmountInput('');
    setRawRemainingInput('');
    setHasCustomRemaining(false);
    setDueDateInput('');
    setNoteInput('');
    setFormError(null);
    setIsFormOpen(true);
  }

  function openEditForm(record: DebtRecord) {
    setEditingDebtId(record.id);
    setDirectionInput(record.direction);
    setPersonNameInput(record.personName);
    setRawAmountInput(formatIdrDigits(record.amount));
    setRawRemainingInput(formatIdrDigits(record.remainingAmount));
    setHasCustomRemaining(true);
    setDueDateInput(record.dueDate ?? '');
    setNoteInput(record.note ?? '');
    setFormError(null);
    setIsFormOpen(true);
  }

  function closeForm() {
    if (isSubmitting) {
      return;
    }
    setIsFormOpen(false);
    setEditingDebtId(null);
    setFormError(null);
  }

  function handleAmountInputChange(rawValue: string) {
    setFormError(null);
    const digitsOnly = rawValue.replace(/\D/g, '');
    if (!digitsOnly) {
      setRawAmountInput('');
      if (!editingDebtId && !hasCustomRemaining) {
        setRawRemainingInput('');
      }
      return;
    }
    const parsed = Number(digitsOnly);
    if (Number.isSafeInteger(parsed)) {
      const formatted = formatIdrDigits(parsed);
      setRawAmountInput(formatted);
      if (!editingDebtId && !hasCustomRemaining) {
        setRawRemainingInput(formatted);
      }
    }
  }

  function handleRemainingInputChange(rawValue: string) {
    setFormError(null);
    setHasCustomRemaining(true);
    const digitsOnly = rawValue.replace(/\D/g, '');
    if (!digitsOnly) {
      setRawRemainingInput('');
      return;
    }
    const parsed = Number(digitsOnly);
    if (Number.isSafeInteger(parsed)) {
      setRawRemainingInput(formatIdrDigits(parsed));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const parsedAmount = parseIdrInputDigits(rawAmountInput);
    if (parsedAmount === null || parsedAmount <= 0) {
      setFormError(
        'Masukkan nominal awal dalam bilangan bulat Rupiah lebih dari Rp 0.',
      );
      return;
    }

    const parsedRemaining =
      rawRemainingInput.trim() === ''
        ? parsedAmount
        : parseIdrInputDigits(rawRemainingInput);

    if (parsedRemaining === null || parsedRemaining < 0) {
      setFormError(
        'Masukkan sisa nominal dalam bilangan bulat Rupiah (0 atau lebih besar).',
      );
      return;
    }

    const candidateInput: DebtRecordInput = {
      direction: directionInput,
      personName: personNameInput,
      amount: parsedAmount,
      remainingAmount: parsedRemaining,
      dueDate: dueDateInput.trim() ? dueDateInput.trim() : undefined,
      note: noteInput.trim() ? noteInput.trim() : undefined,
    };

    const validation = validateDebtRecordInput(candidateInput);
    if (!validation.valid) {
      setFormError(validation.errors[0]);
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      if (editingDebtId) {
        await onUpdateDebtRecord(editingDebtId, {
          direction: candidateInput.direction,
          personName: candidateInput.personName,
          amount: candidateInput.amount,
          remainingAmount: candidateInput.remainingAmount,
          dueDate: candidateInput.dueDate ?? null,
          note: candidateInput.note ?? null,
        });
      } else {
        await onCreateDebtRecord(candidateInput);
      }
      setIsFormOpen(false);
      setEditingDebtId(null);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Gagal menyimpan catatan utang/piutang.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleQuickSettle(debtId: string) {
    if (settlingDebtId) {
      return;
    }
    setSettlingDebtId(debtId);
    setActionError(null);
    try {
      await onSettleDebtRecord(debtId);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Gagal menandai lunas catatan utang/piutang.',
      );
    } finally {
      setSettlingDebtId(null);
    }
  }

  async function handleConfirmDelete(debtId: string) {
    if (isDeletingDebtId) {
      return;
    }
    setIsDeletingDebtId(debtId);
    setActionError(null);
    try {
      await onDeleteDebtRecord(debtId);
      setPendingDeleteDebtId(null);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Gagal menghapus catatan utang/piutang.',
      );
    } finally {
      setIsDeletingDebtId(null);
    }
  }

  return (
    <section
      aria-label="Catatan Utang & Piutang"
      className="rounded-hero bg-nota-surface p-6 sm:p-7 border border-nota-border/70 space-y-6"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-control border border-nota-border bg-nota-bg text-nota-emerald">
            <Handshake className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-nota-ink">
              Catatan Utang & Piutang
            </h2>
            <p className="text-xs text-nota-muted">
              Catat kewajiban utang dan piutang secara terpisah dari transaksi
              kas agar tidak menggandakan saldo tercatat.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreateForm}
          className="inline-flex items-center gap-1.5 rounded-control bg-nota-emerald px-3.5 py-2 text-xs sm:text-sm font-medium text-white hover:bg-nota-emerald-hover transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Tambah catatan
        </button>
      </div>

      {/* Inline Add / Edit Debt Record Form */}
      {isFormOpen ? (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          noValidate
          aria-label="Formulir utang dan piutang"
          className="rounded-panel border border-nota-border bg-nota-bg p-4 sm:p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-nota-ink">
              {editingDebtId
                ? 'Ubah catatan utang/piutang'
                : 'Tambah catatan utang/piutang'}
            </h3>
            <button
              type="button"
              onClick={closeForm}
              disabled={isSubmitting}
              aria-label="Tutup formulir utang dan piutang"
              className="inline-flex h-7 w-7 items-center justify-center rounded-control text-nota-muted hover:bg-nota-surface hover:text-nota-ink transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Direction Select */}
            <div className="space-y-1.5">
              <label
                htmlFor={directionSelectId}
                className="block text-xs font-medium text-nota-ink"
              >
                Jenis catatan
              </label>
              <select
                id={directionSelectId}
                value={directionInput}
                disabled={isSubmitting}
                onChange={(e) => {
                  setFormError(null);
                  setDirectionInput(e.target.value as DebtDirection);
                }}
                className="w-full rounded-control border border-nota-border bg-nota-surface px-3.5 py-2 text-sm text-nota-ink"
              >
                <option value="payable">Utang (saya perlu membayar)</option>
                <option value="receivable">
                  Piutang (orang lain perlu membayar)
                </option>
              </select>
            </div>

            {/* Person Name */}
            <div className="space-y-1.5">
              <label
                htmlFor={personNameInputId}
                className="block text-xs font-medium text-nota-ink"
              >
                Nama pihak terkait
              </label>
              <input
                id={personNameInputId}
                type="text"
                maxLength={MAX_DEBT_PERSON_NAME_LENGTH}
                placeholder="Contoh: Budi Santoso, Koperasi Kantor"
                value={personNameInput}
                disabled={isSubmitting}
                aria-invalid={Boolean(formError)}
                aria-describedby={formError ? errorAlertId : undefined}
                onChange={(e) => {
                  setFormError(null);
                  setPersonNameInput(e.target.value);
                }}
                className="w-full rounded-control border border-nota-border bg-nota-surface px-3.5 py-2 text-sm text-nota-ink placeholder:text-nota-muted/60"
              />
            </div>

            {/* Initial Amount */}
            <div className="space-y-1.5">
              <label
                htmlFor={amountInputId}
                className="block text-xs font-medium text-nota-ink"
              >
                Nominal awal (IDR)
              </label>
              <div className="relative flex items-center">
                <span
                  className="pointer-events-none absolute left-3.5 text-sm font-medium text-nota-muted select-none"
                  aria-hidden="true"
                >
                  Rp
                </span>
                <input
                  id={amountInputId}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Contoh: 1.000.000"
                  value={rawAmountInput}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(formError)}
                  aria-describedby={formError ? errorAlertId : undefined}
                  onChange={(e) => handleAmountInputChange(e.target.value)}
                  className="w-full rounded-control border border-nota-border bg-nota-surface py-2 pl-10 pr-3.5 text-sm font-medium text-nota-ink tabular-nums placeholder:text-nota-muted/60"
                />
              </div>
            </div>

            {/* Remaining Amount */}
            <div className="space-y-1.5">
              <label
                htmlFor={remainingInputId}
                className="block text-xs font-medium text-nota-ink"
              >
                Sisa nominal belum lunas (IDR)
              </label>
              <div className="relative flex items-center">
                <span
                  className="pointer-events-none absolute left-3.5 text-sm font-medium text-nota-muted select-none"
                  aria-hidden="true"
                >
                  Rp
                </span>
                <input
                  id={remainingInputId}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0"
                  value={rawRemainingInput}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(formError)}
                  aria-describedby={formError ? errorAlertId : undefined}
                  onChange={(e) => handleRemainingInputChange(e.target.value)}
                  className="w-full rounded-control border border-nota-border bg-nota-surface py-2 pl-10 pr-3.5 text-sm font-medium text-nota-ink tabular-nums placeholder:text-nota-muted/60"
                />
              </div>
            </div>

            {/* Optional Due Date */}
            <div className="space-y-1.5">
              <label
                htmlFor={dueDateInputId}
                className="block text-xs font-medium text-nota-ink"
              >
                Tanggal jatuh tempo (opsional)
              </label>
              <input
                id={dueDateInputId}
                type="date"
                value={dueDateInput}
                disabled={isSubmitting}
                onChange={(e) => {
                  setFormError(null);
                  setDueDateInput(e.target.value);
                }}
                className="w-full rounded-control border border-nota-border bg-nota-surface px-3.5 py-2 text-sm text-nota-ink"
              />
            </div>

            {/* Optional Note */}
            <div className="space-y-1.5">
              <label
                htmlFor={noteInputId}
                className="block text-xs font-medium text-nota-ink"
              >
                Catatan (opsional)
              </label>
              <input
                id={noteInputId}
                type="text"
                maxLength={MAX_DEBT_NOTE_LENGTH}
                placeholder="Contoh: Cicilan 2 kali pembayaran"
                value={noteInput}
                disabled={isSubmitting}
                onChange={(e) => {
                  setFormError(null);
                  setNoteInput(e.target.value);
                }}
                className="w-full rounded-control border border-nota-border bg-nota-surface px-3.5 py-2 text-sm text-nota-ink placeholder:text-nota-muted/60"
              />
            </div>
          </div>

          {formError ? (
            <div
              id={errorAlertId}
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
              {isSubmitting ? 'Menyimpan...' : 'Simpan catatan'}
            </button>
          </div>
        </form>
      ) : null}

      {actionError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-control border border-nota-expense/30 bg-nota-expense-soft px-3.5 py-2.5 text-xs font-medium text-nota-expense"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      ) : null}

      {/* Empty State or Obligation Summary & List */}
      {debtOverview.items.length === 0 ? (
        <div className="rounded-panel bg-nota-bg/80 px-5 py-8 text-center space-y-2">
          <p className="text-sm font-medium text-nota-ink">
            Belum ada catatan utang atau piutang
          </p>
          <p className="text-xs text-nota-muted max-w-md mx-auto leading-relaxed">
            Catat kewajiban pembayaran (utang) atau dana yang dipinjam pihak
            lain (piutang) untuk memantau jatuh tempo dan sisa nominalnya tanpa
            mencampurnya dengan saldo kas.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Summary Strip */}
          <div
            data-testid="debt-summary-strip"
            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          >
            <div className="rounded-panel bg-nota-bg/75 p-4 border border-nota-border/60">
              <span className="text-xs font-medium text-nota-muted block">
                Utang belum lunas
              </span>
              <span
                data-testid="debt-total-open-payable"
                className="mt-1 block text-base sm:text-lg font-semibold text-nota-expense tabular-nums"
              >
                {formatIDR(debtOverview.totalOpenPayable)}
              </span>
            </div>

            <div className="rounded-panel bg-nota-bg/75 p-4 border border-nota-border/60">
              <span className="text-xs font-medium text-nota-muted block">
                Piutang belum lunas
              </span>
              <span
                data-testid="debt-total-open-receivable"
                className="mt-1 block text-base sm:text-lg font-semibold text-nota-emerald tabular-nums"
              >
                {formatIDR(debtOverview.totalOpenReceivable)}
              </span>
            </div>

            <div className="rounded-panel bg-nota-bg/75 p-4 border border-nota-border/60">
              <span className="text-xs font-medium text-nota-muted block">
                Posisi bersih kewajiban
              </span>
              <span
                data-testid="debt-net-position"
                className={`mt-1 block text-base sm:text-lg font-semibold tabular-nums ${
                  debtOverview.netObligationPosition < 0
                    ? 'text-nota-expense'
                    : 'text-nota-ink'
                }`}
              >
                {formatSignedIDR(debtOverview.netObligationPosition)}
              </span>
            </div>
          </div>

          {/* Status Filter Pill */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              role="group"
              aria-label="Filter status utang dan piutang"
              className="inline-flex items-center gap-1 rounded-control border border-nota-border bg-nota-bg p-1"
            >
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                aria-pressed={statusFilter === 'all'}
                className={
                  statusFilter === 'all'
                    ? 'rounded-control bg-nota-lime px-3 py-1 text-xs font-semibold text-nota-ink cursor-pointer'
                    : 'rounded-control px-3 py-1 text-xs font-medium text-nota-muted hover:text-nota-ink cursor-pointer'
                }
              >
                Semua ({debtOverview.items.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('open')}
                aria-pressed={statusFilter === 'open'}
                className={
                  statusFilter === 'open'
                    ? 'rounded-control bg-nota-lime px-3 py-1 text-xs font-semibold text-nota-ink cursor-pointer'
                    : 'rounded-control px-3 py-1 text-xs font-medium text-nota-muted hover:text-nota-ink cursor-pointer'
                }
              >
                Belum lunas ({debtOverview.openCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('settled')}
                aria-pressed={statusFilter === 'settled'}
                className={
                  statusFilter === 'settled'
                    ? 'rounded-control bg-nota-lime px-3 py-1 text-xs font-semibold text-nota-ink cursor-pointer'
                    : 'rounded-control px-3 py-1 text-xs font-medium text-nota-muted hover:text-nota-ink cursor-pointer'
                }
              >
                Lunas ({debtOverview.settledCount})
              </button>
            </div>
          </div>

          {/* Filtered List */}
          {filteredItems.length === 0 ? (
            <div className="rounded-panel bg-nota-bg/70 px-4 py-6 text-center text-xs text-nota-muted">
              Tidak ada catatan utang/piutang dengan status ini.
            </div>
          ) : (
            <ul
              aria-label="Daftar catatan utang dan piutang"
              className="space-y-3"
            >
              {filteredItems.map((item) => {
                const isPayable = item.direction === 'payable';
                const isSettled = item.status === 'settled';
                const isConfirmingDelete = pendingDeleteDebtId === item.id;
                const isDeletingThis = isDeletingDebtId === item.id;
                const isSettlingThis = settlingDebtId === item.id;
                const barWidthPercent = Math.min(
                  100,
                  item.settledAmount > 0 ? Math.max(item.settledPercent, 4) : 0,
                );

                return (
                  <li
                    key={item.id}
                    data-testid={`debt-item-${item.id}`}
                    className="rounded-panel border border-nota-border/70 bg-nota-bg/65 p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-nota-ink">
                            {item.personName}
                          </span>
                          <span
                            className={`rounded-control px-2 py-0.5 text-[11px] font-medium ${
                              isPayable
                                ? 'border border-nota-expense/30 bg-nota-expense-soft text-nota-expense'
                                : 'border border-nota-emerald/25 bg-nota-soft-green text-nota-emerald'
                            }`}
                          >
                            {isPayable ? 'Utang' : 'Piutang'}
                          </span>
                          <span
                            className={`rounded-control px-2 py-0.5 text-[11px] font-medium ${
                              isSettled
                                ? 'border border-nota-emerald/30 bg-nota-lime text-nota-ink'
                                : 'border border-nota-border bg-nota-surface text-nota-ink'
                            }`}
                          >
                            {isSettled ? 'Lunas' : 'Belum lunas'}
                          </span>
                          {item.dueDate ? (
                            <span className="inline-flex items-center gap-1 rounded-control border border-nota-border bg-nota-surface px-2 py-0.5 text-[11px] font-medium text-nota-muted">
                              <Calendar
                                className="h-3 w-3 text-nota-emerald"
                                aria-hidden="true"
                              />
                              Jatuh tempo: {formatLocalDateID(item.dueDate)}
                            </span>
                          ) : null}
                        </div>

                        <p className="text-xs text-nota-muted tabular-nums">
                          Sisa{' '}
                          <strong className="font-semibold text-nota-ink">
                            {formatIDR(item.remainingAmount)}
                          </strong>{' '}
                          dari{' '}
                          <strong className="font-semibold text-nota-ink">
                            {formatIDR(item.amount)}
                          </strong>{' '}
                          ({item.settledPercent}% selesai)
                        </p>

                        {item.note ? (
                          <p className="text-xs text-nota-muted">{item.note}</p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {!isSettled ? (
                          <button
                            type="button"
                            disabled={isSettlingThis}
                            onClick={() => void handleQuickSettle(item.id)}
                            aria-label={`Tandai lunas ${item.personName}`}
                            className="inline-flex items-center gap-1 rounded-control bg-nota-emerald px-2.5 py-1 text-xs font-medium text-white hover:bg-nota-emerald-hover transition-colors cursor-pointer disabled:opacity-55"
                          >
                            <CheckCircle2
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                            {isSettlingThis ? 'Memproses...' : 'Tandai lunas'}
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => openEditForm(item)}
                          aria-label={`Ubah catatan ${item.personName}`}
                          className="inline-flex items-center gap-1 rounded-control border border-nota-border bg-nota-surface px-2.5 py-1 text-xs font-medium text-nota-ink hover:bg-nota-soft-green/50 transition-colors cursor-pointer"
                        >
                          <PencilLine
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          Ubah
                        </button>

                        {!isConfirmingDelete ? (
                          <button
                            type="button"
                            onClick={() => setPendingDeleteDebtId(item.id)}
                            aria-label={`Hapus catatan ${item.personName}`}
                            className="inline-flex items-center gap-1 rounded-control border border-nota-border bg-nota-surface px-2.5 py-1 text-xs font-medium text-nota-expense hover:bg-nota-expense-soft transition-colors cursor-pointer"
                          >
                            <Trash2
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                            Hapus
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div
                      role="progressbar"
                      aria-label={`Progres pelunasan ${item.personName}`}
                      aria-valuenow={Math.min(100, item.settledPercent)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="h-2 w-full overflow-hidden rounded-control bg-nota-border/60"
                    >
                      {barWidthPercent > 0 ? (
                        <div
                          style={{ width: `${barWidthPercent}%` }}
                          className="h-full rounded-control bg-nota-emerald transition-all"
                        />
                      ) : null}
                    </div>

                    {/* Inline Delete Confirmation */}
                    {isConfirmingDelete ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-nota-expense/30 bg-nota-expense-soft/70 px-3 py-2 text-xs">
                        <span className="font-medium text-nota-ink">
                          Hapus catatan untuk <strong>{item.personName}</strong>
                          ? Saldo tercatat Anda tidak akan berubah.
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isDeletingThis}
                            onClick={() => setPendingDeleteDebtId(null)}
                            className="rounded-control border border-nota-border bg-nota-surface px-2.5 py-1 text-xs font-medium text-nota-ink hover:bg-nota-bg transition-colors cursor-pointer"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            disabled={isDeletingThis}
                            onClick={() => void handleConfirmDelete(item.id)}
                            className="rounded-control bg-nota-expense px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-55"
                          >
                            {isDeletingThis
                              ? 'Menghapus...'
                              : 'Ya, hapus catatan'}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

