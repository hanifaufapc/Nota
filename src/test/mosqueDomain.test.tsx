/**
 * Milestone M1 Tests:
 * - Mosque Finance Domain (`CashAccount`, `Fund`, `CashTransfer`, `MosqueBalanceSplit`, `evaluateTransactionSoftGuard`)
 * - Mosque RAB / BudgetPlan (`createBudgetPlan`, `calculateBudgetPlanOverview`)
 * - Mosque Financial Report (`generateMosqueFinancialReport`, `serializeMosqueReportToCsv`)
 * - Dexie v5 Repository & Versioned Backup/Restore (`accounts`, `funds`, `cashTransfers`, `budgetPlans`)
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  calculateBudgetPlanOverview,
  createBudgetPlan,
} from '../domain/budgetPlan';
import {
  DEFAULT_CASH_ACCOUNTS,
  DEFAULT_CASH_ACCOUNT_BANK_ID,
  DEFAULT_CASH_ACCOUNT_TUNAI_ID,
  DEFAULT_FUNDS,
  DEFAULT_FUND_OPERASIONAL_ID,
  DEFAULT_FUND_PEMBANGUNAN_ID,
  DEFAULT_FUND_SOSIAL_ZAKAT_ID,
  calculateMosqueBalanceSplit,
  createCashTransfer,
  evaluateTransactionSoftGuard,
} from '../domain/mosque';
import { generateMosqueFinancialReport } from '../domain/report';
import {
  DEFAULT_CATEGORIES,
  createTransaction,
} from '../domain/transaction';
import {
  parseAndValidateBackupJson,
  serializeBackupPayload,
  serializeMosqueReportToCsv,
} from '../data/backup/notaBackup';
import { NotaDatabase } from '../data/db';
import { createNotaRepository } from '../data/repositories/notaRepository';
import { getRollingDaysPeriod } from '../lib/date';

describe('Milestone M1 — Mosque Finance Domain & Schema v5 Repository', () => {
  it('separates CashAccount balances from Fund balances and ensures CashTransfer never alters Fund balances or period income/expense', () => {
    const accounts = DEFAULT_CASH_ACCOUNTS.map((acc) => ({
      ...acc,
      openingBalance: acc.id === DEFAULT_CASH_ACCOUNT_TUNAI_ID ? 2_000_000 : 5_000_000,
    }));
    const funds = DEFAULT_FUNDS.map((fund) => ({
      ...fund,
      openingBalance:
        fund.id === DEFAULT_FUND_OPERASIONAL_ID
          ? 3_000_000
          : fund.id === DEFAULT_FUND_PEMBANGUNAN_ID
            ? 4_000_000
            : 0,
    }));

    const txInfakJumat = createTransaction(
      {
        id: 'tx-jumat-1',
        type: 'income',
        amount: 1_500_000,
        accountId: DEFAULT_CASH_ACCOUNT_TUNAI_ID,
        fundId: DEFAULT_FUND_OPERASIONAL_ID,
        categoryId: 'cat-inc-jumat',
        occurredAt: '2026-03-06',
        donorOrPayee: 'Jamaah Salat Jumat',
        note: 'Kotak amal Jumat pekan 1',
      },
      DEFAULT_CATEGORIES,
      { accounts, funds },
    );

    const txSemenPembangunan = createTransaction(
      {
        id: 'tx-semen-1',
        type: 'expense',
        amount: 1_200_000,
        accountId: DEFAULT_CASH_ACCOUNT_BANK_ID,
        fundId: DEFAULT_FUND_PEMBANGUNAN_ID,
        categoryId: 'cat-exp-pembangunan',
        occurredAt: '2026-03-08',
        donorOrPayee: 'TB Sinar Jaya',
        referenceNo: 'INV-2026-09',
        note: 'Pembelian 20 sak semen',
      },
      DEFAULT_CATEGORIES,
      { accounts, funds },
    );

    // Setor uang tunai kotak Jumat ke Rekening Bank Masjid sebesar Rp1.000.000
    const transferSetorBank = createCashTransfer(
      {
        id: 'trf-setor-1',
        fromAccountId: DEFAULT_CASH_ACCOUNT_TUNAI_ID,
        toAccountId: DEFAULT_CASH_ACCOUNT_BANK_ID,
        amount: 1_000_000,
        occurredAt: '2026-03-07',
        note: 'Setor uang infak Jumat ke rekening BSI masjid',
      },
      accounts,
    );

    const split = calculateMosqueBalanceSplit(
      accounts,
      funds,
      [txInfakJumat, txSemenPembangunan],
      [transferSetorBank],
    );

    const kasTunai = split.accountSummaries.find(
      (a) => a.accountId === DEFAULT_CASH_ACCOUNT_TUNAI_ID,
    )!;
    const bankMasjid = split.accountSummaries.find(
      (a) => a.accountId === DEFAULT_CASH_ACCOUNT_BANK_ID,
    )!;

    // Kas Tunai: 2.000.000 + 1.500.000 - 1.000.000 (transfer out) = 2.500.000
    expect(kasTunai.currentBalance).toBe(2_500_000);
    expect(kasTunai.transfersOut).toBe(1_000_000);

    // Rekening Bank: 5.000.000 - 1.200.000 + 1.000.000 (transfer in) = 4.800.000
    expect(bankMasjid.currentBalance).toBe(4_800_000);
    expect(bankMasjid.transfersIn).toBe(1_000_000);

    // Total saldo kas: 2.500.000 + 4.800.000 = 7.300.000
    expect(split.totalBalance).toBe(7_300_000);

    // Dana Operasional Umum: 3.000.000 + 1.500.000 = 4.500.000 (tidak berubah karena transfer kas!)
    const danaOperasional = split.fundSummaries.find(
      (f) => f.fundId === DEFAULT_FUND_OPERASIONAL_ID,
    )!;
    expect(danaOperasional.currentBalance).toBe(4_500_000);

    // Dana Pembangunan: 4.000.000 - 1.200.000 = 2.800.000
    const danaPembangunan = split.fundSummaries.find(
      (f) => f.fundId === DEFAULT_FUND_PEMBANGUNAN_ID,
    )!;
    expect(danaPembangunan.currentBalance).toBe(2_800_000);

    expect(split.unrestrictedBalance).toBe(4_500_000);
    expect(split.restrictedBalance).toBe(2_800_000);
  });

  it('evaluates Soft Guard warnings when an expense exceeds Fund/Account balance or mismatches a restricted Fund category', () => {
    const accounts = DEFAULT_CASH_ACCOUNTS.map((acc) => ({
      ...acc,
      openingBalance: acc.id === DEFAULT_CASH_ACCOUNT_TUNAI_ID ? 500_000 : 5_000_000,
    }));
    const funds = DEFAULT_FUNDS.map((fund) => ({
      ...fund,
      openingBalance:
        fund.id === DEFAULT_FUND_OPERASIONAL_ID
          ? 4_500_000
          : fund.id === DEFAULT_FUND_PEMBANGUNAN_ID
            ? 1_000_000
            : 0,
    }));

    // Expense of Rp1.500.000 from Kas Tunai (balance Rp500.000) & Dana Pembangunan (balance Rp1.000.000)
    // using an Operational utility category ('cat-exp-listrik-air')
    const guard = evaluateTransactionSoftGuard(
      {
        type: 'expense',
        amount: 1_500_000,
        accountId: DEFAULT_CASH_ACCOUNT_TUNAI_ID,
        fundId: DEFAULT_FUND_PEMBANGUNAN_ID,
        categoryId: 'cat-exp-listrik-air',
      },
      {
        accounts,
        funds,
        categories: DEFAULT_CATEGORIES,
        transactions: [],
      },
    );

    expect(guard.requiresConfirmation).toBe(true);
    const codes = guard.warnings.map((w) => w.code);
    expect(codes).toContain('FUND_DEFICIT');
    expect(codes).toContain('ACCOUNT_DEFICIT');
    expect(codes).toContain('RESTRICTED_FUND_CATEGORY_MISMATCH');
  });

  it('calculates Mosque RAB / BudgetPlan realization accurately without altering balances', () => {
    const rabRamadan = createBudgetPlan(
      {
        id: 'rab-ramadan-2026',
        title: 'RAB Kegiatan Ramadan 1447 H',
        kind: 'activity_rab',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-31',
        fundId: DEFAULT_FUND_OPERASIONAL_ID,
        note: 'Buka puasa bersama dan tarawih',
        items: [
          {
            id: 'item-1',
            type: 'income',
            categoryId: 'cat-inc-kegiatan',
            description: 'Target donasi buka puasa jamaah',
            plannedAmount: 5_000_000,
          },
          {
            id: 'item-2',
            type: 'expense',
            categoryId: 'cat-exp-kajian-phbi',
            description: 'Konsumsi takjil & penceramah tarawih',
            plannedAmount: 4_000_000,
          },
        ],
      },
      DEFAULT_CATEGORIES,
    );

    const txDonasi = createTransaction(
      {
        type: 'income',
        amount: 3_500_000,
        accountId: DEFAULT_CASH_ACCOUNT_BANK_ID,
        fundId: DEFAULT_FUND_OPERASIONAL_ID,
        categoryId: 'cat-inc-kegiatan',
        budgetPlanId: rabRamadan.id,
        occurredAt: '2026-03-10',
      },
      DEFAULT_CATEGORIES,
    );

    const txKonsumsi = createTransaction(
      {
        type: 'expense',
        amount: 3_400_000,
        accountId: DEFAULT_CASH_ACCOUNT_TUNAI_ID,
        fundId: DEFAULT_FUND_OPERASIONAL_ID,
        categoryId: 'cat-exp-kajian-phbi',
        occurredAt: '2026-03-15',
      },
      DEFAULT_CATEGORIES,
    );

    const overview = calculateBudgetPlanOverview(
      rabRamadan,
      [txDonasi, txKonsumsi],
      DEFAULT_CATEGORIES,
    );

    expect(overview.totalPlannedIncome).toBe(5_000_000);
    expect(overview.totalActualIncome).toBe(3_500_000);
    expect(overview.totalPlannedExpense).toBe(4_000_000);
    expect(overview.totalActualExpense).toBe(3_400_000);
    expect(overview.remainingExpenseBudget).toBe(600_000);
    expect(overview.expenseUsagePercent).toBe(85);
    expect(overview.lineRealizations[1].status).toBe('near_limit');
  });

  it('generates an accurate 7-day Friday Mosque Financial Report with opening/closing balances per Fund and Account', () => {
    const accounts = DEFAULT_CASH_ACCOUNTS.map((acc) => ({
      ...acc,
      openingBalance: acc.id === DEFAULT_CASH_ACCOUNT_TUNAI_ID ? 1_000_000 : 2_000_000,
    }));
    const funds = DEFAULT_FUNDS.map((fund) => ({
      ...fund,
      openingBalance:
        fund.id === DEFAULT_FUND_OPERASIONAL_ID
          ? 2_000_000
          : fund.id === DEFAULT_FUND_SOSIAL_ZAKAT_ID
            ? 1_000_000
            : 0,
    }));

    // Prior transaction before the 7-day window (occurred on 2026-03-01)
    const txPrior = createTransaction(
      {
        id: 'tx-prior',
        type: 'income',
        amount: 500_000,
        accountId: DEFAULT_CASH_ACCOUNT_TUNAI_ID,
        fundId: DEFAULT_FUND_OPERASIONAL_ID,
        categoryId: 'cat-inc-harian',
        occurredAt: '2026-03-01',
      },
      DEFAULT_CATEGORIES,
    );

    // Transaction inside the 7-day window [2026-03-07 .. 2026-03-13]
    const txJumat = createTransaction(
      {
        id: 'tx-jumat',
        type: 'income',
        amount: 2_250_000,
        accountId: DEFAULT_CASH_ACCOUNT_TUNAI_ID,
        fundId: DEFAULT_FUND_OPERASIONAL_ID,
        categoryId: 'cat-inc-jumat',
        occurredAt: '2026-03-13',
      },
      DEFAULT_CATEGORIES,
    );

    const txSantunan = createTransaction(
      {
        id: 'tx-santunan',
        type: 'expense',
        amount: 400_000,
        accountId: DEFAULT_CASH_ACCOUNT_TUNAI_ID,
        fundId: DEFAULT_FUND_SOSIAL_ZAKAT_ID,
        categoryId: 'cat-exp-penyaluran-zakat',
        occurredAt: '2026-03-12',
      },
      DEFAULT_CATEGORIES,
    );

    const period = getRollingDaysPeriod('2026-03-13', 7);
    expect(period).toEqual({
      startDate: '2026-03-07',
      endDate: '2026-03-13',
    });

    const report = generateMosqueFinancialReport({
      period,
      accounts,
      funds,
      categories: DEFAULT_CATEGORIES,
      transactions: [txPrior, txJumat, txSantunan],
      transfers: [],
    });

    // Opening balance at 2026-03-07 = initial (3.000.000) + txPrior (500.000) = 3.500.000
    expect(report.openingBalance).toBe(3_500_000);
    expect(report.periodIncome).toBe(2_250_000);
    expect(report.periodExpense).toBe(400_000);
    expect(report.periodNetCashFlow).toBe(1_850_000);
    expect(report.closingBalance).toBe(5_350_000);

    const csv = serializeMosqueReportToCsv(report, {
      accounts,
      funds,
      categories: DEFAULT_CATEGORIES,
    });
    expect(csv).toContain('Dana Operasional Umum');
    expect(csv).toContain('Infak Kotak Jumat');
    expect(csv).toContain('2250000');
  });

  describe('Dexie v5 Repository & Backup/Restore Round-Trip', () => {
    let testDb: NotaDatabase;

    beforeEach(async () => {
      testDb = new NotaDatabase(
        `NotaMosqueM1TestDb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      );
      await testDb.open();
    });

    it('initializes default CashAccounts, Funds, and Mosque Categories, and persists v5 entities & backups', async () => {
      const repo = createNotaRepository(testDb);

      await repo.saveInitialSetup({
        mosqueName: 'Masjid Agung Al-Falah',
        mosqueAddress: 'Jl. Raya Masjid No. 12',
        chairpersonName: 'H. Sulaiman',
        treasurerName: 'H. Ridwan',
        accountOpeningBalances: {
          [DEFAULT_CASH_ACCOUNT_TUNAI_ID]: 1_500_000,
          [DEFAULT_CASH_ACCOUNT_BANK_ID]: 8_500_000,
        },
        fundOpeningBalances: {
          [DEFAULT_FUND_OPERASIONAL_ID]: 4_000_000,
          [DEFAULT_FUND_PEMBANGUNAN_ID]: 5_000_000,
          [DEFAULT_FUND_SOSIAL_ZAKAT_ID]: 1_000_000,
        },
      });

      await repo.addTransaction({
        type: 'income',
        amount: 1_200_000,
        accountId: DEFAULT_CASH_ACCOUNT_TUNAI_ID,
        fundId: DEFAULT_FUND_OPERASIONAL_ID,
        categoryId: 'cat-inc-jumat',
        occurredAt: '2026-03-13',
        donorOrPayee: 'Jamaah Jumat',
      });

      await repo.addCashTransfer({
        fromAccountId: DEFAULT_CASH_ACCOUNT_TUNAI_ID,
        toAccountId: DEFAULT_CASH_ACCOUNT_BANK_ID,
        amount: 700_000,
        occurredAt: '2026-03-14',
        note: 'Setor kas tunai ke bank',
      });

      await repo.addBudgetPlan({
        title: 'Anggaran Operasional Maret 2026',
        kind: 'monthly_operational',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-31',
        fundId: DEFAULT_FUND_OPERASIONAL_ID,
        items: [
          {
            type: 'expense',
            categoryId: 'cat-exp-listrik-air',
            description: 'Tagihan PLN & PDAM',
            plannedAmount: 950_000,
          },
        ],
      });

      const state = await repo.loadWorkspaceState({
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      });

      expect(state.settings.mosqueName).toBe('Masjid Agung Al-Falah');
      expect(state.settings.openingBalance).toBe(10_000_000);
      expect(state.mosqueBalanceSplit.totalBalance).toBe(11_200_000);
      expect(state.cashTransfers).toHaveLength(1);
      expect(state.budgetPlans).toHaveLength(1);

      // Export & Restore Backup Round-Trip
      const backupPayload = await repo.exportBackup('2026-03-15T10:00:00.000Z');
      expect(backupPayload.schemaVersion).toBe(5);
      const rawJson = serializeBackupPayload(backupPayload);

      const validation = parseAndValidateBackupJson(rawJson);
      expect(validation.valid).toBe(true);
      if (validation.valid) {
        expect(validation.preview.summary.accountCount).toBe(2);
        expect(validation.preview.summary.fundCount).toBe(3);
        expect(validation.preview.summary.cashTransferCount).toBe(1);
        expect(validation.preview.summary.budgetPlanCount).toBe(1);
      }

      // Restore into a fresh database
      const freshDb = new NotaDatabase(
        `NotaMosqueM1FreshDb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      );
      await freshDb.open();
      const freshRepo = createNotaRepository(freshDb);
      await freshRepo.restoreBackup(rawJson);

      const restoredState = await freshRepo.loadWorkspaceState({
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      });
      expect(restoredState.settings.mosqueName).toBe('Masjid Agung Al-Falah');
      expect(restoredState.mosqueBalanceSplit.totalBalance).toBe(11_200_000);
      expect(restoredState.cashTransfers).toHaveLength(1);
      expect(restoredState.budgetPlans).toHaveLength(1);
    });
  });
});
