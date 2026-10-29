import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotaDatabase } from '../data/db';
import {
  createNotaRepository,
  NotaStorageError,
  type NotaRepository,
} from '../data/repositories/notaRepository';
import { OverviewFoundationPage } from '../features/overview/OverviewFoundationPage';

describe('Nota Milestone 4 — Transaction Management (CRUD, Validation, Search, Filter, Sort)', () => {
  let db: NotaDatabase;
  let repo: NotaRepository;
  let dbCounter = 0;

  beforeEach(async () => {
    dbCounter += 1;
    db = new NotaDatabase(`nota_test_tx_crud_${Date.now()}_${dbCounter}`);
    repo = createNotaRepository(db);
    await repo.initialize();
    await repo.saveOpeningBalance(1_000_000, { completeOnboarding: true });
  });

  afterEach(async () => {
    await db.delete();
  });

  it('creates income and expense transactions through the form, persists them, and refreshes dashboard summaries', async () => {
    render(
      <OverviewFoundationPage
        repository={repo}
        initialYearMonth={{ year: 2026, month: 10 }}
        activeRoute="transactions"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
        /Rp\s*1\.000\.000/,
      );
    });

    // 1. Add Income Transaction
    fireEvent.click(screen.getByRole('button', { name: /Tambah pemasukan/i }));

    const amountInput = await screen.findByLabelText(
      /Nominal transaksi \(IDR\)/i,
    );
    fireEvent.change(amountInput, { target: { value: '3500000' } });
    expect(amountInput).toHaveValue('3.500.000');

    const dateInput = screen.getByLabelText(/Tanggal transaksi/i);
    fireEvent.change(dateInput, { target: { value: '2026-10-10' } });

    const noteInput = screen.getByLabelText(/Catatan transaksi \(opsional\)/i);
    fireEvent.change(noteInput, { target: { value: 'Gaji Oktober' } });

    fireEvent.click(screen.getByRole('button', { name: /Simpan transaksi/i }));

    // Form closes and dashboard refreshes: 1.000.000 + 3.500.000 = 4.500.000
    await waitFor(() => {
      expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
        /Rp\s*4\.500\.000/,
      );
    });
    expect(screen.getByTestId('period-income-value')).toHaveTextContent(
      /\+Rp\s*3\.500\.000/,
    );
    expect(screen.getByTestId('period-net-cashflow-value')).toHaveTextContent(
      /\+Rp\s*3\.500\.000/,
    );

    // 2. Add Expense Transaction
    fireEvent.click(
      screen.getByRole('button', { name: /Tambah pengeluaran/i }),
    );

    const expAmountInput = await screen.findByLabelText(
      /Nominal transaksi \(IDR\)/i,
    );
    fireEvent.change(expAmountInput, { target: { value: '250000' } });

    const expCategorySelect = screen.getByLabelText(/Kategori transaksi/i);
    fireEvent.change(expCategorySelect, {
      target: { value: 'cat-exp-transportasi' },
    });

    const expDateInput = screen.getByLabelText(/Tanggal transaksi/i);
    fireEvent.change(expDateInput, { target: { value: '2026-10-12' } });

    const expNoteInput = screen.getByLabelText(
      /Catatan transaksi \(opsional\)/i,
    );
    fireEvent.change(expNoteInput, { target: { value: 'Tiket kereta' } });

    fireEvent.click(screen.getByRole('button', { name: /Simpan transaksi/i }));

    // Dashboard updates: 4.500.000 - 250.000 = 4.250.000
    await waitFor(() => {
      expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
        /Rp\s*4\.250\.000/,
      );
    });
    expect(screen.getByTestId('period-expense-value')).toHaveTextContent(
      /[-−]Rp\s*250\.000/,
    );
    expect(screen.getByTestId('period-net-cashflow-value')).toHaveTextContent(
      /\+Rp\s*3\.250\.000/,
    );

    // Verify persisted in IndexedDB
    const storedTransactions = await repo.getTransactions();
    expect(storedTransactions).toHaveLength(2);
  });

  it('validates inputs, enforces category-type consistency, and preserves form data when a save fails', async () => {
    let failNextSave = false;
    const controlledRepo: NotaRepository = {
      ...repo,
      addTransaction: vi.fn(async (draft) => {
        if (failNextSave) {
          throw new NotaStorageError(
            'Gagal menulis transaksi ke penyimpanan lokal.',
          );
        }
        return repo.addTransaction(draft);
      }),
    };

    render(
      <OverviewFoundationPage
        repository={controlledRepo}
        initialYearMonth={{ year: 2026, month: 10 }}
        activeRoute="transactions"
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Tambah pemasukan/i }),
      ).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Tambah pemasukan/i }));

    // Submitting with empty amount triggers domain validation error
    fireEvent.click(screen.getByRole('button', { name: /Simpan transaksi/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Nominal transaksi harus berupa bilangan bulat Rupiah lebih besar dari 0/i,
    );

    // Switching from Pemasukan to Pengeluaran updates selectable categories to expense categories
    const categorySelect = screen.getByLabelText(
      /Kategori transaksi/i,
    ) as HTMLSelectElement;
    expect(categorySelect.value).toMatch(/^cat-inc-/);

    fireEvent.click(screen.getByRole('button', { name: /^Pengeluaran$/i }));
    expect(categorySelect.value).toMatch(/^cat-exp-/);

    // Fill valid data but simulate storage write failure
    failNextSave = true;
    const amountInput = screen.getByLabelText(/Nominal transaksi \(IDR\)/i);
    const dateInput = screen.getByLabelText(/Tanggal transaksi/i);
    const noteInput = screen.getByLabelText(/Catatan transaksi \(opsional\)/i);

    fireEvent.change(amountInput, { target: { value: '175000' } });
    fireEvent.change(dateInput, { target: { value: '2026-10-15' } });
    fireEvent.change(noteInput, { target: { value: 'Makan malam keluarga' } });

    fireEvent.click(screen.getByRole('button', { name: /Simpan transaksi/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Gagal menulis transaksi ke penyimpanan lokal/i,
    );

    // Form stays open and preserves all user-entered values
    expect(amountInput).toHaveValue('175.000');
    expect(dateInput).toHaveValue('2026-10-15');
    expect(noteInput).toHaveValue('Makan malam keluarga');

    // Retry when storage succeeds
    failNextSave = false;
    fireEvent.click(screen.getByRole('button', { name: /Simpan transaksi/i }));

    await waitFor(() => {
      expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
        /Rp\s*825\.000/,
      );
    });
  });

  it('edits and deletes transactions with confirmation while preserving archived category history and avoiding double-counting', async () => {
    const created = await repo.addTransaction({
      id: 'tx-edit-target',
      type: 'expense',
      amount: 300_000,
      categoryId: 'cat-exp-hiburan',
      occurredAt: '2026-10-14',
      note: 'Langganan musik',
    });

    // Archive the category after the transaction was recorded
    await repo.archiveCategoryById(
      'cat-exp-hiburan',
      '2026-10-20T00:00:00.000Z',
    );

    render(
      <OverviewFoundationPage
        repository={repo}
        initialYearMonth={{ year: 2026, month: 10 }}
        activeRoute="transactions"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
        /Rp\s*700\.000/,
      );
    });

    // Click Edit on the transaction whose category is now archived
    fireEvent.click(
      screen.getByRole('button', {
        name: /Edit transaksi Hiburan & Langganan Langganan musik/i,
      }),
    );

    const categorySelect = (await screen.findByLabelText(
      /Kategori transaksi/i,
    )) as HTMLSelectElement;
    // Archived category is preserved in edit mode so historical meaning is not lost
    expect(categorySelect.value).toBe('cat-exp-hiburan');
    expect(categorySelect).toHaveTextContent(
      /Hiburan & Langganan \(Diarsipkan\)/i,
    );

    // Update amount from 300.000 to 400.000 and update note
    const amountInput = screen.getByLabelText(/Nominal transaksi \(IDR\)/i);
    fireEvent.change(amountInput, { target: { value: '400000' } });

    const noteInput = screen.getByLabelText(/Catatan transaksi \(opsional\)/i);
    fireEvent.change(noteInput, {
      target: { value: 'Langganan musik & video' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Simpan perubahan/i }));

    // Balance recalculates once (1.000.000 - 400.000 = 600.000), preserving original ID and createdAt
    await waitFor(() => {
      expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
        /Rp\s*600\.000/,
      );
    });
    expect(screen.getByTestId('period-expense-value')).toHaveTextContent(
      /[-−]Rp\s*400\.000/,
    );

    const allStored = await repo.getTransactions();
    expect(allStored).toHaveLength(1);
    expect(allStored[0].id).toBe(created.id);
    expect(allStored[0].createdAt).toBe(created.createdAt);
    expect(allStored[0].note).toBe('Langganan musik & video');

    // Delete flow with confirmation: first open confirmation and click Batal
    fireEvent.click(
      screen.getByRole('button', {
        name: /Hapus transaksi Hiburan & Langganan Langganan musik & video/i,
      }),
    );

    const confirmRegion = screen.getByRole('region', {
      name: /Konfirmasi hapus transaksi/i,
    });
    expect(confirmRegion).toBeInTheDocument();

    fireEvent.click(
      within(confirmRegion).getByRole('button', { name: /Batal/i }),
    );
    expect(
      screen.queryByRole('region', { name: /Konfirmasi hapus transaksi/i }),
    ).not.toBeInTheDocument();

    // Open confirmation again and confirm deletion
    fireEvent.click(
      screen.getByRole('button', {
        name: /Hapus transaksi Hiburan & Langganan Langganan musik & video/i,
      }),
    );
    const confirmRegionAgain = screen.getByRole('region', {
      name: /Konfirmasi hapus transaksi/i,
    });
    fireEvent.click(
      within(confirmRegionAgain).getByRole('button', { name: /Ya, hapus/i }),
    );

    // Deleted transaction no longer affects balance or summaries (back to opening balance Rp 1.000.000)
    await waitFor(() => {
      expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
        /Rp\s*1\.000\.000/,
      );
    });
    expect(screen.getByTestId('period-expense-value')).toHaveTextContent(
      /[-−]Rp\s*0/,
    );
    expect(await repo.getTransactions()).toHaveLength(0);
  });

  it('supports keyword search, period/type/category filters, and newest/oldest sorting', async () => {
    await repo.addTransaction({
      id: 'tx-sep-1',
      type: 'expense',
      amount: 120_000,
      categoryId: 'cat-exp-makanan',
      occurredAt: '2026-09-20',
      note: 'Kopi pagi September',
    });
    await repo.addTransaction({
      id: 'tx-oct-1',
      type: 'income',
      amount: 4_000_000,
      categoryId: 'cat-inc-gaji',
      occurredAt: '2026-10-02',
      note: 'Gaji pokok Oktober',
    });
    await repo.addTransaction({
      id: 'tx-oct-2',
      type: 'expense',
      amount: 85_000,
      categoryId: 'cat-exp-transportasi',
      occurredAt: '2026-10-18',
      note: 'Ojek stasiun',
    });

    render(
      <OverviewFoundationPage
        repository={repo}
        initialYearMonth={{ year: 2026, month: 10 }}
        activeRoute="transactions"
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId('filtered-transaction-count'),
      ).toHaveTextContent('3 dari 3 transaksi');
    });

    const fullList = screen.getByRole('list', {
      name: /Daftar seluruh transaksi/i,
    });

    // Default sort is newest first ('2026-10-18', '2026-10-02', '2026-09-20')
    let rows = within(fullList).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Ojek stasiun');
    expect(rows[2]).toHaveTextContent('Kopi pagi September');

    // Switch sort order to oldest first ('oldest')
    fireEvent.change(screen.getByLabelText(/Urutan transaksi/i), {
      target: { value: 'oldest' },
    });
    rows = within(fullList).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Kopi pagi September');
    expect(rows[2]).toHaveTextContent('Ojek stasiun');

    // Filter by selected month (Oktober 2026) -> excludes September transaction
    fireEvent.change(screen.getByLabelText(/Filter periode/i), {
      target: { value: 'selected-month' },
    });
    expect(screen.getByTestId('filtered-transaction-count')).toHaveTextContent(
      '2 dari 3 transaksi',
    );

    // Filter by type: Pengeluaran -> leaves only October expense ('Ojek stasiun')
    fireEvent.change(screen.getByLabelText(/Filter jenis transaksi/i), {
      target: { value: 'expense' },
    });
    expect(screen.getByTestId('filtered-transaction-count')).toHaveTextContent(
      '1 dari 3 transaksi',
    );
    expect(within(fullList).getByText(/Ojek stasiun/i)).toBeInTheDocument();

    // Reset all filters
    fireEvent.click(screen.getByRole('button', { name: /Reset filter/i }));
    expect(screen.getByTestId('filtered-transaction-count')).toHaveTextContent(
      '3 dari 3 transaksi',
    );

    // Keyword search matching note or category name
    const searchInput = screen.getByLabelText(/Cari transaksi/i);
    fireEvent.change(searchInput, { target: { value: 'kopi' } });
    expect(screen.getByTestId('filtered-transaction-count')).toHaveTextContent(
      '1 dari 3 transaksi',
    );
    expect(
      within(fullList).getByText(/Kopi pagi September/i),
    ).toBeInTheDocument();

    // Non-matching search shows empty-filter state with reset button
    fireEvent.change(searchInput, {
      target: { value: 'kata-kunci-tidak-ada' },
    });
    expect(
      screen.getByText(/Tidak ada transaksi yang cocok dengan filter/i),
    ).toBeInTheDocument();
  });
});
