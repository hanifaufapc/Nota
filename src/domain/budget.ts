/**
 * Pure Domain Model, Validation, and Calculations for Monthly Category Budgets (P1 — Milestone 7).
 *
 * Source of truth: PRD.md §5.2, §6, §7 & IMPLEMENTATION_PLAN.md (Milestone 7).
 *
 * Key Invariants:
 * 1. Budgets apply only to `expense` categories and store `monthlyLimit` as a positive integer IDR.
 * 2. Setting, updating, or deleting a budget NEVER alters `currentBalance` (`Saldo tercatat`)
 *    or period cash-flow summaries (`Pemasukan`, `Pengeluaran`, `Selisih bulan ini`).
 * 3. Budget progress (`spentAmount`, `remainingAmount`, `overAmount`, `usagePercent`) is computed
 *    purely from actual recorded expense transactions within the selected `DateRangePeriod`.
 */

import type { DateRangePeriod } from '../lib/date';
import { addIdr, isValidTransactionAmount } from './money';
import { calculateCategoryTotals } from './summaries';
import type { Category, Transaction } from './transaction';
import type { ValidationResult } from './validation';

export interface CategoryBudget {
  /** Unique local identifier (e.g., `budget-cat-exp-makanan`) */
  id: string;
  /** Reference to an `expense` Category ID */
  categoryId: string;
  /** Monthly spending limit in positive integer IDR (`> 0`) */
  monthlyLimit: number;
  /** ISO 8601 timestamp of last update */
  updatedAt: string;
}

export interface CategoryBudgetInput {
  id?: string;
  categoryId: string;
  monthlyLimit: number;
  updatedAt?: string;
}

export type BudgetUsageStatus = 'safe' | 'near-limit' | 'exceeded';

export interface CategoryBudgetProgressItem {
  id: string;
  categoryId: string;
  categoryName: string;
  isArchived: boolean;
  monthlyLimit: number;
  spentAmount: number;
  remainingAmount: number;
  overAmount: number;
  usagePercent: number;
  status: BudgetUsageStatus;
  updatedAt: string;
}

export interface BudgetPeriodOverview {
  period: DateRangePeriod;
  items: CategoryBudgetProgressItem[];
  totalBudgetedLimit: number;
  totalBudgetedSpent: number;
  totalRemaining: number;
  exceededCount: number;
}

/**
 * Validates a `CategoryBudgetInput` against domain rules and optional category definitions.
 */
export function validateCategoryBudgetInput(
  input: Partial<CategoryBudgetInput> | null | undefined,
  categories?: readonly Category[],
  options?: { allowArchivedCategoryId?: string },
): ValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return {
      valid: false,
      errors: ['Data anggaran kategori tidak boleh kosong.'],
    };
  }

  const categoryId =
    typeof input.categoryId === 'string' ? input.categoryId.trim() : '';

  if (categoryId.length === 0) {
    errors.push('Kategori pengeluaran wajib dipilih untuk anggaran.');
  } else if (categories !== undefined) {
    const matched = categories.find((cat) => cat.id === categoryId);
    if (!matched) {
      errors.push('Kategori anggaran tidak ditemukan.');
    } else {
      if (matched.type !== 'expense') {
        errors.push(
          `Anggaran hanya dapat diatur untuk kategori pengeluaran (kategori "${matched.name}" adalah pemasukan).`,
        );
      }
      if (
        matched.archivedAt &&
        matched.id !== options?.allowArchivedCategoryId
      ) {
        errors.push(
          `Kategori "${matched.name}" sudah diarsipkan dan tidak dapat diberi anggaran baru.`,
        );
      }
    }
  }

  if (!isValidTransactionAmount(input.monthlyLimit)) {
    errors.push(
      'Batas anggaran bulanan harus berupa bilangan bulat Rupiah lebih besar dari 0.',
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Pure factory that creates a validated `CategoryBudget` record.
 */
export function createCategoryBudget(
  input: CategoryBudgetInput,
  categories?: readonly Category[],
  options?: { allowArchivedCategoryId?: string },
): CategoryBudget {
  const validation = validateCategoryBudgetInput(input, categories, options);
  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }

  const trimmedCategoryId = input.categoryId.trim();
  const id =
    typeof input.id === 'string' && input.id.trim().length > 0
      ? input.id.trim()
      : `budget-${trimmedCategoryId}`;
  const updatedAt = input.updatedAt ?? new Date().toISOString();

  return {
    id,
    categoryId: trimmedCategoryId,
    monthlyLimit: input.monthlyLimit,
    updatedAt,
  };
}

/**
 * Computes monthly budget progress for all configured category budgets within `period`.
 * Uses `calculateCategoryTotals` so category spending is never duplicated or double-counted.
 */
export function calculateBudgetOverview(
  budgets: readonly CategoryBudget[],
  transactions: readonly Transaction[],
  categories: readonly Category[],
  period: DateRangePeriod,
): BudgetPeriodOverview {
  const categoryLookup = new Map<string, Category>();
  for (const cat of categories) {
    categoryLookup.set(cat.id, cat);
  }

  const expenseTotals = calculateCategoryTotals(transactions, categories, {
    type: 'expense',
    period,
  });
  const spentByCategoryId = new Map<string, number>();
  for (const item of expenseTotals) {
    spentByCategoryId.set(item.categoryId, item.totalAmount);
  }

  let totalBudgetedLimit = 0;
  let totalBudgetedSpent = 0;
  let exceededCount = 0;

  const items: CategoryBudgetProgressItem[] = budgets.map((budget) => {
    if (!isValidTransactionAmount(budget.monthlyLimit)) {
      throw new RangeError(
        `Nominal batas anggaran untuk kategori "${budget.categoryId}" tidak valid.`,
      );
    }

    const category = categoryLookup.get(budget.categoryId);
    const spentAmount = spentByCategoryId.get(budget.categoryId) ?? 0;
    const diff = addIdr(budget.monthlyLimit, -spentAmount);
    const remainingAmount = diff > 0 ? diff : 0;
    const overAmount = diff < 0 ? Math.abs(diff) : 0;
    const usagePercent = Math.round((spentAmount / budget.monthlyLimit) * 100);

    let status: BudgetUsageStatus = 'safe';
    if (spentAmount > budget.monthlyLimit) {
      status = 'exceeded';
      exceededCount += 1;
    } else if (usagePercent >= 80) {
      status = 'near-limit';
    }

    totalBudgetedLimit = addIdr(totalBudgetedLimit, budget.monthlyLimit);
    totalBudgetedSpent = addIdr(totalBudgetedSpent, spentAmount);

    return {
      id: budget.id,
      categoryId: budget.categoryId,
      categoryName: category?.name ?? 'Kategori Tidak Dikenal',
      isArchived: Boolean(category?.archivedAt),
      monthlyLimit: budget.monthlyLimit,
      spentAmount,
      remainingAmount,
      overAmount,
      usagePercent,
      status,
      updatedAt: budget.updatedAt,
    };
  });

  // Sort by highest usage percentage first, then by category name in Indonesian
  items.sort((a, b) => {
    if (b.usagePercent !== a.usagePercent) {
      return b.usagePercent - a.usagePercent;
    }
    return a.categoryName.localeCompare(b.categoryName, 'id-ID');
  });

  const netRemaining = addIdr(totalBudgetedLimit, -totalBudgetedSpent);

  return {
    period,
    items,
    totalBudgetedLimit,
    totalBudgetedSpent,
    totalRemaining: netRemaining > 0 ? netRemaining : 0,
    exceededCount,
  };
}

