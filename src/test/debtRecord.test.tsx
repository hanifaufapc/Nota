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
  applyDebtRecordEdit,
  calculateDebtRecordsOverview,
  createDebtRecord,
  settleDebtRecord,
  validateDebtRecordInput,
} from '../domain/debtRecord';
import { DEFAULT_CATEGORIES } from '../domain/transaction';
import { OverviewFoundationPage } from '../features/overview/OverviewFoundationPage';
import { getMonthPeriod } from '../lib/date';

describe('Debt & Receivable Tracking (Opsi D — Milestone 7)', () => {
  const activeDatabases: NotaDatabase[] = [];

  function createIsolatedDb() {
    const dbName = `nota-debt-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

  it('validates debt/receivable input, enforces remainingAmount <= amount, and derives status consistently', () => {
    // Rejects empty personName
    expect(
      validateDebtRecordInput({
        direction: 'payable',
        personName: '   ',
        amount: 500_000,
      }).valid,
    ).toBe(false);

    // Rejects remainingAmount > amount
    const overRemaining = validateDebtRecordInput({
      direction: 'payable',
      personName: 'Budi',
      amount: 500_000,
      remainingAmount: 600_000,
    });
    expect(overRemaining.valid).toBe(false);
    expect(overRemaining.errors[0]).toMatch(/tidak boleh melebihi nominal awal/i);

    // Creates open record when remainingAmount > 0
    const openRecord = createDebtRecord({
      id: 'd-1',
      direction: 'payable',
      personName: '  Budi Santoso  ',
      amount: 1_000_000,
      remainingAmount: 600_000,
      dueDate: '2026-11-15',
      note: '  Pinjaman darurat ',
      createdAt: '2026-10-10T08:00:00.000Z',
    });
    expect(openRecord.status).toBe('open');
    expect(openRecord.personName).toBe('Budi Santoso');
    expect(openRecord.note).toBe('Pinjaman darurat');

    // Editing remainingAmount to 0 transitions status to 'settled'
    const settled = settleDebtRecord(openRecord, '2026-10-20T09:00:00.000Z');
    expect(settled.remainingAmount).toBe(0);
    expect(settled.status).toBe('settled');

    // Editing remainingAmount back to 200,000 transitions status back to 'open'
    const reopened = applyDebtRecordEdit(
      settled,
      { remainingAmount: 200_000 },
      '2026-10-21T09:00:00.000Z',
    );
    expect(reopened.status).toBe('open');
    expect(reopened.remainingAmount).toBe(200_000);
  });

  it('computes open payable, open receivable, and net obligation position purely from open obligations', () => {
    const records = [
      createDebtRecord({
        id: 'd-pay-open',
        direction: 'payable',
        personName: 'Andi',
        amount: 1_000_000,
        remainingAmount: 400_000,
      }),
      createDebtRecord({
        id: 'd-rec-open',
        direction: 'receivable',
        personName: 'Siti',
        amount: 1_500_000,
        remainingAmount: 900_000,
      }),
      createDebtRecord({
        id: 'd-pay-settled',
        direction: 'payable',
        personName: 'Koperasi',
        amount: 2_000_000,
        remainingAmount: 0,
      }),
    ];

    const overview = calculateDebtRecordsOverview(records);
    expect(overview.totalOpenPayable).toBe(400_000);
    expect(overview.totalOpenReceivable).toBe(900_000);
    // 900,000 receivable - 400,000 payable = +500,000
    expect(overview.netObligationPosition).toBe(500_000);
    expect(overview.openCount).toBe(2);
    expect(overview.settledCount).toBe(1);
  });

  it('persists debt records, supports v1–v4 backup round-trip, and never alters recorded cash balance', async () => {
    const db = createIsolatedDb();
    const repository = createNotaRepository(db);

    await repository.saveOpeningBalance(3_500_000, {
      completeOnboarding: true,
    });

    const added = await repository.addDebtRecord({
      id: 'debt-1',
      direction: 'payable',
      personName: 'Rina',
      amount: 800_000,
      remainingAmount: 500_000,
      dueDate: '2026-11-01',
    });
    expect(added.status).toBe('open');

    // Recorded balance remains 3,500,000
    const stateAfterAdd = await repository.loadWorkspaceState(
      getMonthPeriod(2026, 10),
    );
    expect(stateAfterAdd.overview.currentBalance).toBe(3_500_000);
    expect(stateAfterAdd.debtRecords).toHaveLength(1);

    // Settle debt record
    const settled = await repository.settleDebtRecordById('debt-1');
    expect(settled.status).toBe('settled');
    expect(settled.remainingAmount).toBe(0);

    // Recorded balance still remains 3,500,000 (no double-counting)
    const stateAfterSettle = await repository.loadWorkspaceState(
      getMonthPeriod(2026, 10),
    );
    expect(stateAfterSettle.overview.currentBalance).toBe(3_500_000);

    // Export v4 backup and restore into a fresh database
    const exported = await repository.exportBackup('2026-10-27T12:00:00.000Z');
    expect(exported.schemaVersion).toBe(NOTA_SCHEMA_VERSION);
    expect(exported.debtRecords).toHaveLength(1);

    const secondDb = createIsolatedDb();
    const secondRepo = createNotaRepository(secondDb);
    const preview = await secondRepo.restoreBackup(exported);
    expect(preview.summary.debtRecordCount).toBe(1);
    const restoredRecords = await secondRepo.getDebtRecords();
    expect(restoredRecords).toHaveLength(1);
    expect(restoredRecords[0].status).toBe('settled');

    // Verify v3 backup without debtRecords restores cleanly
    const v3Payload = {
      appName: 'Nota',
      schemaVersion: 3,
      exportedAt: '2026-10-25T00:00:00.000Z',
      settings: {
        openingBalance: 1_200_000,
        currency: 'IDR',
        onboardingCompleted: true,
      },
      categories: DEFAULT_CATEGORIES,
      transactions: [],
      budgets: [],
      savingsGoals: [],
    };
    const v3Preview = await secondRepo.restoreBackup(v3Payload);
    expect(v3Preview.summary.debtRecordCount).toBe(0);
    expect(await secondRepo.getDebtRecords()).toHaveLength(0);

    await expect(secondRepo.deleteDebtRecord('non-existent')).rejects.toThrow(
      NotaStorageError,
    );
  });

  it('supports creating, filtering, settling, editing, and deleting debt/receivable records in the UI', async () => {
    const db = createIsolatedDb();
    const repository = createNotaRepository(db);

    await repository.saveOpeningBalance(2_500_000, {
      completeOnboarding: true,
    });

    render(
      <OverviewFoundationPage
        repository={repository}
        initialYearMonth={{ year: 2026, month: 10 }}
        activeRoute="planning"
      />,
    );

    const debtSection = await screen.findByRole('region', {
      name: /Catatan Utang & Piutang/i,
    });

    expect(
      within(debtSection).getByText(/Belum ada catatan utang atau piutang/i),
    ).toBeInTheDocument();

    // Open form and add a Payable record ("Budi Santoso", 1,000,000 initial, 600,000 remaining)
    fireEvent.click(
      within(debtSection).getByRole('button', { name: /Tambah catatan/i }),
    );

    fireEvent.change(
      within(debtSection).getByLabelText(/Jenis catatan/i),
      { target: { value: 'payable' } },
    );
    fireEvent.change(
      within(debtSection).getByLabelText(/Nama pihak terkait/i),
      { target: { value: 'Budi Santoso' } },
    );
    fireEvent.change(
      within(debtSection).getByLabelText(/Nominal awal \(IDR\)/i),
      { target: { value: '1000000' } },
    );
    fireEvent.change(
      within(debtSection).getByLabelText(
        /Sisa nominal belum lunas \(IDR\)/i,
      ),
      { target: { value: '600000' } },
    );

    fireEvent.click(
      within(debtSection).getByRole('button', { name: /Simpan catatan/i }),
    );

    await waitFor(() => {
      expect(
        within(debtSection).getByTestId('debt-total-open-payable'),
      ).toHaveTextContent(/Rp\s*600\.000/);
    });
    expect(within(debtSection).getByText('Budi Santoso')).toBeInTheDocument();
    expect(within(debtSection).getByText(/40% selesai/)).toBeInTheDocument();

    // Recorded balance remains Rp 2.500.000
    expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
      /Rp\s*2\.500\.000/,
    );

    // Click "Tandai lunas" to settle the debt
    fireEvent.click(
      within(debtSection).getByRole('button', {
        name: /Tandai lunas Budi Santoso/i,
      }),
    );

    await waitFor(() => {
      expect(
        within(debtSection).getByTestId('debt-total-open-payable'),
      ).toHaveTextContent(/Rp\s*0/);
    });
    expect(within(debtSection).getByText(/100% selesai/)).toBeInTheDocument();

    // Filter by "Belum lunas (0)" -> shows empty filtered state
    fireEvent.click(
      within(debtSection).getByRole('button', { name: /Belum lunas \(0\)/i }),
    );
    expect(
      within(debtSection).getByText(
        /Tidak ada catatan utang\/piutang dengan status ini/i,
      ),
    ).toBeInTheDocument();

    // Switch filter to "Lunas (1)" and delete the record with confirmation
    fireEvent.click(
      within(debtSection).getByRole('button', { name: /^Lunas \(1\)$/i }),
    );

    fireEvent.click(
      within(debtSection).getByRole('button', {
        name: /Hapus catatan Budi Santoso/i,
      }),
    );
    fireEvent.click(
      within(debtSection).getByRole('button', {
        name: /Ya, hapus catatan/i,
      }),
    );

    await waitFor(() => {
      expect(
        within(debtSection).getByText(/Belum ada catatan utang atau piutang/i),
      ).toBeInTheDocument();
    });
  });
});

