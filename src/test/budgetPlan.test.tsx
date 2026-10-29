import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { NotaDatabase } from '../data/db';
import { createNotaRepository } from '../data/repositories/notaRepository';
import {
  DEFAULT_CASH_ACCOUNT_TUNAI_ID,
  DEFAULT_FUND_OPERASIONAL_ID,
} from '../domain/mosque';
import { OverviewFoundationPage } from '../features/overview/OverviewFoundationPage';

describe('Nota Mosque Milestone M4 — Anggaran Operasional & RAB Kegiatan Masjid', () => {
  const activeDatabases: NotaDatabase[] = [];

  function createIsolatedDb() {
    const dbName = `nota-rab-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

  it('creates a multi-line RAB Kegiatan in the UI, computes actual realization from transactions without changing cash/fund balances, and supports edit & delete', async () => {
    const db = createIsolatedDb();
    const repository = createNotaRepository(db);

    await repository.saveInitialSetup({
      mosqueName: 'Masjid Al-Ikhlas',
      accountOpeningBalances: {
        [DEFAULT_CASH_ACCOUNT_TUNAI_ID]: 5_000_000,
      },
      fundOpeningBalances: {
        [DEFAULT_FUND_OPERASIONAL_ID]: 5_000_000,
      },
      completeOnboarding: true,
    });

    await repository.addTransaction({
      id: 'tx-rab-dakwah-1',
      type: 'expense',
      amount: 1_200_000,
      categoryId: 'cat-exp-kajian-phbi',
      accountId: DEFAULT_CASH_ACCOUNT_TUNAI_ID,
      fundId: DEFAULT_FUND_OPERASIONAL_ID,
      occurredAt: '2026-10-12',
      note: 'Konsumsi kajian & takjil pekan 1',
    });

    render(
      <OverviewFoundationPage
        repository={repository}
        initialYearMonth={{ year: 2026, month: 10 }}
        activeRoute="planning"
      />,
    );

    const rabRegion = await screen.findByRole('region', {
      name: /Anggaran Operasional & RAB Kegiatan Masjid/i,
    });

    expect(
      within(rabRegion).getByText(/Belum ada dokumen RAB \/ anggaran masjid/i),
    ).toBeInTheDocument();

    // Recorded balance before creating RAB is Rp 3.800.000 (5.000.000 - 1.200.000)
    expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
      /Rp\s*3\.800\.000/,
    );

    // Open Create RAB form
    fireEvent.click(
      within(rabRegion).getByRole('button', { name: /Buat RAB \/ Anggaran/i }),
    );

    // Fill title
    const titleInput = within(rabRegion).getByLabelText(
      /Judul RAB \/ Anggaran/i,
    );
    fireEvent.change(titleInput, {
      target: { value: 'RAB Kajian Akbar Oktober 2026' },
    });

    // Line #1: Expense -> Kegiatan Ibadah, Kajian & PHBI -> 2.000.000
    const catSelect1 = within(rabRegion).getByLabelText(/Kategori Pos #1/i);
    fireEvent.change(catSelect1, {
      target: { value: 'cat-exp-kajian-phbi' },
    });

    const descInput1 = within(rabRegion).getByLabelText(/Uraian Pos #1/i);
    fireEvent.change(descInput1, {
      target: { value: 'Konsumsi & Bisyaroh Pemateri Kajian' },
    });

    const amtInput1 = within(rabRegion).getByLabelText(
      /Nominal Rencana \(IDR\) #1/i,
    );
    fireEvent.change(amtInput1, { target: { value: '2000000' } });

    // Add second line item (Target Penerimaan)
    fireEvent.click(
      within(rabRegion).getByRole('button', {
        name: /Tambah Target Penerimaan/i,
      }),
    );

    const descInput2 = within(rabRegion).getByLabelText(/Uraian Pos #2/i);
    fireEvent.change(descInput2, {
      target: { value: 'Donasi Jamaah Kajian' },
    });

    const amtInput2 = within(rabRegion).getByLabelText(
      /Nominal Rencana \(IDR\) #2/i,
    );
    fireEvent.change(amtInput2, { target: { value: '2500000' } });

    // Save RAB
    fireEvent.click(
      within(rabRegion).getByRole('button', { name: /Simpan RAB/i }),
    );

    // Verify RAB card renders with 60% expense realization (1.200.000 / 2.000.000) and Sisa Rp 800.000
    await waitFor(() => {
      expect(
        within(rabRegion).getByRole('heading', {
          name: /RAB Kajian Akbar Oktober 2026/i,
        }),
      ).toBeInTheDocument();
    });

    expect(rabRegion).toHaveTextContent('Konsumsi & Bisyaroh Pemateri Kajian');
    expect(rabRegion).toHaveTextContent('Donasi Jamaah Kajian');
    expect(rabRegion).toHaveTextContent('60%');
    expect(rabRegion).toHaveTextContent(/Sisa Rp\s*800\.000/);

    // Recorded balance remains untouched at Rp 3.800.000
    expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
      /Rp\s*3\.800\.000/,
    );

    // Edit the RAB to lower expense target to Rp 1.000.000 -> status becomes "Melebihi anggaran"
    fireEvent.click(
      within(rabRegion).getByRole('button', {
        name: /Ubah RAB RAB Kajian Akbar Oktober 2026/i,
      }),
    );

    const editAmtInput1 = within(rabRegion).getByLabelText(
      /Nominal Rencana \(IDR\) #1/i,
    );
    fireEvent.change(editAmtInput1, { target: { value: '1000000' } });

    fireEvent.click(
      within(rabRegion).getByRole('button', { name: /Simpan RAB/i }),
    );

    await waitFor(() => {
      expect(rabRegion).toHaveTextContent('Melebihi anggaran');
    });
    expect(rabRegion).toHaveTextContent(/Lewat Rp\s*200\.000/);

    // Delete the RAB with confirmation
    fireEvent.click(
      within(rabRegion).getByRole('button', {
        name: /Hapus RAB RAB Kajian Akbar Oktober 2026/i,
      }),
    );
    fireEvent.click(
      within(rabRegion).getByRole('button', { name: /Ya, hapus RAB/i }),
    );

    await waitFor(() => {
      expect(
        within(rabRegion).getByText(
          /Belum ada dokumen RAB \/ anggaran masjid/i,
        ),
      ).toBeInTheDocument();
    });
  });
});
