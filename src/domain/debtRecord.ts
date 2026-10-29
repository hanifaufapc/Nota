/**
 * Pure Domain Model, Validation, and Calculations for Debt & Receivable Tracking
 * (Catatan Utang & Piutang — P1, Milestone 7, Opsi D).
 *
 * Source of truth: PRD.md §5.2 ("Utang/piutang sebagai catatan kewajiban, dipisahkan
 * dari transaksi kas agar tidak menggandakan saldo"), §6, §7 & IMPLEMENTATION_PLAN.md.
 *
 * Key Invariants:
 * 1. `DebtRecord` is an obligation record (`payable` = Utang / I owe someone;
 *    `receivable` = Piutang / someone owes me) separated from cash transactions.
 * 2. Creating, updating, settling, or deleting a `DebtRecord` NEVER alters
 *    `currentBalance` (`Saldo tercatat`) or period cash-flow summaries.
 * 3. `amount` must be a positive integer IDR (`> 0`), and `remainingAmount` must be
 *    an integer IDR with `0 <= remainingAmount <= amount`.
 * 4. `status` is strictly derived/consistent with `remainingAmount`:
 *    - `remainingAmount === 0` -> `'settled'` (`Lunas`)
 *    - `remainingAmount > 0`   -> `'open'` (`Belum lunas`)
 */

import { isValidLocalDateString } from '../lib/date';
import {
  addIdr,
  isValidOpeningBalance,
  isValidTransactionAmount,
} from './money';
import type { ValidationResult } from './validation';

export const MAX_DEBT_PERSON_NAME_LENGTH = 60;
export const MAX_DEBT_NOTE_LENGTH = 160;

export type DebtDirection = 'payable' | 'receivable';
export type DebtStatus = 'open' | 'settled';

export interface DebtRecord {
  /** Unique local identifier */
  id: string;
  /** `'payable'` (Utang — perlu dibayar) or `'receivable'` (Piutang — akan diterima) */
  direction: DebtDirection;
  /** Counterparty / person / institution name */
  personName: string;
  /** Original principal obligation in positive integer IDR (`> 0`) */
  amount: number;
  /** Remaining unpaid obligation in integer IDR (`0 <= remainingAmount <= amount`) */
  remainingAmount: number;
  /** Derived status: `'open'` when `remainingAmount > 0`, `'settled'` when `remainingAmount === 0` */
  status: DebtStatus;
  /** Optional due date (`YYYY-MM-DD`) */
  dueDate?: string;
  /** Optional note */
  note?: string;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 last-update timestamp */
  updatedAt: string;
}

export interface DebtRecordInput {
  id?: string;
  direction: DebtDirection;
  personName: string;
  amount: number;
  remainingAmount?: number;
  dueDate?: string;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DebtRecordPatch {
  direction?: DebtDirection;
  personName?: string;
  amount?: number;
  remainingAmount?: number;
  dueDate?: string | null;
  note?: string | null;
}

export interface DebtRecordOverviewItem extends DebtRecord {
  /** Settled/paid portion (`amount - remainingAmount`) */
  settledAmount: number;
  /** Completion percentage (`0` to `100`, rounded integer) */
  settledPercent: number;
}

export interface DebtRecordsOverview {
  items: DebtRecordOverviewItem[];
  /** Sum of `remainingAmount` across open `'payable'` (Utang) records */
  totalOpenPayable: number;
  /** Sum of `remainingAmount` across open `'receivable'` (Piutang) records */
  totalOpenReceivable: number;
  /** `totalOpenReceivable - totalOpenPayable` */
  netObligationPosition: number;
  openCount: number;
  settledCount: number;
}

export function isValidDebtDirection(value: unknown): value is DebtDirection {
  return value === 'payable' || value === 'receivable';
}

/**
 * Validates a `DebtRecordInput` against domain rules.
 */
export function validateDebtRecordInput(
  input: Partial<DebtRecordInput> | null | undefined,
): ValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return {
      valid: false,
      errors: ['Data catatan utang/piutang tidak boleh kosong.'],
    };
  }

  if (!isValidDebtDirection(input.direction)) {
    errors.push(
      'Jenis catatan wajib dipilih (Utang atau Piutang).',
    );
  }

  const trimmedPersonName =
    typeof input.personName === 'string' ? input.personName.trim() : '';
  if (trimmedPersonName.length === 0) {
    errors.push('Nama pihak terkait wajib diisi.');
  } else if (trimmedPersonName.length > MAX_DEBT_PERSON_NAME_LENGTH) {
    errors.push(
      `Nama pihak terkait maksimal ${MAX_DEBT_PERSON_NAME_LENGTH} karakter.`,
    );
  }

  const validAmount = isValidTransactionAmount(input.amount);
  if (!validAmount) {
    errors.push(
      'Nominal awal wajib berupa bilangan bulat Rupiah lebih besar dari 0.',
    );
  }

  const effectiveRemaining =
    input.remainingAmount !== undefined ? input.remainingAmount : input.amount;

  if (!isValidOpeningBalance(effectiveRemaining)) {
    errors.push(
      'Sisa nominal wajib berupa bilangan bulat Rupiah (0 atau lebih besar).',
    );
  } else if (validAmount && effectiveRemaining > (input.amount as number)) {
    errors.push(
      'Sisa nominal belum lunas tidak boleh melebihi nominal awal.',
    );
  }

  if (
    input.dueDate !== undefined &&
    input.dueDate !== null &&
    input.dueDate.trim().length > 0
  ) {
    if (!isValidLocalDateString(input.dueDate.trim())) {
      errors.push(
        'Tanggal jatuh tempo harus menggunakan format tanggal lokal YYYY-MM-DD yang valid.',
      );
    }
  }

  if (input.note !== undefined && input.note !== null) {
    const trimmedNote = String(input.note).trim();
    if (trimmedNote.length > MAX_DEBT_NOTE_LENGTH) {
      errors.push(
        `Catatan utang/piutang maksimal ${MAX_DEBT_NOTE_LENGTH} karakter.`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Pure factory that creates a validated `DebtRecord` with consistent `status`.
 */
export function createDebtRecord(input: DebtRecordInput): DebtRecord {
  const validation = validateDebtRecordInput(input);
  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }

  const nowIso = new Date().toISOString();
  const createdAt = input.createdAt ?? nowIso;
  const updatedAt = input.updatedAt ?? createdAt;
  const id =
    typeof input.id === 'string' && input.id.trim().length > 0
      ? input.id.trim()
      : `debt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const remainingAmount =
    input.remainingAmount !== undefined ? input.remainingAmount : input.amount;
  const status: DebtStatus = remainingAmount === 0 ? 'settled' : 'open';

  const trimmedDueDate = input.dueDate?.trim();
  const trimmedNote = input.note?.trim();

  return {
    id,
    direction: input.direction,
    personName: input.personName.trim(),
    amount: input.amount,
    remainingAmount,
    status,
    ...(trimmedDueDate ? { dueDate: trimmedDueDate } : {}),
    ...(trimmedNote ? { note: trimmedNote } : {}),
    createdAt,
    updatedAt,
  };
}

/**
 * Applies a partial edit to an existing `DebtRecord` while preserving `id` and `createdAt`.
 */
export function applyDebtRecordEdit(
  existing: DebtRecord,
  patch: DebtRecordPatch,
  updatedAtIso?: string,
): DebtRecord {
  const nextDueDate =
    patch.dueDate === null
      ? undefined
      : patch.dueDate !== undefined
        ? patch.dueDate
        : existing.dueDate;
  const nextNote =
    patch.note === null
      ? undefined
      : patch.note !== undefined
        ? patch.note
        : existing.note;

  return createDebtRecord({
    id: existing.id,
    direction:
      patch.direction !== undefined ? patch.direction : existing.direction,
    personName:
      patch.personName !== undefined ? patch.personName : existing.personName,
    amount: patch.amount !== undefined ? patch.amount : existing.amount,
    remainingAmount:
      patch.remainingAmount !== undefined
        ? patch.remainingAmount
        : existing.remainingAmount,
    dueDate: nextDueDate,
    note: nextNote,
    createdAt: existing.createdAt,
    updatedAt: updatedAtIso ?? new Date().toISOString(),
  });
}

/**
 * Marks a `DebtRecord` as settled (`remainingAmount = 0`, `status = 'settled'`).
 */
export function settleDebtRecord(
  existing: DebtRecord,
  updatedAtIso?: string,
): DebtRecord {
  return applyDebtRecordEdit(
    existing,
    { remainingAmount: 0 },
    updatedAtIso,
  );
}

/**
 * Computes obligation summaries and progress items for all `DebtRecord` entries.
 * Isolated from cash transactions (`calculateCurrentBalance` is never affected).
 */
export function calculateDebtRecordsOverview(
  records: readonly DebtRecord[],
): DebtRecordsOverview {
  let totalOpenPayable = 0;
  let totalOpenReceivable = 0;
  let openCount = 0;
  let settledCount = 0;

  const items: DebtRecordOverviewItem[] = records.map((record) => {
    if (!isValidTransactionAmount(record.amount)) {
      throw new RangeError(
        `Nominal awal utang/piutang untuk "${record.personName}" tidak valid.`,
      );
    }
    if (
      !isValidOpeningBalance(record.remainingAmount) ||
      record.remainingAmount > record.amount
    ) {
      throw new RangeError(
        `Sisa nominal utang/piutang untuk "${record.personName}" tidak valid.`,
      );
    }

    const derivedStatus: DebtStatus =
      record.remainingAmount === 0 ? 'settled' : 'open';
    const settledAmount = addIdr(record.amount, -record.remainingAmount);
    const settledPercent = Math.round((settledAmount / record.amount) * 100);

    if (derivedStatus === 'open') {
      openCount += 1;
      if (record.direction === 'payable') {
        totalOpenPayable = addIdr(totalOpenPayable, record.remainingAmount);
      } else {
        totalOpenReceivable = addIdr(
          totalOpenReceivable,
          record.remainingAmount,
        );
      }
    } else {
      settledCount += 1;
    }

    return {
      ...record,
      status: derivedStatus,
      settledAmount,
      settledPercent,
    };
  });

  // Sort open items first (by dueDate ascending if present, then newest), then settled items
  items.sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'open' ? -1 : 1;
    }
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
      return a.dueDate.localeCompare(b.dueDate);
    }
    if (a.dueDate && !b.dueDate) {
      return -1;
    }
    if (!a.dueDate && b.dueDate) {
      return 1;
    }
    return b.createdAt.localeCompare(a.createdAt);
  });

  const netObligationPosition = addIdr(totalOpenReceivable, -totalOpenPayable);

  return {
    items,
    totalOpenPayable,
    totalOpenReceivable,
    netObligationPosition,
    openCount,
    settledCount,
  };
}

