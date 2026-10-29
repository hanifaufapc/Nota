/**
 * Core Mosque Financial Domain:
 * - Cash Accounts (`CashAccount` — where money is stored: `Kas Tunai`, `Rekening Bank Tercatat`)
 * - Funds (`Fund` — designated amanah purposes: `Dana Operasional Umum`, `Dana Pembangunan`, `Dana Sosial / Zakat`)
 * - Internal Cash Transfers (`CashTransfer` — moves balance between `CashAccount`s without altering `Fund` balances or period income/expense)
 * - Soft-Guard Evaluation (`evaluateTransactionSoftGuard` — warns treasurer when an expense exceeds Fund/Account balance or crosses restricted fund boundaries)
 *
 * Source of truth: PRD.md §6, §7 & ARCHITECTURE.md §2, §3.
 */

import { isValidLocalDateString, toLocalDateString } from '../lib/date';
import { formatIDR } from '../lib/format';
import {
  addIdr,
  assertOpeningBalance,
  assertTransactionAmount,
  isValidOpeningBalance,
  isValidTransactionAmount,
} from './money';
import type { Category, Transaction, TransactionType } from './transaction';
import type { ValidationResult } from './validation';

export type CashAccountKind = 'cash' | 'bank_recorded';
export type FundRestriction = 'unrestricted' | 'restricted';

export const DEFAULT_CASH_ACCOUNT_TUNAI_ID = 'acc-kas-tunai';
export const DEFAULT_CASH_ACCOUNT_BANK_ID = 'acc-bank-masjid';

export const DEFAULT_FUND_OPERASIONAL_ID = 'fund-operasional';
export const DEFAULT_FUND_PEMBANGUNAN_ID = 'fund-pembangunan';
export const DEFAULT_FUND_SOSIAL_ZAKAT_ID = 'fund-sosial-zakat';

export const MAX_ACCOUNT_NAME_LENGTH = 60;
export const MAX_FUND_NAME_LENGTH = 60;
export const MAX_FUND_DESCRIPTION_LENGTH = 200;
export const MAX_TRANSFER_NOTE_LENGTH = 240;

export interface CashAccount {
  id: string;
  name: string;
  kind: CashAccountKind;
  openingBalance: number;
  isDefault: boolean;
  archivedAt?: string;
}

export interface CashAccountInput {
  id: string;
  name: string;
  kind: CashAccountKind;
  openingBalance: number;
  isDefault?: boolean;
  archivedAt?: string;
}

export interface CashAccountPatch {
  name?: string;
  kind?: CashAccountKind;
  openingBalance?: number;
}

export interface Fund {
  id: string;
  name: string;
  restriction: FundRestriction;
  openingBalance: number;
  description?: string;
  isDefault: boolean;
  archivedAt?: string;
}

export interface FundInput {
  id: string;
  name: string;
  restriction: FundRestriction;
  openingBalance: number;
  description?: string;
  isDefault?: boolean;
  archivedAt?: string;
}

export interface FundPatch {
  name?: string;
  restriction?: FundRestriction;
  openingBalance?: number;
  description?: string;
}

export interface CashTransfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  occurredAt: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CashTransferInput {
  id?: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  occurredAt?: string;
  note?: string;
  nowIso?: string;
}

export interface AccountBalanceSummary {
  accountId: string;
  accountName: string;
  kind: CashAccountKind;
  openingBalance: number;
  totalIncome: number;
  totalExpense: number;
  transfersIn: number;
  transfersOut: number;
  currentBalance: number;
  isDefault: boolean;
  isArchived: boolean;
}

export interface FundBalanceSummary {
  fundId: string;
  fundName: string;
  restriction: FundRestriction;
  description?: string;
  openingBalance: number;
  totalIncome: number;
  totalExpense: number;
  currentBalance: number;
  isDefault: boolean;
  isArchived: boolean;
}

export interface MosqueBalanceSplit {
  /** Total cash across all accounts */
  totalBalance: number;
  /** Total balance across unrestricted funds (`Dana Operasional Umum`) */
  unrestrictedBalance: number;
  /** Total balance across restricted funds (`Dana Pembangunan`, `Dana Sosial / Zakat`, etc.) */
  restrictedBalance: number;
  /** Sum of opening balances across all accounts */
  totalAccountOpeningBalance: number;
  /** Sum of opening balances across all funds */
  totalFundOpeningBalance: number;
  accountSummaries: AccountBalanceSummary[];
  fundSummaries: FundBalanceSummary[];
}

export interface SoftGuardWarningItem {
  code:
    | 'FUND_DEFICIT'
    | 'ACCOUNT_DEFICIT'
    | 'RESTRICTED_FUND_CATEGORY_MISMATCH';
  title: string;
  message: string;
}

export interface SoftGuardEvaluation {
  requiresConfirmation: boolean;
  warnings: SoftGuardWarningItem[];
}

/**
 * Default Mosque Cash Accounts (2 locations per PRD.md §6.2).
 */
export const DEFAULT_CASH_ACCOUNTS: readonly Readonly<CashAccount>[] =
  Object.freeze([
    Object.freeze({
      id: DEFAULT_CASH_ACCOUNT_TUNAI_ID,
      name: 'Kas Tunai',
      kind: 'cash',
      openingBalance: 0,
      isDefault: true,
    }),
    Object.freeze({
      id: DEFAULT_CASH_ACCOUNT_BANK_ID,
      name: 'Rekening Bank Tercatat',
      kind: 'bank_recorded',
      openingBalance: 0,
      isDefault: true,
    }),
  ]);

/**
 * Default Mosque Funds (3 designated amanah funds per PRD.md §6.3).
 */
export const DEFAULT_FUNDS: readonly Readonly<Fund>[] = Object.freeze([
  Object.freeze({
    id: DEFAULT_FUND_OPERASIONAL_ID,
    name: 'Dana Operasional Umum',
    restriction: 'unrestricted',
    openingBalance: 0,
    description:
      'Dana bebas untuk operasional rutin masjid, listrik, kebersihan, bisyarah imam/marbot, dan kegiatan umum.',
    isDefault: true,
  }),
  Object.freeze({
    id: DEFAULT_FUND_PEMBANGUNAN_ID,
    name: 'Dana Pembangunan',
    restriction: 'restricted',
    openingBalance: 0,
    description:
      'Dana amanah terikat khusus pembangunan, renovasi fisik, dan pengadaan inventaris masjid.',
    isDefault: true,
  }),
  Object.freeze({
    id: DEFAULT_FUND_SOSIAL_ZAKAT_ID,
    name: 'Dana Sosial / Zakat',
    restriction: 'restricted',
    openingBalance: 0,
    description:
      'Dana amanah terikat khusus penerimaan dan penyaluran santunan sosial, yatim/dhuafa, dan zakat.',
    isDefault: true,
  }),
]);

export function isValidCashAccountKind(
  value: unknown,
): value is CashAccountKind {
  return value === 'cash' || value === 'bank_recorded';
}

export function isValidFundRestriction(
  value: unknown,
): value is FundRestriction {
  return value === 'unrestricted' || value === 'restricted';
}

export function validateCashAccountInput(
  input: Partial<CashAccountInput> | null | undefined,
): ValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Data lokasi kas tidak boleh kosong.'] };
  }

  if (typeof input.id !== 'string' || input.id.trim().length === 0) {
    errors.push('ID lokasi kas wajib diisi.');
  }

  if (typeof input.name !== 'string' || input.name.trim().length === 0) {
    errors.push('Nama lokasi kas wajib diisi.');
  } else if (input.name.trim().length > MAX_ACCOUNT_NAME_LENGTH) {
    errors.push(
      `Nama lokasi kas maksimal ${MAX_ACCOUNT_NAME_LENGTH} karakter.`,
    );
  }

  if (!isValidCashAccountKind(input.kind)) {
    errors.push(
      'Jenis lokasi kas harus berupa Kas Tunai (cash) atau Rekening Bank Tercatat (bank_recorded).',
    );
  }

  if (!isValidOpeningBalance(input.openingBalance)) {
    errors.push(
      'Saldo awal lokasi kas harus berupa bilangan bulat Rupiah (0 atau lebih besar).',
    );
  }

  return { valid: errors.length === 0, errors };
}

export function createCashAccount(input: CashAccountInput): CashAccount {
  const validation = validateCashAccountInput(input);
  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }

  return {
    id: input.id.trim(),
    name: input.name.trim(),
    kind: input.kind,
    openingBalance: input.openingBalance,
    isDefault: Boolean(input.isDefault),
    ...(input.archivedAt ? { archivedAt: input.archivedAt } : {}),
  };
}

export function applyCashAccountEdit(
  existing: CashAccount,
  patch: CashAccountPatch,
): CashAccount {
  const candidate: CashAccountInput = {
    ...existing,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
    ...(patch.openingBalance !== undefined
      ? { openingBalance: patch.openingBalance }
      : {}),
  };

  return createCashAccount(candidate);
}

export function archiveCashAccount(
  account: CashAccount,
  archivedAtIso: string = new Date().toISOString(),
): CashAccount {
  return {
    ...account,
    archivedAt: archivedAtIso,
  };
}

export function getSelectableCashAccounts(
  accounts: readonly CashAccount[],
  preserveAccountId?: string,
): CashAccount[] {
  return accounts
    .filter((acc) => !acc.archivedAt || acc.id === preserveAccountId)
    .sort((a, b) => {
      if (a.id === DEFAULT_CASH_ACCOUNT_TUNAI_ID) return -1;
      if (b.id === DEFAULT_CASH_ACCOUNT_TUNAI_ID) return 1;
      return 0;
    });
}

export function validateFundInput(
  input: Partial<FundInput> | null | undefined,
): ValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Data dana masjid tidak boleh kosong.'] };
  }

  if (typeof input.id !== 'string' || input.id.trim().length === 0) {
    errors.push('ID dana masjid wajib diisi.');
  }

  if (typeof input.name !== 'string' || input.name.trim().length === 0) {
    errors.push('Nama dana masjid wajib diisi.');
  } else if (input.name.trim().length > MAX_FUND_NAME_LENGTH) {
    errors.push(`Nama dana masjid maksimal ${MAX_FUND_NAME_LENGTH} karakter.`);
  }

  if (!isValidFundRestriction(input.restriction)) {
    errors.push(
      'Sifat dana harus berupa Dana Umum (unrestricted) atau Dana Terikat (restricted).',
    );
  }

  if (!isValidOpeningBalance(input.openingBalance)) {
    errors.push(
      'Saldo awal dana harus berupa bilangan bulat Rupiah (0 atau lebih besar).',
    );
  }

  if (
    input.description !== undefined &&
    input.description.trim().length > MAX_FUND_DESCRIPTION_LENGTH
  ) {
    errors.push(
      `Deskripsi dana maksimal ${MAX_FUND_DESCRIPTION_LENGTH} karakter.`,
    );
  }

  return { valid: errors.length === 0, errors };
}

export function createFund(input: FundInput): Fund {
  const validation = validateFundInput(input);
  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }

  const trimmedDesc = input.description?.trim();

  return {
    id: input.id.trim(),
    name: input.name.trim(),
    restriction: input.restriction,
    openingBalance: input.openingBalance,
    ...(trimmedDesc ? { description: trimmedDesc } : {}),
    isDefault: Boolean(input.isDefault),
    ...(input.archivedAt ? { archivedAt: input.archivedAt } : {}),
  };
}

export function applyFundEdit(existing: Fund, patch: FundPatch): Fund {
  const candidate: FundInput = {
    ...existing,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.restriction !== undefined
      ? { restriction: patch.restriction }
      : {}),
    ...(patch.openingBalance !== undefined
      ? { openingBalance: patch.openingBalance }
      : {}),
    ...(patch.description !== undefined
      ? { description: patch.description }
      : {}),
  };

  return createFund(candidate);
}

export function archiveFund(
  fund: Fund,
  archivedAtIso: string = new Date().toISOString(),
): Fund {
  return {
    ...fund,
    archivedAt: archivedAtIso,
  };
}

export function getSelectableFunds(
  funds: readonly Fund[],
  preserveFundId?: string,
): Fund[] {
  return funds.filter((f) => !f.archivedAt || f.id === preserveFundId);
}

export function validateCashTransferInput(
  input: Partial<CashTransferInput> | null | undefined,
  accounts?: readonly CashAccount[],
  options?: { allowArchivedAccounts?: boolean },
): ValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return {
      valid: false,
      errors: ['Data mutasi antar-kas tidak boleh kosong.'],
    };
  }

  const fromId =
    typeof input.fromAccountId === 'string' ? input.fromAccountId.trim() : '';
  const toId =
    typeof input.toAccountId === 'string' ? input.toAccountId.trim() : '';

  if (!fromId) {
    errors.push('Lokasi kas asal wajib dipilih.');
  }
  if (!toId) {
    errors.push('Lokasi kas tujuan wajib dipilih.');
  }
  if (fromId && toId && fromId === toId) {
    errors.push('Lokasi kas asal dan lokasi kas tujuan tidak boleh sama.');
  }

  if (accounts && fromId && toId && fromId !== toId) {
    const fromAcc = accounts.find((a) => a.id === fromId);
    const toAcc = accounts.find((a) => a.id === toId);
    if (!fromAcc) {
      errors.push('Lokasi kas asal tidak ditemukan.');
    } else if (fromAcc.archivedAt && !options?.allowArchivedAccounts) {
      errors.push(
        `Lokasi kas asal "${fromAcc.name}" sudah diarsipkan dan tidak dapat dipilih.`,
      );
    }
    if (!toAcc) {
      errors.push('Lokasi kas tujuan tidak ditemukan.');
    } else if (toAcc.archivedAt && !options?.allowArchivedAccounts) {
      errors.push(
        `Lokasi kas tujuan "${toAcc.name}" sudah diarsipkan dan tidak dapat dipilih.`,
      );
    }
  }

  if (!isValidTransactionAmount(input.amount)) {
    errors.push(
      'Nominal mutasi harus berupa bilangan bulat Rupiah lebih besar dari 0.',
    );
  }

  const occurredAt = input.occurredAt ?? toLocalDateString(new Date());
  if (!isValidLocalDateString(occurredAt)) {
    errors.push(
      'Tanggal mutasi harus berformat tanggal lokal YYYY-MM-DD yang valid.',
    );
  }

  if (input.note !== undefined) {
    if (typeof input.note !== 'string') {
      errors.push('Catatan mutasi harus berupa teks.');
    } else if (input.note.trim().length > MAX_TRANSFER_NOTE_LENGTH) {
      errors.push(
        `Catatan mutasi maksimal ${MAX_TRANSFER_NOTE_LENGTH} karakter.`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

export function createCashTransfer(
  input: CashTransferInput,
  accounts?: readonly CashAccount[],
  options?: { allowArchivedAccounts?: boolean },
): CashTransfer {
  const occurredAt = input.occurredAt ?? toLocalDateString(new Date());
  const timestamp = input.nowIso ?? new Date().toISOString();

  const validation = validateCashTransferInput(
    { ...input, occurredAt },
    accounts,
    options,
  );
  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }

  const id =
    input.id && input.id.trim().length > 0
      ? input.id.trim()
      : `trf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const trimmedNote = input.note?.trim();

  return {
    id,
    fromAccountId: input.fromAccountId.trim(),
    toAccountId: input.toAccountId.trim(),
    amount: input.amount,
    occurredAt,
    ...(trimmedNote ? { note: trimmedNote } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Pure calculation of balances per `CashAccount` (`Kas Tunai`, `Rekening Bank Tercatat`, etc.).
 * Includes `openingBalance`, `income`, `expense`, `transfersIn`, and `transfersOut`.
 */
export function calculateAccountBalances(
  accounts: readonly CashAccount[],
  transactions: readonly Transaction[],
  transfers: readonly CashTransfer[] = [],
): AccountBalanceSummary[] {
  const map = new Map<
    string,
    {
      account: CashAccount;
      income: number;
      expense: number;
      transfersIn: number;
      transfersOut: number;
    }
  >();

  for (const acc of accounts) {
    assertOpeningBalance(acc.openingBalance);
    map.set(acc.id, {
      account: acc,
      income: 0,
      expense: 0,
      transfersIn: 0,
      transfersOut: 0,
    });
  }

  for (const tx of transactions) {
    const amount = assertTransactionAmount(tx.amount);
    const accId = tx.accountId || DEFAULT_CASH_ACCOUNT_TUNAI_ID;
    const entry = map.get(accId);
    if (entry) {
      if (tx.type === 'income') {
        entry.income = addIdr(entry.income, amount);
      } else {
        entry.expense = addIdr(entry.expense, amount);
      }
    }
  }

  for (const tr of transfers) {
    const amount = assertTransactionAmount(tr.amount);
    const fromEntry = map.get(tr.fromAccountId);
    if (fromEntry) {
      fromEntry.transfersOut = addIdr(fromEntry.transfersOut, amount);
    }
    const toEntry = map.get(tr.toAccountId);
    if (toEntry) {
      toEntry.transfersIn = addIdr(toEntry.transfersIn, amount);
    }
  }

  const summaries: AccountBalanceSummary[] = [];
  for (const {
    account,
    income,
    expense,
    transfersIn,
    transfersOut,
  } of map.values()) {
    const afterTx = addIdr(
      addIdr(account.openingBalance, income),
      -expense,
    );
    const currentBalance = addIdr(addIdr(afterTx, transfersIn), -transfersOut);

    summaries.push({
      accountId: account.id,
      accountName: account.name,
      kind: account.kind,
      openingBalance: account.openingBalance,
      totalIncome: income,
      totalExpense: expense,
      transfersIn,
      transfersOut,
      currentBalance,
      isDefault: account.isDefault,
      isArchived: Boolean(account.archivedAt),
    });
  }

  return summaries;
}

/**
 * Pure calculation of balances per `Fund` (`Dana Operasional Umum`, `Dana Pembangunan`, `Dana Sosial / Zakat`, etc.).
 * Note: Internal `CashTransfer`s NEVER alter `Fund` balances (PRD.md §7.3).
 */
export function calculateFundBalances(
  funds: readonly Fund[],
  transactions: readonly Transaction[],
): FundBalanceSummary[] {
  const map = new Map<
    string,
    {
      fund: Fund;
      income: number;
      expense: number;
    }
  >();

  for (const fund of funds) {
    assertOpeningBalance(fund.openingBalance);
    map.set(fund.id, {
      fund,
      income: 0,
      expense: 0,
    });
  }

  for (const tx of transactions) {
    const amount = assertTransactionAmount(tx.amount);
    const fundId = tx.fundId || DEFAULT_FUND_OPERASIONAL_ID;
    const entry = map.get(fundId);
    if (entry) {
      if (tx.type === 'income') {
        entry.income = addIdr(entry.income, amount);
      } else {
        entry.expense = addIdr(entry.expense, amount);
      }
    }
  }

  const summaries: FundBalanceSummary[] = [];
  for (const { fund, income, expense } of map.values()) {
    const currentBalance = addIdr(
      addIdr(fund.openingBalance, income),
      -expense,
    );

    summaries.push({
      fundId: fund.id,
      fundName: fund.name,
      restriction: fund.restriction,
      ...(fund.description ? { description: fund.description } : {}),
      openingBalance: fund.openingBalance,
      totalIncome: income,
      totalExpense: expense,
      currentBalance,
      isDefault: fund.isDefault,
      isArchived: Boolean(fund.archivedAt),
    });
  }

  return summaries;
}

/**
 * Computes the complete Mosque Balance Split across all accounts and funds (PRD.md §5 & §7).
 */
export function calculateMosqueBalanceSplit(
  accounts: readonly CashAccount[],
  funds: readonly Fund[],
  transactions: readonly Transaction[],
  transfers: readonly CashTransfer[] = [],
): MosqueBalanceSplit {
  const accountSummaries = calculateAccountBalances(
    accounts,
    transactions,
    transfers,
  );
  const fundSummaries = calculateFundBalances(funds, transactions);

  let totalBalance = 0;
  let totalAccountOpeningBalance = 0;
  for (const acc of accountSummaries) {
    totalBalance = addIdr(totalBalance, acc.currentBalance);
    totalAccountOpeningBalance = addIdr(
      totalAccountOpeningBalance,
      acc.openingBalance,
    );
  }

  let unrestrictedBalance = 0;
  let restrictedBalance = 0;
  let totalFundOpeningBalance = 0;
  for (const fund of fundSummaries) {
    totalFundOpeningBalance = addIdr(
      totalFundOpeningBalance,
      fund.openingBalance,
    );
    if (fund.restriction === 'unrestricted') {
      unrestrictedBalance = addIdr(unrestrictedBalance, fund.currentBalance);
    } else {
      restrictedBalance = addIdr(restrictedBalance, fund.currentBalance);
    }
  }

  return {
    totalBalance,
    unrestrictedBalance,
    restrictedBalance,
    totalAccountOpeningBalance,
    totalFundOpeningBalance,
    accountSummaries,
    fundSummaries,
  };
}

/**
 * Evaluates Soft Guard rules (PRD.md §7.4) before saving a transaction:
 * 1. Warns if an expense exceeds the selected `Fund`'s available balance.
 * 2. Warns if an expense exceeds the selected `CashAccount`'s available balance.
 * 3. Warns if a `restricted` Fund is charged with a category whose `defaultFundId` points to a different fund.
 */
export function evaluateTransactionSoftGuard(
  candidate: {
    type: TransactionType;
    amount: number;
    accountId: string;
    fundId: string;
    categoryId: string;
  },
  context: {
    accounts: readonly CashAccount[];
    funds: readonly Fund[];
    categories: readonly Category[];
    transactions: readonly Transaction[];
    transfers?: readonly CashTransfer[];
    editingTransactionId?: string;
  },
): SoftGuardEvaluation {
  if (
    candidate.type !== 'expense' ||
    !isValidTransactionAmount(candidate.amount)
  ) {
    return { requiresConfirmation: false, warnings: [] };
  }

  const baseTransactions = context.editingTransactionId
    ? context.transactions.filter(
        (tx) => tx.id !== context.editingTransactionId,
      )
    : context.transactions;

  const accountBalances = calculateAccountBalances(
    context.accounts,
    baseTransactions,
    context.transfers ?? [],
  );
  const fundBalances = calculateFundBalances(context.funds, baseTransactions);

  const warnings: SoftGuardWarningItem[] = [];

  const targetFundSummary = fundBalances.find(
    (f) => f.fundId === candidate.fundId,
  );
  if (targetFundSummary && candidate.amount > targetFundSummary.currentBalance) {
    const deficit = addIdr(candidate.amount, -targetFundSummary.currentBalance);
    warnings.push({
      code: 'FUND_DEFICIT',
      title: `Saldo ${targetFundSummary.fundName} tidak mencukupi`,
      message: `Pengeluaran sebesar ${formatIDR(candidate.amount)} melebihi saldo tersedia pada ${targetFundSummary.fundName} (${formatIDR(targetFundSummary.currentBalance)}) sebesar ${formatIDR(deficit)}.`,
    });
  }

  const targetAccountSummary = accountBalances.find(
    (a) => a.accountId === candidate.accountId,
  );
  if (
    targetAccountSummary &&
    candidate.amount > targetAccountSummary.currentBalance
  ) {
    const deficit = addIdr(
      candidate.amount,
      -targetAccountSummary.currentBalance,
    );
    warnings.push({
      code: 'ACCOUNT_DEFICIT',
      title: `Saldo ${targetAccountSummary.accountName} tidak mencukupi`,
      message: `Pengeluaran sebesar ${formatIDR(candidate.amount)} melebihi saldo tersedia pada lokasi ${targetAccountSummary.accountName} (${formatIDR(targetAccountSummary.currentBalance)}) sebesar ${formatIDR(deficit)}.`,
    });
  }

  const selectedFund = context.funds.find((f) => f.id === candidate.fundId);
  const selectedCategory = context.categories.find(
    (c) => c.id === candidate.categoryId,
  );
  if (
    selectedFund &&
    selectedFund.restriction === 'restricted' &&
    selectedCategory?.defaultFundId &&
    selectedCategory.defaultFundId !== selectedFund.id
  ) {
    const recommendedFund = context.funds.find(
      (f) => f.id === selectedCategory.defaultFundId,
    );
    warnings.push({
      code: 'RESTRICTED_FUND_CATEGORY_MISMATCH',
      title: `Penggunaan Dana Terikat (${selectedFund.name})`,
      message: `Kategori "${selectedCategory.name}" umumnya dibebankan pada ${recommendedFund?.name ?? 'dana lain'}, sedangkan Anda memilih ${selectedFund.name} (Dana Terikat/Amanah). Pastikan pengeluaran ini sesuai dengan peruntukan amanah dana.`,
    });
  }

  return {
    requiresConfirmation: warnings.length > 0,
    warnings,
  };
}

