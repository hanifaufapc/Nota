/**
 * Core Domain Types & Default Category Definitions for Nota (Manajemen Keuangan Masjid).
 *
 * Source of truth: PRD.md §6, §7 & ARCHITECTURE.md §2, §3.
 * Pure TypeScript module with zero React or browser-storage dependencies.
 */

import { toLocalDateString } from '../lib/date';
import {
  DEFAULT_CASH_ACCOUNT_TUNAI_ID,
  DEFAULT_FUND_OPERASIONAL_ID,
  DEFAULT_FUND_PEMBANGUNAN_ID,
  DEFAULT_FUND_SOSIAL_ZAKAT_ID,
} from './mosque';
import {
  validateCategoryInput,
  validateTransactionDraft,
  validateTransactionPatch,
} from './validation';

export type TransactionType = 'income' | 'expense';

export const MAX_TRANSACTION_NOTE_LENGTH = 280;
export const MAX_CATEGORY_NAME_LENGTH = 48;
export const MAX_DONOR_OR_PAYEE_LENGTH = 80;
export const MAX_REFERENCE_NO_LENGTH = 48;
export const MAX_MOSQUE_NAME_LENGTH = 80;
export const MAX_MOSQUE_ADDRESS_LENGTH = 160;
export const MAX_OFFICER_NAME_LENGTH = 80;

export interface Transaction {
  /** Unique local identifier */
  id: string;
  /** Whether the transaction adds to (`income`) or subtracts from (`expense`) balance */
  type: TransactionType;
  /** Positive integer amount in Indonesian Rupiah (IDR) */
  amount: number;
  /** Reference to a `CashAccount.id` (`Kas Tunai`, `Rekening Bank Tercatat`, etc.); defaults to `'acc-kas-tunai'` for legacy v1–v4 records */
  accountId?: string;
  /** Reference to a `Fund.id` (`Dana Operasional Umum`, `Dana Pembangunan`, `Dana Sosial / Zakat`, etc.); defaults to `'fund-operasional'` for legacy v1–v4 records */
  fundId?: string;
  /** Reference to a `Category.id` */
  categoryId: string;
  /** Optional reference to a `BudgetPlan.id` (RAB realization link) */
  budgetPlanId?: string;
  /** Local occurrence date in `YYYY-MM-DD` format */
  occurredAt: string;
  /** Optional donor name (e.g. `"Hamba Allah"`) or payee/vendor name */
  donorOrPayee?: string;
  /** Optional receipt or voucher reference number */
  referenceNo?: string;
  /** Optional trimmed note (max 280 characters) */
  note?: string;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 last-update timestamp */
  updatedAt: string;
}

export interface TransactionDraft {
  id?: string;
  type: TransactionType;
  amount: number;
  accountId?: string;
  fundId?: string;
  categoryId: string;
  budgetPlanId?: string;
  occurredAt?: string;
  donorOrPayee?: string;
  referenceNo?: string;
  note?: string;
  nowIso?: string;
}

export interface TransactionPatch {
  type?: TransactionType;
  amount?: number;
  accountId?: string;
  fundId?: string;
  categoryId?: string;
  budgetPlanId?: string;
  occurredAt?: string;
  donorOrPayee?: string;
  referenceNo?: string;
  note?: string;
}

export interface Category {
  /** Unique local identifier */
  id: string;
  /** Display name in Bahasa Indonesia */
  name: string;
  /** Category direction (`income` or `expense`) */
  type: TransactionType;
  /** Optional default `Fund.id` mapped to this category */
  defaultFundId?: string;
  /** Semantic color token key aligned with Nota design tokens */
  color: string;
  /** Optional Lucide icon key */
  iconKey?: string;
  /** True if seeded by default */
  isDefault: boolean;
  /** Optional ISO 8601 timestamp when archived; archived categories remain readable on historical transactions */
  archivedAt?: string;
}

export interface CategoryInput {
  id: string;
  name: string;
  type: TransactionType;
  defaultFundId?: string;
  color: string;
  iconKey?: string;
  isDefault?: boolean;
  archivedAt?: string;
}

export interface AppSettings {
  /** Baseline integer IDR balance before all recorded transactions (may be 0; not counted as period income) */
  openingBalance: number;
  /** Fixed to `'IDR'` for MVP */
  currency: 'IDR';
  /** Whether the user has completed first-run setup */
  onboardingCompleted: boolean;
  /** Mosque / Musholla name (for dashboard & print reports) */
  mosqueName?: string;
  /** Optional Mosque address */
  mosqueAddress?: string;
  /** Optional Chairperson (Ketua DKM / Takmir) name for report signature */
  chairpersonName?: string;
  /** Optional Treasurer (Bendahara) name for report signature */
  treasurerName?: string;
}

export type MosqueSettings = AppSettings;

export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = Object.freeze({
  openingBalance: 0,
  currency: 'IDR',
  onboardingCompleted: false,
});

/**
 * Mosque-specific default categories (PRD.md §6.4).
 */
export const MOSQUE_DEFAULT_CATEGORIES: readonly Readonly<Category>[] =
  Object.freeze([
    // Mosque Income (Penerimaan Masjid)
    Object.freeze({
      id: 'cat-inc-jumat',
      name: 'Infak Kotak Jumat',
      type: 'income',
      defaultFundId: DEFAULT_FUND_OPERASIONAL_ID,
      color: 'emerald',
      iconKey: 'landmark',
      isDefault: true,
    }),
    Object.freeze({
      id: 'cat-inc-harian',
      name: 'Infak & Sedekah Harian',
      type: 'income',
      defaultFundId: DEFAULT_FUND_OPERASIONAL_ID,
      color: 'emerald',
      iconKey: 'coins',
      isDefault: true,
    }),
    Object.freeze({
      id: 'cat-inc-pembangunan',
      name: 'Donasi Pembangunan & Wakaf',
      type: 'income',
      defaultFundId: DEFAULT_FUND_PEMBANGUNAN_ID,
      color: 'lime',
      iconKey: 'building-2',
      isDefault: true,
    }),
    Object.freeze({
      id: 'cat-inc-zakat-sosial',
      name: 'Penerimaan Zakat & Santunan Sosial',
      type: 'income',
      defaultFundId: DEFAULT_FUND_SOSIAL_ZAKAT_ID,
      color: 'emerald',
      iconKey: 'heart-handshake',
      isDefault: true,
    }),
    Object.freeze({
      id: 'cat-inc-kegiatan',
      name: 'Donasi Kegiatan / PHBI / Ramadan',
      type: 'income',
      defaultFundId: DEFAULT_FUND_OPERASIONAL_ID,
      color: 'lime',
      iconKey: 'calendar-check',
      isDefault: true,
    }),
    Object.freeze({
      id: 'cat-inc-masjid-lainnya',
      name: 'Penerimaan Masjid Lainnya',
      type: 'income',
      defaultFundId: DEFAULT_FUND_OPERASIONAL_ID,
      color: 'soft-green',
      iconKey: 'plus-circle',
      isDefault: true,
    }),

    // Mosque Expense (Pengeluaran Masjid)
    Object.freeze({
      id: 'cat-exp-listrik-air',
      name: 'Listrik, Air & Internet Masjid',
      type: 'expense',
      defaultFundId: DEFAULT_FUND_OPERASIONAL_ID,
      color: 'expense',
      iconKey: 'zap',
      isDefault: true,
    }),
    Object.freeze({
      id: 'cat-exp-kebersihan',
      name: 'Kebersihan & Pemeliharaan Fasilitas',
      type: 'expense',
      defaultFundId: DEFAULT_FUND_OPERASIONAL_ID,
      color: 'expense',
      iconKey: 'sparkles',
      isDefault: true,
    }),
    Object.freeze({
      id: 'cat-exp-insentif',
      name: 'Insentif / Bisyarah Imam, Khatib & Marbot',
      type: 'expense',
      defaultFundId: DEFAULT_FUND_OPERASIONAL_ID,
      color: 'expense',
      iconKey: 'users',
      isDefault: true,
    }),
    Object.freeze({
      id: 'cat-exp-kajian-phbi',
      name: 'Kegiatan Ibadah, Kajian & PHBI',
      type: 'expense',
      defaultFundId: DEFAULT_FUND_OPERASIONAL_ID,
      color: 'expense',
      iconKey: 'book-open',
      isDefault: true,
    }),
    Object.freeze({
      id: 'cat-exp-pembangunan',
      name: 'Pembangunan, Renovasi & Inventaris',
      type: 'expense',
      defaultFundId: DEFAULT_FUND_PEMBANGUNAN_ID,
      color: 'expense',
      iconKey: 'hammer',
      isDefault: true,
    }),
    Object.freeze({
      id: 'cat-exp-penyaluran-zakat',
      name: 'Penyaluran Zakat & Santunan Sosial',
      type: 'expense',
      defaultFundId: DEFAULT_FUND_SOSIAL_ZAKAT_ID,
      color: 'expense',
      iconKey: 'hand-helping',
      isDefault: true,
    }),
    Object.freeze({
      id: 'cat-exp-operasional-dkm',
      name: 'Operasional & Administrasi DKM',
      type: 'expense',
      defaultFundId: DEFAULT_FUND_OPERASIONAL_ID,
      color: 'muted',
      iconKey: 'file-text',
      isDefault: true,
    }),
  ]);

/**
 * Legacy categories kept in `DEFAULT_CATEGORIES` for backward-compatibility with v1–v4 backups and existing tests.
 */
export const LEGACY_COMPAT_CATEGORIES: readonly Readonly<Category>[] =
  Object.freeze([
    Object.freeze({
      id: 'cat-inc-gaji',
      name: 'Gaji & Upah',
      type: 'income',
      defaultFundId: DEFAULT_FUND_OPERASIONAL_ID,
      color: 'emerald',
      iconKey: 'briefcase',
      isDefault: true,
    }),
    Object.freeze({
      id: 'cat-inc-usaha',
      name: 'Hasil Usaha & Freelance',
      type: 'income',
      defaultFundId: DEFAULT_FUND_OPERASIONAL_ID,
      color: 'emerald',
      iconKey: 'laptop',
      isDefault: true,
    }),
    Object.freeze({
      id: 'cat-inc-bonus',
      name: 'Bonus & Tunjangan',
      type: 'income',
      defaultFundId: DEFAULT_FUND_OPERASIONAL_ID,
      color: 'lime',
      iconKey: 'sparkles',
      isDefault: true,
    }),
    Object.freeze({
      id: 'cat-inc-lainnya',
      name: 'Pemasukan Lainnya',
      type: 'income',
      defaultFundId: DEFAULT_FUND_OPERASIONAL_ID,
      color: 'soft-green',
      iconKey: 'plus-circle',
      isDefault: true,
    }),
    Object.freeze({
      id: 'cat-exp-makanan',
      name: 'Makanan & Minuman',
      type: 'expense',
      defaultFundId: DEFAULT_FUND_OPERASIONAL_ID,
      color: 'expense',
      iconKey: 'utensils',
      isDefault: true,
    }),
    Object.freeze({
      id: 'cat-exp-transportasi',
      name: 'Transportasi',
      type: 'expense',
      defaultFundId: DEFAULT_FUND_OPERASIONAL_ID,
      color: 'expense',
      iconKey: 'car',
      isDefault: true,
    }),
    Object.freeze({
      id: 'cat-exp-tempat-tinggal',
      name: 'Tempat Tinggal & Tagihan',
      type: 'expense',
      defaultFundId: DEFAULT_FUND_OPERASIONAL_ID,
      color: 'expense',
      iconKey: 'home',
      isDefault: true,
    }),
    Object.freeze({
      id: 'cat-exp-belanja',
      name: 'Belanja Kebutuhan',
      type: 'expense',
      defaultFundId: DEFAULT_FUND_OPERASIONAL_ID,
      color: 'expense',
      iconKey: 'shopping-bag',
      isDefault: true,
    }),
    Object.freeze({
      id: 'cat-exp-kesehatan',
      name: 'Kesehatan',
      type: 'expense',
      defaultFundId: DEFAULT_FUND_OPERASIONAL_ID,
      color: 'expense',
      iconKey: 'heart-pulse',
      isDefault: true,
    }),
    Object.freeze({
      id: 'cat-exp-hiburan',
      name: 'Hiburan & Langganan',
      type: 'expense',
      defaultFundId: DEFAULT_FUND_OPERASIONAL_ID,
      color: 'expense',
      iconKey: 'film',
      isDefault: true,
    }),
    Object.freeze({
      id: 'cat-exp-lainnya',
      name: 'Pengeluaran Lainnya',
      type: 'expense',
      defaultFundId: DEFAULT_FUND_OPERASIONAL_ID,
      color: 'muted',
      iconKey: 'more-horizontal',
      isDefault: true,
    }),
  ]);

/**
 * Combined default categories (Mosque categories first, followed by legacy compatibility categories).
 */
export const DEFAULT_CATEGORIES: readonly Readonly<Category>[] = Object.freeze([
  ...MOSQUE_DEFAULT_CATEGORIES,
  ...LEGACY_COMPAT_CATEGORIES,
]);

/**
 * Pure factory that creates a validated `Transaction` record.
 * Defaults `occurredAt` to today's local date (`YYYY-MM-DD`),
 * `accountId` to `'acc-kas-tunai'`, and `fundId` to the category's `defaultFundId` or `'fund-operasional'`.
 */
export function createTransaction(
  draft: TransactionDraft,
  categories?: readonly Category[],
  options?: {
    allowArchivedCategoryId?: string;
    allowArchivedAccountId?: string;
    allowArchivedFundId?: string;
    accounts?: readonly import('./mosque').CashAccount[];
    funds?: readonly import('./mosque').Fund[];
  },
): Transaction {
  const occurredAt = draft.occurredAt ?? toLocalDateString(new Date());
  const timestamp = draft.nowIso ?? new Date().toISOString();
  const id =
    draft.id && draft.id.trim().length > 0
      ? draft.id.trim()
      : `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const validation = validateTransactionDraft(
    {
      ...draft,
      id,
      occurredAt,
    },
    categories,
    options,
  );

  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }

  const trimmedCategoryId = draft.categoryId.trim();
  const matchedCategory = categories?.find((c) => c.id === trimmedCategoryId);

  const accountId =
    draft.accountId && draft.accountId.trim().length > 0
      ? draft.accountId.trim()
      : DEFAULT_CASH_ACCOUNT_TUNAI_ID;

  const fundId =
    draft.fundId && draft.fundId.trim().length > 0
      ? draft.fundId.trim()
      : matchedCategory?.defaultFundId ?? DEFAULT_FUND_OPERASIONAL_ID;

  const trimmedNote = draft.note?.trim();
  const trimmedDonorOrPayee = draft.donorOrPayee?.trim();
  const trimmedReferenceNo = draft.referenceNo?.trim();
  const trimmedBudgetPlanId = draft.budgetPlanId?.trim();

  return {
    id,
    type: draft.type,
    amount: draft.amount,
    accountId,
    fundId,
    categoryId: trimmedCategoryId,
    ...(trimmedBudgetPlanId ? { budgetPlanId: trimmedBudgetPlanId } : {}),
    occurredAt,
    ...(trimmedDonorOrPayee ? { donorOrPayee: trimmedDonorOrPayee } : {}),
    ...(trimmedReferenceNo ? { referenceNo: trimmedReferenceNo } : {}),
    ...(trimmedNote ? { note: trimmedNote } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Pure function that applies an edit patch to an existing `Transaction` without mutating it.
 * Per PRD.md §7.5: Editing a transaction replaces the old values on the same ID (`createdAt` preserved, `updatedAt` refreshed).
 */
export function applyTransactionEdit(
  existing: Transaction,
  patch: TransactionPatch,
  updatedAtIso: string = new Date().toISOString(),
  categories?: readonly Category[],
  options?: {
    accounts?: readonly import('./mosque').CashAccount[];
    funds?: readonly import('./mosque').Fund[];
  },
): Transaction {
  const patchValidation = validateTransactionPatch(patch);
  if (!patchValidation.valid) {
    throw new Error(patchValidation.errors[0]);
  }

  const nextNote =
    patch.note !== undefined ? patch.note.trim() : existing.note;
  const nextDonorOrPayee =
    patch.donorOrPayee !== undefined
      ? patch.donorOrPayee.trim()
      : existing.donorOrPayee;
  const nextReferenceNo =
    patch.referenceNo !== undefined
      ? patch.referenceNo.trim()
      : existing.referenceNo;
  const nextBudgetPlanId =
    patch.budgetPlanId !== undefined
      ? patch.budgetPlanId.trim()
      : existing.budgetPlanId;
  const nextAccountId =
    patch.accountId !== undefined && patch.accountId.trim().length > 0
      ? patch.accountId.trim()
      : existing.accountId || DEFAULT_CASH_ACCOUNT_TUNAI_ID;
  const nextFundId =
    patch.fundId !== undefined && patch.fundId.trim().length > 0
      ? patch.fundId.trim()
      : existing.fundId || DEFAULT_FUND_OPERASIONAL_ID;

  const updatedCandidate: TransactionDraft = {
    id: existing.id,
    type: patch.type ?? existing.type,
    amount: patch.amount ?? existing.amount,
    accountId: nextAccountId,
    fundId: nextFundId,
    categoryId:
      patch.categoryId !== undefined
        ? patch.categoryId.trim()
        : existing.categoryId,
    budgetPlanId: nextBudgetPlanId,
    occurredAt: patch.occurredAt ?? existing.occurredAt,
    donorOrPayee: nextDonorOrPayee,
    referenceNo: nextReferenceNo,
    note: nextNote,
  };

  const fullValidation = validateTransactionDraft(
    updatedCandidate,
    categories,
    {
      allowArchivedCategoryId: existing.categoryId,
      allowArchivedAccountId: existing.accountId,
      allowArchivedFundId: existing.fundId,
      accounts: options?.accounts,
      funds: options?.funds,
    },
  );

  if (!fullValidation.valid) {
    throw new Error(fullValidation.errors[0]);
  }

  return {
    id: existing.id,
    type: updatedCandidate.type,
    amount: updatedCandidate.amount,
    accountId: nextAccountId,
    fundId: nextFundId,
    categoryId: updatedCandidate.categoryId,
    ...(nextBudgetPlanId ? { budgetPlanId: nextBudgetPlanId } : {}),
    occurredAt: updatedCandidate.occurredAt!,
    ...(nextDonorOrPayee ? { donorOrPayee: nextDonorOrPayee } : {}),
    ...(nextReferenceNo ? { referenceNo: nextReferenceNo } : {}),
    ...(nextNote ? { note: nextNote } : {}),
    createdAt: existing.createdAt,
    updatedAt: updatedAtIso,
  };
}

/**
 * Pure helper that replaces an edited transaction in a collection by ID.
 * Ensures editing never duplicates a record and rejects lists with duplicate matching IDs.
 */
export function replaceTransactionInList(
  transactions: readonly Transaction[],
  updatedTransaction: Transaction,
): Transaction[] {
  let matchCount = 0;
  const nextList = transactions.map((tx) => {
    if (tx.id === updatedTransaction.id) {
      matchCount += 1;
      return updatedTransaction;
    }
    return tx;
  });

  if (matchCount === 0) {
    throw new Error(
      `Transaksi dengan ID "${updatedTransaction.id}" tidak ditemukan untuk diperbarui.`,
    );
  }
  if (matchCount > 1) {
    throw new Error(
      `Ditemukan duplikasi transaksi dengan ID "${updatedTransaction.id}".`,
    );
  }

  return nextList;
}

/**
 * Pure helper that removes a transaction by ID.
 */
export function removeTransactionFromList(
  transactions: readonly Transaction[],
  transactionId: string,
): Transaction[] {
  return transactions.filter((tx) => tx.id !== transactionId);
}

/**
 * Pure factory for creating a validated custom `Category`.
 */
export function createCategory(input: CategoryInput): Category {
  const validation = validateCategoryInput(input);
  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }

  const trimmedDefaultFundId = input.defaultFundId?.trim();

  return {
    id: input.id.trim(),
    name: input.name.trim(),
    type: input.type,
    ...(trimmedDefaultFundId ? { defaultFundId: trimmedDefaultFundId } : {}),
    color: input.color.trim(),
    ...(input.iconKey?.trim() ? { iconKey: input.iconKey.trim() } : {}),
    isDefault: Boolean(input.isDefault),
    ...(input.archivedAt ? { archivedAt: input.archivedAt } : {}),
  };
}

/**
 * Pure helper to archive a category without deleting it so existing transactions keep their category meaning.
 */
export function archiveCategory(
  category: Category,
  archivedAtIso: string = new Date().toISOString(),
): Category {
  return {
    ...category,
    archivedAt: archivedAtIso,
  };
}

/**
 * Pure helper to rename a category while preserving its ID and historical references.
 */
export function renameCategory(category: Category, newName: string): Category {
  const candidate: CategoryInput = {
    ...category,
    name: newName,
  };
  const validation = validateCategoryInput(candidate);
  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }
  return {
    ...category,
    name: newName.trim(),
  };
}

/**
 * Returns categories selectable for new transactions of a given `type`.
 */
export function getSelectableCategories(
  categories: readonly Category[],
  type: TransactionType,
  preserveCategoryId?: string,
): Category[] {
  return categories.filter(
    (cat) =>
      cat.type === type &&
      (!cat.archivedAt || cat.id === preserveCategoryId),
  );
}
