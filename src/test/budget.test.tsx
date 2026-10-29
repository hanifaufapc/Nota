import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { NOTA_SCHEMA_VERSION, NotaDatabase } from '../data/db';
import {
  createNotaRepository,
  NotaStorageError,
} from '../data/repositories/notaRepository';
import {
  calculateBudgetOverview,
  createCategoryBudget,
  validateCategoryBudgetInput,
} from '../domain/budget';
import { DEFAULT_CATEGORIES } from '../domain/transaction';
import { OverviewFoundationPage } from '../features/overview/OverviewFoundationPage';
import { getMonthPeriod } from '../lib/date';

describe('Monthly Budgets by Category (Opsi A — Milestone 7)', () => {
  const activeDatabases: NotaDatabase[] = [];

  function createIsolatedDb() {
    const dbName = `nota-budget-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const database = new NotaDatabase(dbName);
    activeDatabases.push(database);
    return database;
  }

  afterEach(async () => {
    while (activeDatabases.length > 0) {
      const db = activeDatabases.pop();
      if (db) {
        await db.delete();
      }
    }
  });

  it('validates category budget input and rejects income categories or non-positive limits', () => {
    // Rejects income category
    const incomeAttempt = validateCategoryBudgetInput(
      {
        categoryId: 'cat-inc-gaji',
        monthlyLimit: 1_000_000,
      },
      DEFAULT_CATEGORIES,
    );
    expect(incomeAttempt.valid).toBe(false);
    expect(incomeAttempt.errors[0]).toMatch(/kategori pengeluaran/i);

    // Rejects 0 or negative limits
    const zeroAttempt = validateCategoryBudgetInput(
      {
        categoryId: 'cat-exp-makanan',
        monthlyLimit: 0,
      },
      DEFAULT_CATEGORIES,
    );
    expect(zeroAttempt.valid).toBe(false);

    // Accepts valid expense category and positive integer IDR
    const validBudget = createCategoryBudget(
      {
        id: 'budget-makanan',
        categoryId: 'cat-exp-makanan',
        monthlyLimit: 1_500_000,
        updatedAt: '2026-10-10T08:00:00.000Z',
      },
      DEFAULT_CATEGORIES,
    );
    expect(validBudget).toEqual({
      id: 'budget-makanan',
      categoryId: 'cat-exp-makanan',
      monthlyLimit: 1_500_000,
      updatedAt: '2026-10-10T08:00:00.000Z',
    });
  });

  it('computes safe, near-limit, and exceeded statuses purely from period expense transactions', () => {
    const octoberPeriod = getMonthPeriod(2026, 10);
    const budgets = [
      createCategoryBudget(
        {
          id: 'b-makanan',
          categoryId: 'cat-exp-makanan',
          monthlyLimit: 1_000_000,
        },
        DEFAULT_CATEGORIES,
      ),
      createCategoryBudget(
        {
          id: 'b-transport',
          categoryId: 'cat-exp-transportasi',
          monthlyLimit: 500_000,
        },
        DEFAULT_CATEGORIES,
      ),
      createCategoryBudget(
        {
          id: 'b-hiburan',
          categoryId: 'cat-exp-hiburan',
          monthlyLimit: 300_000,
        },
        DEFAULT_CATEGORIES,
      ),
    ];

    const transactions = [
      // Safe: 400k / 1,000k (40%)
      {
        id: 'tx-1',
        type: 'expense' as const,
        amount: 400_000,
        categoryId: 'cat-exp-makanan',
        occurredAt: '2026-10-05',
        createdAt: '2026-10-05T10:00:00.000Z',
        updatedAt: '2026-10-05T10:00:00.000Z',
      },
      // Near-limit: 425k / 500k (85%)
      {
        id: 'tx-2',
        type: 'expense' as const,
        amount: 425_000,
        categoryId: 'cat-exp-transportasi',
        occurredAt: '2026-10-12',
        createdAt: '2026-10-12T10:00:00.000Z',
        updatedAt: '2026-10-12T10:00:00.000Z',
      },
      // Exceeded: 360k / 300k (120%)
      {
        id: 'tx-3',
        type: 'expense' as const,
        amount: 360_000,
        categoryId: 'cat-exp-hiburan',
        occurredAt: '2026-10-18',
        createdAt: '2026-10-18T10:00:00.000Z',
        updatedAt: '2026-10-18T10:00:00.000Z',
      },
      // Outside period (September) — must be ignored
      {
        id: 'tx-prev-month',
        type: 'expense' as const,
        amount: 900_000,
        categoryId: 'cat-exp-makanan',
        occurredAt: '2026-09-28',
        createdAt: '2026-09-28T10:00:00.000Z',
        updatedAt: '2026-09-28T10:00:00.000Z',
      },
    ];

    const overview = calculateBudgetOverview(
      budgets,
      transactions,
      DEFAULT_CATEGORIES,
      octoberPeriod,
    );

    expect(overview.totalBudgetedLimit).toBe(1_800_000);
    expect(overview.totalBudgetedSpent).toBe(1_185_000);
    // Net remaining (1,800,000 - 1,185,000 = 615,000)
    expect(overview.totalRemaining).toBe(615_000);
    expect(overview.exceededCount).toBe(1);

    const hiburanItem = overview.items.find(
      (i) => i.categoryId === 'cat-exp-hiburan',
    );
    expect(hiburanItem?.status).toBe('exceeded');
    expect(hiburanItem?.overAmount).toBe(60_000);
    expect(hiburanItem?.remainingAmount).toBe(0);

    const transportItem = overview.items.find(
      (i) => i.categoryId === 'cat-exp-transportasi',
    );
    expect(transportItem?.status).toBe('near-limit');
    expect(transportItem?.usagePercent).toBe(85);
    expect(transportItem?.remainingAmount).toBe(75_000);

    const makananItem = overview.items.find(
      (i) => i.categoryId === 'cat-exp-makanan',
    );
    expect(makananItem?.status).toBe('safe');
    expect(makananItem?.usagePercent).toBe(40);
    expect(makananItem?.remainingAmount).toBe(600_000);
  });

  it('persists category budgets, upserts by categoryId, supports v1 and v2 backups, and never alters balance', async () => {
    const db = createIsolatedDb();
    const repository = createNotaRepository(db);

    await repository.saveOpeningBalance(2_000_000, {
      completeOnboarding: true,
    });
    await repository.addTransaction({
      id: 'tx-budget-1',
      type: 'expense',
      amount: 250_000,
      categoryId: 'cat-exp-makanan',
      occurredAt: '2026-10-10',
      note: 'Belanja bahan masakan',
    });

    const stateBeforeBudget = await repository.loadWorkspaceState(
      getMonthPeriod(2026, 10),
    );
    expect(stateBeforeBudget.overview.currentBalance).toBe(1_750_000);

    // Save budget for Makanan & Minuman
    const saved = await repository.saveCategoryBudget({
      categoryId: 'cat-exp-makanan',
      monthlyLimit: 1_200_000,
    });
    expect(saved.monthlyLimit).toBe(1_200_000);

    // Upsert existing budget for the same categoryId
    const updated = await repository.saveCategoryBudget({
      categoryId: 'cat-exp-makanan',
      monthlyLimit: 1_500_000,
    });
    expect(updated.id).toBe(saved.id);
    expect(updated.monthlyLimit).toBe(1_500_000);

    const allBudgets = await repository.getBudgets();
    expect(allBudgets).toHaveLength(1);

    // Verify currentBalance & period summary are untouched by saving budgets
    const stateAfterBudget = await repository.loadWorkspaceState(
      getMonthPeriod(2026, 10),
    );
    expect(stateAfterBudget.overview.currentBalance).toBe(1_750_000);
    expect(stateAfterBudget.overview.periodSummary.expense).toBe(250_000);

    // Export backup and restore into a fresh database
    const exportedPayload = await repository.exportBackup(
      '2026-10-20T12:00:00.000Z',
    );
    expect(exportedPayload.schemaVersion).toBe(NOTA_SCHEMA_VERSION);
    expect(exportedPayload.budgets).toHaveLength(1);

    const secondDb = createIsolatedDb();
    const secondRepo = createNotaRepository(secondDb);
    const preview = await secondRepo.restoreBackup(exportedPayload);
    expect(preview.summary.budgetCount).toBe(1);
    const restoredBudgets = await secondRepo.getBudgets();
    expect(restoredBudgets).toHaveLength(1);
    expect(restoredBudgets[0].monthlyLimit).toBe(1_500_000);

    // Verify legacy v1 backup without budgets restores cleanly
    const legacyV1Payload = {
      appName: 'Nota',
      schemaVersion: 1,
      exportedAt: '2026-10-01T00:00:00.000Z',
      settings: {
        openingBalance: 500_000,
        currency: 'IDR',
        onboardingCompleted: true,
      },
      categories: DEFAULT_CATEGORIES,
      transactions: [],
    };
    const v1Preview = await secondRepo.restoreBackup(legacyV1Payload);
    expect(v1Preview.summary.budgetCount).toBe(0);
    expect(await secondRepo.getBudgets()).toHaveLength(0);

    // Rejects deleting non-existent budget
    await expect(
      secondRepo.deleteCategoryBudget('cat-exp-makanan'),
    ).rejects.toThrow(NotaStorageError);
  });

  it('supports creating, updating, and deleting a monthly category budget through the UI', async () => {
    const db = createIsolatedDb();
    const repository = createNotaRepository(db);

    await repository.saveOpeningBalance(3_000_000, {
      completeOnboarding: true,
    });
    await repository.addTransaction({
      id: 'tx-ui-budget-1',
      type: 'expense',
      amount: 450_000,
      categoryId: 'cat-exp-makanan',
      occurredAt: '2026-10-14',
      note: 'Makan siang kantor',
    });

    render(
      <OverviewFoundationPage
        repository={repository}
        initialYearMonth={{ year: 2026, month: 10 }}
        activeRoute="planning"
      />,
    );

    const budgetSection = await screen.findByRole('region', {
      name: /Anggaran Bulanan per Kategori/i,
    });

    expect(
      within(budgetSection).getByText(/Belum ada anggaran kategori/i),
    ).toBeInTheDocument();

    // Verify recorded balance before budget
    expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
      /Rp\s*2\.550\.000/,
    );

    // Open budget form and create a 1,000,000 IDR budget for Makanan & Minuman
    fireEvent.click(
      within(budgetSection).getByRole('button', { name: /Atur anggaran/i }),
    );

    const categorySelect = within(budgetSection).getByLabelText(
      /Kategori pengeluaran/i,
    );
    fireEvent.change(categorySelect, { target: { value: 'cat-exp-makanan' } });

    const limitInput = within(budgetSection).getByLabelText(
      /Batas anggaran bulanan \(IDR\)/i,
    );
    fireEvent.change(limitInput, { target: { value: '1000000' } });

    fireEvent.click(
      within(budgetSection).getByRole('button', { name: /Simpan anggaran/i }),
    );

    // Verify budget item appears with 45% progress (Rp 450.000 dari Rp 1.000.000)
    const budgetItem = await within(budgetSection).findByTestId(
      'budget-item-cat-exp-makanan',
    );
    expect(budgetItem).toHaveTextContent('Makanan & Minuman');
    expect(budgetItem).toHaveTextContent('Dalam anggaran');
    expect(budgetItem).toHaveTextContent('45%');
    expect(budgetItem).toHaveTextContent(/Sisa Rp\s*550\.000/);

    // Recorded balance is completely unchanged
    expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
      /Rp\s*2\.550\.000/,
    );

    // Edit the budget to 400,000 IDR so status becomes "Melebihi anggaran"
    fireEvent.click(
      within(budgetItem).getByRole('button', {
        name: /Ubah anggaran Makanan & Minuman/i,
      }),
    );

    const editLimitInput = within(budgetSection).getByLabelText(
      /Batas anggaran bulanan \(IDR\)/i,
    );
    fireEvent.change(editLimitInput, { target: { value: '400000' } });
    fireEvent.click(
      within(budgetSection).getByRole('button', { name: /Simpan anggaran/i }),
    );

    await waitFor(() => {
      expect(
        within(budgetSection).getByTestId('budget-item-cat-exp-makanan'),
      ).toHaveTextContent('Melebihi anggaran');
    });
    expect(
      within(budgetSection).getByTestId('budget-item-cat-exp-makanan'),
    ).toHaveTextContent(/Lewat Rp\s*50\.000/);

    // Delete the budget with confirmation
    fireEvent.click(
      within(budgetSection).getByRole('button', {
        name: /Hapus anggaran Makanan & Minuman/i,
      }),
    );
    fireEvent.click(
      within(budgetSection).getByRole('button', {
        name: /Ya, hapus anggaran/i,
      }),
    );

    await waitFor(() => {
      expect(
        within(budgetSection).getByText(/Belum ada anggaran kategori/i),
      ).toBeInTheDocument();
    });
  });
});

