import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NOTA_BACKUP_APP_NAME,
  SUPPORTED_BACKUP_SCHEMA_VERSION,
  parseAndValidateBackupJson,
  serializeBackupPayload,
  serializeTransactionsToCsv,
} from '../data/backup/notaBackup';
import { NotaDatabase } from '../data/db';
import {
  createNotaRepository,
  NotaStorageError,
  type NotaRepository,
} from '../data/repositories/notaRepository';
import { DEFAULT_CATEGORIES } from '../domain/transaction';
import { OverviewFoundationPage } from '../features/overview/OverviewFoundationPage';

describe('Nota Milestone 5 — Local Data Backup and Restore', () => {
  let db: NotaDatabase;
  let repo: NotaRepository;
  let dbCounter = 0;

  beforeEach(async () => {
    dbCounter += 1;
    db = new NotaDatabase(`nota_test_backup_${Date.now()}_${dbCounter}`);
    repo = createNotaRepository(db);
    await repo.initialize();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('performs a lossless export and restore round trip preserving settings, custom/archived categories, and transactions', async () => {
    await repo.saveOpeningBalance(2_500_000, { completeOnboarding: true });
    await repo.addCategory({
      id: 'cat-exp-kursus',
      name: 'Kursus & Buku',
      type: 'expense',
      color: 'expense',
    });
    await repo.addTransaction({
      id: 'tx-roundtrip-1',
      type: 'income',
      amount: 4_000_000,
      categoryId: 'cat-inc-gaji',
      occurredAt: '2026-10-05',
      note: 'Gaji Oktober',
    });
    await repo.addTransaction({
      id: 'tx-roundtrip-2',
      type: 'expense',
      amount: 350_000,
      categoryId: 'cat-exp-hiburan',
      occurredAt: '2026-10-11',
      note: 'Konser musik',
    });
    // Archive category after transaction was created
    await repo.archiveCategoryById(
      'cat-exp-hiburan',
      '2026-10-15T08:00:00.000Z',
    );

    const exportedPayload = await repo.exportBackup('2026-10-27T12:00:00.000Z');
    expect(exportedPayload.appName).toBe(NOTA_BACKUP_APP_NAME);
    expect(exportedPayload.schemaVersion).toBe(SUPPORTED_BACKUP_SCHEMA_VERSION);
    expect(exportedPayload.exportedAt).toBe('2026-10-27T12:00:00.000Z');
    expect(exportedPayload.settings.openingBalance).toBe(2_500_000);
    expect(exportedPayload.transactions).toHaveLength(2);

    const jsonString = serializeBackupPayload(exportedPayload);

    // Mutate local DB with completely different data before restoring
    await repo.saveOpeningBalance(50_000, { completeOnboarding: true });
    await repo.deleteTransaction('tx-roundtrip-1');
    await repo.deleteTransaction('tx-roundtrip-2');
    await repo.addTransaction({
      id: 'tx-temp-other',
      type: 'expense',
      amount: 20_000,
      categoryId: 'cat-exp-makanan',
      occurredAt: '2026-10-20',
      note: 'Data sementara',
    });

    const restorePreview = await repo.restoreBackup(jsonString);
    expect(restorePreview.summary.openingBalance).toBe(2_500_000);
    // 2.500.000 + 4.000.000 - 350.000 = 6.150.000
    expect(restorePreview.summary.currentBalance).toBe(6_150_000);
    expect(restorePreview.summary.transactionCount).toBe(2);

    const restoredState = await repo.loadWorkspaceState({
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    });
    expect(restoredState.settings.openingBalance).toBe(2_500_000);
    expect(restoredState.overview.currentBalance).toBe(6_150_000);
    expect(restoredState.transactions.map((t) => t.id)).toEqual([
      'tx-roundtrip-2',
      'tx-roundtrip-1',
    ]);
    expect(
      restoredState.categories.find((c) => c.id === 'cat-exp-kursus')?.name,
    ).toBe('Kursus & Buku');
    expect(
      restoredState.categories.find((c) => c.id === 'cat-exp-hiburan')
        ?.archivedAt,
    ).toBe('2026-10-15T08:00:00.000Z');
  });

  it('rejects malformed JSON, unsupported schema versions, invalid settings, missing/mismatched categories, duplicate IDs, and invalid transactions without modifying existing data', async () => {
    await repo.saveOpeningBalance(900_000, { completeOnboarding: true });
    await repo.addTransaction({
      id: 'tx-existing-safe',
      type: 'expense',
      amount: 100_000,
      categoryId: 'cat-exp-makanan',
      occurredAt: '2026-10-10',
      note: 'Data aman jangan hilang',
    });

    const basePayload = await repo.exportBackup('2026-10-27T12:00:00.000Z');

    // 1. Malformed JSON
    await expect(repo.restoreBackup('{ json rusak')).rejects.toThrow(
      /bukan berformat JSON yang valid/i,
    );

    // 2. Wrong appName
    await expect(
      repo.restoreBackup({ ...basePayload, appName: 'AplikasiLain' }),
    ).rejects.toThrow(/bukan berasal dari aplikasi Nota/i);

    // 3. Unsupported schemaVersion
    await expect(
      repo.restoreBackup({ ...basePayload, schemaVersion: 99 }),
    ).rejects.toThrow(/Versi skema cadangan \(99\) tidak didukung/i);

    // 4. Corrupted settings (negative openingBalance)
    await expect(
      repo.restoreBackup({
        ...basePayload,
        settings: { ...basePayload.settings, openingBalance: -500 },
      }),
    ).rejects.toThrow(/Data pengaturan dalam cadangan tidak valid/i);

    // 5. Missing category reference on transaction
    await expect(
      repo.restoreBackup({
        ...basePayload,
        transactions: [
          {
            id: 'tx-bad-cat',
            type: 'expense',
            amount: 50_000,
            categoryId: 'cat-tidak-ada',
            occurredAt: '2026-10-12',
            createdAt: '2026-10-12T00:00:00.000Z',
            updatedAt: '2026-10-12T00:00:00.000Z',
          },
        ],
      }),
    ).rejects.toThrow(/Kategori yang dipilih tidak ditemukan/i);

    // 6. Mismatched category type (income transaction with expense category)
    await expect(
      repo.restoreBackup({
        ...basePayload,
        transactions: [
          {
            id: 'tx-mismatch-type',
            type: 'income',
            amount: 50_000,
            categoryId: 'cat-exp-makanan',
            occurredAt: '2026-10-12',
            createdAt: '2026-10-12T00:00:00.000Z',
            updatedAt: '2026-10-12T00:00:00.000Z',
          },
        ],
      }),
    ).rejects.toThrow(/tidak sesuai dengan jenis transaksi/i);

    // 7. Duplicate transaction IDs
    await expect(
      repo.restoreBackup({
        ...basePayload,
        transactions: [
          {
            id: 'tx-dup',
            type: 'expense',
            amount: 25_000,
            categoryId: 'cat-exp-makanan',
            occurredAt: '2026-10-12',
            createdAt: '2026-10-12T00:00:00.000Z',
            updatedAt: '2026-10-12T00:00:00.000Z',
          },
          {
            id: 'tx-dup',
            type: 'expense',
            amount: 35_000,
            categoryId: 'cat-exp-makanan',
            occurredAt: '2026-10-13',
            createdAt: '2026-10-13T00:00:00.000Z',
            updatedAt: '2026-10-13T00:00:00.000Z',
          },
        ],
      }),
    ).rejects.toThrow(/duplikasi ID transaksi "tx-dup"/i);

    // 8. Invalid transaction amount or date
    const invalidDateResult = parseAndValidateBackupJson(
      JSON.stringify({
        ...basePayload,
        transactions: [
          {
            id: 'tx-bad-date',
            type: 'expense',
            amount: 25_000,
            categoryId: 'cat-exp-makanan',
            occurredAt: '2026-02-30',
          },
        ],
      }),
    );
    expect(invalidDateResult.valid).toBe(false);

    // Verify existing data in IndexedDB was NEVER overwritten or partially lost
    const currentState = await repo.loadWorkspaceState();
    expect(currentState.settings.openingBalance).toBe(900_000);
    expect(currentState.transactions).toHaveLength(1);
    expect(currentState.transactions[0].id).toBe('tx-existing-safe');
    expect(currentState.overview.currentBalance).toBe(800_000);
  });

  it('rolls back atomically and preserves existing data if a storage write failure occurs during restore', async () => {
    await repo.saveOpeningBalance(1_200_000, { completeOnboarding: true });
    await repo.addTransaction({
      id: 'tx-before-crash',
      type: 'income',
      amount: 300_000,
      categoryId: 'cat-inc-gaji',
      occurredAt: '2026-10-08',
      note: 'Data sebelum gagal tulis',
    });

    const validReplacement = {
      appName: NOTA_BACKUP_APP_NAME,
      schemaVersion: SUPPORTED_BACKUP_SCHEMA_VERSION,
      exportedAt: '2026-10-27T14:00:00.000Z',
      settings: {
        openingBalance: 5_000_000,
        currency: 'IDR' as const,
        onboardingCompleted: true,
      },
      categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
      transactions: [
        {
          id: 'tx-new-1',
          type: 'expense' as const,
          amount: 500_000,
          categoryId: 'cat-exp-makanan',
          occurredAt: '2026-10-15',
          createdAt: '2026-10-15T00:00:00.000Z',
          updatedAt: '2026-10-15T00:00:00.000Z',
        },
      ],
    };

    // Simulate IndexedDB failure mid-transaction when inserting transactions
    const bulkAddSpy = vi
      .spyOn(db.transactions, 'bulkAdd')
      .mockRejectedValueOnce(new Error('Simulated Disk Full Error'));

    await expect(repo.restoreBackup(validReplacement)).rejects.toThrow(
      NotaStorageError,
    );

    bulkAddSpy.mockRestore();

    // Verify atomic rollback: original settings and original transaction are still present!
    const stateAfterFailedRestore = await repo.loadWorkspaceState();
    expect(stateAfterFailedRestore.settings.openingBalance).toBe(1_200_000);
    expect(stateAfterFailedRestore.transactions).toHaveLength(1);
    expect(stateAfterFailedRestore.transactions[0].id).toBe('tx-before-crash');
    expect(stateAfterFailedRestore.overview.currentBalance).toBe(1_500_000);
  });

  it('serializes CSV safely and supports the full UI preview, cancel, and confirmed restore workflow', async () => {
    await repo.saveOpeningBalance(1_000_000, { completeOnboarding: true });
    await repo.addTransaction({
      id: 'tx-csv-1',
      type: 'expense',
      amount: 75_000,
      categoryId: 'cat-exp-makanan',
      occurredAt: '2026-10-11',
      note: '=SUM(A1:A2), "kopi"',
    });

    const state = await repo.loadWorkspaceState();
    const csvOutput = serializeTransactionsToCsv(
      state.transactions,
      state.categories,
    );
    expect(csvOutput).toContain(
      'ID Transaksi,Tanggal,Jenis,Kategori,Nominal (IDR),Catatan',
    );
    // Formula injection prefixed with single quote and quotes escaped
    expect(csvOutput).toContain('"\'=SUM(A1:A2), ""kopi"""');

    render(
      <OverviewFoundationPage
        repository={repo}
        initialYearMonth={{ year: 2026, month: 10 }}
        activeRoute="settings"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
        /Rp\s*925\.000/,
      );
    });

    // Click "Ekspor cadangan" and verify status message
    fireEvent.click(screen.getByRole('button', { name: /Ekspor cadangan/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      /File cadangan JSON \(1 transaksi\) siap diunduh/i,
    );

    const fileInput = screen.getByLabelText(/Pilih file cadangan \(\.json\)/i);

    // 1. Upload invalid backup file -> displays alert, does not show preview
    const badFile = new File(['{ bukan json'], 'rusak.json', {
      type: 'application/json',
    });
    fireEvent.change(fileInput, { target: { files: [badFile] } });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /bukan berformat JSON yang valid/i,
    );
    expect(
      screen.queryByRole('region', { name: /Pratinjau pemulihan cadangan/i }),
    ).not.toBeInTheDocument();

    // 2. Upload valid backup file -> shows preview summary before replacing
    const replacementBackupJson = JSON.stringify({
      appName: NOTA_BACKUP_APP_NAME,
      schemaVersion: SUPPORTED_BACKUP_SCHEMA_VERSION,
      exportedAt: '2026-10-27T15:00:00.000Z',
      settings: {
        openingBalance: 3_000_000,
        currency: 'IDR',
        onboardingCompleted: true,
      },
      categories: DEFAULT_CATEGORIES,
      transactions: [
        {
          id: 'tx-restored-1',
          type: 'income',
          amount: 2_000_000,
          categoryId: 'cat-inc-usaha',
          occurredAt: '2026-10-19',
          note: 'Proyek desain UI',
          createdAt: '2026-10-19T10:00:00.000Z',
          updatedAt: '2026-10-19T10:00:00.000Z',
        },
      ],
    });

    const validFile = new File(
      [replacementBackupJson],
      'nota-cadangan-2026-10-27.json',
      { type: 'application/json' },
    );
    fireEvent.change(fileInput, { target: { files: [validFile] } });

    const previewRegion = await screen.findByRole('region', {
      name: /Pratinjau pemulihan cadangan/i,
    });
    expect(
      within(previewRegion).getByTestId('backup-preview-opening-balance'),
    ).toHaveTextContent(/Rp\s*3\.000\.000/);
    expect(
      within(previewRegion).getByTestId('backup-preview-current-balance'),
    ).toHaveTextContent(/Rp\s*5\.000\.000/);
    expect(
      within(previewRegion).getByTestId('backup-preview-tx-count'),
    ).toHaveTextContent('1 transaksi');

    // Cancel first -> existing data Rp 925.000 remains unchanged
    fireEvent.click(
      within(previewRegion).getByRole('button', { name: /^Batal$/i }),
    );
    expect(
      screen.queryByRole('region', { name: /Pratinjau pemulihan cadangan/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
      /Rp\s*925\.000/,
    );

    // Select file again and confirm replace
    fireEvent.change(fileInput, { target: { files: [validFile] } });
    const previewRegionAgain = await screen.findByRole('region', {
      name: /Pratinjau pemulihan cadangan/i,
    });
    fireEvent.click(
      within(previewRegionAgain).getByRole('button', {
        name: /Ganti data & pulihkan cadangan/i,
      }),
    );

    // Settings summary and persisted repository update to restored backup (Rp 5.000.000)
    await waitFor(() => {
      expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
        /Rp\s*5\.000\.000/,
      );
    });
    expect(screen.getByTestId('period-income-value')).toHaveTextContent(
      /\+Rp\s*2\.000\.000/,
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      /Cadangan berhasil dipulihkan \(1 transaksi/i,
    );
    const restoredTx = await repo.getTransactions();
    expect(restoredTx).toHaveLength(1);
    expect(restoredTx[0].note).toBe('Proyek desain UI');
  });
});

