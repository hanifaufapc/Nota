/**
 * Pure Domain Model, Validation, and Calculations for Savings Goals (P1 — Milestone 7, Opsi B).
 *
 * Source of truth: PRD.md §5.2, §6, §7 & IMPLEMENTATION_PLAN.md (Milestone 7).
 *
 * Key Invariants:
 * 1. A `SavingsGoal` is a non-destructive earmark/allocation against `currentBalance` (`Saldo tercatat`),
 *    NEVER a synthetic expense or transfer transaction.
 * 2. Creating, updating, or deleting a savings goal NEVER alters `currentBalance` (`Saldo tercatat`)
 *    or period cash-flow summaries (`Pemasukan`, `Pengeluaran`, `Selisih bulan ini`).
 * 3. `targetAmount` must be a positive integer IDR (`> 0`), and `allocatedAmount` must be a
 *    non-negative integer IDR (`>= 0`).
 */

import { isValidLocalDateString } from '../lib/date';
import {
  addIdr,
  isValidOpeningBalance,
  isValidTransactionAmount,
} from './money';
import type { ValidationResult } from './validation';

export const MAX_SAVINGS_GOAL_NAME_LENGTH = 60;
export const MAX_SAVINGS_GOAL_NOTE_LENGTH = 160;

export interface SavingsGoal {
  /** Unique local identifier */
  id: string;
  /** Goal name (e.g., "Dana Darurat", "Liburan Akhir Tahun") */
  name: string;
  /** Target savings amount in positive integer IDR (`> 0`) */
  targetAmount: number;
  /** Currently earmarked/allocated amount in non-negative integer IDR (`>= 0`) */
  allocatedAmount: number;
  /** Optional target completion date (`YYYY-MM-DD`) */
  targetDate?: string;
  /** Optional note */
  note?: string;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 last-update timestamp */
  updatedAt: string;
}

export interface SavingsGoalInput {
  id?: string;
  name: string;
  targetAmount: number;
  allocatedAmount: number;
  targetDate?: string;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SavingsGoalPatch {
  name?: string;
  targetAmount?: number;
  allocatedAmount?: number;
  targetDate?: string | null;
  note?: string | null;
}

export type SavingsGoalStatus = 'in-progress' | 'completed';

export interface SavingsGoalProgressItem extends SavingsGoal {
  /** Remaining IDR needed to reach `targetAmount` (`>= 0`) */
  remainingTargetAmount: number;
  /** Completion percentage (`0` to `100+`, rounded integer) */
  progressPercent: number;
  /** Status derived from `allocatedAmount >= targetAmount` */
  status: SavingsGoalStatus;
}

export interface SavingsGoalsOverview {
  items: SavingsGoalProgressItem[];
  totalTargetAmount: number;
  totalAllocatedAmount: number;
  /** Remaining recorded balance not earmarked to any goal (`currentBalance - totalAllocatedAmount`, may be negative) */
  unallocatedBalance: number;
  /** Positive IDR amount by which `totalAllocatedAmount` exceeds `Math.max(0, currentBalance)` (`0` when fully backed by current balance) */
  overAllocatedAmount: number;
  completedCount: number;
}

/**
 * Validates a `SavingsGoalInput` against domain rules.
 */
export function validateSavingsGoalInput(
  input: Partial<SavingsGoalInput> | null | undefined,
): ValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return {
      valid: false,
      errors: ['Data target tabungan tidak boleh kosong.'],
    };
  }

  const trimmedName =
    typeof input.name === 'string' ? input.name.trim() : '';
  if (trimmedName.length === 0) {
    errors.push('Nama target tabungan wajib diisi.');
  } else if (trimmedName.length > MAX_SAVINGS_GOAL_NAME_LENGTH) {
    errors.push(
      `Nama target tabungan maksimal ${MAX_SAVINGS_GOAL_NAME_LENGTH} karakter.`,
    );
  }

  if (!isValidTransactionAmount(input.targetAmount)) {
    errors.push(
      'Target nominal tabungan harus berupa bilangan bulat Rupiah lebih besar dari 0.',
    );
  }

  if (!isValidOpeningBalance(input.allocatedAmount)) {
    errors.push(
      'Dana dialokasikan harus berupa bilangan bulat Rupiah (0 atau lebih besar).',
    );
  }

  if (
    input.targetDate !== undefined &&
    input.targetDate !== null &&
    input.targetDate.trim().length > 0
  ) {
    if (!isValidLocalDateString(input.targetDate.trim())) {
      errors.push(
        'Tanggal target tabungan harus menggunakan format tanggal lokal YYYY-MM-DD yang valid.',
      );
    }
  }

  if (input.note !== undefined && input.note !== null) {
    const trimmedNote = String(input.note).trim();
    if (trimmedNote.length > MAX_SAVINGS_GOAL_NOTE_LENGTH) {
      errors.push(
        `Catatan target tabungan maksimal ${MAX_SAVINGS_GOAL_NOTE_LENGTH} karakter.`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Pure factory that creates a validated `SavingsGoal` record.
 */
export function createSavingsGoal(input: SavingsGoalInput): SavingsGoal {
  const validation = validateSavingsGoalInput(input);
  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }

  const nowIso = new Date().toISOString();
  const createdAt = input.createdAt ?? nowIso;
  const updatedAt = input.updatedAt ?? createdAt;
  const id =
    typeof input.id === 'string' && input.id.trim().length > 0
      ? input.id.trim()
      : `goal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const trimmedTargetDate = input.targetDate?.trim();
  const trimmedNote = input.note?.trim();

  return {
    id,
    name: input.name.trim(),
    targetAmount: input.targetAmount,
    allocatedAmount: input.allocatedAmount,
    ...(trimmedTargetDate ? { targetDate: trimmedTargetDate } : {}),
    ...(trimmedNote ? { note: trimmedNote } : {}),
    createdAt,
    updatedAt,
  };
}

/**
 * Applies a partial edit to an existing `SavingsGoal` while preserving `id` and `createdAt`.
 */
export function applySavingsGoalEdit(
  existing: SavingsGoal,
  patch: SavingsGoalPatch,
  updatedAtIso?: string,
): SavingsGoal {
  const nextTargetDate =
    patch.targetDate === null
      ? undefined
      : patch.targetDate !== undefined
        ? patch.targetDate
        : existing.targetDate;
  const nextNote =
    patch.note === null
      ? undefined
      : patch.note !== undefined
        ? patch.note
        : existing.note;

  return createSavingsGoal({
    id: existing.id,
    name: patch.name !== undefined ? patch.name : existing.name,
    targetAmount:
      patch.targetAmount !== undefined
        ? patch.targetAmount
        : existing.targetAmount,
    allocatedAmount:
      patch.allocatedAmount !== undefined
        ? patch.allocatedAmount
        : existing.allocatedAmount,
    targetDate: nextTargetDate,
    note: nextNote,
    createdAt: existing.createdAt,
    updatedAt: updatedAtIso ?? new Date().toISOString(),
  });
}

/**
 * Computes progress and balance allocation summary for all configured savings goals.
 * Never mutates `currentBalance` or creates synthetic transactions.
 */
export function calculateSavingsGoalsOverview(
  goals: readonly SavingsGoal[],
  currentBalance: number,
): SavingsGoalsOverview {
  let totalTargetAmount = 0;
  let totalAllocatedAmount = 0;
  let completedCount = 0;

  const items: SavingsGoalProgressItem[] = goals.map((goal) => {
    if (!isValidTransactionAmount(goal.targetAmount)) {
      throw new RangeError(
        `Target nominal untuk "${goal.name}" tidak valid.`,
      );
    }
    if (!isValidOpeningBalance(goal.allocatedAmount)) {
      throw new RangeError(
        `Nominal alokasi untuk "${goal.name}" tidak valid.`,
      );
    }

    const diff = addIdr(goal.targetAmount, -goal.allocatedAmount);
    const remainingTargetAmount = diff > 0 ? diff : 0;
    const progressPercent = Math.round(
      (goal.allocatedAmount / goal.targetAmount) * 100,
    );
    const status: SavingsGoalStatus =
      goal.allocatedAmount >= goal.targetAmount ? 'completed' : 'in-progress';

    if (status === 'completed') {
      completedCount += 1;
    }

    totalTargetAmount = addIdr(totalTargetAmount, goal.targetAmount);
    totalAllocatedAmount = addIdr(totalAllocatedAmount, goal.allocatedAmount);

    return {
      ...goal,
      remainingTargetAmount,
      progressPercent,
      status,
    };
  });

  // Sort in-progress goals first (by targetDate ascending if present, then newest), then completed goals
  items.sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'in-progress' ? -1 : 1;
    }
    if (a.targetDate && b.targetDate && a.targetDate !== b.targetDate) {
      return a.targetDate.localeCompare(b.targetDate);
    }
    if (a.targetDate && !b.targetDate) {
      return -1;
    }
    if (!a.targetDate && b.targetDate) {
      return 1;
    }
    return b.createdAt.localeCompare(a.createdAt);
  });

  const unallocatedBalance = addIdr(currentBalance, -totalAllocatedAmount);
  const availablePositiveBalance = currentBalance > 0 ? currentBalance : 0;
  const overDiff = addIdr(totalAllocatedAmount, -availablePositiveBalance);
  const overAllocatedAmount = overDiff > 0 ? overDiff : 0;

  return {
    items,
    totalTargetAmount,
    totalAllocatedAmount,
    unallocatedBalance,
    overAllocatedAmount,
    completedCount,
  };
}

