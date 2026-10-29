/**
 * Pure Domain Module for Mosque Budgets & Activity RAB (`Anggaran Operasional Bulanan` & `RAB Kegiatan`).
 *
 * Source of truth: PRD.md §5.4, §6.7 & ARCHITECTURE.md §3.3.
 * - Supports both Monthly Operational Budgets (`monthly_operational`) and Event/Committee RAB (`activity_rab`).
 * - Each `BudgetPlan` contains multiple `BudgetLineItem`s (income or expense targets mapped to categories).
 * - Actual realization is computed purely from recorded `Transaction`s within `[periodStart, periodEnd]`
 *   (matching `budgetPlanId` if explicitly linked, or matching `categoryId` + `fundId` within the plan's period)
 *   without ever altering cash or fund balances.
 */

import { isDateWithinPeriod, isValidDateRangePeriod } from '../lib/date';
import { addIdr, isValidTransactionAmount } from './money';
import { DEFAULT_FUND_OPERASIONAL_ID } from './mosque';
import type {
  Category,
  Transaction,
  TransactionType,
} from './transaction';
import { isValidTransactionType, type ValidationResult } from './validation';

export type BudgetPlanKind = 'monthly_operational' | 'activity_rab';
export type BudgetItemStatus = 'safe' | 'near_limit' | 'exceeded';

export const MAX_BUDGET_PLAN_TITLE_LENGTH = 90;
export const MAX_BUDGET_PLAN_NOTE_LENGTH = 280;
export const MAX_BUDGET_LINE_DESC_LENGTH = 100;

export interface BudgetLineItem {
  id: string;
  type: TransactionType;
  categoryId: string;
  description: string;
  plannedAmount: number;
}

export interface BudgetLineItemInput {
  id?: string;
  type: TransactionType;
  categoryId: string;
  description: string;
  plannedAmount: number;
}

export interface BudgetPlan {
  id: string;
  title: string;
  kind: BudgetPlanKind;
  periodStart: string;
  periodEnd: string;
  fundId?: string;
  note?: string;
  items: BudgetLineItem[];
  createdAt: string;
  updatedAt: string;
}

export interface BudgetPlanInput {
  id?: string;
  title: string;
  kind: BudgetPlanKind;
  periodStart: string;
  periodEnd: string;
  fundId?: string;
  note?: string;
  items: BudgetLineItemInput[];
  createdAt?: string;
  updatedAt?: string;
}

export interface BudgetPlanPatch {
  title?: string;
  kind?: BudgetPlanKind;
  periodStart?: string;
  periodEnd?: string;
  fundId?: string;
  note?: string;
  items?: BudgetLineItemInput[];
}

export interface BudgetLineRealizationItem {
  id: string;
  type: TransactionType;
  categoryId: string;
  categoryName: string;
  description: string;
  plannedAmount: number;
  actualAmount: number;
  varianceAmount: number;
  usagePercent: number;
  status: BudgetItemStatus;
}

export interface BudgetPlanOverview {
  plan: BudgetPlan;
  totalPlannedIncome: number;
  totalActualIncome: number;
  totalPlannedExpense: number;
  totalActualExpense: number;
  remainingExpenseBudget: number;
  expenseUsagePercent: number;
  lineRealizations: BudgetLineRealizationItem[];
}

export function isValidBudgetPlanKind(
  value: unknown,
): value is BudgetPlanKind {
  return value === 'monthly_operational' || value === 'activity_rab';
}

export function validateBudgetPlanInput(
  input: Partial<BudgetPlanInput> | null | undefined,
  categories?: readonly Category[],
): ValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Data RAB / anggaran tidak boleh kosong.'] };
  }

  if (typeof input.title !== 'string' || input.title.trim().length === 0) {
    errors.push('Judul RAB / anggaran wajib diisi.');
  } else if (input.title.trim().length > MAX_BUDGET_PLAN_TITLE_LENGTH) {
    errors.push(
      `Judul RAB / anggaran maksimal ${MAX_BUDGET_PLAN_TITLE_LENGTH} karakter.`,
    );
  }

  if (!isValidBudgetPlanKind(input.kind)) {
    errors.push(
      'Jenis RAB harus berupa Anggaran Operasional Bulanan (monthly_operational) atau RAB Kegiatan (activity_rab).',
    );
  }

  if (
    !isValidDateRangePeriod({
      startDate: input.periodStart,
      endDate: input.periodEnd,
    })
  ) {
    errors.push(
      'Periode tanggal RAB tidak valid (pastikan format YYYY-MM-DD dan tanggal mulai <= tanggal selesai).',
    );
  }

  if (
    input.note !== undefined &&
    input.note.trim().length > MAX_BUDGET_PLAN_NOTE_LENGTH
  ) {
    errors.push(
      `Catatan RAB maksimal ${MAX_BUDGET_PLAN_NOTE_LENGTH} karakter.`,
    );
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    errors.push('Minimal harus ada 1 pos anggaran (baris item RAB).');
  } else {
    input.items.forEach((item, index) => {
      const rowLabel = `Pos RAB #${index + 1}`;
      if (!isValidTransactionType(item.type)) {
        errors.push(`${rowLabel}: Jenis pos harus berupa penerimaan atau pengeluaran.`);
      }
      if (
        typeof item.categoryId !== 'string' ||
        item.categoryId.trim().length === 0
      ) {
        errors.push(`${rowLabel}: Kategori wajib dipilih.`);
      } else if (categories) {
        const matchedCat = categories.find(
          (c) => c.id === item.categoryId.trim(),
        );
        if (!matchedCat) {
          errors.push(`${rowLabel}: Kategori tidak ditemukan.`);
        } else if (matchedCat.type !== item.type) {
          errors.push(
            `${rowLabel}: Kategori "${matchedCat.name}" tidak sesuai dengan jenis pos.`,
          );
        }
      }
      if (
        typeof item.description !== 'string' ||
        item.description.trim().length === 0
      ) {
        errors.push(`${rowLabel}: Uraian pos anggaran wajib diisi.`);
      } else if (
        item.description.trim().length > MAX_BUDGET_LINE_DESC_LENGTH
      ) {
        errors.push(
          `${rowLabel}: Uraian pos maksimal ${MAX_BUDGET_LINE_DESC_LENGTH} karakter.`,
        );
      }
      if (!isValidTransactionAmount(item.plannedAmount)) {
        errors.push(
          `${rowLabel}: Nominal rencana harus berupa bilangan bulat Rupiah lebih besar dari 0.`,
        );
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

export function createBudgetPlan(
  input: BudgetPlanInput,
  categories?: readonly Category[],
): BudgetPlan {
  const validation = validateBudgetPlanInput(input, categories);
  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }

  const nowIso = new Date().toISOString();
  const createdAt = input.createdAt ?? nowIso;
  const updatedAt = input.updatedAt ?? createdAt;

  const id =
    input.id && input.id.trim().length > 0
      ? input.id.trim()
      : `rab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const trimmedFundId = input.fundId?.trim();
  const trimmedNote = input.note?.trim();

  const items: BudgetLineItem[] = input.items.map((item, idx) => ({
    id:
      item.id && item.id.trim().length > 0
        ? item.id.trim()
        : `${id}-item-${idx + 1}`,
    type: item.type,
    categoryId: item.categoryId.trim(),
    description: item.description.trim(),
    plannedAmount: item.plannedAmount,
  }));

  return {
    id,
    title: input.title.trim(),
    kind: input.kind,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    ...(trimmedFundId ? { fundId: trimmedFundId } : {}),
    ...(trimmedNote ? { note: trimmedNote } : {}),
    items,
    createdAt,
    updatedAt,
  };
}

export function applyBudgetPlanEdit(
  existing: BudgetPlan,
  patch: BudgetPlanPatch,
  updatedAtIso: string = new Date().toISOString(),
  categories?: readonly Category[],
): BudgetPlan {
  const candidate: BudgetPlanInput = {
    id: existing.id,
    title: patch.title ?? existing.title,
    kind: patch.kind ?? existing.kind,
    periodStart: patch.periodStart ?? existing.periodStart,
    periodEnd: patch.periodEnd ?? existing.periodEnd,
    fundId: patch.fundId !== undefined ? patch.fundId : existing.fundId,
    note: patch.note !== undefined ? patch.note : existing.note,
    items: patch.items ?? existing.items,
    createdAt: existing.createdAt,
    updatedAt: updatedAtIso,
  };

  return createBudgetPlan(candidate, categories);
}

/**
 * Computes planned vs actual realization for a `BudgetPlan` against recorded transactions.
 */
export function calculateBudgetPlanOverview(
  plan: BudgetPlan,
  transactions: readonly Transaction[],
  categories: readonly Category[],
): BudgetPlanOverview {
  const categoryNameMap = new Map<string, string>();
  for (const cat of categories) {
    categoryNameMap.set(cat.id, cat.name);
  }

  const period = {
    startDate: plan.periodStart,
    endDate: plan.periodEnd,
  };

  // Transactions matching this RAB:
  // Either explicitly linked via `tx.budgetPlanId === plan.id`,
  // OR occurring within `[plan.periodStart, plan.periodEnd]` (and matching `plan.fundId` if specified on the plan).
  const relevantTransactions = transactions.filter((tx) => {
    if (tx.budgetPlanId) {
      return tx.budgetPlanId === plan.id;
    }
    if (!isDateWithinPeriod(tx.occurredAt, period)) {
      return false;
    }
    if (
      plan.fundId &&
      (tx.fundId || DEFAULT_FUND_OPERASIONAL_ID) !== plan.fundId
    ) {
      return false;
    }
    return true;
  });

  // Sum actuals per (type, categoryId)
  const actualByTypeAndCat = new Map<string, number>();
  for (const tx of relevantTransactions) {
    const key = `${tx.type}:${tx.categoryId}`;
    const prev = actualByTypeAndCat.get(key) ?? 0;
    actualByTypeAndCat.set(key, addIdr(prev, tx.amount));
  }

  // Also count how many line items share the same (type, categoryId) so we don't double-attribute
  // if a plan has one line per category (standard) or multiple lines per category.
  const consumedCategoryKeys = new Set<string>();

  let totalPlannedIncome = 0;
  let totalActualIncome = 0;
  let totalPlannedExpense = 0;
  let totalActualExpense = 0;

  const lineRealizations: BudgetLineRealizationItem[] = plan.items.map(
    (item) => {
      const key = `${item.type}:${item.categoryId}`;
      const actualAmount = consumedCategoryKeys.has(key)
        ? 0
        : actualByTypeAndCat.get(key) ?? 0;
      consumedCategoryKeys.add(key);

      if (item.type === 'income') {
        totalPlannedIncome = addIdr(totalPlannedIncome, item.plannedAmount);
        totalActualIncome = addIdr(totalActualIncome, actualAmount);
      } else {
        totalPlannedExpense = addIdr(totalPlannedExpense, item.plannedAmount);
        totalActualExpense = addIdr(totalActualExpense, actualAmount);
      }

      const varianceAmount = addIdr(item.plannedAmount, -actualAmount);
      const usagePercent =
        item.plannedAmount > 0
          ? Math.round((actualAmount / item.plannedAmount) * 100)
          : 0;

      const status: BudgetItemStatus =
        actualAmount > item.plannedAmount
          ? 'exceeded'
          : usagePercent >= 80
            ? 'near_limit'
            : 'safe';

      return {
        id: item.id,
        type: item.type,
        categoryId: item.categoryId,
        categoryName:
          categoryNameMap.get(item.categoryId) ?? 'Kategori Tidak Dikenal',
        description: item.description,
        plannedAmount: item.plannedAmount,
        actualAmount,
        varianceAmount,
        usagePercent,
        status,
      };
    },
  );

  const remainingExpenseBudget = addIdr(
    totalPlannedExpense,
    -totalActualExpense,
  );
  const expenseUsagePercent =
    totalPlannedExpense > 0
      ? Math.round((totalActualExpense / totalPlannedExpense) * 100)
      : 0;

  return {
    plan,
    totalPlannedIncome,
    totalActualIncome,
    totalPlannedExpense,
    totalActualExpense,
    remainingExpenseBudget,
    expenseUsagePercent,
    lineRealizations,
  };
}

