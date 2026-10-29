/**
 * Repository & Data-Access Layer for Nota's Local IndexedDB Storage (Schema v5).
 *
 * Source of truth: ARCHITECTURE.md §3, §4 & PRD.md §5, §6, §7.
 *
 * Responsibilities:
 * - Encapsulate all Dexie/IndexedDB reads and writes behind a clean, testable API.
 * - Seed only `DEFAULT_CASH_ACCOUNTS`, `DEFAULT_FUNDS`, `DEFAULT_CATEGORIES`, and `DEFAULT_APP_SETTINGS` on initialization (never fake transactions).
 * - Delegate all validation and financial calculations to the tested domain functions in `src/domain/`.
 * - Surface storage read/write failures via explicit `NotaStorageError` so the UI never pretends failed writes succeeded.
 */

import { type DateRangePeriod, getCurrentMonthPeriod } from '../../lib/date';
import {
  type CategoryBudget,
  type CategoryBudgetInput,
  createCategoryBudget,
} from '../../domain/budget';
import {
  type BudgetPlan,
  type BudgetPlanInput,
  type BudgetPlanPatch,
  applyBudgetPlanEdit,
  createBudgetPlan,
} from '../../domain/budgetPlan';
import {
  type DebtRecord,
  type DebtRecordInput,
  type DebtRecordPatch,
  applyDebtRecordEdit,
  createDebtRecord,
  settleDebtRecord,
} from '../../domain/debtRecord';
import {
  DEFAULT_CASH_ACCOUNTS,
  DEFAULT_CASH_ACCOUNT_TUNAI_ID,
  DEFAULT_FUNDS,
  DEFAULT_FUND_OPERASIONAL_ID,
  type CashAccount,
  type CashAccountInput,
  type CashAccountPatch,
  type CashTransfer,
  type CashTransferInput,
  type Fund,
  type FundInput,
  type FundPatch,
  type MosqueBalanceSplit,
  applyCashAccountEdit,
  applyFundEdit,
  archiveCashAccount,
  archiveFund,
  calculateMosqueBalanceSplit,
  createCashAccount,
  createCashTransfer,
  createFund,
} from '../../domain/mosque';
import {
  type SavingsGoal,
  type SavingsGoalInput,
  type SavingsGoalPatch,
  applySavingsGoalEdit,
  createSavingsGoal,
} from '../../domain/savingsGoal';
import {
  type OverviewSnapshot,
  calculateOverviewSnapshot,
  sortTransactions,
} from '../../domain/summaries';
import {
  type AppSettings,
  type Category,
  type CategoryInput,
  DEFAULT_APP_SETTINGS,
  DEFAULT_CATEGORIES,
  type Transaction,
  type TransactionDraft,
  type TransactionPatch,
  applyTransactionEdit,
  archiveCategory,
  createCategory,
  createTransaction,
  renameCategory,
} from '../../domain/transaction';
import { validateAppSettings } from '../../domain/validation';
import {
  type NotaBackupPayload,
  type NotaBackupPreview,
  createBackupPayload,
  parseAndValidateBackupJson,
  validateBackupObject,
} from '../backup/notaBackup';
import {
  NotaDatabase,
  PRIMARY_SETTINGS_ID,
  type StoredAppSettings,
  db as defaultDb,
} from '../db';

export class NotaStorageError extends Error {
  readonly causeError?: unknown;

  constructor(message: string, causeError?: unknown) {
    super(message);
    this.name = 'NotaStorageError';
    this.causeError = causeError;
  }
}

export interface MosqueProfileInput {
  mosqueName: string;
  mosqueAddress?: string;
  chairpersonName?: string;
  treasurerName?: string;
}

export interface InitialMosqueSetupInput {
  mosqueName?: string;
  mosqueAddress?: string;
  chairpersonName?: string;
  treasurerName?: string;
  accountOpeningBalances?: Record<string, number>;
  fundOpeningBalances?: Record<string, number>;
  completeOnboarding?: boolean;
  nowIso?: string;
}

export interface LocalWorkspaceState {
  settings: AppSettings;
  accounts: CashAccount[];
  funds: Fund[];
  categories: Category[];
  transactions: Transaction[];
  cashTransfers: CashTransfer[];
  budgetPlans: BudgetPlan[];
  budgets: CategoryBudget[];
  savingsGoals: SavingsGoal[];
  debtRecords: DebtRecord[];
  overview: OverviewSnapshot;
  mosqueBalanceSplit: MosqueBalanceSplit;
}

export interface NotaRepository {
  /** Ensures default settings, default CashAccounts, default Funds, and default Indonesian categories exist in IndexedDB (never seeds fake transactions). */
  initialize(): Promise<{
    settings: AppSettings;
    accounts: CashAccount[];
    funds: Fund[];
    categories: Category[];
  }>;
  /** Reads the current `AppSettings` (initializing defaults if empty). */
  getSettings(): Promise<AppSettings>;
  /** Completes first-run setup or updates the opening balance in integer IDR (`>= 0`). Never creates a transaction. */
  saveOpeningBalance(
    openingBalance: number,
    options?: { completeOnboarding?: boolean; nowIso?: string },
  ): Promise<AppSettings>;
  /** Updates Mosque profile metadata (`mosqueName`, `mosqueAddress`, `chairpersonName`, `treasurerName`). */
  saveMosqueProfile(
    profile: MosqueProfileInput,
    nowIso?: string,
  ): Promise<AppSettings>;
  /** Completes first-run Mosque onboarding or updates initial Mosque profile + Account/Fund opening balances atomically. */
  saveInitialSetup(input: InitialMosqueSetupInput): Promise<AppSettings>;
  /** Returns all CashAccounts (`Kas Tunai`, `Rekening Bank Tercatat`, plus custom accounts). */
  getAccounts(): Promise<CashAccount[]>;
  /** Adds a new CashAccount after domain validation. */
  addAccount(input: CashAccountInput): Promise<CashAccount>;
  /** Updates an existing CashAccount in-place and syncs `settings.openingBalance`. */
  updateAccount(
    accountId: string,
    patch: CashAccountPatch,
  ): Promise<CashAccount>;
  /** Archives a CashAccount without deleting it so historical transactions retain its name. */
  archiveAccountById(
    accountId: string,
    archivedAtIso?: string,
  ): Promise<CashAccount>;
  /** Returns all Mosque Funds (`Dana Operasional Umum`, `Dana Pembangunan`, `Dana Sosial / Zakat`, plus custom funds). */
  getFunds(): Promise<Fund[]>;
  /** Adds a new Mosque Fund after domain validation. */
  addFund(input: FundInput): Promise<Fund>;
  /** Updates an existing Mosque Fund in-place. */
  updateFund(fundId: string, patch: FundPatch): Promise<Fund>;
  /** Archives a Mosque Fund without deleting it so historical transactions retain its name. */
  archiveFundById(fundId: string, archivedAtIso?: string): Promise<Fund>;
  /** Returns all internal CashTransfers sorted newest-first. */
  getCashTransfers(): Promise<CashTransfer[]>;
  /** Records a new internal CashTransfer between two CashAccounts without altering Fund balances or period income/expense. */
  addCashTransfer(input: CashTransferInput): Promise<CashTransfer>;
  /** Deletes an internal CashTransfer by ID. */
  deleteCashTransfer(transferId: string): Promise<void>;
  /** Returns all stored Mosque RAB / BudgetPlans sorted newest-first. */
  getBudgetPlans(): Promise<BudgetPlan[]>;
  /** Creates a new Mosque RAB / BudgetPlan (`monthly_operational` or `activity_rab`). */
  addBudgetPlan(input: BudgetPlanInput): Promise<BudgetPlan>;
  /** Updates an existing Mosque RAB / BudgetPlan in-place. */
  updateBudgetPlan(
    planId: string,
    patch: BudgetPlanPatch,
    updatedAtIso?: string,
  ): Promise<BudgetPlan>;
  /** Deletes a Mosque RAB / BudgetPlan by ID. */
  deleteBudgetPlan(planId: string): Promise<void>;
  /** Returns all categories (both default and custom, including archived for historical lookups). */
  getCategories(): Promise<Category[]>;
  /** Adds a new custom category after domain validation. */
  addCategory(input: CategoryInput): Promise<Category>;
  /** Renames an existing category while preserving its ID for historical transactions. */
  updateCategoryName(categoryId: string, newName: string): Promise<Category>;
  /** Archives a category without deleting it so existing transactions retain its name. */
  archiveCategoryById(
    categoryId: string,
    archivedAtIso?: string,
  ): Promise<Category>;
  /** Returns all stored transactions sorted newest-first. */
  getTransactions(): Promise<Transaction[]>;
  /** Persists a new validated transaction (`income` or `expense`). */
  addTransaction(draft: TransactionDraft): Promise<Transaction>;
  /** Updates an existing transaction in-place without duplicating records. */
  updateTransaction(
    transactionId: string,
    patch: TransactionPatch,
    updatedAtIso?: string,
  ): Promise<Transaction>;
  /** Deletes a transaction by ID. */
  deleteTransaction(transactionId: string): Promise<void>;
  /** Returns all configured monthly category budgets. */
  getBudgets(): Promise<CategoryBudget[]>;
  /** Creates or updates a monthly budget limit (`> 0` IDR) for an expense category. Never creates a transaction or alters balance. */
  saveCategoryBudget(input: CategoryBudgetInput): Promise<CategoryBudget>;
  /** Deletes a monthly category budget by `categoryId`. */
  deleteCategoryBudget(categoryId: string): Promise<void>;
  /** Returns all configured savings goals sorted newest-first. */
  getSavingsGoals(): Promise<SavingsGoal[]>;
  /** Creates a new savings goal (`targetAmount > 0`, `allocatedAmount >= 0`). Never creates a transaction or alters balance. */
  addSavingsGoal(input: SavingsGoalInput): Promise<SavingsGoal>;
  /** Updates an existing savings goal in-place. Never creates a transaction or alters balance. */
  updateSavingsGoal(
    goalId: string,
    patch: SavingsGoalPatch,
    updatedAtIso?: string,
  ): Promise<SavingsGoal>;
  /** Deletes a savings goal by ID. */
  deleteSavingsGoal(goalId: string): Promise<void>;
  /** Returns all stored debt and receivable records sorted newest-first. */
  getDebtRecords(): Promise<DebtRecord[]>;
  /** Creates a new debt/receivable record (`payable` or `receivable`). Never alters cash balance. */
  addDebtRecord(input: DebtRecordInput): Promise<DebtRecord>;
  /** Updates an existing debt/receivable record in-place. Never alters cash balance. */
  updateDebtRecord(
    debtId: string,
    patch: DebtRecordPatch,
    updatedAtIso?: string,
  ): Promise<DebtRecord>;
  /** Marks a debt/receivable record as settled (`remainingAmount = 0`, `status = 'settled'`). */
  settleDebtRecordById(
    debtId: string,
    updatedAtIso?: string,
  ): Promise<DebtRecord>;
  /** Deletes a debt/receivable record by ID. */
  deleteDebtRecord(debtId: string): Promise<void>;
  /** Loads settings, accounts, funds, categories, transactions, cashTransfers, budgetPlans, budgets, savingsGoals, debtRecords, `OverviewSnapshot`, and `MosqueBalanceSplit` for a period. */
  loadWorkspaceState(period?: DateRangePeriod): Promise<LocalWorkspaceState>;
  /** Exports all persisted local records into a versioned `NotaBackupPayload` (`schemaVersion: 5`). */
  exportBackup(exportedAt?: string): Promise<NotaBackupPayload>;
  /** Validates a backup JSON string or object and atomically replaces local data inside a single transaction. */
  restoreBackup(rawJsonOrPayload: string | unknown): Promise<NotaBackupPreview>;
}

function toDomainSettings(stored: StoredAppSettings): AppSettings {
  return {
    openingBalance: stored.openingBalance,
    currency: stored.currency,
    onboardingCompleted: stored.onboardingCompleted,
    ...(stored.mosqueName !== undefined
      ? { mosqueName: stored.mosqueName }
      : {}),
    ...(stored.mosqueAddress !== undefined
      ? { mosqueAddress: stored.mosqueAddress }
      : {}),
    ...(stored.chairpersonName !== undefined
      ? { chairpersonName: stored.chairpersonName }
      : {}),
    ...(stored.treasurerName !== undefined
      ? { treasurerName: stored.treasurerName }
      : {}),
  };
}

export function createNotaRepository(
  database: NotaDatabase = defaultDb,
): NotaRepository {
  async function syncSettingsOpeningBalanceFromAccounts(
    nowIso: string = new Date().toISOString(),
  ): Promise<StoredAppSettings> {
    const allAccounts = await database.accounts.toArray();
    const totalAccountOpening = allAccounts.reduce(
      (sum, acc) => sum + acc.openingBalance,
      0,
    );
    const existingSettings = await database.settings.get(PRIMARY_SETTINGS_ID);
    const updatedRecord: StoredAppSettings = {
      id: PRIMARY_SETTINGS_ID,
      openingBalance: totalAccountOpening,
      currency: 'IDR',
      onboardingCompleted: existingSettings?.onboardingCompleted ?? true,
      ...(existingSettings?.mosqueName !== undefined
        ? { mosqueName: existingSettings.mosqueName }
        : {}),
      ...(existingSettings?.mosqueAddress !== undefined
        ? { mosqueAddress: existingSettings.mosqueAddress }
        : {}),
      ...(existingSettings?.chairpersonName !== undefined
        ? { chairpersonName: existingSettings.chairpersonName }
        : {}),
      ...(existingSettings?.treasurerName !== undefined
        ? { treasurerName: existingSettings.treasurerName }
        : {}),
      updatedAt: nowIso,
    };
    await database.settings.put(updatedRecord);
    return updatedRecord;
  }

  async function initialize(): Promise<{
    settings: AppSettings;
    accounts: CashAccount[];
    funds: Fund[];
    categories: Category[];
  }> {
    try {
      return await database.transaction(
        'rw',
        [
          database.settings,
          database.accounts,
          database.funds,
          database.categories,
        ],
        async () => {
          let storedSettings = await database.settings.get(PRIMARY_SETTINGS_ID);

          if (!storedSettings) {
            storedSettings = {
              id: PRIMARY_SETTINGS_ID,
              ...DEFAULT_APP_SETTINGS,
              updatedAt: new Date().toISOString(),
            };
            await database.settings.put(storedSettings);
          } else {
            const validation = validateAppSettings(storedSettings);
            if (!validation.valid) {
              throw new NotaStorageError(
                `Data pengaturan lokal tidak valid: ${validation.errors[0]}`,
              );
            }
          }

          // Seed or merge default CashAccounts
          const existingAccounts = await database.accounts.toArray();
          let allAccounts: CashAccount[];
          if (existingAccounts.length === 0) {
            const seedAccounts: CashAccount[] = DEFAULT_CASH_ACCOUNTS.map(
              (acc) => ({
                ...acc,
                openingBalance:
                  acc.id === DEFAULT_CASH_ACCOUNT_TUNAI_ID
                    ? storedSettings.openingBalance
                    : 0,
              }),
            );
            await database.accounts.bulkPut(seedAccounts);
            allAccounts = seedAccounts;
          } else {
            const existingAccountIds = new Set(
              existingAccounts.map((a) => a.id),
            );
            const missingAccounts = DEFAULT_CASH_ACCOUNTS.filter(
              (a) => !existingAccountIds.has(a.id),
            ).map((a) => ({ ...a }));
            if (missingAccounts.length > 0) {
              await database.accounts.bulkPut(missingAccounts);
              allAccounts = await database.accounts.toArray();
            } else {
              allAccounts = existingAccounts;
            }
          }

          // Seed or merge default Mosque Funds
          const existingFunds = await database.funds.toArray();
          let allFunds: Fund[];
          if (existingFunds.length === 0) {
            const seedFunds: Fund[] = DEFAULT_FUNDS.map((fund) => ({
              ...fund,
              openingBalance:
                fund.id === DEFAULT_FUND_OPERASIONAL_ID
                  ? storedSettings.openingBalance
                  : 0,
            }));
            await database.funds.bulkPut(seedFunds);
            allFunds = seedFunds;
          } else {
            const existingFundIds = new Set(existingFunds.map((f) => f.id));
            const missingFunds = DEFAULT_FUNDS.filter(
              (f) => !existingFundIds.has(f.id),
            ).map((f) => ({ ...f }));
            if (missingFunds.length > 0) {
              await database.funds.bulkPut(missingFunds);
              allFunds = await database.funds.toArray();
            } else {
              allFunds = existingFunds;
            }
          }

          // Seed or merge default Categories
          const existingCategories = await database.categories.toArray();
          let allCategories: Category[];
          if (existingCategories.length === 0) {
            const seedCategories: Category[] = DEFAULT_CATEGORIES.map((cat) => ({
              ...cat,
            }));
            await database.categories.bulkPut(seedCategories);
            allCategories = seedCategories;
          } else {
            const existingIds = new Set(existingCategories.map((c) => c.id));
            const missingDefaults = DEFAULT_CATEGORIES.filter(
              (c) => !existingIds.has(c.id),
            ).map((c) => ({ ...c }));

            if (missingDefaults.length > 0) {
              await database.categories.bulkPut(missingDefaults);
              allCategories = await database.categories.toArray();
            } else {
              allCategories = existingCategories;
            }
          }

          return {
            settings: toDomainSettings(storedSettings),
            accounts: allAccounts,
            funds: allFunds,
            categories: allCategories,
          };
        },
      );
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal menyiapkan penyimpanan lokal di browser. Pastikan penyimpanan situs (IndexedDB) tidak diblokir.',
        error,
      );
    }
  }

  async function getSettings(): Promise<AppSettings> {
    try {
      const stored = await database.settings.get(PRIMARY_SETTINGS_ID);
      if (!stored) {
        const initialized = await initialize();
        return initialized.settings;
      }
      const validation = validateAppSettings(stored);
      if (!validation.valid) {
        throw new NotaStorageError(
          `Data pengaturan lokal tidak valid: ${validation.errors[0]}`,
        );
      }
      return toDomainSettings(stored);
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal membaca pengaturan dari penyimpanan lokal.',
        error,
      );
    }
  }

  async function saveOpeningBalance(
    openingBalance: number,
    options?: { completeOnboarding?: boolean; nowIso?: string },
  ): Promise<AppSettings> {
    const candidateSettings: AppSettings = {
      openingBalance,
      currency: 'IDR',
      onboardingCompleted: options?.completeOnboarding ?? true,
    };

    const validation = validateAppSettings(candidateSettings);
    if (!validation.valid) {
      throw new NotaStorageError(validation.errors[0]);
    }

    try {
      return await database.transaction(
        'rw',
        [
          database.settings,
          database.accounts,
          database.funds,
          database.categories,
        ],
        async () => {
          await initialize();
          const existing = await database.settings.get(PRIMARY_SETTINGS_ID);
          const nowIso = options?.nowIso ?? new Date().toISOString();

          // Keep Kas Tunai & Dana Operasional Umum opening balances in sync
          // when other accounts/funds have 0 opening balance
          const accounts = await database.accounts.toArray();
          const otherAccountsOpening = accounts
            .filter((a) => a.id !== DEFAULT_CASH_ACCOUNT_TUNAI_ID)
            .reduce((sum, a) => sum + a.openingBalance, 0);
          const kasTunai = accounts.find(
            (a) => a.id === DEFAULT_CASH_ACCOUNT_TUNAI_ID,
          );
          if (kasTunai) {
            const nextKasTunaiOpening = Math.max(
              0,
              openingBalance - otherAccountsOpening,
            );
            await database.accounts.put({
              ...kasTunai,
              openingBalance: nextKasTunaiOpening,
            });
          }

          const funds = await database.funds.toArray();
          const otherFundsOpening = funds
            .filter((f) => f.id !== DEFAULT_FUND_OPERASIONAL_ID)
            .reduce((sum, f) => sum + f.openingBalance, 0);
          const danaOperasional = funds.find(
            (f) => f.id === DEFAULT_FUND_OPERASIONAL_ID,
          );
          if (danaOperasional) {
            const nextOperasionalOpening = Math.max(
              0,
              openingBalance - otherFundsOpening,
            );
            await database.funds.put({
              ...danaOperasional,
              openingBalance: nextOperasionalOpening,
            });
          }

          const updatedRecord: StoredAppSettings = {
            id: PRIMARY_SETTINGS_ID,
            openingBalance,
            currency: 'IDR',
            onboardingCompleted: options?.completeOnboarding ?? true,
            ...(existing?.mosqueName !== undefined
              ? { mosqueName: existing.mosqueName }
              : {}),
            ...(existing?.mosqueAddress !== undefined
              ? { mosqueAddress: existing.mosqueAddress }
              : {}),
            ...(existing?.chairpersonName !== undefined
              ? { chairpersonName: existing.chairpersonName }
              : {}),
            ...(existing?.treasurerName !== undefined
              ? { treasurerName: existing.treasurerName }
              : {}),
            updatedAt: nowIso,
          };
          await database.settings.put(updatedRecord);
          return toDomainSettings(updatedRecord);
        },
      );
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal menyimpan saldo awal ke penyimpanan lokal perangkat.',
        error,
      );
    }
  }

  async function saveMosqueProfile(
    profile: MosqueProfileInput,
    nowIso: string = new Date().toISOString(),
  ): Promise<AppSettings> {
    try {
      return await database.transaction(
        'rw',
        [
          database.settings,
          database.accounts,
          database.funds,
          database.categories,
        ],
        async () => {
          const { settings } = await initialize();
          const trimmedMosqueName = profile.mosqueName.trim();
          if (!trimmedMosqueName) {
            throw new NotaStorageError('Nama masjid wajib diisi.');
          }

          const candidate: AppSettings = {
            ...settings,
            mosqueName: trimmedMosqueName,
            mosqueAddress: profile.mosqueAddress?.trim() ?? '',
            chairpersonName: profile.chairpersonName?.trim() ?? '',
            treasurerName: profile.treasurerName?.trim() ?? '',
          };

          const validation = validateAppSettings(candidate);
          if (!validation.valid) {
            throw new NotaStorageError(validation.errors[0]);
          }

          const updatedRecord: StoredAppSettings = {
            id: PRIMARY_SETTINGS_ID,
            ...candidate,
            updatedAt: nowIso,
          };
          await database.settings.put(updatedRecord);
          return toDomainSettings(updatedRecord);
        },
      );
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal menyimpan profil masjid ke penyimpanan lokal.',
        error,
      );
    }
  }

  async function saveInitialSetup(
    input: InitialMosqueSetupInput,
  ): Promise<AppSettings> {
    try {
      return await database.transaction(
        'rw',
        [
          database.settings,
          database.accounts,
          database.funds,
          database.categories,
        ],
        async () => {
          const { settings, accounts, funds } = await initialize();
          const nowIso = input.nowIso ?? new Date().toISOString();

          if (input.accountOpeningBalances) {
            for (const acc of accounts) {
              const nextBalance = input.accountOpeningBalances[acc.id];
              if (nextBalance !== undefined) {
                const updatedAcc = applyCashAccountEdit(acc, {
                  openingBalance: nextBalance,
                });
                await database.accounts.put(updatedAcc);
              }
            }
          }

          if (input.fundOpeningBalances) {
            for (const fund of funds) {
              const nextBalance = input.fundOpeningBalances[fund.id];
              if (nextBalance !== undefined) {
                const updatedFund = applyFundEdit(fund, {
                  openingBalance: nextBalance,
                });
                await database.funds.put(updatedFund);
              }
            }
          }

          const refreshedAccounts = await database.accounts.toArray();
          const totalAccountOpening = refreshedAccounts.reduce(
            (sum, acc) => sum + acc.openingBalance,
            0,
          );

          const candidate: AppSettings = {
            openingBalance: totalAccountOpening,
            currency: 'IDR',
            onboardingCompleted: input.completeOnboarding ?? true,
            ...(input.mosqueName !== undefined && input.mosqueName.trim()
              ? { mosqueName: input.mosqueName.trim() }
              : settings.mosqueName !== undefined
                ? { mosqueName: settings.mosqueName }
                : {}),
            ...(input.mosqueAddress !== undefined && input.mosqueAddress.trim()
              ? { mosqueAddress: input.mosqueAddress.trim() }
              : settings.mosqueAddress !== undefined
                ? { mosqueAddress: settings.mosqueAddress }
                : {}),
            ...(input.chairpersonName !== undefined &&
            input.chairpersonName.trim()
              ? { chairpersonName: input.chairpersonName.trim() }
              : settings.chairpersonName !== undefined
                ? { chairpersonName: settings.chairpersonName }
                : {}),
            ...(input.treasurerName !== undefined && input.treasurerName.trim()
              ? { treasurerName: input.treasurerName.trim() }
              : settings.treasurerName !== undefined
                ? { treasurerName: settings.treasurerName }
                : {}),
          };

          const validation = validateAppSettings(candidate);
          if (!validation.valid) {
            throw new NotaStorageError(validation.errors[0]);
          }

          const updatedRecord: StoredAppSettings = {
            id: PRIMARY_SETTINGS_ID,
            ...candidate,
            updatedAt: nowIso,
          };
          await database.settings.put(updatedRecord);
          return toDomainSettings(updatedRecord);
        },
      );
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new NotaStorageError(error.message, error);
      }
      throw new NotaStorageError(
        'Gagal menyimpan pengaturan awal masjid ke penyimpanan lokal.',
        error,
      );
    }
  }

  async function getAccounts(): Promise<CashAccount[]> {
    try {
      const existing = await database.accounts.toArray();
      if (existing.length === 0) {
        const initialized = await initialize();
        return initialized.accounts;
      }
      return existing;
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal memuat daftar lokasi kas dari penyimpanan lokal.',
        error,
      );
    }
  }

  async function addAccount(input: CashAccountInput): Promise<CashAccount> {
    let account: CashAccount;
    try {
      account = createCashAccount(input);
    } catch (validationError) {
      throw new NotaStorageError(
        validationError instanceof Error
          ? validationError.message
          : 'Data lokasi kas tidak valid.',
        validationError,
      );
    }

    try {
      return await database.transaction(
        'rw',
        [database.settings, database.accounts],
        async () => {
          const existing = await database.accounts.get(account.id);
          if (existing) {
            throw new NotaStorageError(
              `Lokasi kas dengan ID "${account.id}" sudah terdaftar.`,
            );
          }
          await database.accounts.add(account);
          await syncSettingsOpeningBalanceFromAccounts();
          return account;
        },
      );
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal menyimpan lokasi kas baru ke penyimpanan lokal.',
        error,
      );
    }
  }

  async function updateAccount(
    accountId: string,
    patch: CashAccountPatch,
  ): Promise<CashAccount> {
    const trimmedId = typeof accountId === 'string' ? accountId.trim() : '';
    try {
      return await database.transaction(
        'rw',
        [database.settings, database.accounts],
        async () => {
          const existing = await database.accounts.get(trimmedId);
          if (!existing) {
            throw new NotaStorageError(
              `Lokasi kas dengan ID "${trimmedId}" tidak ditemukan.`,
            );
          }
          const updated = applyCashAccountEdit(existing, patch);
          await database.accounts.put(updated);
          await syncSettingsOpeningBalanceFromAccounts();
          return updated;
        },
      );
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new NotaStorageError(error.message, error);
      }
      throw new NotaStorageError(
        'Gagal memperbarui lokasi kas di penyimpanan lokal.',
        error,
      );
    }
  }

  async function archiveAccountById(
    accountId: string,
    archivedAtIso?: string,
  ): Promise<CashAccount> {
    const trimmedId = typeof accountId === 'string' ? accountId.trim() : '';
    try {
      return await database.transaction('rw', database.accounts, async () => {
        const existing = await database.accounts.get(trimmedId);
        if (!existing) {
          throw new NotaStorageError(
            `Lokasi kas dengan ID "${trimmedId}" tidak ditemukan.`,
          );
        }
        const archived = archiveCashAccount(existing, archivedAtIso);
        await database.accounts.put(archived);
        return archived;
      });
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal mengarsipkan lokasi kas di penyimpanan lokal.',
        error,
      );
    }
  }

  async function getFunds(): Promise<Fund[]> {
    try {
      const existing = await database.funds.toArray();
      if (existing.length === 0) {
        const initialized = await initialize();
        return initialized.funds;
      }
      return existing;
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal memuat daftar dana masjid dari penyimpanan lokal.',
        error,
      );
    }
  }

  async function addFund(input: FundInput): Promise<Fund> {
    let fund: Fund;
    try {
      fund = createFund(input);
    } catch (validationError) {
      throw new NotaStorageError(
        validationError instanceof Error
          ? validationError.message
          : 'Data dana masjid tidak valid.',
        validationError,
      );
    }

    try {
      return await database.transaction('rw', database.funds, async () => {
        const existing = await database.funds.get(fund.id);
        if (existing) {
          throw new NotaStorageError(
            `Dana masjid dengan ID "${fund.id}" sudah terdaftar.`,
          );
        }
        await database.funds.add(fund);
        return fund;
      });
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal menyimpan dana masjid baru ke penyimpanan lokal.',
        error,
      );
    }
  }

  async function updateFund(fundId: string, patch: FundPatch): Promise<Fund> {
    const trimmedId = typeof fundId === 'string' ? fundId.trim() : '';
    try {
      return await database.transaction('rw', database.funds, async () => {
        const existing = await database.funds.get(trimmedId);
        if (!existing) {
          throw new NotaStorageError(
            `Dana masjid dengan ID "${trimmedId}" tidak ditemukan.`,
          );
        }
        const updated = applyFundEdit(existing, patch);
        await database.funds.put(updated);
        return updated;
      });
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new NotaStorageError(error.message, error);
      }
      throw new NotaStorageError(
        'Gagal memperbarui dana masjid di penyimpanan lokal.',
        error,
      );
    }
  }

  async function archiveFundById(
    fundId: string,
    archivedAtIso?: string,
  ): Promise<Fund> {
    const trimmedId = typeof fundId === 'string' ? fundId.trim() : '';
    try {
      return await database.transaction('rw', database.funds, async () => {
        const existing = await database.funds.get(trimmedId);
        if (!existing) {
          throw new NotaStorageError(
            `Dana masjid dengan ID "${trimmedId}" tidak ditemukan.`,
          );
        }
        const archived = archiveFund(existing, archivedAtIso);
        await database.funds.put(archived);
        return archived;
      });
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal mengarsipkan dana masjid di penyimpanan lokal.',
        error,
      );
    }
  }

  async function getCashTransfers(): Promise<CashTransfer[]> {
    try {
      const records = await database.cashTransfers.toArray();
      return records.sort((a, b) => {
        const byDate = b.occurredAt.localeCompare(a.occurredAt);
        return byDate !== 0 ? byDate : b.createdAt.localeCompare(a.createdAt);
      });
    } catch (error) {
      throw new NotaStorageError(
        'Gagal membaca riwayat mutasi antar-kas dari penyimpanan lokal.',
        error,
      );
    }
  }

  async function addCashTransfer(
    input: CashTransferInput,
  ): Promise<CashTransfer> {
    try {
      return await database.transaction(
        'rw',
        [
          database.settings,
          database.accounts,
          database.funds,
          database.categories,
          database.cashTransfers,
        ],
        async () => {
          const { accounts } = await initialize();
          let transfer: CashTransfer;
          try {
            transfer = createCashTransfer(input, accounts);
          } catch (validationError) {
            throw new NotaStorageError(
              validationError instanceof Error
                ? validationError.message
                : 'Data mutasi antar-kas tidak valid.',
              validationError,
            );
          }

          const duplicate = await database.cashTransfers.get(transfer.id);
          if (duplicate) {
            throw new NotaStorageError(
              `Mutasi antar-kas dengan ID "${transfer.id}" sudah ada.`,
            );
          }
          await database.cashTransfers.add(transfer);
          return transfer;
        },
      );
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal menyimpan mutasi antar-kas ke penyimpanan lokal.',
        error,
      );
    }
  }

  async function deleteCashTransfer(transferId: string): Promise<void> {
    const trimmedId = typeof transferId === 'string' ? transferId.trim() : '';
    try {
      await database.transaction('rw', database.cashTransfers, async () => {
        const existing = await database.cashTransfers.get(trimmedId);
        if (!existing) {
          throw new NotaStorageError(
            `Mutasi antar-kas dengan ID "${trimmedId}" tidak ditemukan untuk dihapus.`,
          );
        }
        await database.cashTransfers.delete(trimmedId);
      });
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal menghapus mutasi antar-kas dari penyimpanan lokal.',
        error,
      );
    }
  }

  async function getBudgetPlans(): Promise<BudgetPlan[]> {
    try {
      const records = await database.budgetPlans.toArray();
      return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch (error) {
      throw new NotaStorageError(
        'Gagal membaca daftar RAB / anggaran dari penyimpanan lokal.',
        error,
      );
    }
  }

  async function addBudgetPlan(input: BudgetPlanInput): Promise<BudgetPlan> {
    try {
      return await database.transaction(
        'rw',
        [
          database.settings,
          database.accounts,
          database.funds,
          database.categories,
          database.budgetPlans,
        ],
        async () => {
          const { categories } = await initialize();
          let plan: BudgetPlan;
          try {
            plan = createBudgetPlan(input, categories);
          } catch (validationError) {
            throw new NotaStorageError(
              validationError instanceof Error
                ? validationError.message
                : 'Data RAB / anggaran tidak valid.',
              validationError,
            );
          }

          const duplicate = await database.budgetPlans.get(plan.id);
          if (duplicate) {
            throw new NotaStorageError(
              `RAB / anggaran dengan ID "${plan.id}" sudah ada.`,
            );
          }
          await database.budgetPlans.add(plan);
          return plan;
        },
      );
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal menyimpan RAB / anggaran ke penyimpanan lokal.',
        error,
      );
    }
  }

  async function updateBudgetPlan(
    planId: string,
    patch: BudgetPlanPatch,
    updatedAtIso?: string,
  ): Promise<BudgetPlan> {
    const trimmedId = typeof planId === 'string' ? planId.trim() : '';
    try {
      return await database.transaction(
        'rw',
        [
          database.settings,
          database.accounts,
          database.funds,
          database.categories,
          database.budgetPlans,
        ],
        async () => {
          const { categories } = await initialize();
          const existing = await database.budgetPlans.get(trimmedId);
          if (!existing) {
            throw new NotaStorageError(
              `RAB / anggaran dengan ID "${trimmedId}" tidak ditemukan untuk diperbarui.`,
            );
          }

          let updated: BudgetPlan;
          try {
            updated = applyBudgetPlanEdit(
              existing,
              patch,
              updatedAtIso,
              categories,
            );
          } catch (validationError) {
            throw new NotaStorageError(
              validationError instanceof Error
                ? validationError.message
                : 'Perubahan RAB / anggaran tidak valid.',
              validationError,
            );
          }

          await database.budgetPlans.put(updated);
          return updated;
        },
      );
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal memperbarui RAB / anggaran di penyimpanan lokal.',
        error,
      );
    }
  }

  async function deleteBudgetPlan(planId: string): Promise<void> {
    const trimmedId = typeof planId === 'string' ? planId.trim() : '';
    try {
      await database.transaction('rw', database.budgetPlans, async () => {
        const existing = await database.budgetPlans.get(trimmedId);
        if (!existing) {
          throw new NotaStorageError(
            `RAB / anggaran dengan ID "${trimmedId}" tidak ditemukan untuk dihapus.`,
          );
        }
        await database.budgetPlans.delete(trimmedId);
      });
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal menghapus RAB / anggaran dari penyimpanan lokal.',
        error,
      );
    }
  }

  async function getCategories(): Promise<Category[]> {
    try {
      const existing = await database.categories.toArray();
      if (existing.length === 0) {
        const initialized = await initialize();
        return initialized.categories;
      }
      return existing;
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal memuat daftar kategori dari penyimpanan lokal.',
        error,
      );
    }
  }

  async function addCategory(input: CategoryInput): Promise<Category> {
    let category: Category;
    try {
      category = createCategory(input);
    } catch (validationError) {
      throw new NotaStorageError(
        validationError instanceof Error
          ? validationError.message
          : 'Data kategori tidak valid.',
        validationError,
      );
    }

    try {
      return await database.transaction('rw', database.categories, async () => {
        const existing = await database.categories.get(category.id);
        if (existing) {
          throw new NotaStorageError(
            `Kategori dengan ID "${category.id}" sudah terdaftar.`,
          );
        }
        await database.categories.add(category);
        return category;
      });
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal menyimpan kategori baru ke penyimpanan lokal.',
        error,
      );
    }
  }

  async function updateCategoryName(
    categoryId: string,
    newName: string,
  ): Promise<Category> {
    try {
      return await database.transaction('rw', database.categories, async () => {
        const existing = await database.categories.get(categoryId);
        if (!existing) {
          throw new NotaStorageError(
            `Kategori dengan ID "${categoryId}" tidak ditemukan.`,
          );
        }
        const updated = renameCategory(existing, newName);
        await database.categories.put(updated);
        return updated;
      });
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new NotaStorageError(error.message, error);
      }
      throw new NotaStorageError(
        'Gagal memperbarui nama kategori di penyimpanan lokal.',
        error,
      );
    }
  }

  async function archiveCategoryById(
    categoryId: string,
    archivedAtIso?: string,
  ): Promise<Category> {
    try {
      return await database.transaction('rw', database.categories, async () => {
        const existing = await database.categories.get(categoryId);
        if (!existing) {
          throw new NotaStorageError(
            `Kategori dengan ID "${categoryId}" tidak ditemukan.`,
          );
        }
        const archived = archiveCategory(existing, archivedAtIso);
        await database.categories.put(archived);
        return archived;
      });
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal mengarsipkan kategori di penyimpanan lokal.',
        error,
      );
    }
  }

  async function getTransactions(): Promise<Transaction[]> {
    try {
      const records = await database.transactions.toArray();
      return sortTransactions(records, 'newest');
    } catch (error) {
      throw new NotaStorageError(
        'Gagal membaca daftar transaksi dari penyimpanan lokal.',
        error,
      );
    }
  }

  async function addTransaction(draft: TransactionDraft): Promise<Transaction> {
    try {
      return await database.transaction(
        'rw',
        [
          database.settings,
          database.accounts,
          database.funds,
          database.categories,
          database.transactions,
        ],
        async () => {
          const { accounts, funds, categories } = await initialize();
          let transaction: Transaction;
          try {
            transaction = createTransaction(draft, categories, {
              accounts,
              funds,
            });
          } catch (validationError) {
            throw new NotaStorageError(
              validationError instanceof Error
                ? validationError.message
                : 'Data transaksi tidak valid.',
              validationError,
            );
          }

          const duplicate = await database.transactions.get(transaction.id);
          if (duplicate) {
            throw new NotaStorageError(
              `Transaksi dengan ID "${transaction.id}" sudah ada.`,
            );
          }
          await database.transactions.add(transaction);
          return transaction;
        },
      );
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal menyimpan transaksi ke penyimpanan lokal.',
        error,
      );
    }
  }

  async function updateTransaction(
    transactionId: string,
    patch: TransactionPatch,
    updatedAtIso?: string,
  ): Promise<Transaction> {
    try {
      return await database.transaction(
        'rw',
        [
          database.settings,
          database.accounts,
          database.funds,
          database.categories,
          database.transactions,
        ],
        async () => {
          const { accounts, funds, categories } = await initialize();
          const existing = await database.transactions.get(transactionId);
          if (!existing) {
            throw new NotaStorageError(
              `Transaksi dengan ID "${transactionId}" tidak ditemukan untuk diperbarui.`,
            );
          }

          let updated: Transaction;
          try {
            updated = applyTransactionEdit(
              existing,
              patch,
              updatedAtIso,
              categories,
              { accounts, funds },
            );
          } catch (validationError) {
            throw new NotaStorageError(
              validationError instanceof Error
                ? validationError.message
                : 'Perubahan transaksi tidak valid.',
              validationError,
            );
          }

          await database.transactions.put(updated);
          return updated;
        },
      );
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal memperbarui transaksi di penyimpanan lokal.',
        error,
      );
    }
  }

  async function deleteTransaction(transactionId: string): Promise<void> {
    try {
      await database.transaction('rw', database.transactions, async () => {
        const existing = await database.transactions.get(transactionId);
        if (!existing) {
          throw new NotaStorageError(
            `Transaksi dengan ID "${transactionId}" tidak ditemukan untuk dihapus.`,
          );
        }
        await database.transactions.delete(transactionId);
      });
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal menghapus transaksi dari penyimpanan lokal.',
        error,
      );
    }
  }

  async function getBudgets(): Promise<CategoryBudget[]> {
    try {
      const records = await database.budgets.toArray();
      return records.sort((a, b) =>
        a.categoryId.localeCompare(b.categoryId, 'id-ID'),
      );
    } catch (error) {
      throw new NotaStorageError(
        'Gagal membaca daftar anggaran kategori dari penyimpanan lokal.',
        error,
      );
    }
  }

  async function saveCategoryBudget(
    input: CategoryBudgetInput,
  ): Promise<CategoryBudget> {
    try {
      return await database.transaction(
        'rw',
        [
          database.settings,
          database.accounts,
          database.funds,
          database.categories,
          database.budgets,
        ],
        async () => {
          const { categories } = await initialize();
          const trimmedCategoryId =
            typeof input.categoryId === 'string'
              ? input.categoryId.trim()
              : '';
          const existingForCategory = await database.budgets
            .where('categoryId')
            .equals(trimmedCategoryId)
            .first();

          let budget: CategoryBudget;
          try {
            budget = createCategoryBudget(
              {
                ...input,
                id: existingForCategory?.id ?? input.id,
              },
              categories,
              existingForCategory
                ? { allowArchivedCategoryId: existingForCategory.categoryId }
                : undefined,
            );
          } catch (validationError) {
            throw new NotaStorageError(
              validationError instanceof Error
                ? validationError.message
                : 'Data anggaran kategori tidak valid.',
              validationError,
            );
          }

          await database.budgets.put(budget);
          return budget;
        },
      );
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal menyimpan anggaran kategori ke penyimpanan lokal.',
        error,
      );
    }
  }

  async function deleteCategoryBudget(categoryId: string): Promise<void> {
    const trimmedCategoryId =
      typeof categoryId === 'string' ? categoryId.trim() : '';
    try {
      await database.transaction('rw', database.budgets, async () => {
        const existing = await database.budgets
          .where('categoryId')
          .equals(trimmedCategoryId)
          .first();
        if (!existing) {
          throw new NotaStorageError(
            `Anggaran untuk kategori "${trimmedCategoryId}" tidak ditemukan untuk dihapus.`,
          );
        }
        await database.budgets.delete(existing.id);
      });
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal menghapus anggaran kategori dari penyimpanan lokal.',
        error,
      );
    }
  }

  async function getSavingsGoals(): Promise<SavingsGoal[]> {
    try {
      const records = await database.savingsGoals.toArray();
      return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch (error) {
      throw new NotaStorageError(
        'Gagal membaca daftar target tabungan dari penyimpanan lokal.',
        error,
      );
    }
  }

  async function addSavingsGoal(input: SavingsGoalInput): Promise<SavingsGoal> {
    let goal: SavingsGoal;
    try {
      goal = createSavingsGoal(input);
    } catch (validationError) {
      throw new NotaStorageError(
        validationError instanceof Error
          ? validationError.message
          : 'Data target tabungan tidak valid.',
        validationError,
      );
    }

    try {
      return await database.transaction(
        'rw',
        database.savingsGoals,
        async () => {
          const duplicate = await database.savingsGoals.get(goal.id);
          if (duplicate) {
            throw new NotaStorageError(
              `Target tabungan dengan ID "${goal.id}" sudah ada.`,
            );
          }
          await database.savingsGoals.add(goal);
          return goal;
        },
      );
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal menyimpan target tabungan ke penyimpanan lokal.',
        error,
      );
    }
  }

  async function updateSavingsGoal(
    goalId: string,
    patch: SavingsGoalPatch,
    updatedAtIso?: string,
  ): Promise<SavingsGoal> {
    const trimmedId = typeof goalId === 'string' ? goalId.trim() : '';
    try {
      return await database.transaction(
        'rw',
        database.savingsGoals,
        async () => {
          const existing = await database.savingsGoals.get(trimmedId);
          if (!existing) {
            throw new NotaStorageError(
              `Target tabungan dengan ID "${trimmedId}" tidak ditemukan untuk diperbarui.`,
            );
          }

          let updated: SavingsGoal;
          try {
            updated = applySavingsGoalEdit(existing, patch, updatedAtIso);
          } catch (validationError) {
            throw new NotaStorageError(
              validationError instanceof Error
                ? validationError.message
                : 'Perubahan target tabungan tidak valid.',
              validationError,
            );
          }

          await database.savingsGoals.put(updated);
          return updated;
        },
      );
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal memperbarui target tabungan di penyimpanan lokal.',
        error,
      );
    }
  }

  async function deleteSavingsGoal(goalId: string): Promise<void> {
    const trimmedId = typeof goalId === 'string' ? goalId.trim() : '';
    try {
      await database.transaction('rw', database.savingsGoals, async () => {
        const existing = await database.savingsGoals.get(trimmedId);
        if (!existing) {
          throw new NotaStorageError(
            `Target tabungan dengan ID "${trimmedId}" tidak ditemukan untuk dihapus.`,
          );
        }
        await database.savingsGoals.delete(trimmedId);
      });
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal menghapus target tabungan dari penyimpanan lokal.',
        error,
      );
    }
  }

  async function getDebtRecords(): Promise<DebtRecord[]> {
    try {
      const records = await database.debtRecords.toArray();
      return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch (error) {
      throw new NotaStorageError(
        'Gagal membaca daftar catatan utang/piutang dari penyimpanan lokal.',
        error,
      );
    }
  }

  async function addDebtRecord(input: DebtRecordInput): Promise<DebtRecord> {
    let record: DebtRecord;
    try {
      record = createDebtRecord(input);
    } catch (validationError) {
      throw new NotaStorageError(
        validationError instanceof Error
          ? validationError.message
          : 'Data catatan utang/piutang tidak valid.',
        validationError,
      );
    }

    try {
      return await database.transaction(
        'rw',
        database.debtRecords,
        async () => {
          const duplicate = await database.debtRecords.get(record.id);
          if (duplicate) {
            throw new NotaStorageError(
              `Catatan utang/piutang dengan ID "${record.id}" sudah ada.`,
            );
          }
          await database.debtRecords.add(record);
          return record;
        },
      );
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal menyimpan catatan utang/piutang ke penyimpanan lokal.',
        error,
      );
    }
  }

  async function updateDebtRecord(
    debtId: string,
    patch: DebtRecordPatch,
    updatedAtIso?: string,
  ): Promise<DebtRecord> {
    const trimmedId = typeof debtId === 'string' ? debtId.trim() : '';
    try {
      return await database.transaction(
        'rw',
        database.debtRecords,
        async () => {
          const existing = await database.debtRecords.get(trimmedId);
          if (!existing) {
            throw new NotaStorageError(
              `Catatan utang/piutang dengan ID "${trimmedId}" tidak ditemukan untuk diperbarui.`,
            );
          }

          let updated: DebtRecord;
          try {
            updated = applyDebtRecordEdit(existing, patch, updatedAtIso);
          } catch (validationError) {
            throw new NotaStorageError(
              validationError instanceof Error
                ? validationError.message
                : 'Perubahan catatan utang/piutang tidak valid.',
              validationError,
            );
          }

          await database.debtRecords.put(updated);
          return updated;
        },
      );
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal memperbarui catatan utang/piutang di penyimpanan lokal.',
        error,
      );
    }
  }

  async function settleDebtRecordById(
    debtId: string,
    updatedAtIso?: string,
  ): Promise<DebtRecord> {
    const trimmedId = typeof debtId === 'string' ? debtId.trim() : '';
    try {
      return await database.transaction(
        'rw',
        database.debtRecords,
        async () => {
          const existing = await database.debtRecords.get(trimmedId);
          if (!existing) {
            throw new NotaStorageError(
              `Catatan utang/piutang dengan ID "${trimmedId}" tidak ditemukan untuk dilunasi.`,
            );
          }

          const settled = settleDebtRecord(existing, updatedAtIso);
          await database.debtRecords.put(settled);
          return settled;
        },
      );
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal menandai lunas catatan utang/piutang di penyimpanan lokal.',
        error,
      );
    }
  }

  async function deleteDebtRecord(debtId: string): Promise<void> {
    const trimmedId = typeof debtId === 'string' ? debtId.trim() : '';
    try {
      await database.transaction('rw', database.debtRecords, async () => {
        const existing = await database.debtRecords.get(trimmedId);
        if (!existing) {
          throw new NotaStorageError(
            `Catatan utang/piutang dengan ID "${trimmedId}" tidak ditemukan untuk dihapus.`,
          );
        }
        await database.debtRecords.delete(trimmedId);
      });
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal menghapus catatan utang/piutang dari penyimpanan lokal.',
        error,
      );
    }
  }

  async function loadWorkspaceState(
    period: DateRangePeriod = getCurrentMonthPeriod(new Date()),
  ): Promise<LocalWorkspaceState> {
    try {
      const { settings, accounts, funds, categories } = await initialize();
      const rawTransactions = await database.transactions.toArray();
      const rawCashTransfers = await database.cashTransfers.toArray();
      const rawBudgetPlans = await database.budgetPlans.toArray();
      const rawBudgets = await database.budgets.toArray();
      const rawSavingsGoals = await database.savingsGoals.toArray();
      const rawDebtRecords = await database.debtRecords.toArray();

      const transactions = sortTransactions(rawTransactions, 'newest');
      const cashTransfers = [...rawCashTransfers].sort((a, b) => {
        const byDate = b.occurredAt.localeCompare(a.occurredAt);
        return byDate !== 0 ? byDate : b.createdAt.localeCompare(a.createdAt);
      });
      const budgetPlans = [...rawBudgetPlans].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
      const budgets = [...rawBudgets].sort((a, b) =>
        a.categoryId.localeCompare(b.categoryId, 'id-ID'),
      );
      const savingsGoals = [...rawSavingsGoals].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
      const debtRecords = [...rawDebtRecords].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );

      const mosqueBalanceSplit = calculateMosqueBalanceSplit(
        accounts,
        funds,
        transactions,
        cashTransfers,
      );
      const overview = calculateOverviewSnapshot(
        settings.openingBalance,
        transactions,
        period,
      );

      return {
        settings,
        accounts,
        funds,
        categories,
        transactions,
        cashTransfers,
        budgetPlans,
        budgets,
        savingsGoals,
        debtRecords,
        overview,
        mosqueBalanceSplit,
      };
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal memuat data keuangan lokal dari browser.',
        error,
      );
    }
  }

  async function exportBackup(
    exportedAt?: string,
  ): Promise<NotaBackupPayload> {
    try {
      const { settings, accounts, funds, categories } = await initialize();
      const rawTransactions = await database.transactions.toArray();
      const rawCashTransfers = await database.cashTransfers.toArray();
      const rawBudgetPlans = await database.budgetPlans.toArray();
      const rawBudgets = await database.budgets.toArray();
      const rawSavingsGoals = await database.savingsGoals.toArray();
      const rawDebtRecords = await database.debtRecords.toArray();
      return createBackupPayload({
        settings,
        accounts,
        funds,
        categories,
        transactions: rawTransactions,
        cashTransfers: rawCashTransfers,
        budgetPlans: rawBudgetPlans,
        budgets: rawBudgets,
        savingsGoals: rawSavingsGoals,
        debtRecords: rawDebtRecords,
        exportedAt,
      });
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal mengekspor cadangan data dari penyimpanan lokal.',
        error,
      );
    }
  }

  async function restoreBackup(
    rawJsonOrPayload: string | unknown,
  ): Promise<NotaBackupPreview> {
    const validation =
      typeof rawJsonOrPayload === 'string'
        ? parseAndValidateBackupJson(rawJsonOrPayload)
        : validateBackupObject(rawJsonOrPayload);

    if (!validation.valid) {
      throw new NotaStorageError(validation.errors[0]);
    }

    const { payload } = validation.preview;

    try {
      await database.transaction(
        'rw',
        [
          database.settings,
          database.accounts,
          database.funds,
          database.categories,
          database.transactions,
          database.cashTransfers,
          database.budgetPlans,
          database.budgets,
          database.savingsGoals,
          database.debtRecords,
        ],
        async () => {
          await database.debtRecords.clear();
          await database.savingsGoals.clear();
          await database.budgets.clear();
          await database.budgetPlans.clear();
          await database.cashTransfers.clear();
          await database.transactions.clear();
          await database.categories.clear();
          await database.funds.clear();
          await database.accounts.clear();
          await database.settings.clear();

          const storedSettings: StoredAppSettings = {
            id: PRIMARY_SETTINGS_ID,
            openingBalance: payload.settings.openingBalance,
            currency: payload.settings.currency,
            onboardingCompleted: payload.settings.onboardingCompleted,
            ...(payload.settings.mosqueName !== undefined
              ? { mosqueName: payload.settings.mosqueName }
              : {}),
            ...(payload.settings.mosqueAddress !== undefined
              ? { mosqueAddress: payload.settings.mosqueAddress }
              : {}),
            ...(payload.settings.chairpersonName !== undefined
              ? { chairpersonName: payload.settings.chairpersonName }
              : {}),
            ...(payload.settings.treasurerName !== undefined
              ? { treasurerName: payload.settings.treasurerName }
              : {}),
            updatedAt: payload.exportedAt,
          };

          await database.settings.put(storedSettings);
          if (payload.accounts && payload.accounts.length > 0) {
            await database.accounts.bulkAdd(payload.accounts);
          }
          if (payload.funds && payload.funds.length > 0) {
            await database.funds.bulkAdd(payload.funds);
          }
          await database.categories.bulkAdd(payload.categories);
          if (payload.transactions.length > 0) {
            await database.transactions.bulkAdd(payload.transactions);
          }
          if (payload.cashTransfers && payload.cashTransfers.length > 0) {
            await database.cashTransfers.bulkAdd(payload.cashTransfers);
          }
          if (payload.budgetPlans && payload.budgetPlans.length > 0) {
            await database.budgetPlans.bulkAdd(payload.budgetPlans);
          }
          if (payload.budgets && payload.budgets.length > 0) {
            await database.budgets.bulkAdd(payload.budgets);
          }
          if (payload.savingsGoals && payload.savingsGoals.length > 0) {
            await database.savingsGoals.bulkAdd(payload.savingsGoals);
          }
          if (payload.debtRecords && payload.debtRecords.length > 0) {
            await database.debtRecords.bulkAdd(payload.debtRecords);
          }
        },
      );

      return validation.preview;
    } catch (error) {
      if (error instanceof NotaStorageError) {
        throw error;
      }
      throw new NotaStorageError(
        'Gagal memulihkan cadangan ke penyimpanan lokal perangkat. Data sebelumnya tetap dipertahankan.',
        error,
      );
    }
  }

  return {
    initialize,
    getSettings,
    saveOpeningBalance,
    saveMosqueProfile,
    saveInitialSetup,
    getAccounts,
    addAccount,
    updateAccount,
    archiveAccountById,
    getFunds,
    addFund,
    updateFund,
    archiveFundById,
    getCashTransfers,
    addCashTransfer,
    deleteCashTransfer,
    getBudgetPlans,
    addBudgetPlan,
    updateBudgetPlan,
    deleteBudgetPlan,
    getCategories,
    addCategory,
    updateCategoryName,
    archiveCategoryById,
    getTransactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    getBudgets,
    saveCategoryBudget,
    deleteCategoryBudget,
    getSavingsGoals,
    addSavingsGoal,
    updateSavingsGoal,
    deleteSavingsGoal,
    getDebtRecords,
    addDebtRecord,
    updateDebtRecord,
    settleDebtRecordById,
    deleteDebtRecord,
    loadWorkspaceState,
    exportBackup,
    restoreBackup,
  };
}

export const notaRepository = createNotaRepository();
