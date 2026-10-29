/**
 * Pure Financial Calculation & Summary Domain Functions.
 *
 * Source of truth: PRD.md §5.1, §7 & ARCHITECTURE.md §4.
 *
 * Key Invariants:
 * 1. `currentBalance = openingBalance + totalAllTimeIncome - totalAllTimeExpense`
 * 2. `openingBalance` is a baseline setting before all recorded transactions — NEVER counted as period income.
 * 3. Period summaries (`income`, `expense`, `netCashFlow`) aggregate only transactions whose `occurredAt`
 *    falls inclusively within `[period.startDate, period.endDate]`.
 * 4. Archived categories remain resolved in historical summaries so older transactions never lose their meaning (PRD.md §5.1).
 */

import { isDateWithinPeriod, type DateRangePeriod } from '../lib/date';
import { addIdr, assertOpeningBalance, assertTransactionAmount } from './money';
import {
  DEFAULT_CASH_ACCOUNT_TUNAI_ID,
  DEFAULT_FUND_OPERASIONAL_ID,
} from './mosque';
import type { Category, Transaction, TransactionType } from './transaction';

export interface PeriodSummary {
  /** Period boundaries (`YYYY-MM-DD` inclusive) */
  period: DateRangePeriod;
  /** Sum of `income` transactions within the period (does NOT include `openingBalance`) */
  income: number;
  /** Sum of `expense` transactions within the period */
  expense: number;
  /** `income - expense` within the period */
  netCashFlow: number;
  /** Number of transactions within the period */
  transactionCount: number;
}

export interface CategorySummaryItem {
  categoryId: string;
  categoryName: string;
  type: TransactionType;
  /** Total integer IDR for this category */
  totalAmount: number;
  /** Number of transactions matching this category */
  transactionCount: number;
  /** True if the category has been archived (historical transactions still preserve its name) */
  isArchived: boolean;
}

export interface TransactionFilterCriteria {
  /** Optional inclusive date range */
  period?: DateRangePeriod;
  /** Optional filter by `'income'` or `'expense'` */
  type?: TransactionType;
  /** Optional filter by specific `accountId` (`CashAccount`) */
  accountId?: string;
  /** Optional filter by specific `fundId` (`Fund`) */
  fundId?: string;
  /** Optional filter by specific `categoryId` */
  categoryId?: string;
  /** Optional case-insensitive search query matched against note, category name, donor/payee, and referenceNo */
  searchQuery?: string;
}

export type TransactionSortOrder = 'newest' | 'oldest';

export interface OverviewSnapshot {
  openingBalance: number;
  totalAllTimeIncome: number;
  totalAllTimeExpense: number;
  currentBalance: number;
  periodSummary: PeriodSummary;
}

/**
 * Calculates total income and total expense across a given list of transactions.
 * Validates that every transaction amount is a positive integer IDR.
 */
export function calculateIncomeAndExpenseTotals(
  transactions: readonly Transaction[],
): { totalIncome: number; totalExpense: number } {
  let totalIncome = 0;
  let totalExpense = 0;

  for (const tx of transactions) {
    const amount = assertTransactionAmount(tx.amount);
    if (tx.type === 'income') {
      totalIncome = addIdr(totalIncome, amount);
    } else if (tx.type === 'expense') {
      totalExpense = addIdr(totalExpense, amount);
    } else {
      throw new Error(`Jenis transaksi tidak dikenal: "${String(tx.type)}".`);
    }
  }

  return { totalIncome, totalExpense };
}

/**
 * Calculates the all-time virtual balance (`Saldo tercatat`):
 * `openingBalance + sum(all income) - sum(all expense)` (PRD.md §5.1 & §7.3).
 */
export function calculateCurrentBalance(
  openingBalance: number,
  transactions: readonly Transaction[],
): number {
  const validOpening = assertOpeningBalance(openingBalance);
  const { totalIncome, totalExpense } =
    calculateIncomeAndExpenseTotals(transactions);

  const withIncome = addIdr(validOpening, totalIncome);
  return addIdr(withIncome, -totalExpense);
}

/**
 * Filters transactions inclusively by a `DateRangePeriod` (`startDate <= occurredAt <= endDate`).
 */
export function filterTransactionsByPeriod(
  transactions: readonly Transaction[],
  period: DateRangePeriod,
): Transaction[] {
  return transactions.filter((tx) => isDateWithinPeriod(tx.occurredAt, period));
}

/**
 * Filters transactions by period, type, categoryId, and/or keyword search query (PRD.md §5.1 Transaksi).
 */
export function filterTransactions(
  transactions: readonly Transaction[],
  criteria: TransactionFilterCriteria,
  categories?: readonly Category[],
): Transaction[] {
  const categoryNameMap = new Map<string, string>();
  if (categories) {
    for (const cat of categories) {
      categoryNameMap.set(cat.id, cat.name.toLowerCase());
    }
  }

  const normalizedQuery = criteria.searchQuery?.trim().toLowerCase() ?? '';

  return transactions.filter((tx) => {
    if (criteria.period && !isDateWithinPeriod(tx.occurredAt, criteria.period)) {
      return false;
    }
    if (criteria.type && tx.type !== criteria.type) {
      return false;
    }
    if (
      criteria.accountId &&
      (tx.accountId || DEFAULT_CASH_ACCOUNT_TUNAI_ID) !== criteria.accountId
    ) {
      return false;
    }
    if (
      criteria.fundId &&
      (tx.fundId || DEFAULT_FUND_OPERASIONAL_ID) !== criteria.fundId
    ) {
      return false;
    }
    if (criteria.categoryId && tx.categoryId !== criteria.categoryId) {
      return false;
    }
    if (normalizedQuery.length > 0) {
      const noteMatch = (tx.note ?? '').toLowerCase().includes(normalizedQuery);
      const donorMatch = (tx.donorOrPayee ?? '')
        .toLowerCase()
        .includes(normalizedQuery);
      const refMatch = (tx.referenceNo ?? '')
        .toLowerCase()
        .includes(normalizedQuery);
      const categoryName = categoryNameMap.get(tx.categoryId) ?? '';
      const categoryMatch = categoryName.includes(normalizedQuery);
      if (!noteMatch && !donorMatch && !refMatch && !categoryMatch) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Sorts transactions by `occurredAt` (`newest` = descending, `oldest` = ascending),
 * using `createdAt` and `id` as deterministic tie-breakers. Does not mutate the input array.
 */
export function sortTransactions(
  transactions: readonly Transaction[],
  order: TransactionSortOrder = 'newest',
): Transaction[] {
  const copy = [...transactions];
  const direction = order === 'newest' ? -1 : 1;

  copy.sort((a, b) => {
    if (a.occurredAt !== b.occurredAt) {
      return a.occurredAt < b.occurredAt ? -1 * direction : 1 * direction;
    }
    if (a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? -1 * direction : 1 * direction;
    }
    return a.id.localeCompare(b.id) * direction;
  });

  return copy;
}

/**
 * Calculates the financial summary (`income`, `expense`, `netCashFlow`, `transactionCount`)
 * for a specific `DateRangePeriod`.
 *
 * Per PRD.md §5.1 & §7.3: Opening balance is NEVER included in period income or period net cash flow.
 */
export function calculatePeriodSummary(
  transactions: readonly Transaction[],
  period: DateRangePeriod,
): PeriodSummary {
  const periodTransactions = filterTransactionsByPeriod(transactions, period);
  const { totalIncome, totalExpense } =
    calculateIncomeAndExpenseTotals(periodTransactions);

  return {
    period,
    income: totalIncome,
    expense: totalExpense,
    netCashFlow: addIdr(totalIncome, -totalExpense),
    transactionCount: periodTransactions.length,
  };
}

/**
 * Aggregates transaction totals grouped by category (optionally filtered to a specific `type` or `period`).
 * Preserves category names even when a category has `archivedAt` set (PRD.md §5.1 Kategori).
 * Sorted by `totalAmount` descending.
 */
export function calculateCategoryTotals(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  options?: {
    type?: TransactionType;
    period?: DateRangePeriod;
  },
): CategorySummaryItem[] {
  const categoryLookup = new Map<string, Category>();
  for (const cat of categories) {
    categoryLookup.set(cat.id, cat);
  }

  const scopedTransactions = filterTransactions(transactions, {
    type: options?.type,
    period: options?.period,
  });

  const totalsByCategoryId = new Map<
    string,
    { totalAmount: number; count: number; type: TransactionType }
  >();

  for (const tx of scopedTransactions) {
    const amount = assertTransactionAmount(tx.amount);
    if (tx.type !== 'income' && tx.type !== 'expense') {
      throw new Error(`Jenis transaksi tidak dikenal: "${String(tx.type)}".`);
    }
    if (typeof tx.categoryId !== 'string' || tx.categoryId.trim().length === 0) {
      throw new Error('ID kategori transaksi tidak valid.');
    }
    const existing = totalsByCategoryId.get(tx.categoryId);
    if (existing) {
      existing.totalAmount = addIdr(existing.totalAmount, amount);
      existing.count += 1;
    } else {
      totalsByCategoryId.set(tx.categoryId, {
        totalAmount: amount,
        count: 1,
        type: tx.type,
      });
    }
  }

  const results: CategorySummaryItem[] = [];
  for (const [categoryId, aggregate] of totalsByCategoryId.entries()) {
    const category = categoryLookup.get(categoryId);
    results.push({
      categoryId,
      categoryName: category?.name ?? 'Kategori Tidak Dikenal',
      type: category?.type ?? aggregate.type,
      totalAmount: aggregate.totalAmount,
      transactionCount: aggregate.count,
      isArchived: Boolean(category?.archivedAt),
    });
  }

  results.sort((a, b) => {
    if (b.totalAmount !== a.totalAmount) {
      return b.totalAmount - a.totalAmount;
    }
    return a.categoryName.localeCompare(b.categoryName, 'id-ID');
  });

  return results;
}

/**
 * Computes a complete dashboard overview snapshot in a single tested domain call (PRD.md §7.7).
 */
export function calculateOverviewSnapshot(
  openingBalance: number,
  transactions: readonly Transaction[],
  period: DateRangePeriod,
): OverviewSnapshot {
  const validOpening = assertOpeningBalance(openingBalance);
  const { totalIncome, totalExpense } =
    calculateIncomeAndExpenseTotals(transactions);
  const currentBalance = addIdr(
    addIdr(validOpening, totalIncome),
    -totalExpense,
  );
  const periodSummary = calculatePeriodSummary(transactions, period);

  return {
    openingBalance: validOpening,
    totalAllTimeIncome: totalIncome,
    totalAllTimeExpense: totalExpense,
    currentBalance,
    periodSummary,
  };
}

