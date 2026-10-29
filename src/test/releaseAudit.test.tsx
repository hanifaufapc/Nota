import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  parseAndValidateBackupJson,
  serializeBackupPayload,
  validateBackupObject,
} from '../data/backup/notaBackup';
import { NotaDatabase } from '../data/db';
import {
  createNotaRepository,
  type NotaRepository,
} from '../data/repositories/notaRepository';
import {
  calculateBudgetPlanOverview,
  createBudgetPlan,
} from '../domain/budgetPlan';
import {
  DEFAULT_CASH_ACCOUNT_BANK_ID,
  DEFAULT_CASH_ACCOUNT_TUNAI_ID,
  DEFAULT_FUND_OPERASIONAL_ID,
  DEFAULT_FUND_PEMBANGUNAN_ID,
} from '../domain/mosque';
import { generateMosqueFinancialReport } from '../domain/report';
import { filterTransactions } from '../domain/summaries';
import {
  DEFAULT_CATEGORIES,
  type Transaction,
} from '../domain/transaction';

describe('Release Audit Regression & Financial Invariants Suite', () => {
  let db: NotaDatabase;
  let repo: NotaRepository;
  let dbCounter = 0;

  beforeEach(async () => {
    dbCounter += 1;
    db = new NotaDatabase(`nota_release_audit_${Date.now()}_${dbCounter}`);
    repo = createNotaRepository(db);
    await repo.initialize();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('restores backup containing historical CashTransfer referencing a subsequently archived CashAccount', async () => {
    await repo.saveInitialSetup({
      mosqueName: 'Masjid Al-Ikhlas',
      accountOpeningBalances: {
        [DEFAULT_CASH_ACCOUNT_TUNAI_ID]: 5_000_000,
        [DEFAULT_CASH_ACCOUNT_BANK_ID]: 10_000_000,
      },
      fundOpeningBalances: {
        [DEFAULT_FUND_OPERASIONAL_ID]: 15_000_000,
      },
    });

    const extraBank = await repo.addAccount({
      id: 'acc-bsi-lama',
      name: 'Rekening BSI Lama',
      kind: 'bank_recorded',
      openingBalance: 0,
    });

    // Record transfer to the extra bank account while it is active
    await repo.addCashTransfer({
      fromAccountId: DEFAULT_CASH_ACCOUNT_TUNAI_ID,
      toAccountId: extraBank.id,
      amount: 1_500_000,
      occurredAt: '2026-03-10',
      note: 'Setor tunai ke rekening lama',
    });

    // Later archive the extra bank account
    await repo.archiveAccountById(extraBank.id);

    // Export full backup
    const backupPayload = await repo.exportBackup('2026-03-15T10:00:00.000Z');
    const rawJson = serializeBackupPayload(backupPayload);

    const validation = parseAndValidateBackupJson(rawJson);
    expect(validation.valid).toBe(true);

    // Restore into a fresh database
    const freshDb = new NotaDatabase(
      `nota_release_audit_fresh_${Date.now()}_${dbCounter}`,
    );
    const freshRepo = createNotaRepository(freshDb);
    await freshRepo.initialize();
    await freshRepo.restoreBackup(rawJson);

    const state = await freshRepo.loadWorkspaceState({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    });
    expect(state.cashTransfers).toHaveLength(1);
    const archivedAccount = state.accounts.find((a) => a.id === extraBank.id);
    expect(archivedAccount?.archivedAt).toBeTruthy();

    // Internal transfer preserves total cash === total fund balance
    expect(state.mosqueBalanceSplit.totalBalance).toBe(15_000_000);
    expect(
      state.mosqueBalanceSplit.unrestrictedBalance +
        state.mosqueBalanceSplit.restrictedBalance,
    ).toBe(15_000_000);

    await freshDb.delete();
  });

  it('rejects backup when BudgetPlan references a non-existent fundId and preserves existing data', async () => {
    await repo.saveInitialSetup({
      mosqueName: 'Masjid Darussalam',
      accountOpeningBalances: {
        [DEFAULT_CASH_ACCOUNT_TUNAI_ID]: 8_000_000,
      },
      fundOpeningBalances: {
        [DEFAULT_FUND_OPERASIONAL_ID]: 8_000_000,
      },
    });

    const validBackup = await repo.exportBackup('2026-03-15T10:00:00.000Z');
    const corruptedPayload = {
      ...validBackup,
      budgetPlans: [
        {
          id: 'rab-invalid-fund',
          title: 'RAB Tanpa Dana Valid',
          kind: 'activity_rab',
          periodStart: '2026-03-01',
          periodEnd: '2026-03-31',
          fundId: 'fund-tidak-ada',
          items: [
            {
              id: 'line-1',
              type: 'expense',
              categoryId: 'cat-exp-kajian-phbi',
              description: 'Konsumsi Kajian',
              plannedAmount: 1_000_000,
            },
          ],
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z',
        },
      ],
    };

    const validation = validateBackupObject(corruptedPayload);
    expect(validation.valid).toBe(false);
    if (!validation.valid) {
      expect(validation.errors[0]).toMatch(
        /merujuk ke ID dana "fund-tidak-ada"/i,
      );
    }

    await expect(
      repo.restoreBackup(JSON.stringify(corruptedPayload)),
    ).rejects.toThrow(/merujuk ke ID dana "fund-tidak-ada"/i);

    // Verify existing data is untouched
    const state = await repo.loadWorkspaceState({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    });
    expect(state.settings.mosqueName).toBe('Masjid Darussalam');
    expect(state.mosqueBalanceSplit.totalBalance).toBe(8_000_000);
  });

  it('normalizes legacy transactions without explicit accountId or fundId to default Kas Tunai and Dana Operasional Umum', () => {
    const legacyTx: Transaction = {
      id: 'tx-legacy-1',
      type: 'expense',
      amount: 350_000,
      categoryId: 'cat-exp-listrik-air',
      note: 'Tagihan air sebelum migrasi v5',
      occurredAt: '2026-03-12',
      createdAt: '2026-03-12T08:00:00.000Z',
      updatedAt: '2026-03-12T08:00:00.000Z',
    };

    // Filtering by default Kas Tunai and default Dana Operasional Umum matches legacy transaction
    const byDefaultAccount = filterTransactions([legacyTx], {
      accountId: DEFAULT_CASH_ACCOUNT_TUNAI_ID,
    });
    expect(byDefaultAccount).toHaveLength(1);

    const byDefaultFund = filterTransactions([legacyTx], {
      fundId: DEFAULT_FUND_OPERASIONAL_ID,
    });
    expect(byDefaultFund).toHaveLength(1);

    const byOtherFund = filterTransactions([legacyTx], {
      fundId: DEFAULT_FUND_PEMBANGUNAN_ID,
    });
    expect(byOtherFund).toHaveLength(0);

    // RAB scoped to Dana Operasional Umum includes legacy transaction realization
    const plan = createBudgetPlan(
      {
        title: 'Anggaran Operasional Maret 2026',
        kind: 'monthly_operational',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-31',
        fundId: DEFAULT_FUND_OPERASIONAL_ID,
        items: [
          {
            type: 'expense',
            categoryId: 'cat-exp-listrik-air',
            description: 'Tagihan Listrik & Air',
            plannedAmount: 1_000_000,
          },
        ],
      },
      DEFAULT_CATEGORIES,
    );

    const overview = calculateBudgetPlanOverview(
      plan,
      [legacyTx],
      DEFAULT_CATEGORIES,
    );
    expect(overview.totalActualExpense).toBe(350_000);
    expect(overview.remainingExpenseBudget).toBe(650_000);
  });

  it('maintains financial invariants across transaction create/edit/delete, RAB non-mutation, and period reports', async () => {
    await repo.saveInitialSetup({
      mosqueName: 'Masjid Al-Falah',
      accountOpeningBalances: {
        [DEFAULT_CASH_ACCOUNT_TUNAI_ID]: 3_000_000,
        [DEFAULT_CASH_ACCOUNT_BANK_ID]: 7_000_000,
      },
      fundOpeningBalances: {
        [DEFAULT_FUND_OPERASIONAL_ID]: 6_000_000,
        [DEFAULT_FUND_PEMBANGUNAN_ID]: 4_000_000,
      },
    });

    const marchPeriod = { startDate: '2026-03-01', endDate: '2026-03-31' };

    // 1. Create RAB and verify it never mutates account or fund balances
    const rab = await repo.addBudgetPlan({
      title: 'RAB Kajian Akbar',
      kind: 'activity_rab',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      fundId: DEFAULT_FUND_OPERASIONAL_ID,
      items: [
        {
          type: 'expense',
          categoryId: 'cat-exp-kajian-phbi',
          description: 'Konsumsi & Honor Pemateri',
          plannedAmount: 2_000_000,
        },
      ],
    });

    let state = await repo.loadWorkspaceState(marchPeriod);
    expect(state.mosqueBalanceSplit.totalBalance).toBe(10_000_000);
    expect(
      state.mosqueBalanceSplit.unrestrictedBalance +
        state.mosqueBalanceSplit.restrictedBalance,
    ).toBe(10_000_000);

    // 2. Record prior-period income (2026-02-20) and in-period expense (2026-03-15)
    await repo.addTransaction({
      type: 'income',
      amount: 1_000_000,
      categoryId: 'cat-inc-jumat',
      accountId: DEFAULT_CASH_ACCOUNT_TUNAI_ID,
      fundId: DEFAULT_FUND_OPERASIONAL_ID,
      occurredAt: '2026-02-20',
      note: 'Infak Jumat Februari',
    });

    const expenseTx = await repo.addTransaction({
      type: 'expense',
      amount: 750_000,
      categoryId: 'cat-exp-kajian-phbi',
      accountId: DEFAULT_CASH_ACCOUNT_TUNAI_ID,
      fundId: DEFAULT_FUND_OPERASIONAL_ID,
      budgetPlanId: rab.id,
      occurredAt: '2026-03-15',
      note: 'DP Konsumsi Kajian',
    });

    state = await repo.loadWorkspaceState(marchPeriod);
    let rabOverview = calculateBudgetPlanOverview(
      state.budgetPlans[0],
      state.transactions,
      state.categories,
    );
    expect(rabOverview.totalActualExpense).toBe(750_000);

    // 3. Edit the expense transaction amount -> updates both balances and RAB realization
    await repo.updateTransaction(expenseTx.id, {
      amount: 1_250_000,
    });

    state = await repo.loadWorkspaceState(marchPeriod);
    expect(state.mosqueBalanceSplit.totalBalance).toBe(9_750_000);
    expect(
      state.mosqueBalanceSplit.unrestrictedBalance +
        state.mosqueBalanceSplit.restrictedBalance,
    ).toBe(9_750_000);

    rabOverview = calculateBudgetPlanOverview(
      state.budgetPlans[0],
      state.transactions,
      state.categories,
    );
    expect(rabOverview.totalActualExpense).toBe(1_250_000);
    expect(rabOverview.remainingExpenseBudget).toBe(750_000);

    // 4. Verify March 2026 report carries February income into March openingBalance
    const marchReport = generateMosqueFinancialReport({
      period: marchPeriod,
      funds: state.funds,
      accounts: state.accounts,
      categories: state.categories,
      transactions: state.transactions,
      transfers: state.cashTransfers,
    });
    expect(marchReport.openingBalance).toBe(11_000_000);
    expect(marchReport.periodIncome).toBe(0);
    expect(marchReport.periodExpense).toBe(1_250_000);
    expect(marchReport.closingBalance).toBe(9_750_000);

    // 5. Update and delete RAB -> never alters cash or fund balances
    await repo.updateBudgetPlan(rab.id, { title: 'RAB Kajian Akbar Revisi' });
    await repo.deleteBudgetPlan(rab.id);

    state = await repo.loadWorkspaceState(marchPeriod);
    expect(state.mosqueBalanceSplit.totalBalance).toBe(9_750_000);

    // 6. Delete expense transaction -> restores closing balance to 11,000,000
    await repo.deleteTransaction(expenseTx.id);
    state = await repo.loadWorkspaceState(marchPeriod);
    expect(state.mosqueBalanceSplit.totalBalance).toBe(11_000_000);
    expect(
      state.mosqueBalanceSplit.unrestrictedBalance +
        state.mosqueBalanceSplit.restrictedBalance,
    ).toBe(11_000_000);
  });
});
