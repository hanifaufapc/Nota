import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NotaDatabase } from '../data/db';
import {
  NotaStorageError,
  createNotaRepository,
} from '../data/repositories/notaRepository';
import { DEFAULT_CATEGORIES } from '../domain/transaction';
import { OverviewFoundationPage } from '../features/overview/OverviewFoundationPage';
import { getMonthPeriod } from '../lib/date';

describe('Nota Milestone 2 — Local Persistence & First-Run Setup', () => {
  let dbName: string;
  let dbInstance: NotaDatabase;

  beforeEach(() => {
    dbName = `nota_test_db_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    dbInstance = new NotaDatabase(dbName);
  });

  afterEach(async () => {
    await dbInstance.delete();
  });

  it('initializes an empty database with default settings and default Indonesian categories without fake transactions, and is idempotent when called repeatedly', async () => {
    const repo = createNotaRepository(dbInstance);
    const state = await repo.loadWorkspaceState(getMonthPeriod(2026, 10));

    expect(state.settings).toEqual({
      openingBalance: 0,
      currency: 'IDR',
      onboardingCompleted: false,
    });
    expect(state.categories).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(state.transactions).toEqual([]);
    expect(state.overview.currentBalance).toBe(0);
    expect(state.overview.periodSummary.income).toBe(0);
    expect(state.overview.periodSummary.expense).toBe(0);

    // Rename one default category, archive another, then call initialize() repeatedly
    await repo.updateCategoryName('cat-exp-makanan', 'Konsumsi Harian');
    await repo.archiveCategoryById(
      'cat-inc-bonus',
      '2026-10-27T10:00:00.000Z',
    );

    const secondInit = await repo.initialize();
    const thirdInit = await repo.initialize();

    expect(secondInit.categories).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(thirdInit.categories).toHaveLength(DEFAULT_CATEGORIES.length);

    const renamedFood = thirdInit.categories.find(
      (c) => c.id === 'cat-exp-makanan',
    );
    const archivedBonus = thirdInit.categories.find(
      (c) => c.id === 'cat-inc-bonus',
    );
    expect(renamedFood?.name).toBe('Konsumsi Harian');
    expect(archivedBonus?.archivedAt).toBe('2026-10-27T10:00:00.000Z');
  });

  it('persists opening balance across database close/reopen and never counts opening balance as period income', async () => {
    const repo1 = createNotaRepository(dbInstance);
    await repo1.initialize();

    const savedSettings = await repo1.saveOpeningBalance(3_500_000, {
      completeOnboarding: true,
    });
    expect(savedSettings).toEqual({
      openingBalance: 3_500_000,
      currency: 'IDR',
      onboardingCompleted: true,
    });

    // Simulate closing the browser and reopening a fresh NotaDatabase instance on the same IndexedDB name
    dbInstance.close();
    const reopenedDb = new NotaDatabase(dbName);
    dbInstance = reopenedDb;
    const repo2 = createNotaRepository(reopenedDb);

    const stateAfterReload = await repo2.loadWorkspaceState(
      getMonthPeriod(2026, 10),
    );
    expect(stateAfterReload.settings).toEqual({
      openingBalance: 3_500_000,
      currency: 'IDR',
      onboardingCompleted: true,
    });
    expect(stateAfterReload.transactions).toHaveLength(0);
    expect(stateAfterReload.overview.currentBalance).toBe(3_500_000);
    expect(stateAfterReload.overview.periodSummary.income).toBe(0);
    expect(stateAfterReload.overview.periodSummary.netCashFlow).toBe(0);
  });

  it('persists transactions and category operations through the repository and integrates with domain summaries', async () => {
    const repo = createNotaRepository(dbInstance);
    await repo.saveOpeningBalance(1_000_000);

    const addedTx = await repo.addTransaction({
      id: 'tx-persisted-1',
      type: 'income',
      amount: 2_500_000,
      categoryId: 'cat-inc-gaji',
      occurredAt: '2026-10-12',
      note: 'Gaji paruh waktu',
    });
    expect(addedTx.amount).toBe(2_500_000);

    // Edit transaction in-place
    const updatedTx = await repo.updateTransaction('tx-persisted-1', {
      amount: 3_000_000,
      note: 'Gaji penuh',
    });
    expect(updatedTx.amount).toBe(3_000_000);

    const state = await repo.loadWorkspaceState(getMonthPeriod(2026, 10));
    expect(state.transactions).toHaveLength(1);
    expect(state.overview.currentBalance).toBe(4_000_000); // 1.000.000 + 3.000.000
    expect(state.overview.periodSummary.income).toBe(3_000_000);

    // Custom category add, rename, and archive
    const customCat = await repo.addCategory({
      id: 'cat-exp-buku',
      name: 'Buku & Kursus',
      type: 'expense',
      color: 'expense',
    });
    expect(customCat.name).toBe('Buku & Kursus');

    const renamedCat = await repo.updateCategoryName(
      'cat-exp-buku',
      'Edukasi & Buku',
    );
    expect(renamedCat.name).toBe('Edukasi & Buku');

    const archivedCat = await repo.archiveCategoryById('cat-exp-buku');
    expect(archivedCat.archivedAt).toBeDefined();

    // Delete transaction
    await repo.deleteTransaction('tx-persisted-1');
    const stateAfterDelete = await repo.loadWorkspaceState(
      getMonthPeriod(2026, 10),
    );
    expect(stateAfterDelete.transactions).toHaveLength(0);
    expect(stateAfterDelete.overview.currentBalance).toBe(1_000_000);
  });

  it('rejects invalid opening balance, duplicate IDs, and missing IDs with NotaStorageError', async () => {
    const repo = createNotaRepository(dbInstance);
    await repo.initialize();

    await expect(repo.saveOpeningBalance(-100)).rejects.toThrow(
      NotaStorageError,
    );
    await expect(
      repo.addTransaction({
        id: 'tx-invalid',
        type: 'expense',
        amount: 0,
        categoryId: 'cat-exp-makanan',
        occurredAt: '2026-10-15',
      }),
    ).rejects.toThrow(NotaStorageError);

    await expect(
      repo.updateTransaction('tx-missing', { amount: 50_000 }),
    ).rejects.toThrow(NotaStorageError);

    await expect(repo.deleteTransaction('tx-missing')).rejects.toThrow(
      NotaStorageError,
    );

    await expect(
      repo.addCategory({
        id: 'cat-invalid',
        name: '   ',
        type: 'expense',
        color: 'expense',
      }),
    ).rejects.toThrow(NotaStorageError);
  });

  it('supports first-run opening balance setup and subsequent opening balance edits in the UI', async () => {
    const repo = createNotaRepository(dbInstance);
    render(<OverviewFoundationPage repository={repo} />);

    // First-run onboarding panel appears automatically when onboardingCompleted is false
    const heading = await screen.findByRole('heading', {
      name: /Atur saldo awal catatan Anda/i,
    });
    expect(heading).toBeInTheDocument();

    const input = screen.getByLabelText(/Nominal saldo awal \(IDR\)/i);
    fireEvent.change(input, { target: { value: '1500000' } });
    expect(input).toHaveValue('1.500.000');

    const saveBtn = screen.getByRole('button', {
      name: /Simpan & mulai gunakan Nota/i,
    });
    fireEvent.click(saveBtn);

    // Onboarding panel closes and hero opening balance pill updates to Rp 1.500.000
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', {
          name: /Atur saldo awal catatan Anda/i,
        }),
      ).not.toBeInTheDocument();
    });

    expect(
      screen.getAllByText(/Rp\s*1\.500\.000/).length,
    ).toBeGreaterThanOrEqual(1);

    // User can open the "Atur saldo awal" editor later and update the opening balance
    const editBtn = screen.getByRole('button', { name: /Atur saldo awal/i });
    fireEvent.click(editBtn);

    expect(
      await screen.findByRole('heading', { name: /Ubah saldo awal catatan/i }),
    ).toBeInTheDocument();

    const editInput = screen.getByLabelText(/Nominal saldo awal \(IDR\)/i);
    fireEvent.change(editInput, { target: { value: '2250000' } });
    fireEvent.click(
      screen.getByRole('button', { name: /Simpan saldo awal/i }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /Ubah saldo awal catatan/i }),
      ).not.toBeInTheDocument();
    });

    const settings = await repo.getSettings();
    expect(settings.openingBalance).toBe(2_250_000);
  });

  it('surfaces storage read errors honestly without fabricating a Rp 0 balance, and recovers on retry', async () => {
    const realRepo = createNotaRepository(dbInstance);
    let shouldFail = true;

    const flakyRepo = {
      ...realRepo,
      loadWorkspaceState: async () => {
        if (shouldFail) {
          throw new NotaStorageError(
            'Simulasi kegagalan membaca IndexedDB pada browser.',
          );
        }
        return realRepo.loadWorkspaceState();
      },
    };

    render(<OverviewFoundationPage repository={flakyRepo} />);

    const alertBanner = await screen.findByRole('alert');
    expect(alertBanner).toHaveTextContent(
      /Penyimpanan lokal tidak dapat diakses/i,
    );
    expect(alertBanner).toHaveTextContent(
      /Simulasi kegagalan membaca IndexedDB pada browser/i,
    );

    const retryBtn = screen.getByRole('button', { name: /Coba muat ulang/i });
    shouldFail = false;
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    // After recovery, the first-run onboarding setup appears normally
    expect(
      await screen.findByRole('heading', {
        name: /Atur saldo awal catatan Anda/i,
      }),
    ).toBeInTheDocument();

    // Test "Mulai dari Rp 0" quick onboarding button
    const startZeroBtn = screen.getByRole('button', {
      name: /Mulai dari Rp 0/i,
    });
    fireEvent.click(startZeroBtn);

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', {
          name: /Atur saldo awal catatan Anda/i,
        }),
      ).not.toBeInTheDocument();
    });

    const settings = await realRepo.getSettings();
    expect(settings).toEqual({
      openingBalance: 0,
      currency: 'IDR',
      onboardingCompleted: true,
    });
  });

  it('displays an inline error alert inside OpeningBalanceSetup when saving opening balance fails', async () => {
    const repo = createNotaRepository(dbInstance);
    const failingSaveRepo = {
      ...repo,
      saveOpeningBalance: async () => {
        throw new NotaStorageError(
          'Gagal menulis ke IndexedDB karena ruang penyimpanan penuh.',
        );
      },
    };

    render(<OverviewFoundationPage repository={failingSaveRepo} />);

    await screen.findByRole('heading', {
      name: /Atur saldo awal catatan Anda/i,
    });

    const startZeroBtn = screen.getByRole('button', {
      name: /Mulai dari Rp 0/i,
    });
    fireEvent.click(startZeroBtn);

    const errorAlert = await screen.findByRole('alert');
    expect(errorAlert).toHaveTextContent(
      /Gagal menulis ke IndexedDB karena ruang penyimpanan penuh/i,
    );
  });
});
