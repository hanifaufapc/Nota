import { type FormEvent, useEffect, useId, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  PencilLine,
  Plus,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import {
  MAX_SAVINGS_GOAL_NAME_LENGTH,
  MAX_SAVINGS_GOAL_NOTE_LENGTH,
  type SavingsGoal,
  type SavingsGoalInput,
  type SavingsGoalPatch,
  calculateSavingsGoalsOverview,
  validateSavingsGoalInput,
} from '../../domain/savingsGoal';
import {
  formatIDR,
  formatIdrDigits,
  formatLocalDateID,
  formatSignedIDR,
  parseIdrInputDigits,
} from '../../lib/format';

interface SavingsGoalSectionProps {
  savingsGoals: readonly SavingsGoal[];
  currentBalance: number;
  onCreateGoal: (input: SavingsGoalInput) => Promise<void>;
  onUpdateGoal: (goalId: string, patch: SavingsGoalPatch) => Promise<void>;
  onDeleteGoal: (goalId: string) => Promise<void>;
}

export function SavingsGoalSection({
  savingsGoals,
  currentBalance,
  onCreateGoal,
  onUpdateGoal,
  onDeleteGoal,
}: SavingsGoalSectionProps) {
  const nameInputId = useId();
  const targetAmountInputId = useId();
  const allocatedAmountInputId = useId();
  const targetDateInputId = useId();
  const noteInputId = useId();
  const errorAlertId = useId();

  const goalsOverview = useMemo(
    () => calculateSavingsGoalsOverview(savingsGoals, currentBalance),
    [savingsGoals, currentBalance],
  );

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [rawTargetInput, setRawTargetInput] = useState('');
  const [rawAllocatedInput, setRawAllocatedInput] = useState('0');
  const [targetDateInput, setTargetDateInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [pendingDeleteGoalId, setPendingDeleteGoalId] = useState<string | null>(
    null,
  );
  const [isDeletingGoalId, setIsDeletingGoalId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFormOpen) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSubmitting) {
        event.preventDefault();
        setIsFormOpen(false);
        setEditingGoalId(null);
        setFormError(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFormOpen, isSubmitting]);

  function openCreateGoalForm() {
    setEditingGoalId(null);
    setNameInput('');
    setRawTargetInput('');
    setRawAllocatedInput('0');
    setTargetDateInput('');
    setNoteInput('');
    setFormError(null);
    setIsFormOpen(true);
  }

  function openEditGoalForm(goal: SavingsGoal) {
    setEditingGoalId(goal.id);
    setNameInput(goal.name);
    setRawTargetInput(formatIdrDigits(goal.targetAmount));
    setRawAllocatedInput(formatIdrDigits(goal.allocatedAmount));
    setTargetDateInput(goal.targetDate ?? '');
    setNoteInput(goal.note ?? '');
    setFormError(null);
    setIsFormOpen(true);
  }

  function closeForm() {
    if (isSubmitting) {
      return;
    }
    setIsFormOpen(false);
    setEditingGoalId(null);
    setFormError(null);
  }

  function handleTargetInputChange(rawValue: string) {
    setFormError(null);
    const digitsOnly = rawValue.replace(/\D/g, '');
    if (!digitsOnly) {
      setRawTargetInput('');
      return;
    }
    const parsed = Number(digitsOnly);
    if (Number.isSafeInteger(parsed)) {
      setRawTargetInput(formatIdrDigits(parsed));
    }
  }

  function handleAllocatedInputChange(rawValue: string) {
    setFormError(null);
    const digitsOnly = rawValue.replace(/\D/g, '');
    if (!digitsOnly) {
      setRawAllocatedInput('');
      return;
    }
    const parsed = Number(digitsOnly);
    if (Number.isSafeInteger(parsed)) {
      setRawAllocatedInput(formatIdrDigits(parsed));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const parsedTarget = parseIdrInputDigits(rawTargetInput);
    const parsedAllocated =
      rawAllocatedInput.trim() === ''
        ? 0
        : parseIdrInputDigits(rawAllocatedInput);

    if (parsedTarget === null || parsedTarget <= 0) {
      setFormError(
        'Masukkan target nominal tabungan dalam bilangan bulat Rupiah lebih dari Rp 0.',
      );
      return;
    }

    if (parsedAllocated === null || parsedAllocated < 0) {
      setFormError(
        'Masukkan nominal dana dialokasikan dalam bilangan bulat Rupiah (0 atau lebih besar).',
      );
      return;
    }

    const candidateInput: SavingsGoalInput = {
      name: nameInput,
      targetAmount: parsedTarget,
      allocatedAmount: parsedAllocated,
      targetDate: targetDateInput.trim() ? targetDateInput.trim() : undefined,
      note: noteInput.trim() ? noteInput.trim() : undefined,
    };

    const validation = validateSavingsGoalInput(candidateInput);
    if (!validation.valid) {
      setFormError(validation.errors[0]);
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      if (editingGoalId) {
        await onUpdateGoal(editingGoalId, {
          name: candidateInput.name,
          targetAmount: candidateInput.targetAmount,
          allocatedAmount: candidateInput.allocatedAmount,
          targetDate: candidateInput.targetDate ?? null,
          note: candidateInput.note ?? null,
        });
      } else {
        await onCreateGoal(candidateInput);
      }
      setIsFormOpen(false);
      setEditingGoalId(null);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Gagal menyimpan target tabungan.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmDelete(goalId: string) {
    if (isDeletingGoalId) {
      return;
    }
    setIsDeletingGoalId(goalId);
    setDeleteError(null);
    try {
      await onDeleteGoal(goalId);
      setPendingDeleteGoalId(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : 'Gagal menghapus target tabungan.',
      );
    } finally {
      setIsDeletingGoalId(null);
    }
  }

  return (
    <section
      aria-label="Target Tabungan"
      className="rounded-hero bg-nota-surface p-6 sm:p-7 border border-nota-border/70 space-y-6"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-control border border-nota-border bg-nota-bg text-nota-emerald">
            <Target className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-nota-ink">
              Target Tabungan
            </h2>
            <p className="text-xs text-nota-muted">
              Alokasikan sebagian saldo tercatat untuk tujuan tabungan tanpa
              membuat transaksi semu.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreateGoalForm}
          className="inline-flex items-center gap-1.5 rounded-control bg-nota-emerald px-3.5 py-2 text-xs sm:text-sm font-medium text-white hover:bg-nota-emerald-hover transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Tambah target
        </button>
      </div>

      {/* Inline Add / Edit Savings Goal Form */}
      {isFormOpen ? (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          noValidate
          aria-label="Formulir target tabungan"
          className="rounded-panel border border-nota-border bg-nota-bg p-4 sm:p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-nota-ink">
              {editingGoalId
                ? 'Ubah target tabungan'
                : 'Tambah target tabungan baru'}
            </h3>
            <button
              type="button"
              onClick={closeForm}
              disabled={isSubmitting}
              aria-label="Tutup formulir target tabungan"
              className="inline-flex h-7 w-7 items-center justify-center rounded-control text-nota-muted hover:bg-nota-surface hover:text-nota-ink transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Goal Name */}
            <div className="space-y-1.5 sm:col-span-2">
              <label
                htmlFor={nameInputId}
                className="block text-xs font-medium text-nota-ink"
              >
                Nama target tabungan
              </label>
              <input
                id={nameInputId}
                type="text"
                maxLength={MAX_SAVINGS_GOAL_NAME_LENGTH}
                placeholder="Contoh: Dana Darurat, Liburan Akhir Tahun"
                value={nameInput}
                disabled={isSubmitting}
                aria-invalid={Boolean(formError)}
                aria-describedby={formError ? errorAlertId : undefined}
                onChange={(e) => {
                  setFormError(null);
                  setNameInput(e.target.value);
                }}
                className="w-full rounded-control border border-nota-border bg-nota-surface px-3.5 py-2 text-sm text-nota-ink placeholder:text-nota-muted/60"
              />
            </div>

            {/* Target Amount */}
            <div className="space-y-1.5">
              <label
                htmlFor={targetAmountInputId}
                className="block text-xs font-medium text-nota-ink"
              >
                Target nominal (IDR)
              </label>
              <div className="relative flex items-center">
                <span
                  className="pointer-events-none absolute left-3.5 text-sm font-medium text-nota-muted select-none"
                  aria-hidden="true"
                >
                  Rp
                </span>
                <input
                  id={targetAmountInputId}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Contoh: 10.000.000"
                  value={rawTargetInput}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(formError)}
                  aria-describedby={formError ? errorAlertId : undefined}
                  onChange={(e) => handleTargetInputChange(e.target.value)}
                  className="w-full rounded-control border border-nota-border bg-nota-surface py-2 pl-10 pr-3.5 text-sm font-medium text-nota-ink tabular-nums placeholder:text-nota-muted/60"
                />
              </div>
            </div>

            {/* Allocated Amount */}
            <div className="space-y-1.5">
              <label
                htmlFor={allocatedAmountInputId}
                className="block text-xs font-medium text-nota-ink"
              >
                Dana dialokasikan saat ini (IDR)
              </label>
              <div className="relative flex items-center">
                <span
                  className="pointer-events-none absolute left-3.5 text-sm font-medium text-nota-muted select-none"
                  aria-hidden="true"
                >
                  Rp
                </span>
                <input
                  id={allocatedAmountInputId}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0"
                  value={rawAllocatedInput}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(formError)}
                  aria-describedby={formError ? errorAlertId : undefined}
                  onChange={(e) => handleAllocatedInputChange(e.target.value)}
                  className="w-full rounded-control border border-nota-border bg-nota-surface py-2 pl-10 pr-3.5 text-sm font-medium text-nota-ink tabular-nums placeholder:text-nota-muted/60"
                />
              </div>
            </div>

            {/* Optional Target Date */}
            <div className="space-y-1.5">
              <label
                htmlFor={targetDateInputId}
                className="block text-xs font-medium text-nota-ink"
              >
                Target tanggal (opsional)
              </label>
              <input
                id={targetDateInputId}
                type="date"
                value={targetDateInput}
                disabled={isSubmitting}
                onChange={(e) => {
                  setFormError(null);
                  setTargetDateInput(e.target.value);
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
                Catatan target (opsional)
              </label>
              <input
                id={noteInputId}
                type="text"
                maxLength={MAX_SAVINGS_GOAL_NOTE_LENGTH}
                placeholder="Contoh: Disisihkan tiap awal bulan"
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
              {isSubmitting ? 'Menyimpan...' : 'Simpan target'}
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

      {/* Empty State or Goals Overview & List */}
      {goalsOverview.items.length === 0 ? (
        <div className="rounded-panel bg-nota-bg/80 px-5 py-8 text-center space-y-2">
          <p className="text-sm font-medium text-nota-ink">
            Belum ada target tabungan
          </p>
          <p className="text-xs text-nota-muted max-w-md mx-auto leading-relaxed">
            Buat target tabungan seperti Dana Darurat atau Pembelian Barang dan
            alokasikan sebagian saldo tercatat Anda untuk memantau kemajuannya.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Aggregate Allocation Summary Strip */}
          <div
            data-testid="savings-goals-summary-strip"
            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          >
            <div className="rounded-panel bg-nota-bg/75 p-4 border border-nota-border/60">
              <span className="text-xs font-medium text-nota-muted block">
                Total dialokasikan ke target
              </span>
              <span
                data-testid="savings-total-allocated"
                className="mt-1 block text-base sm:text-lg font-semibold text-nota-emerald tabular-nums"
              >
                {formatIDR(goalsOverview.totalAllocatedAmount)}
              </span>
            </div>

            <div className="rounded-panel bg-nota-bg/75 p-4 border border-nota-border/60">
              <span className="text-xs font-medium text-nota-muted block">
                Saldo belum dialokasikan
              </span>
              <span
                data-testid="savings-unallocated-balance"
                className={`mt-1 block text-base sm:text-lg font-semibold tabular-nums ${
                  goalsOverview.unallocatedBalance < 0
                    ? 'text-nota-expense'
                    : 'text-nota-ink'
                }`}
              >
                {goalsOverview.unallocatedBalance < 0
                  ? formatSignedIDR(goalsOverview.unallocatedBalance)
                  : formatIDR(goalsOverview.unallocatedBalance)}
              </span>
            </div>

            <div className="rounded-panel bg-nota-bg/75 p-4 border border-nota-border/60">
              <span className="text-xs font-medium text-nota-muted block">
                Total target tabungan
              </span>
              <span
                data-testid="savings-total-target"
                className="mt-1 block text-base sm:text-lg font-semibold text-nota-ink tabular-nums"
              >
                {formatIDR(goalsOverview.totalTargetAmount)}
              </span>
            </div>
          </div>

          {/* Over-allocation Notice if allocated exceeds current recorded balance */}
          {goalsOverview.overAllocatedAmount > 0 ? (
            <div
              role="status"
              data-testid="savings-overallocation-warning"
              className="flex items-start gap-2.5 rounded-panel border border-nota-expense/30 bg-nota-expense-soft px-4 py-3 text-xs text-nota-ink"
            >
              <AlertTriangle
                className="h-4 w-4 text-nota-expense shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div>
                <p className="font-semibold text-nota-expense">
                  Alokasi target melebihi saldo tercatat saat ini
                </p>
                <p className="mt-0.5 text-nota-ink/85">
                  Total dana yang dialokasikan ke target tabungan melebihi saldo
                  tercatat sebesar{' '}
                  <strong className="font-semibold tabular-nums">
                    {formatIDR(goalsOverview.overAllocatedAmount)}
                  </strong>
                  . Sesuaikan alokasi target atau tambahkan pemasukan.
                </p>
              </div>
            </div>
          ) : null}

          {/* Savings Goals List */}
          <ul aria-label="Daftar target tabungan" className="space-y-3">
            {goalsOverview.items.map((item) => {
              const isCompleted = item.status === 'completed';
              const isConfirmingDelete = pendingDeleteGoalId === item.id;
              const isDeletingThis = isDeletingGoalId === item.id;
              const barWidthPercent = Math.min(
                100,
                item.allocatedAmount > 0 ? Math.max(item.progressPercent, 4) : 0,
              );

              return (
                <li
                  key={item.id}
                  data-testid={`savings-goal-item-${item.id}`}
                  className="rounded-panel border border-nota-border/70 bg-nota-bg/65 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-nota-ink">
                          {item.name}
                        </span>
                        <span
                          className={`rounded-control px-2 py-0.5 text-[11px] font-medium ${
                            isCompleted
                              ? 'border border-nota-emerald/30 bg-nota-lime text-nota-ink'
                              : 'border border-nota-emerald/25 bg-nota-soft-green text-nota-emerald'
                          }`}
                        >
                          {isCompleted ? 'Target tercapai' : 'Sedang berjalan'}
                        </span>
                        {item.targetDate ? (
                          <span className="inline-flex items-center gap-1 rounded-control border border-nota-border bg-nota-surface px-2 py-0.5 text-[11px] font-medium text-nota-muted">
                            <Calendar
                              className="h-3 w-3 text-nota-emerald"
                              aria-hidden="true"
                            />
                            Target: {formatLocalDateID(item.targetDate)}
                          </span>
                        ) : null}
                      </div>

                      <p className="text-xs text-nota-muted tabular-nums">
                        Dialokasikan{' '}
                        <strong className="font-semibold text-nota-ink">
                          {formatIDR(item.allocatedAmount)}
                        </strong>{' '}
                        dari target{' '}
                        <strong className="font-semibold text-nota-ink">
                          {formatIDR(item.targetAmount)}
                        </strong>{' '}
                        ({item.progressPercent}%)
                      </p>

                      {item.note ? (
                        <p className="text-xs text-nota-muted">{item.note}</p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-nota-emerald tabular-nums">
                        {isCompleted
                          ? 'Tercapai 100%'
                          : `Kurang ${formatIDR(item.remainingTargetAmount)}`}
                      </span>

                      <button
                        type="button"
                        onClick={() => openEditGoalForm(item)}
                        aria-label={`Ubah target ${item.name}`}
                        className="inline-flex items-center gap-1 rounded-control border border-nota-border bg-nota-surface px-2.5 py-1 text-xs font-medium text-nota-ink hover:bg-nota-soft-green/50 transition-colors cursor-pointer"
                      >
                        <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
                        Ubah
                      </button>

                      {!isConfirmingDelete ? (
                        <button
                          type="button"
                          onClick={() => setPendingDeleteGoalId(item.id)}
                          aria-label={`Hapus target ${item.name}`}
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
                    aria-label={`Kemajuan target ${item.name}`}
                    aria-valuenow={Math.min(100, item.progressPercent)}
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
                        Hapus target tabungan <strong>{item.name}</strong>? Saldo
                        tercatat Anda tidak akan berubah.
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isDeletingThis}
                          onClick={() => setPendingDeleteGoalId(null)}
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
                            : 'Ya, hapus target'}
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

