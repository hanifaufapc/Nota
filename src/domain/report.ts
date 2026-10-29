/**
 * Pure Mosque Financial Report Generator (`Laporan Kas Jumat / Mingguan`, `Laporan Bulanan`, `Rentang Tanggal Kustom`).
 *
 * Source of truth: PRD.md §5.5, §7.6 & ARCHITECTURE.md §3.4.
 *
 * Computes for any `DateRangePeriod`:
 * - `openingBalance` before `period.startDate`
 * - `periodIncome`, `periodExpense`, `periodNetCashFlow` within `[period.startDate, period.endDate]`
 * - `closingBalance` at `period.endDate`
 * - Per-Fund breakdown (`openingBalance`, `periodIncome`, `periodExpense`, `closingBalance`)
 * - Per-CashAccount breakdown (`openingBalance`, `periodIncome`, `periodExpense`, `transfersIn`, `transfersOut`, `closingBalance`)
 * - Category totals (`incomeCategoryRows`, `expenseCategoryRows`)
 * - Filtered period transactions
 */

import { isValidDateRangePeriod, type DateRangePeriod } from '../lib/date';
import { addIdr } from './money';
import {
  DEFAULT_CASH_ACCOUNT_TUNAI_ID,
  DEFAULT_FUND_OPERASIONAL_ID,
  type CashAccount,
  type CashAccountKind,
  type CashTransfer,
  type Fund,
  type FundRestriction,
} from './mosque';
import {
  calculateCategoryTotals,
  sortTransactions,
  type CategorySummaryItem,
} from './summaries';
import type { Category, Transaction } from './transaction';

export interface ReportFundRow {
  fundId: string;
  fundName: string;
  restriction: FundRestriction;
  openingBalance: number;
  periodIncome: number;
  periodExpense: number;
  closingBalance: number;
}

export interface ReportAccountRow {
  accountId: string;
  accountName: string;
  kind: CashAccountKind;
  openingBalance: number;
  periodIncome: number;
  periodExpense: number;
  periodTransfersIn: number;
  periodTransfersOut: number;
  closingBalance: number;
}

export interface MosqueFinancialReport {
  period: DateRangePeriod;
  filterFundId?: string;
  /** Balance before `period.startDate` */
  openingBalance: number;
  /** Total income within `[period.startDate, period.endDate]` */
  periodIncome: number;
  /** Total expense within `[period.startDate, period.endDate]` */
  periodExpense: number;
  /** `periodIncome - periodExpense` */
  periodNetCashFlow: number;
  /** `openingBalance + periodIncome - periodExpense` at `period.endDate` */
  closingBalance: number;
  /** Breakdown by Fund */
  fundRows: ReportFundRow[];
  /** Breakdown by CashAccount */
  accountRows: ReportAccountRow[];
  /** Income breakdown by Category within the period */
  incomeCategoryRows: CategorySummaryItem[];
  /** Expense breakdown by Category within the period */
  expenseCategoryRows: CategorySummaryItem[];
  /** Transactions within the period (sorted chronologically) */
  periodTransactions: Transaction[];
}

export function generateMosqueFinancialReport(params: {
  period: DateRangePeriod;
  accounts: readonly CashAccount[];
  funds: readonly Fund[];
  categories: readonly Category[];
  transactions: readonly Transaction[];
  transfers?: readonly CashTransfer[];
  filterFundId?: string;
}): MosqueFinancialReport {
  const {
    period,
    accounts,
    funds,
    categories,
    transactions,
    transfers = [],
    filterFundId,
  } = params;

  if (!isValidDateRangePeriod(period)) {
    throw new RangeError('Periode laporan tidak valid.');
  }

  const scopedFunds = filterFundId
    ? funds.filter((f) => f.id === filterFundId)
    : funds;

  const scopedTransactions = filterFundId
    ? transactions.filter(
        (tx) => (tx.fundId || DEFAULT_FUND_OPERASIONAL_ID) === filterFundId,
      )
    : transactions;

  // Partition transactions into:
  // 1) Prior to period (`occurredAt < period.startDate`)
  // 2) Within period (`period.startDate <= occurredAt <= period.endDate`)
  const priorTransactions = scopedTransactions.filter(
    (tx) => tx.occurredAt < period.startDate,
  );
  const inPeriodTransactions = scopedTransactions.filter(
    (tx) =>
      tx.occurredAt >= period.startDate && tx.occurredAt <= period.endDate,
  );

  // Per-Fund calculation
  const fundRows: ReportFundRow[] = scopedFunds.map((fund) => {
    let priorNet = 0;
    for (const tx of priorTransactions) {
      const fId = tx.fundId || DEFAULT_FUND_OPERASIONAL_ID;
      if (fId === fund.id) {
        priorNet = addIdr(
          priorNet,
          tx.type === 'income' ? tx.amount : -tx.amount,
        );
      }
    }

    const fundOpening = addIdr(fund.openingBalance, priorNet);

    let pIncome = 0;
    let pExpense = 0;
    for (const tx of inPeriodTransactions) {
      const fId = tx.fundId || DEFAULT_FUND_OPERASIONAL_ID;
      if (fId === fund.id) {
        if (tx.type === 'income') {
          pIncome = addIdr(pIncome, tx.amount);
        } else {
          pExpense = addIdr(pExpense, tx.amount);
        }
      }
    }

    const fundClosing = addIdr(addIdr(fundOpening, pIncome), -pExpense);

    return {
      fundId: fund.id,
      fundName: fund.name,
      restriction: fund.restriction,
      openingBalance: fundOpening,
      periodIncome: pIncome,
      periodExpense: pExpense,
      closingBalance: fundClosing,
    };
  });

  // Per-Account calculation (using all transactions & transfers when no fund filter, or scoped when filtered)
  const priorTransfers = transfers.filter(
    (tr) => tr.occurredAt < period.startDate,
  );
  const inPeriodTransfers = transfers.filter(
    (tr) =>
      tr.occurredAt >= period.startDate && tr.occurredAt <= period.endDate,
  );

  const accountRows: ReportAccountRow[] = accounts.map((acc) => {
    let priorNet = 0;
    for (const tx of priorTransactions) {
      const aId = tx.accountId || DEFAULT_CASH_ACCOUNT_TUNAI_ID;
      if (aId === acc.id) {
        priorNet = addIdr(
          priorNet,
          tx.type === 'income' ? tx.amount : -tx.amount,
        );
      }
    }

    if (!filterFundId) {
      for (const tr of priorTransfers) {
        if (tr.toAccountId === acc.id) {
          priorNet = addIdr(priorNet, tr.amount);
        }
        if (tr.fromAccountId === acc.id) {
          priorNet = addIdr(priorNet, -tr.amount);
        }
      }
    }

    const baseAccountOpening = filterFundId ? 0 : acc.openingBalance;
    const accOpening = addIdr(baseAccountOpening, priorNet);

    let pIncome = 0;
    let pExpense = 0;
    for (const tx of inPeriodTransactions) {
      const aId = tx.accountId || DEFAULT_CASH_ACCOUNT_TUNAI_ID;
      if (aId === acc.id) {
        if (tx.type === 'income') {
          pIncome = addIdr(pIncome, tx.amount);
        } else {
          pExpense = addIdr(pExpense, tx.amount);
        }
      }
    }

    let pTransfersIn = 0;
    let pTransfersOut = 0;
    if (!filterFundId) {
      for (const tr of inPeriodTransfers) {
        if (tr.toAccountId === acc.id) {
          pTransfersIn = addIdr(pTransfersIn, tr.amount);
        }
        if (tr.fromAccountId === acc.id) {
          pTransfersOut = addIdr(pTransfersOut, tr.amount);
        }
      }
    }

    const afterTx = addIdr(addIdr(accOpening, pIncome), -pExpense);
    const accClosing = addIdr(
      addIdr(afterTx, pTransfersIn),
      -pTransfersOut,
    );

    return {
      accountId: acc.id,
      accountName: acc.name,
      kind: acc.kind,
      openingBalance: accOpening,
      periodIncome: pIncome,
      periodExpense: pExpense,
      periodTransfersIn: pTransfersIn,
      periodTransfersOut: pTransfersOut,
      closingBalance: accClosing,
    };
  });

  // Top-level report totals derived from fundRows
  let openingBalance = 0;
  let periodIncome = 0;
  let periodExpense = 0;
  for (const row of fundRows) {
    openingBalance = addIdr(openingBalance, row.openingBalance);
    periodIncome = addIdr(periodIncome, row.periodIncome);
    periodExpense = addIdr(periodExpense, row.periodExpense);
  }
  const periodNetCashFlow = addIdr(periodIncome, -periodExpense);
  const closingBalance = addIdr(openingBalance, periodNetCashFlow);

  const incomeCategoryRows = calculateCategoryTotals(
    inPeriodTransactions,
    categories,
    { type: 'income' },
  );
  const expenseCategoryRows = calculateCategoryTotals(
    inPeriodTransactions,
    categories,
    { type: 'expense' },
  );

  const periodTransactions = sortTransactions(inPeriodTransactions, 'oldest');

  return {
    period,
    ...(filterFundId ? { filterFundId } : {}),
    openingBalance,
    periodIncome,
    periodExpense,
    periodNetCashFlow,
    closingBalance,
    fundRows,
    accountRows,
    incomeCategoryRows,
    expenseCategoryRows,
    periodTransactions,
  };
}

