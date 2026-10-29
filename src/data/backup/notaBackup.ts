/**
 * Versioned Backup & Restore Domain Module for Nota (Manajemen Keuangan Masjid).
 *
 * Source of truth: PRD.md §5.6, §8 & ARCHITECTURE.md §2, §5.
 *
 * Responsibilities:
 * - Construct versioned JSON backup payloads (`schemaVersion: 5`) including `settings`, `accounts`, `funds`,
 *   `categories`, `transactions`, `cashTransfers`, and `budgetPlans` (plus legacy v2–v4 stores).
 * - Validate imported JSON strings or objects (`schemaVersion` 1..5) exhaustively BEFORE any database mutation occurs.
 * - Compute a human-readable `NotaBackupPreview` so the user can review record counts and balances before confirming a replace.
 * - Export transactions and mosque financial reports to CSV safely without formula injection.
 */

import { NOTA_SCHEMA_VERSION } from '../db';
import { isValidLocalDateString } from '../../lib/date';
import {
  type CategoryBudget,
  createCategoryBudget,
} from '../../domain/budget';
import {
  type BudgetPlan,
  createBudgetPlan,
} from '../../domain/budgetPlan';
import {
  type DebtRecord,
  createDebtRecord,
} from '../../domain/debtRecord';
import {
  DEFAULT_CASH_ACCOUNTS,
  DEFAULT_CASH_ACCOUNT_TUNAI_ID,
  DEFAULT_FUNDS,
  DEFAULT_FUND_OPERASIONAL_ID,
  type CashAccount,
  type CashTransfer,
  type Fund,
  createCashAccount,
  createCashTransfer,
  createFund,
} from '../../domain/mosque';
import type { MosqueFinancialReport } from '../../domain/report';
import {
  type SavingsGoal,
  createSavingsGoal,
} from '../../domain/savingsGoal';
import {
  addIdr,
  isValidOpeningBalance,
  isValidTransactionAmount,
} from '../../domain/money';
import {
  calculateCurrentBalance,
  calculateIncomeAndExpenseTotals,
  sortTransactions,
} from '../../domain/summaries';
import {
  DEFAULT_CATEGORIES,
  type AppSettings,
  type Category,
  type Transaction,
} from '../../domain/transaction';
import {
  validateAppSettings,
  validateCategoryInput,
  validateTransactionDraft,
} from '../../domain/validation';

export const NOTA_BACKUP_APP_NAME = 'Nota' as const;
export const SUPPORTED_BACKUP_SCHEMA_VERSION = NOTA_SCHEMA_VERSION;

export interface NotaBackupPayload {
  appName: typeof NOTA_BACKUP_APP_NAME;
  schemaVersion: number;
  exportedAt: string;
  settings: AppSettings;
  accounts?: CashAccount[];
  funds?: Fund[];
  categories: Category[];
  transactions: Transaction[];
  cashTransfers?: CashTransfer[];
  budgetPlans?: BudgetPlan[];
  budgets?: CategoryBudget[];
  savingsGoals?: SavingsGoal[];
  debtRecords?: DebtRecord[];
}

export interface NotaBackupPreview {
  payload: NotaBackupPayload;
  rawJson: string;
  summary: {
    schemaVersion: number;
    exportedAt: string;
    openingBalance: number;
    currentBalance: number;
    totalIncome: number;
    totalExpense: number;
    transactionCount: number;
    categoryCount: number;
    archivedCategoryCount: number;
    accountCount: number;
    fundCount: number;
    cashTransferCount: number;
    budgetPlanCount: number;
    budgetCount: number;
    savingsGoalCount: number;
    debtRecordCount: number;
  };
}

export type BackupValidationResult =
  | { valid: true; preview: NotaBackupPreview }
  | { valid: false; errors: string[] };

function isValidIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }
  const time = Date.parse(value);
  return !Number.isNaN(time);
}

/**
 * Ensures all default categories exist in a category collection
 * without overwriting user-renamed or archived default categories.
 */
export function mergeWithDefaultCategories(
  categories: readonly Category[],
): Category[] {
  const existingIds = new Set(categories.map((c) => c.id));
  const missingDefaults = DEFAULT_CATEGORIES.filter(
    (c) => !existingIds.has(c.id),
  ).map((c) => ({ ...c }));

  return [...categories.map((c) => ({ ...c })), ...missingDefaults];
}

export function mergeWithDefaultAccounts(
  accounts: readonly CashAccount[],
): CashAccount[] {
  const existingIds = new Set(accounts.map((a) => a.id));
  const missingDefaults = DEFAULT_CASH_ACCOUNTS.filter(
    (a) => !existingIds.has(a.id),
  ).map((a) => ({ ...a }));

  return [...accounts.map((a) => ({ ...a })), ...missingDefaults];
}

export function mergeWithDefaultFunds(funds: readonly Fund[]): Fund[] {
  const existingIds = new Set(funds.map((f) => f.id));
  const missingDefaults = DEFAULT_FUNDS.filter(
    (f) => !existingIds.has(f.id),
  ).map((f) => ({ ...f }));

  return [...funds.map((f) => ({ ...f })), ...missingDefaults];
}

/**
 * Creates a validated `NotaBackupPayload` from current workspace records.
 */
export function createBackupPayload(params: {
  settings: AppSettings;
  accounts?: readonly CashAccount[];
  funds?: readonly Fund[];
  categories: readonly Category[];
  transactions: readonly Transaction[];
  cashTransfers?: readonly CashTransfer[];
  budgetPlans?: readonly BudgetPlan[];
  budgets?: readonly CategoryBudget[];
  savingsGoals?: readonly SavingsGoal[];
  debtRecords?: readonly DebtRecord[];
  exportedAt?: string;
}): NotaBackupPayload {
  const exportedAt = params.exportedAt ?? new Date().toISOString();
  const accounts = mergeWithDefaultAccounts(params.accounts ?? []);
  const funds = mergeWithDefaultFunds(params.funds ?? []);
  const cashTransfers = (params.cashTransfers ?? [])
    .map((tr) => ({ ...tr }))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const budgetPlans = (params.budgetPlans ?? [])
    .map((p) => ({
      ...p,
      items: p.items.map((item) => ({ ...item })),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const budgets = (params.budgets ?? [])
    .map((b) => ({ ...b }))
    .sort((a, b) => a.categoryId.localeCompare(b.categoryId, 'id-ID'));
  const savingsGoals = (params.savingsGoals ?? [])
    .map((g) => ({ ...g }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const debtRecords = (params.debtRecords ?? [])
    .map((d) => ({ ...d }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    appName: NOTA_BACKUP_APP_NAME,
    schemaVersion: SUPPORTED_BACKUP_SCHEMA_VERSION,
    exportedAt,
    settings: {
      openingBalance: params.settings.openingBalance,
      currency: params.settings.currency,
      onboardingCompleted: params.settings.onboardingCompleted,
      ...(params.settings.mosqueName !== undefined
        ? { mosqueName: params.settings.mosqueName }
        : {}),
      ...(params.settings.mosqueAddress !== undefined
        ? { mosqueAddress: params.settings.mosqueAddress }
        : {}),
      ...(params.settings.chairpersonName !== undefined
        ? { chairpersonName: params.settings.chairpersonName }
        : {}),
      ...(params.settings.treasurerName !== undefined
        ? { treasurerName: params.settings.treasurerName }
        : {}),
    },
    accounts,
    funds,
    categories: mergeWithDefaultCategories(params.categories),
    transactions: sortTransactions(params.transactions, 'newest').map((tx) => ({
      ...tx,
    })),
    cashTransfers,
    budgetPlans,
    budgets,
    savingsGoals,
    debtRecords,
  };
}

/**
 * Serializes a `NotaBackupPayload` into formatted JSON for download.
 */
export function serializeBackupPayload(payload: NotaBackupPayload): string {
  return JSON.stringify(payload, null, 2);
}

/**
 * Parses and exhaustively validates a raw JSON string as a `NotaBackupPayload`.
 */
export function parseAndValidateBackupJson(
  rawJson: string,
): BackupValidationResult {
  if (typeof rawJson !== 'string' || rawJson.trim().length === 0) {
    return {
      valid: false,
      errors: ['File cadangan kosong atau tidak dapat dibaca.'],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return {
      valid: false,
      errors: [
        'File cadangan bukan berformat JSON yang valid. Pastikan Anda memilih file .json dari Nota.',
      ],
    };
  }

  return validateBackupObject(parsed, rawJson);
}

/**
 * Validates an unknown parsed object as a `NotaBackupPayload` and builds a `NotaBackupPreview`.
 */
export function validateBackupObject(
  candidate: unknown,
  rawJsonSource?: string,
): BackupValidationResult {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return {
      valid: false,
      errors: ['Struktur file cadangan tidak valid (harus berupa objek JSON).'],
    };
  }

  const record = candidate as Record<string, unknown>;

  if (record.appName !== NOTA_BACKUP_APP_NAME) {
    return {
      valid: false,
      errors: [
        'File cadangan bukan berasal dari aplikasi Nota (properti appName tidak sesuai).',
      ],
    };
  }

  if (
    typeof record.schemaVersion !== 'number' ||
    !Number.isInteger(record.schemaVersion)
  ) {
    return {
      valid: false,
      errors: [
        'Versi skema cadangan (schemaVersion) tidak ditemukan atau tidak valid.',
      ],
    };
  }

  if (
    record.schemaVersion < 1 ||
    record.schemaVersion > SUPPORTED_BACKUP_SCHEMA_VERSION
  ) {
    return {
      valid: false,
      errors: [
        `Versi skema cadangan (${record.schemaVersion}) tidak didukung oleh versi Nota ini (mendukung versi 1–${SUPPORTED_BACKUP_SCHEMA_VERSION}).`,
      ],
    };
  }

  if (!isValidIsoTimestamp(record.exportedAt)) {
    return {
      valid: false,
      errors: ['Waktu ekspor cadangan (exportedAt) tidak valid.'],
    };
  }

  // Validate settings
  const rawSettings = record.settings as Partial<AppSettings> | undefined;
  const settingsValidation = validateAppSettings(rawSettings);
  if (!settingsValidation.valid || !rawSettings) {
    return {
      valid: false,
      errors: [
        `Data pengaturan dalam cadangan tidak valid: ${
          settingsValidation.errors[0] ?? 'Pengaturan rusak.'
        }`,
      ],
    };
  }

  if (!isValidOpeningBalance(rawSettings.openingBalance)) {
    return {
      valid: false,
      errors: ['Nominal saldo awal dalam cadangan tidak valid.'],
    };
  }

  const validatedSettings: AppSettings = {
    openingBalance: rawSettings.openingBalance,
    currency: 'IDR',
    onboardingCompleted: Boolean(rawSettings.onboardingCompleted),
    ...(typeof rawSettings.mosqueName === 'string' &&
    rawSettings.mosqueName.trim().length > 0
      ? { mosqueName: rawSettings.mosqueName.trim() }
      : {}),
    ...(typeof rawSettings.mosqueAddress === 'string' &&
    rawSettings.mosqueAddress.trim().length > 0
      ? { mosqueAddress: rawSettings.mosqueAddress.trim() }
      : {}),
    ...(typeof rawSettings.chairpersonName === 'string' &&
    rawSettings.chairpersonName.trim().length > 0
      ? { chairpersonName: rawSettings.chairpersonName.trim() }
      : {}),
    ...(typeof rawSettings.treasurerName === 'string' &&
    rawSettings.treasurerName.trim().length > 0
      ? { treasurerName: rawSettings.treasurerName.trim() }
      : {}),
  };

  // Validate optional accounts (v5+) or seed from settings.openingBalance for v1–v4
  const validatedAccounts: CashAccount[] = [];
  const seenAccountIds = new Set<string>();

  if (record.accounts !== undefined) {
    if (!Array.isArray(record.accounts)) {
      return {
        valid: false,
        errors: [
          'Daftar lokasi kas dalam cadangan tidak valid (harus berupa array).',
        ],
      };
    }

    for (let i = 0; i < record.accounts.length; i += 1) {
      const rawAcc = record.accounts[i] as
        | Record<string, unknown>
        | null
        | undefined;
      if (!rawAcc || typeof rawAcc !== 'object') {
        return {
          valid: false,
          errors: [
            `Lokasi kas pada indeks #${i + 1} rusak atau bukan objek.`,
          ],
        };
      }

      let acc: CashAccount;
      try {
        acc = createCashAccount({
          id: typeof rawAcc.id === 'string' ? rawAcc.id : '',
          name: typeof rawAcc.name === 'string' ? rawAcc.name : '',
          kind: rawAcc.kind as CashAccount['kind'],
          openingBalance:
            typeof rawAcc.openingBalance === 'number'
              ? rawAcc.openingBalance
              : NaN,
          isDefault: Boolean(rawAcc.isDefault),
          archivedAt:
            typeof rawAcc.archivedAt === 'string' && rawAcc.archivedAt.trim()
              ? rawAcc.archivedAt.trim()
              : undefined,
        });
      } catch (accErr) {
        return {
          valid: false,
          errors: [
            `Lokasi kas pada indeks #${i + 1} tidak valid: ${
              accErr instanceof Error ? accErr.message : 'Data lokasi kas rusak.'
            }`,
          ],
        };
      }

      if (seenAccountIds.has(acc.id)) {
        return {
          valid: false,
          errors: [
            `Ditemukan duplikasi ID lokasi kas "${acc.id}" dalam file cadangan.`,
          ],
        };
      }
      seenAccountIds.add(acc.id);
      validatedAccounts.push(acc);
    }
  } else {
    // v1–v4 backup compatibility: map settings.openingBalance to Kas Tunai
    for (const defAcc of DEFAULT_CASH_ACCOUNTS) {
      validatedAccounts.push({
        ...defAcc,
        openingBalance:
          defAcc.id === DEFAULT_CASH_ACCOUNT_TUNAI_ID
            ? validatedSettings.openingBalance
            : 0,
      });
    }
  }

  const completeAccounts = mergeWithDefaultAccounts(validatedAccounts);

  // Validate optional funds (v5+) or seed from settings.openingBalance for v1–v4
  const validatedFunds: Fund[] = [];
  const seenFundIds = new Set<string>();

  if (record.funds !== undefined) {
    if (!Array.isArray(record.funds)) {
      return {
        valid: false,
        errors: [
          'Daftar dana masjid dalam cadangan tidak valid (harus berupa array).',
        ],
      };
    }

    for (let i = 0; i < record.funds.length; i += 1) {
      const rawFund = record.funds[i] as
        | Record<string, unknown>
        | null
        | undefined;
      if (!rawFund || typeof rawFund !== 'object') {
        return {
          valid: false,
          errors: [
            `Dana masjid pada indeks #${i + 1} rusak atau bukan objek.`,
          ],
        };
      }

      let fund: Fund;
      try {
        fund = createFund({
          id: typeof rawFund.id === 'string' ? rawFund.id : '',
          name: typeof rawFund.name === 'string' ? rawFund.name : '',
          restriction: rawFund.restriction as Fund['restriction'],
          openingBalance:
            typeof rawFund.openingBalance === 'number'
              ? rawFund.openingBalance
              : NaN,
          description:
            typeof rawFund.description === 'string'
              ? rawFund.description
              : undefined,
          isDefault: Boolean(rawFund.isDefault),
          archivedAt:
            typeof rawFund.archivedAt === 'string' && rawFund.archivedAt.trim()
              ? rawFund.archivedAt.trim()
              : undefined,
        });
      } catch (fundErr) {
        return {
          valid: false,
          errors: [
            `Dana masjid pada indeks #${i + 1} tidak valid: ${
              fundErr instanceof Error ? fundErr.message : 'Data dana rusak.'
            }`,
          ],
        };
      }

      if (seenFundIds.has(fund.id)) {
        return {
          valid: false,
          errors: [
            `Ditemukan duplikasi ID dana "${fund.id}" dalam file cadangan.`,
          ],
        };
      }
      seenFundIds.add(fund.id);
      validatedFunds.push(fund);
    }
  } else {
    // v1–v4 backup compatibility: map settings.openingBalance to Dana Operasional Umum
    for (const defFund of DEFAULT_FUNDS) {
      validatedFunds.push({
        ...defFund,
        openingBalance:
          defFund.id === DEFAULT_FUND_OPERASIONAL_ID
            ? validatedSettings.openingBalance
            : 0,
      });
    }
  }

  const completeFunds = mergeWithDefaultFunds(validatedFunds);

  // Validate categories
  if (!Array.isArray(record.categories) || record.categories.length === 0) {
    return {
      valid: false,
      errors: ['Daftar kategori dalam cadangan tidak ditemukan atau kosong.'],
    };
  }

  const validatedCategories: Category[] = [];
  const seenCategoryIds = new Set<string>();

  for (let i = 0; i < record.categories.length; i += 1) {
    const rawCat = record.categories[i] as
      | Record<string, unknown>
      | null
      | undefined;
    if (!rawCat || typeof rawCat !== 'object') {
      return {
        valid: false,
        errors: [`Kategori pada indeks #${i + 1} rusak atau bukan objek.`],
      };
    }

    const catValidation = validateCategoryInput({
      id: typeof rawCat.id === 'string' ? rawCat.id : '',
      name: typeof rawCat.name === 'string' ? rawCat.name : '',
      type: rawCat.type as Category['type'],
      color: typeof rawCat.color === 'string' ? rawCat.color : '',
    });

    if (!catValidation.valid) {
      return {
        valid: false,
        errors: [
          `Kategori pada indeks #${i + 1} tidak valid: ${catValidation.errors[0]}`,
        ],
      };
    }

    const trimmedId = (rawCat.id as string).trim();
    if (seenCategoryIds.has(trimmedId)) {
      return {
        valid: false,
        errors: [
          `Ditemukan duplikasi ID kategori "${trimmedId}" dalam file cadangan.`,
        ],
      };
    }
    seenCategoryIds.add(trimmedId);

    if (
      rawCat.archivedAt !== undefined &&
      rawCat.archivedAt !== null &&
      !isValidIsoTimestamp(rawCat.archivedAt)
    ) {
      return {
        valid: false,
        errors: [`Waktu arsip kategori "${trimmedId}" tidak valid.`],
      };
    }

    validatedCategories.push({
      id: trimmedId,
      name: (rawCat.name as string).trim(),
      type: rawCat.type as Category['type'],
      ...(typeof rawCat.defaultFundId === 'string' &&
      rawCat.defaultFundId.trim()
        ? { defaultFundId: rawCat.defaultFundId.trim() }
        : {}),
      color: (rawCat.color as string).trim(),
      ...(typeof rawCat.iconKey === 'string' && rawCat.iconKey.trim()
        ? { iconKey: rawCat.iconKey.trim() }
        : {}),
      isDefault: Boolean(rawCat.isDefault),
      ...(typeof rawCat.archivedAt === 'string' && rawCat.archivedAt.trim()
        ? { archivedAt: rawCat.archivedAt.trim() }
        : {}),
    });
  }

  const completeCategories = mergeWithDefaultCategories(validatedCategories);

  // Validate transactions
  if (!Array.isArray(record.transactions)) {
    return {
      valid: false,
      errors: [
        'Daftar transaksi dalam cadangan tidak valid (harus berupa array).',
      ],
    };
  }

  const validatedTransactions: Transaction[] = [];
  const seenTransactionIds = new Set<string>();

  for (let i = 0; i < record.transactions.length; i += 1) {
    const rawTx = record.transactions[i] as
      | Record<string, unknown>
      | null
      | undefined;
    if (!rawTx || typeof rawTx !== 'object') {
      return {
        valid: false,
        errors: [`Transaksi pada indeks #${i + 1} rusak atau bukan objek.`],
      };
    }

    const txId = typeof rawTx.id === 'string' ? rawTx.id.trim() : '';
    const txCategoryId =
      typeof rawTx.categoryId === 'string' ? rawTx.categoryId.trim() : '';
    const matchedCat = completeCategories.find((c) => c.id === txCategoryId);
    const txAccountId =
      typeof rawTx.accountId === 'string' && rawTx.accountId.trim()
        ? rawTx.accountId.trim()
        : DEFAULT_CASH_ACCOUNT_TUNAI_ID;
    const txFundId =
      typeof rawTx.fundId === 'string' && rawTx.fundId.trim()
        ? rawTx.fundId.trim()
        : matchedCat?.defaultFundId ?? DEFAULT_FUND_OPERASIONAL_ID;
    const txBudgetPlanId =
      typeof rawTx.budgetPlanId === 'string' && rawTx.budgetPlanId.trim()
        ? rawTx.budgetPlanId.trim()
        : undefined;
    const txAmount = typeof rawTx.amount === 'number' ? rawTx.amount : NaN;
    const txOccurredAt =
      typeof rawTx.occurredAt === 'string' ? rawTx.occurredAt : '';
    const txDonorOrPayee =
      rawTx.donorOrPayee !== undefined && rawTx.donorOrPayee !== null
        ? String(rawTx.donorOrPayee)
        : undefined;
    const txReferenceNo =
      rawTx.referenceNo !== undefined && rawTx.referenceNo !== null
        ? String(rawTx.referenceNo)
        : undefined;
    const txNote =
      rawTx.note !== undefined && rawTx.note !== null
        ? String(rawTx.note)
        : undefined;

    if (!isValidTransactionAmount(txAmount)) {
      return {
        valid: false,
        errors: [
          `Transaksi pada indeks #${i + 1} memiliki nominal IDR yang tidak valid.`,
        ],
      };
    }

    if (!isValidLocalDateString(txOccurredAt)) {
      return {
        valid: false,
        errors: [
          `Transaksi pada indeks #${i + 1} memiliki tanggal kejadian (${txOccurredAt}) yang tidak valid.`,
        ],
      };
    }

    const draftValidation = validateTransactionDraft(
      {
        id: txId,
        type: rawTx.type as Transaction['type'],
        amount: txAmount,
        accountId: txAccountId,
        fundId: txFundId,
        categoryId: txCategoryId,
        budgetPlanId: txBudgetPlanId,
        occurredAt: txOccurredAt,
        donorOrPayee: txDonorOrPayee,
        referenceNo: txReferenceNo,
        note: txNote,
      },
      completeCategories,
      {
        allowArchivedCategoryId: txCategoryId,
        allowArchivedAccountId: txAccountId,
        allowArchivedFundId: txFundId,
        accounts: completeAccounts,
        funds: completeFunds,
      },
    );

    if (!draftValidation.valid) {
      return {
        valid: false,
        errors: [
          `Transaksi pada indeks #${i + 1} tidak valid: ${draftValidation.errors[0]}`,
        ],
      };
    }

    if (seenTransactionIds.has(txId)) {
      return {
        valid: false,
        errors: [
          `Ditemukan duplikasi ID transaksi "${txId}" dalam file cadangan.`,
        ],
      };
    }
    seenTransactionIds.add(txId);

    const createdAt = isValidIsoTimestamp(rawTx.createdAt)
      ? rawTx.createdAt
      : record.exportedAt;
    const updatedAt = isValidIsoTimestamp(rawTx.updatedAt)
      ? rawTx.updatedAt
      : createdAt;

    const trimmedNote = txNote?.trim();
    const trimmedDonor = txDonorOrPayee?.trim();
    const trimmedRef = txReferenceNo?.trim();

    validatedTransactions.push({
      id: txId,
      type: rawTx.type as Transaction['type'],
      amount: txAmount,
      accountId: txAccountId,
      fundId: txFundId,
      categoryId: txCategoryId,
      ...(txBudgetPlanId ? { budgetPlanId: txBudgetPlanId } : {}),
      occurredAt: txOccurredAt,
      ...(trimmedDonor ? { donorOrPayee: trimmedDonor } : {}),
      ...(trimmedRef ? { referenceNo: trimmedRef } : {}),
      ...(trimmedNote ? { note: trimmedNote } : {}),
      createdAt,
      updatedAt,
    });
  }

  // Validate optional cashTransfers (v5+)
  const validatedTransfers: CashTransfer[] = [];
  const seenTransferIds = new Set<string>();

  if (record.cashTransfers !== undefined) {
    if (!Array.isArray(record.cashTransfers)) {
      return {
        valid: false,
        errors: [
          'Daftar mutasi antar-kas dalam cadangan tidak valid (harus berupa array).',
        ],
      };
    }

    for (let i = 0; i < record.cashTransfers.length; i += 1) {
      const rawTr = record.cashTransfers[i] as
        | Record<string, unknown>
        | null
        | undefined;
      if (!rawTr || typeof rawTr !== 'object') {
        return {
          valid: false,
          errors: [
            `Mutasi antar-kas pada indeks #${i + 1} rusak atau bukan objek.`,
          ],
        };
      }

      const trId = typeof rawTr.id === 'string' ? rawTr.id.trim() : '';
      const fromAccountId =
        typeof rawTr.fromAccountId === 'string'
          ? rawTr.fromAccountId.trim()
          : '';
      const toAccountId =
        typeof rawTr.toAccountId === 'string' ? rawTr.toAccountId.trim() : '';
      const amount = typeof rawTr.amount === 'number' ? rawTr.amount : NaN;
      const occurredAt =
        typeof rawTr.occurredAt === 'string' ? rawTr.occurredAt : '';
      const note =
        rawTr.note !== undefined && rawTr.note !== null
          ? String(rawTr.note)
          : undefined;
      const createdAt = isValidIsoTimestamp(rawTr.createdAt)
        ? rawTr.createdAt
        : record.exportedAt;

      let transfer: CashTransfer;
      try {
        transfer = createCashTransfer(
          {
            id: trId || undefined,
            fromAccountId,
            toAccountId,
            amount,
            occurredAt,
            note,
            nowIso: createdAt,
          },
          completeAccounts,
          { allowArchivedAccounts: true },
        );
      } catch (trErr) {
        return {
          valid: false,
          errors: [
            `Mutasi antar-kas pada indeks #${i + 1} tidak valid: ${
              trErr instanceof Error ? trErr.message : 'Data mutasi rusak.'
            }`,
          ],
        };
      }

      if (seenTransferIds.has(transfer.id)) {
        return {
          valid: false,
          errors: [
            `Ditemukan duplikasi ID mutasi "${transfer.id}" dalam file cadangan.`,
          ],
        };
      }
      seenTransferIds.add(transfer.id);
      validatedTransfers.push(transfer);
    }
  }

  // Validate optional budgetPlans (v5+)
  const validatedBudgetPlans: BudgetPlan[] = [];
  const seenBudgetPlanIds = new Set<string>();

  if (record.budgetPlans !== undefined) {
    if (!Array.isArray(record.budgetPlans)) {
      return {
        valid: false,
        errors: [
          'Daftar RAB dalam cadangan tidak valid (harus berupa array).',
        ],
      };
    }

    for (let i = 0; i < record.budgetPlans.length; i += 1) {
      const rawPlan = record.budgetPlans[i] as
        | Record<string, unknown>
        | null
        | undefined;
      if (!rawPlan || typeof rawPlan !== 'object') {
        return {
          valid: false,
          errors: [`RAB pada indeks #${i + 1} rusak atau bukan objek.`],
        };
      }

      let plan: BudgetPlan;
      try {
        plan = createBudgetPlan(
          {
            id: typeof rawPlan.id === 'string' ? rawPlan.id : undefined,
            title: typeof rawPlan.title === 'string' ? rawPlan.title : '',
            kind: rawPlan.kind as BudgetPlan['kind'],
            periodStart:
              typeof rawPlan.periodStart === 'string'
                ? rawPlan.periodStart
                : '',
            periodEnd:
              typeof rawPlan.periodEnd === 'string' ? rawPlan.periodEnd : '',
            fundId:
              typeof rawPlan.fundId === 'string' ? rawPlan.fundId : undefined,
            note: typeof rawPlan.note === 'string' ? rawPlan.note : undefined,
            items: Array.isArray(rawPlan.items)
              ? (rawPlan.items as BudgetPlan['items'])
              : [],
            createdAt: isValidIsoTimestamp(rawPlan.createdAt)
              ? rawPlan.createdAt
              : record.exportedAt,
            updatedAt: isValidIsoTimestamp(rawPlan.updatedAt)
              ? rawPlan.updatedAt
              : record.exportedAt,
          },
          completeCategories,
        );
      } catch (planErr) {
        return {
          valid: false,
          errors: [
            `RAB pada indeks #${i + 1} tidak valid: ${
              planErr instanceof Error ? planErr.message : 'Data RAB rusak.'
            }`,
          ],
        };
      }

      if (
        plan.fundId &&
        !completeFunds.some((f) => f.id === plan.fundId)
      ) {
        return {
          valid: false,
          errors: [
            `RAB pada indeks #${i + 1} merujuk ke ID dana "${plan.fundId}" yang tidak ditemukan dalam cadangan.`,
          ],
        };
      }

      if (seenBudgetPlanIds.has(plan.id)) {
        return {
          valid: false,
          errors: [
            `Ditemukan duplikasi ID RAB "${plan.id}" dalam file cadangan.`,
          ],
        };
      }
      seenBudgetPlanIds.add(plan.id);
      validatedBudgetPlans.push(plan);
    }
  }

  // Verify aggregate arithmetic safety
  let totalIncome = 0;
  let totalExpense = 0;
  let currentBalance = 0;
  try {
    const totals = calculateIncomeAndExpenseTotals(validatedTransactions);
    totalIncome = totals.totalIncome;
    totalExpense = totals.totalExpense;
    currentBalance = calculateCurrentBalance(
      validatedSettings.openingBalance,
      validatedTransactions,
    );
    addIdr(totalIncome, totalExpense);
  } catch (arithError) {
    return {
      valid: false,
      errors: [
        arithError instanceof Error
          ? arithError.message
          : 'Total nilai transaksi dalam cadangan melebihi batas aman perhitungan Rupiah.',
      ],
    };
  }

  // Validate optional legacy v2–v4 stores (`budgets`, `savingsGoals`, `debtRecords`)
  const validatedBudgets: CategoryBudget[] = [];
  const seenBudgetIds = new Set<string>();
  const seenBudgetCategoryIds = new Set<string>();

  if (record.budgets !== undefined) {
    if (!Array.isArray(record.budgets)) {
      return {
        valid: false,
        errors: [
          'Daftar anggaran kategori dalam cadangan tidak valid (harus berupa array).',
        ],
      };
    }

    for (let i = 0; i < record.budgets.length; i += 1) {
      const rawBudget = record.budgets[i] as
        | Record<string, unknown>
        | null
        | undefined;
      if (!rawBudget || typeof rawBudget !== 'object') {
        return {
          valid: false,
          errors: [
            `Anggaran kategori pada indeks #${i + 1} rusak atau bukan objek.`,
          ],
        };
      }

      const budgetId =
        typeof rawBudget.id === 'string' ? rawBudget.id.trim() : '';
      const budgetCategoryId =
        typeof rawBudget.categoryId === 'string'
          ? rawBudget.categoryId.trim()
          : '';
      const monthlyLimit =
        typeof rawBudget.monthlyLimit === 'number'
          ? rawBudget.monthlyLimit
          : NaN;
      const updatedAt = isValidIsoTimestamp(rawBudget.updatedAt)
        ? rawBudget.updatedAt
        : record.exportedAt;

      let validatedBudget: CategoryBudget;
      try {
        validatedBudget = createCategoryBudget(
          {
            id: budgetId || undefined,
            categoryId: budgetCategoryId,
            monthlyLimit,
            updatedAt,
          },
          completeCategories,
          { allowArchivedCategoryId: budgetCategoryId },
        );
      } catch (budgetErr) {
        return {
          valid: false,
          errors: [
            `Anggaran kategori pada indeks #${i + 1} tidak valid: ${
              budgetErr instanceof Error
                ? budgetErr.message
                : 'Data anggaran rusak.'
            }`,
          ],
        };
      }

      if (seenBudgetIds.has(validatedBudget.id)) {
        return {
          valid: false,
          errors: [
            `Ditemukan duplikasi ID anggaran "${validatedBudget.id}" dalam file cadangan.`,
          ],
        };
      }
      if (seenBudgetCategoryIds.has(validatedBudget.categoryId)) {
        return {
          valid: false,
          errors: [
            `Ditemukan duplikasi anggaran untuk kategori "${validatedBudget.categoryId}" dalam file cadangan.`,
          ],
        };
      }
      seenBudgetIds.add(validatedBudget.id);
      seenBudgetCategoryIds.add(validatedBudget.categoryId);
      validatedBudgets.push(validatedBudget);
    }
  }

  const validatedSavingsGoals: SavingsGoal[] = [];
  const seenGoalIds = new Set<string>();

  if (record.savingsGoals !== undefined) {
    if (!Array.isArray(record.savingsGoals)) {
      return {
        valid: false,
        errors: [
          'Daftar target tabungan dalam cadangan tidak valid (harus berupa array).',
        ],
      };
    }

    for (let i = 0; i < record.savingsGoals.length; i += 1) {
      const rawGoal = record.savingsGoals[i] as
        | Record<string, unknown>
        | null
        | undefined;
      if (!rawGoal || typeof rawGoal !== 'object') {
        return {
          valid: false,
          errors: [
            `Target tabungan pada indeks #${i + 1} rusak atau bukan objek.`,
          ],
        };
      }

      const goalId =
        typeof rawGoal.id === 'string' ? rawGoal.id.trim() : '';
      const goalName =
        typeof rawGoal.name === 'string' ? rawGoal.name : '';
      const targetAmount =
        typeof rawGoal.targetAmount === 'number' ? rawGoal.targetAmount : NaN;
      const allocatedAmount =
        typeof rawGoal.allocatedAmount === 'number'
          ? rawGoal.allocatedAmount
          : NaN;
      const targetDate =
        rawGoal.targetDate !== undefined && rawGoal.targetDate !== null
          ? String(rawGoal.targetDate)
          : undefined;
      const note =
        rawGoal.note !== undefined && rawGoal.note !== null
          ? String(rawGoal.note)
          : undefined;
      const createdAt = isValidIsoTimestamp(rawGoal.createdAt)
        ? rawGoal.createdAt
        : record.exportedAt;
      const updatedAt = isValidIsoTimestamp(rawGoal.updatedAt)
        ? rawGoal.updatedAt
        : createdAt;

      let validatedGoal: SavingsGoal;
      try {
        validatedGoal = createSavingsGoal({
          id: goalId || undefined,
          name: goalName,
          targetAmount,
          allocatedAmount,
          targetDate,
          note,
          createdAt,
          updatedAt,
        });
      } catch (goalErr) {
        return {
          valid: false,
          errors: [
            `Target tabungan pada indeks #${i + 1} tidak valid: ${
              goalErr instanceof Error
                ? goalErr.message
                : 'Data target tabungan rusak.'
            }`,
          ],
        };
      }

      if (seenGoalIds.has(validatedGoal.id)) {
        return {
          valid: false,
          errors: [
            `Ditemukan duplikasi ID target tabungan "${validatedGoal.id}" dalam file cadangan.`,
          ],
        };
      }
      seenGoalIds.add(validatedGoal.id);
      validatedSavingsGoals.push(validatedGoal);
    }
  }

  const validatedDebtRecords: DebtRecord[] = [];
  const seenDebtRecordIds = new Set<string>();

  if (record.debtRecords !== undefined) {
    if (!Array.isArray(record.debtRecords)) {
      return {
        valid: false,
        errors: [
          'Daftar catatan utang/piutang dalam cadangan tidak valid (harus berupa array).',
        ],
      };
    }

    for (let i = 0; i < record.debtRecords.length; i += 1) {
      const rawDebt = record.debtRecords[i] as
        | Record<string, unknown>
        | null
        | undefined;
      if (!rawDebt || typeof rawDebt !== 'object') {
        return {
          valid: false,
          errors: [
            `Catatan utang/piutang pada indeks #${i + 1} rusak atau bukan objek.`,
          ],
        };
      }

      const debtId =
        typeof rawDebt.id === 'string' ? rawDebt.id.trim() : '';
      const direction = rawDebt.direction as DebtRecord['direction'];
      const personName =
        typeof rawDebt.personName === 'string' ? rawDebt.personName : '';
      const amount =
        typeof rawDebt.amount === 'number' ? rawDebt.amount : NaN;
      const remainingAmount =
        typeof rawDebt.remainingAmount === 'number'
          ? rawDebt.remainingAmount
          : NaN;
      const dueDate =
        rawDebt.dueDate !== undefined && rawDebt.dueDate !== null
          ? String(rawDebt.dueDate)
          : undefined;
      const note =
        rawDebt.note !== undefined && rawDebt.note !== null
          ? String(rawDebt.note)
          : undefined;
      const createdAt = isValidIsoTimestamp(rawDebt.createdAt)
        ? rawDebt.createdAt
        : record.exportedAt;
      const updatedAt = isValidIsoTimestamp(rawDebt.updatedAt)
        ? rawDebt.updatedAt
        : createdAt;

      let validatedDebt: DebtRecord;
      try {
        validatedDebt = createDebtRecord({
          id: debtId || undefined,
          direction,
          personName,
          amount,
          remainingAmount,
          dueDate,
          note,
          createdAt,
          updatedAt,
        });
      } catch (debtErr) {
        return {
          valid: false,
          errors: [
            `Catatan utang/piutang pada indeks #${i + 1} tidak valid: ${
              debtErr instanceof Error
                ? debtErr.message
                : 'Data utang/piutang rusak.'
            }`,
          ],
        };
      }

      if (seenDebtRecordIds.has(validatedDebt.id)) {
        return {
          valid: false,
          errors: [
            `Ditemukan duplikasi ID catatan utang/piutang "${validatedDebt.id}" dalam file cadangan.`,
          ],
        };
      }
      seenDebtRecordIds.add(validatedDebt.id);
      validatedDebtRecords.push(validatedDebt);
    }
  }

  const sortedTransactions = sortTransactions(validatedTransactions, 'newest');
  const sortedTransfers = [...validatedTransfers].sort((a, b) =>
    b.occurredAt.localeCompare(a.occurredAt),
  );
  const sortedBudgetPlans = [...validatedBudgetPlans].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const sortedBudgets = [...validatedBudgets].sort((a, b) =>
    a.categoryId.localeCompare(b.categoryId, 'id-ID'),
  );
  const sortedSavingsGoals = [...validatedSavingsGoals].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const sortedDebtRecords = [...validatedDebtRecords].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const archivedCategoryCount = completeCategories.filter((c) =>
    Boolean(c.archivedAt),
  ).length;

  const validatedPayload: NotaBackupPayload = {
    appName: NOTA_BACKUP_APP_NAME,
    schemaVersion: SUPPORTED_BACKUP_SCHEMA_VERSION,
    exportedAt: record.exportedAt,
    settings: validatedSettings,
    accounts: completeAccounts,
    funds: completeFunds,
    categories: completeCategories,
    transactions: sortedTransactions,
    cashTransfers: sortedTransfers,
    budgetPlans: sortedBudgetPlans,
    budgets: sortedBudgets,
    savingsGoals: sortedSavingsGoals,
    debtRecords: sortedDebtRecords,
  };

  return {
    valid: true,
    preview: {
      payload: validatedPayload,
      rawJson: rawJsonSource ?? serializeBackupPayload(validatedPayload),
      summary: {
        schemaVersion: record.schemaVersion,
        exportedAt: validatedPayload.exportedAt,
        openingBalance: validatedSettings.openingBalance,
        currentBalance,
        totalIncome,
        totalExpense,
        transactionCount: sortedTransactions.length,
        categoryCount: completeCategories.length,
        archivedCategoryCount,
        accountCount: completeAccounts.length,
        fundCount: completeFunds.length,
        cashTransferCount: sortedTransfers.length,
        budgetPlanCount: sortedBudgetPlans.length,
        budgetCount: sortedBudgets.length,
        savingsGoalCount: sortedSavingsGoals.length,
        debtRecordCount: sortedDebtRecords.length,
      },
    },
  };
}

function escapeCsvCell(value: string): string {
  // Prevent spreadsheet formula injection on leading =, +, -, @
  const safeValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(safeValue)) {
    return `"${safeValue.replace(/"/g, '""')}"`;
  }
  return safeValue;
}

/**
 * Serializes transactions into a clean UTF-8 CSV string with Indonesian column headers.
 */
export function serializeTransactionsToCsv(
  transactions: readonly Transaction[],
  categories: readonly Category[],
): string {
  const categoryNameMap = new Map(categories.map((c) => [c.id, c.name]));
  const headers = [
    'ID Transaksi',
    'Tanggal',
    'Jenis',
    'Kategori',
    'Nominal (IDR)',
    'Catatan',
  ];

  const sorted = sortTransactions(transactions, 'newest');
  const rows = sorted.map((tx) => {
    const categoryName = categoryNameMap.get(tx.categoryId) ?? tx.categoryId;
    const jenisLabel = tx.type === 'income' ? 'Pemasukan' : 'Pengeluaran';
    return [
      escapeCsvCell(tx.id),
      escapeCsvCell(tx.occurredAt),
      escapeCsvCell(jenisLabel),
      escapeCsvCell(categoryName),
      String(tx.amount),
      escapeCsvCell(tx.note ?? ''),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Serializes a Mosque Financial Report (`MosqueFinancialReport`) into a comprehensive CSV string
 * including account/fund names, donor/payee, reference numbers, and notes.
 */
export function serializeMosqueReportToCsv(
  report: MosqueFinancialReport,
  context: {
    accounts: readonly CashAccount[];
    funds: readonly Fund[];
    categories: readonly Category[];
  },
): string {
  const accountMap = new Map(context.accounts.map((a) => [a.id, a.name]));
  const fundMap = new Map(context.funds.map((f) => [f.id, f.name]));
  const categoryMap = new Map(context.categories.map((c) => [c.id, c.name]));

  const headers = [
    'Tanggal',
    'Jenis',
    'Dana Masjid',
    'Lokasi Kas',
    'Kategori',
    'Donatur / Penerima',
    'No. Bukti',
    'Nominal (IDR)',
    'Catatan',
  ];

  const rows = report.periodTransactions.map((tx) => {
    const jenisLabel = tx.type === 'income' ? 'Penerimaan' : 'Pengeluaran';
    const fId = tx.fundId ?? DEFAULT_FUND_OPERASIONAL_ID;
    const aId = tx.accountId ?? DEFAULT_CASH_ACCOUNT_TUNAI_ID;
    const fundName = fundMap.get(fId) ?? fId;
    const accountName = accountMap.get(aId) ?? aId;
    const categoryName = categoryMap.get(tx.categoryId) ?? tx.categoryId;
    return [
      escapeCsvCell(tx.occurredAt),
      escapeCsvCell(jenisLabel),
      escapeCsvCell(fundName),
      escapeCsvCell(accountName),
      escapeCsvCell(categoryName),
      escapeCsvCell(tx.donorOrPayee ?? ''),
      escapeCsvCell(tx.referenceNo ?? ''),
      String(tx.amount),
      escapeCsvCell(tx.note ?? ''),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}
