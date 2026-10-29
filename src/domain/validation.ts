/**
 * Pure Validation Rules for Transactions, Categories, and Application Settings.
 *
 * Source of truth: PRD.md §6, §7 & ARCHITECTURE.md §3.
 */

import { isValidLocalDateString } from '../lib/date';
import { isValidOpeningBalance, isValidTransactionAmount } from './money';
import type { CashAccount, Fund } from './mosque';
import {
  MAX_CATEGORY_NAME_LENGTH,
  MAX_DONOR_OR_PAYEE_LENGTH,
  MAX_MOSQUE_ADDRESS_LENGTH,
  MAX_MOSQUE_NAME_LENGTH,
  MAX_OFFICER_NAME_LENGTH,
  MAX_REFERENCE_NO_LENGTH,
  MAX_TRANSACTION_NOTE_LENGTH,
  type AppSettings,
  type Category,
  type CategoryInput,
  type TransactionDraft,
  type TransactionPatch,
  type TransactionType,
} from './transaction';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface TransactionValidationOptions {
  /**
   * When editing an existing transaction whose category/account/fund was previously archived,
   * allow keeping that same archived ID so historical meaning is preserved.
   */
  allowArchivedCategoryId?: string;
  allowArchivedAccountId?: string;
  allowArchivedFundId?: string;
  accounts?: readonly CashAccount[];
  funds?: readonly Fund[];
}

/**
 * Checks whether a value is a valid `TransactionType` (`'income' | 'expense'`).
 */
export function isValidTransactionType(value: unknown): value is TransactionType {
  return value === 'income' || value === 'expense';
}

/**
 * Validates a `TransactionDraft` before creation or full update.
 * Optionally checks that `categoryId` exists in `categories` and matches the transaction's `type`,
 * and that `accountId` / `fundId` exist in `options.accounts` / `options.funds` when provided.
 */
export function validateTransactionDraft(
  draft: Partial<TransactionDraft> | null | undefined,
  categories?: readonly Category[],
  options?: TransactionValidationOptions,
): ValidationResult {
  const errors: string[] = [];

  if (!draft || typeof draft !== 'object') {
    return {
      valid: false,
      errors: ['Data transaksi tidak boleh kosong.'],
    };
  }

  if (typeof draft.id !== 'string' || draft.id.trim().length === 0) {
    errors.push('ID transaksi wajib diisi.');
  }

  if (!isValidTransactionType(draft.type)) {
    errors.push(
      'Jenis transaksi harus berupa pemasukan (income) atau pengeluaran (expense).',
    );
  }

  if (!isValidTransactionAmount(draft.amount)) {
    errors.push(
      'Nominal transaksi harus berupa bilangan bulat Rupiah lebih besar dari 0.',
    );
  }

  if (
    typeof draft.categoryId !== 'string' ||
    draft.categoryId.trim().length === 0
  ) {
    errors.push('Kategori transaksi wajib dipilih.');
  } else if (categories !== undefined && isValidTransactionType(draft.type)) {
    const trimmedCategoryId = draft.categoryId.trim();
    const matchedCategory = categories.find(
      (cat) => cat.id === trimmedCategoryId,
    );

    if (!matchedCategory) {
      errors.push('Kategori yang dipilih tidak ditemukan.');
    } else {
      if (matchedCategory.type !== draft.type) {
        errors.push(
          `Kategori "${matchedCategory.name}" tidak sesuai dengan jenis transaksi ${
            draft.type === 'income' ? 'pemasukan' : 'pengeluaran'
          }.`,
        );
      }
      if (
        matchedCategory.archivedAt &&
        matchedCategory.id !== options?.allowArchivedCategoryId
      ) {
        errors.push(
          `Kategori "${matchedCategory.name}" sudah diarsipkan dan tidak dapat dipilih untuk transaksi baru.`,
        );
      }
    }
  }

  if (options?.accounts && draft.accountId !== undefined) {
    const trimmedAccountId = draft.accountId.trim();
    const matchedAccount = options.accounts.find(
      (acc) => acc.id === trimmedAccountId,
    );
    if (!matchedAccount) {
      errors.push('Lokasi kas yang dipilih tidak ditemukan.');
    } else if (
      matchedAccount.archivedAt &&
      matchedAccount.id !== options.allowArchivedAccountId
    ) {
      errors.push(
        `Lokasi kas "${matchedAccount.name}" sudah diarsipkan dan tidak dapat dipilih.`,
      );
    }
  }

  if (options?.funds && draft.fundId !== undefined) {
    const trimmedFundId = draft.fundId.trim();
    const matchedFund = options.funds.find((f) => f.id === trimmedFundId);
    if (!matchedFund) {
      errors.push('Dana masjid yang dipilih tidak ditemukan.');
    } else if (
      matchedFund.archivedAt &&
      matchedFund.id !== options.allowArchivedFundId
    ) {
      errors.push(
        `Dana "${matchedFund.name}" sudah diarsipkan dan tidak dapat dipilih.`,
      );
    }
  }

  if (!isValidLocalDateString(draft.occurredAt)) {
    errors.push(
      'Tanggal transaksi harus berformat tanggal lokal YYYY-MM-DD yang valid.',
    );
  }

  if (draft.donorOrPayee !== undefined) {
    if (typeof draft.donorOrPayee !== 'string') {
      errors.push('Nama donatur/penerima harus berupa teks.');
    } else if (draft.donorOrPayee.trim().length > MAX_DONOR_OR_PAYEE_LENGTH) {
      errors.push(
        `Nama donatur/penerima maksimal ${MAX_DONOR_OR_PAYEE_LENGTH} karakter.`,
      );
    }
  }

  if (draft.referenceNo !== undefined) {
    if (typeof draft.referenceNo !== 'string') {
      errors.push('Nomor bukti/referensi harus berupa teks.');
    } else if (draft.referenceNo.trim().length > MAX_REFERENCE_NO_LENGTH) {
      errors.push(
        `Nomor bukti/referensi maksimal ${MAX_REFERENCE_NO_LENGTH} karakter.`,
      );
    }
  }

  if (draft.note !== undefined) {
    if (typeof draft.note !== 'string') {
      errors.push('Catatan transaksi harus berupa teks.');
    } else if (draft.note.trim().length > MAX_TRANSACTION_NOTE_LENGTH) {
      errors.push(
        `Catatan transaksi maksimal ${MAX_TRANSACTION_NOTE_LENGTH} karakter.`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a partial `TransactionPatch` before applying it to an existing transaction.
 */
export function validateTransactionPatch(
  patch: TransactionPatch | null | undefined,
): ValidationResult {
  const errors: string[] = [];

  if (!patch || typeof patch !== 'object') {
    return {
      valid: false,
      errors: ['Perubahan transaksi tidak boleh kosong.'],
    };
  }

  if (patch.type !== undefined && !isValidTransactionType(patch.type)) {
    errors.push(
      'Jenis transaksi harus berupa pemasukan (income) atau pengeluaran (expense).',
    );
  }

  if (patch.amount !== undefined && !isValidTransactionAmount(patch.amount)) {
    errors.push(
      'Nominal transaksi harus berupa bilangan bulat Rupiah lebih besar dari 0.',
    );
  }

  if (
    patch.categoryId !== undefined &&
    (typeof patch.categoryId !== 'string' ||
      patch.categoryId.trim().length === 0)
  ) {
    errors.push('Kategori transaksi wajib dipilih.');
  }

  if (
    patch.occurredAt !== undefined &&
    !isValidLocalDateString(patch.occurredAt)
  ) {
    errors.push(
      'Tanggal transaksi harus berformat tanggal lokal YYYY-MM-DD yang valid.',
    );
  }

  if (patch.donorOrPayee !== undefined) {
    if (typeof patch.donorOrPayee !== 'string') {
      errors.push('Nama donatur/penerima harus berupa teks.');
    } else if (patch.donorOrPayee.trim().length > MAX_DONOR_OR_PAYEE_LENGTH) {
      errors.push(
        `Nama donatur/penerima maksimal ${MAX_DONOR_OR_PAYEE_LENGTH} karakter.`,
      );
    }
  }

  if (patch.referenceNo !== undefined) {
    if (typeof patch.referenceNo !== 'string') {
      errors.push('Nomor bukti/referensi harus berupa teks.');
    } else if (patch.referenceNo.trim().length > MAX_REFERENCE_NO_LENGTH) {
      errors.push(
        `Nomor bukti/referensi maksimal ${MAX_REFERENCE_NO_LENGTH} karakter.`,
      );
    }
  }

  if (patch.note !== undefined) {
    if (typeof patch.note !== 'string') {
      errors.push('Catatan transaksi harus berupa teks.');
    } else if (patch.note.trim().length > MAX_TRANSACTION_NOTE_LENGTH) {
      errors.push(
        `Catatan transaksi maksimal ${MAX_TRANSACTION_NOTE_LENGTH} karakter.`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a `CategoryInput` object.
 */
export function validateCategoryInput(
  input: Partial<CategoryInput> | null | undefined,
): ValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return {
      valid: false,
      errors: ['Data kategori tidak boleh kosong.'],
    };
  }

  if (typeof input.id !== 'string' || input.id.trim().length === 0) {
    errors.push('ID kategori wajib diisi.');
  }

  if (typeof input.name !== 'string' || input.name.trim().length === 0) {
    errors.push('Nama kategori wajib diisi.');
  } else if (input.name.trim().length > MAX_CATEGORY_NAME_LENGTH) {
    errors.push(`Nama kategori maksimal ${MAX_CATEGORY_NAME_LENGTH} karakter.`);
  }

  if (!isValidTransactionType(input.type)) {
    errors.push(
      'Jenis kategori harus berupa pemasukan (income) atau pengeluaran (expense).',
    );
  }

  if (typeof input.color !== 'string' || input.color.trim().length === 0) {
    errors.push('Token warna kategori wajib diisi.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates `AppSettings` / `MosqueSettings` (openingBalance integer IDR >= 0, currency === 'IDR', and optional mosque profile fields).
 */
export function validateAppSettings(
  settings: Partial<AppSettings> | null | undefined,
): ValidationResult {
  const errors: string[] = [];

  if (!settings || typeof settings !== 'object') {
    return {
      valid: false,
      errors: ['Pengaturan aplikasi tidak boleh kosong.'],
    };
  }

  if (!isValidOpeningBalance(settings.openingBalance)) {
    errors.push(
      'Saldo awal harus berupa bilangan bulat Rupiah (0 atau lebih besar).',
    );
  }

  if (settings.currency !== 'IDR') {
    errors.push('Mata uang MVP harus berupa IDR.');
  }

  if (typeof settings.onboardingCompleted !== 'boolean') {
    errors.push('Status onboarding harus berupa boolean.');
  }

  if (
    settings.mosqueName !== undefined &&
    (typeof settings.mosqueName !== 'string' ||
      settings.mosqueName.trim().length > MAX_MOSQUE_NAME_LENGTH)
  ) {
    errors.push(`Nama masjid maksimal ${MAX_MOSQUE_NAME_LENGTH} karakter.`);
  }

  if (
    settings.mosqueAddress !== undefined &&
    (typeof settings.mosqueAddress !== 'string' ||
      settings.mosqueAddress.trim().length > MAX_MOSQUE_ADDRESS_LENGTH)
  ) {
    errors.push(
      `Alamat masjid maksimal ${MAX_MOSQUE_ADDRESS_LENGTH} karakter.`,
    );
  }

  if (
    settings.chairpersonName !== undefined &&
    (typeof settings.chairpersonName !== 'string' ||
      settings.chairpersonName.trim().length > MAX_OFFICER_NAME_LENGTH)
  ) {
    errors.push(
      `Nama Ketua DKM maksimal ${MAX_OFFICER_NAME_LENGTH} karakter.`,
    );
  }

  if (
    settings.treasurerName !== undefined &&
    (typeof settings.treasurerName !== 'string' ||
      settings.treasurerName.trim().length > MAX_OFFICER_NAME_LENGTH)
  ) {
    errors.push(
      `Nama Bendahara maksimal ${MAX_OFFICER_NAME_LENGTH} karakter.`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
