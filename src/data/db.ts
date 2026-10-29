/**
 * Local IndexedDB Database Definition using Dexie.
 *
 * Source of truth: ARCHITECTURE.md §2 & PRD.md §6.
 * - Schema v5 adds Mosque Finance stores: `accounts`, `funds`, `cashTransfers`, and `budgetPlans`.
 * - Preserves v1–v4 stores (`transactions`, `categories`, `settings`, `budgets`, `savingsGoals`, `debtRecords`)
 *   and migrates existing v1–v4 records seamlessly without data loss.
 * - Presentation components must NOT import or query `NotaDatabase` directly;
 *   all data operations go through `src/data/repositories/`.
 */

import Dexie, { type Table } from 'dexie';
import type { CategoryBudget } from '../domain/budget';
import type { BudgetPlan } from '../domain/budgetPlan';
import type { DebtRecord } from '../domain/debtRecord';
import {
  DEFAULT_CASH_ACCOUNTS,
  DEFAULT_CASH_ACCOUNT_TUNAI_ID,
  DEFAULT_FUNDS,
  DEFAULT_FUND_OPERASIONAL_ID,
  type CashAccount,
  type CashTransfer,
  type Fund,
} from '../domain/mosque';
import type { SavingsGoal } from '../domain/savingsGoal';
import type {
  AppSettings,
  Category,
  Transaction,
} from '../domain/transaction';

export const NOTA_DB_NAME = 'nota_local_db';
export const NOTA_SCHEMA_VERSION = 5;
export const PRIMARY_SETTINGS_ID = 'app-settings';

export interface StoredAppSettings extends AppSettings {
  /** Singleton primary key (`'app-settings'`) in the `settings` store */
  id: string;
  /** ISO 8601 timestamp of last settings update */
  updatedAt: string;
}

export class NotaDatabase extends Dexie {
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  settings!: Table<StoredAppSettings, string>;
  accounts!: Table<CashAccount, string>;
  funds!: Table<Fund, string>;
  cashTransfers!: Table<CashTransfer, string>;
  budgetPlans!: Table<BudgetPlan, string>;
  budgets!: Table<CategoryBudget, string>;
  savingsGoals!: Table<SavingsGoal, string>;
  debtRecords!: Table<DebtRecord, string>;

  constructor(databaseName: string = NOTA_DB_NAME) {
    super(databaseName);

    // Schema v1: Core MVP stores
    this.version(1).stores({
      transactions: 'id, occurredAt, type, categoryId, createdAt',
      categories: 'id, type, isDefault',
      settings: 'id',
    });

    // Schema v2: Adds Monthly Category Budgets store
    this.version(2).stores({
      transactions: 'id, occurredAt, type, categoryId, createdAt',
      categories: 'id, type, isDefault',
      settings: 'id',
      budgets: 'id, &categoryId',
    });

    // Schema v3: Adds Savings Goals store
    this.version(3).stores({
      transactions: 'id, occurredAt, type, categoryId, createdAt',
      categories: 'id, type, isDefault',
      settings: 'id',
      budgets: 'id, &categoryId',
      savingsGoals: 'id, createdAt, targetDate',
    });

    // Schema v4: Adds Debt & Receivable Tracking store
    this.version(4).stores({
      transactions: 'id, occurredAt, type, categoryId, createdAt',
      categories: 'id, type, isDefault',
      settings: 'id',
      budgets: 'id, &categoryId',
      savingsGoals: 'id, createdAt, targetDate',
      debtRecords: 'id, direction, status, dueDate, createdAt',
    });

    // Schema v5: Mosque Finance stores (`accounts`, `funds`, `cashTransfers`, `budgetPlans`)
    this.version(NOTA_SCHEMA_VERSION)
      .stores({
        transactions:
          'id, occurredAt, type, accountId, fundId, categoryId, budgetPlanId, createdAt',
        categories: 'id, type, defaultFundId, isDefault',
        settings: 'id',
        accounts: 'id, kind, isDefault',
        funds: 'id, restriction, isDefault',
        cashTransfers: 'id, occurredAt, fromAccountId, toAccountId, createdAt',
        budgetPlans: 'id, kind, periodStart, periodEnd, fundId, createdAt',
        budgets: 'id, &categoryId',
        savingsGoals: 'id, createdAt, targetDate',
        debtRecords: 'id, direction, status, dueDate, createdAt',
      })
      .upgrade(async (tx) => {
        const settingsRow = await tx
          .table<StoredAppSettings, string>('settings')
          .get(PRIMARY_SETTINGS_ID);
        const legacyOpening = settingsRow?.openingBalance ?? 0;

        const existingAccountsCount = await tx
          .table<CashAccount, string>('accounts')
          .count();
        if (existingAccountsCount === 0) {
          const seededAccounts = DEFAULT_CASH_ACCOUNTS.map((acc) =>
            acc.id === DEFAULT_CASH_ACCOUNT_TUNAI_ID
              ? { ...acc, openingBalance: legacyOpening }
              : { ...acc },
          );
          await tx
            .table<CashAccount, string>('accounts')
            .bulkPut(seededAccounts);
        }

        const existingFundsCount = await tx
          .table<Fund, string>('funds')
          .count();
        if (existingFundsCount === 0) {
          const seededFunds = DEFAULT_FUNDS.map((fund) =>
            fund.id === DEFAULT_FUND_OPERASIONAL_ID
              ? { ...fund, openingBalance: legacyOpening }
              : { ...fund },
          );
          await tx.table<Fund, string>('funds').bulkPut(seededFunds);
        }

        await tx
          .table<Transaction, string>('transactions')
          .toCollection()
          .modify((record: Partial<Transaction>) => {
            if (!record.accountId) {
              record.accountId = DEFAULT_CASH_ACCOUNT_TUNAI_ID;
            }
            if (!record.fundId) {
              record.fundId = DEFAULT_FUND_OPERASIONAL_ID;
            }
          });
      });
  }
}

export const db = new NotaDatabase();
