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
  applySavingsGoalEdit,
  calculateSavingsGoalsOverview,
  createSavingsGoal,
  validateSavingsGoalInput,
} from '../domain/savingsGoal';
import { DEFAULT_CATEGORIES } from '../domain/transaction';
import { OverviewFoundationPage } from '../features/overview/OverviewFoundationPage';
import { getMonthPeriod } from '../lib/date';

describe('Savings Goals (Opsi B — Milestone 7)', () => {
  const activeDatabases: NotaDatabase[] = [];

  function createIsolatedDb() {
    const dbName = `nota-savings-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

  it('validates savings goal input, supports partial edits, and rejects invalid names, amounts, or dates', () => {
    expect(
      validateSavingsGoalInput({
        name: '   ',
        targetAmount: 5_000_000,
        allocatedAmount: 0,
      }).valid,
    ).toBe(false);

    expect(
      validateSavingsGoalInput({
        name: 'Dana Darurat',
        targetAmount: 0,
        allocatedAmount: 0,
      }).valid,
    ).toBe(false);

    expect(
      validateSavingsGoalInput({
        name: 'Dana Darurat',
        targetAmount: 5_000_000,
        allocatedAmount: -10_000,
      }).valid,
    ).toBe(false);

    expect(
      validateSavingsGoalInput({
        name: 'Dana Darurat',
        targetAmount: 5_000_000,
        allocatedAmount: 1_000_000,
        targetDate: '2026-02-30',
      }).valid,
    ).toBe(false);

    const created = createSavingsGoal({
      id: 'goal-1',
      name: '  Dana Darurat  ',
      targetAmount: 10_000_000,
      allocatedAmount: 2_500_000,
      targetDate: '2026-12-31',
      note: '  6 bulan biaya hidup ',
      createdAt: '2026-10-01T10:00:00.000Z',
    });

    expect(created).toEqual({
      id: 'goal-1',
      name: 'Dana Darurat',
      targetAmount: 10_000_000,
      allocatedAmount: 2_500_000,
      targetDate: '2026-12-31',
      note: '6 bulan biaya hidup',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    });

    const edited = applySavingsGoalEdit(
      created,
      {
        allocatedAmount: 4_000_000,
        targetDate: null,
      },
      '2026-10-15T10:00:00.000Z',
    );
    expect(edited.allocatedAmount).toBe(4_000_000);
    expect(edited.targetDate).toBeUndefined();
    expect(edited.updatedAt).toBe('2026-10-15T10:00:00.000Z');
  });

  it('computes goal progress, unallocated balance, and over-allocation without altering recorded balance', () => {
    const goals = [
      createSavingsGoal({
        id: 'g-1',
        name: 'Dana Darurat',
        targetAmount: 10_000_000,
        allocatedAmount: 3_000_000,
        targetDate: '2026-12-31',
      }),
      createSavingsGoal({
        id: 'g-2',
        name: 'Laptop Kerja',
        targetAmount: 5_000_000,
        allocatedAmount: 5_000_000,
      }),
    ];

    // Case 1: currentBalance = 9,500,000 >= totalAllocatedAmount (8,000,000)
    const normalOverview = calculateSavingsGoalsOverview(goals, 9_500_000);
    expect(normalOverview.totalTargetAmount).toBe(15_000_000);
    expect(normalOverview.totalAllocatedAmount).toBe(8_000_000);
    expect(normalOverview.unallocatedBalance).toBe(1_500_000);
    expect(normalOverview.overAllocatedAmount).toBe(0);
    expect(normalOverview.completedCount).toBe(1);

    // Case 2: currentBalance = 6,000,000 < totalAllocatedAmount (8,000,000) -> overAllocated by 2,000,000
    const overOverview = calculateSavingsGoalsOverview(goals, 6_000_000);
    expect(overOverview.unallocatedBalance).toBe(-2_000_000);
    expect(overOverview.overAllocatedAmount).toBe(2_000_000);
  });

  it('persists savings goals, supports v1/v2/v3 backup export and restore, and never alters currentBalance', async () => {
    const db = createIsolatedDb();
    const repository = createNotaRepository(db);

    await repository.saveOpeningBalance(5_000_000, {
      completeOnboarding: true,
    });
    await repository.addTransaction({
      id: 'tx-inc-1',
      type: 'income',
      amount: 2_000_000,
      categoryId: 'cat-inc-gaji',
      occurredAt: '2026-10-05',
    });

    const goal = await repository.addSavingsGoal({
      id: 'goal-liburan',
      name: 'Liburan Keluarga',
      targetAmount: 6_000_000,
      allocatedAmount: 2_500_000,
      targetDate: '2026-12-20',
      note: 'Tiket & akomodasi',
    });
    expect(goal.allocatedAmount).toBe(2_500_000);

    const updatedGoal = await repository.updateSavingsGoal('goal-liburan', {
      allocatedAmount: 3_200_000,
    });
    expect(updatedGoal.allocatedAmount).toBe(3_200_000);

    // Recorded balance remains 5,000,000 + 2,000,000 = 7,000,000
    const state = await repository.loadWorkspaceState(getMonthPeriod(2026, 10));
    expect(state.overview.currentBalance).toBe(7_000_000);
    expect(state.savingsGoals).toHaveLength(1);

    // Export v3 backup and restore into a second isolated DB
    const exported = await repository.exportBackup('2026-10-25T10:00:00.000Z');
    expect(exported.schemaVersion).toBe(NOTA_SCHEMA_VERSION);
    expect(exported.savingsGoals).toHaveLength(1);

    const secondDb = createIsolatedDb();
    const secondRepo = createNotaRepository(secondDb);
    const preview = await secondRepo.restoreBackup(exported);
    expect(preview.summary.savingsGoalCount).toBe(1);
    const restoredGoals = await secondRepo.getSavingsGoals();
    expect(restoredGoals).toHaveLength(1);
    expect(restoredGoals[0].allocatedAmount).toBe(3_200_000);

    // Verify v2 backup (with budgets, without savingsGoals) restores cleanly
    const v2Payload = {
      appName: 'Nota',
      schemaVersion: 2,
      exportedAt: '2026-10-20T00:00:00.000Z',
      settings: {
        openingBalance: 1_000_000,
        currency: 'IDR',
        onboardingCompleted: true,
      },
      categories: DEFAULT_CATEGORIES,
      transactions: [],
      budgets: [
        {
          id: 'b-makanan',
          categoryId: 'cat-exp-makanan',
          monthlyLimit: 800_000,
          updatedAt: '2026-10-20T00:00:00.000Z',
        },
      ],
    };
    const v2Preview = await secondRepo.restoreBackup(v2Payload);
    expect(v2Preview.summary.budgetCount).toBe(1);
    expect(v2Preview.summary.savingsGoalCount).toBe(0);
    expect(await secondRepo.getSavingsGoals()).toHaveLength(0);

    await expect(secondRepo.deleteSavingsGoal('missing-goal')).rejects.toThrow(
      NotaStorageError,
    );
  });

  it('supports creating, editing, over-allocation warning, and deleting a savings goal through the UI', async () => {
    const db = createIsolatedDb();
    const repository = createNotaRepository(db);

    await repository.saveOpeningBalance(4_000_000, {
      completeOnboarding: true,
    });

    render(
      <OverviewFoundationPage
        repository={repository}
        initialYearMonth={{ year: 2026, month: 10 }}
        activeRoute="planning"
      />,
    );

    const savingsSection = await screen.findByRole('region', {
      name: /^Target Tabungan$/i,
    });

    expect(
      within(savingsSection).getByText(/Belum ada target tabungan/i),
    ).toBeInTheDocument();

    // Open form and create a goal ("Dana Darurat", target 5,000,000, allocated 1,500,000)
    fireEvent.click(
      within(savingsSection).getByRole('button', { name: /Tambah target/i }),
    );

    fireEvent.change(
      within(savingsSection).getByLabelText(/Nama target tabungan/i),
      { target: { value: 'Dana Darurat' } },
    );
    fireEvent.change(
      within(savingsSection).getByLabelText(/Target nominal \(IDR\)/i),
      { target: { value: '5000000' } },
    );
    fireEvent.change(
      within(savingsSection).getByLabelText(
        /Dana dialokasikan saat ini \(IDR\)/i,
      ),
      { target: { value: '1500000' } },
    );
    fireEvent.change(
      within(savingsSection).getByLabelText(/Catatan target \(opsional\)/i),
      { target: { value: 'Simpanan cadangan utama' } },
    );

    fireEvent.click(
      within(savingsSection).getByRole('button', { name: /Simpan target/i }),
    );

    // Verify summary strip and goal item
    await waitFor(() => {
      expect(
        within(savingsSection).getByTestId('savings-total-allocated'),
      ).toHaveTextContent(/Rp\s*1\.500\.000/);
    });
    expect(
      within(savingsSection).getByTestId('savings-unallocated-balance'),
    ).toHaveTextContent(/Rp\s*2\.500\.000/);
    expect(
      within(savingsSection).getByText('Dana Darurat'),
    ).toBeInTheDocument();
    expect(within(savingsSection).getByText(/30%/)).toBeInTheDocument();

    // Recorded balance is untouched at Rp 4.000.000
    expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
      /Rp\s*4\.000\.000/,
    );

    // Edit goal allocated amount to 4,500,000 (> 4,000,000 recorded balance) to trigger over-allocation notice
    fireEvent.click(
      within(savingsSection).getByRole('button', {
        name: /Ubah target Dana Darurat/i,
      }),
    );

    fireEvent.change(
      within(savingsSection).getByLabelText(
        /Dana dialokasikan saat ini \(IDR\)/i,
      ),
      { target: { value: '4500000' } },
    );
    fireEvent.click(
      within(savingsSection).getByRole('button', { name: /Simpan target/i }),
    );

    const overWarning = await within(savingsSection).findByTestId(
      'savings-overallocation-warning',
    );
    expect(overWarning).toHaveTextContent(
      /Alokasi target melebihi saldo tercatat saat ini/i,
    );
    expect(overWarning).toHaveTextContent(/Rp\s*500\.000/);

    // Delete goal with confirmation
    fireEvent.click(
      within(savingsSection).getByRole('button', {
        name: /Hapus target Dana Darurat/i,
      }),
    );
    fireEvent.click(
      within(savingsSection).getByRole('button', {
        name: /Ya, hapus target/i,
      }),
    );

    await waitFor(() => {
      expect(
        within(savingsSection).getByText(/Belum ada target tabungan/i),
      ).toBeInTheDocument();
    });
  });
});

