import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotaDatabase } from '../data/db';
import {
  createNotaRepository,
  NotaStorageError,
  type NotaRepository,
} from '../data/repositories/notaRepository';
import { OverviewFoundationPage } from '../features/overview/OverviewFoundationPage';

describe('Nota Milestone 3 — Dashboard with Real Data', () => {
  let db: NotaDatabase;
  let repo: NotaRepository;
  let dbCounter = 0;

  beforeEach(() => {
    dbCounter += 1;
    db = new NotaDatabase(`nota_test_dashboard_${Date.now()}_${dbCounter}`);
    repo = createNotaRepository(db);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('displays zero values and honest empty states when the database has no transactions', async () => {
    await repo.initialize();
    await repo.saveOpeningBalance(0, { completeOnboarding: true });

    render(
      <OverviewFoundationPage
        repository={repo}
        initialYearMonth={{ year: 2026, month: 10 }}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Atur saldo awal/i }),
      ).toBeInTheDocument();
    });

    expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
      /Rp\s*0/,
    );
    expect(screen.getByTestId('period-net-cashflow-value')).toHaveTextContent(
      /Rp\s*0/,
    );
    expect(screen.getByTestId('period-income-value')).toHaveTextContent(
      /\+Rp\s*0/,
    );
    expect(screen.getByTestId('period-expense-value')).toHaveTextContent(
      /[-−]Rp\s*0/,
    );

    expect(screen.getByText('Belum ada data arus kas')).toBeInTheDocument();
    expect(screen.getByText('Belum ada transaksi')).toBeInTheDocument();
    expect(
      screen.queryByTestId('cashflow-overview-visual'),
    ).not.toBeInTheDocument();
  });

  it('renders real balance, period summaries, cash-flow visual, and recent transactions while keeping opening balance separate from period income', async () => {
    await repo.initialize();
    await repo.saveOpeningBalance(2_000_000, { completeOnboarding: true });

    // Prior-month expense (September 2026) — affects currentBalance, NOT October period summary
    await repo.addTransaction({
      id: 'tx-sep-utilities',
      type: 'expense',
      amount: 250_000,
      categoryId: 'cat-exp-tempat-tinggal',
      occurredAt: '2026-09-15',
      note: 'Listrik September',
    });

    // Current-month transactions (October 2026)
    await repo.addTransaction({
      id: 'tx-oct-salary',
      type: 'income',
      amount: 5_000_000,
      categoryId: 'cat-inc-gaji',
      occurredAt: '2026-10-05',
      note: 'Gaji Oktober',
    });
    await repo.addTransaction({
      id: 'tx-oct-food',
      type: 'expense',
      amount: 450_000,
      categoryId: 'cat-exp-makanan',
      occurredAt: '2026-10-12',
      note: 'Belanja bahan makanan',
    });
    await repo.addTransaction({
      id: 'tx-oct-transport',
      type: 'expense',
      amount: 150_000,
      categoryId: 'cat-exp-transportasi',
      occurredAt: '2026-10-18',
      note: 'Bensin dan parkir',
    });

    render(
      <OverviewFoundationPage
        repository={repo}
        initialYearMonth={{ year: 2026, month: 10 }}
      />,
    );

    // Current balance = 2.000.000 + 5.000.000 - (250.000 + 450.000 + 150.000) = 6.150.000
    await waitFor(() => {
      expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
        /Rp\s*6\.150\.000/,
      );
    });

    // October income = 5.000.000 (opening balance of 2.000.000 is NOT counted as period income)
    expect(screen.getByTestId('period-income-value')).toHaveTextContent(
      /\+Rp\s*5\.000\.000/,
    );
    // October expense = 450.000 + 150.000 = 600.000 (September expense is NOT counted in October)
    expect(screen.getByTestId('period-expense-value')).toHaveTextContent(
      /[-−]Rp\s*600\.000/,
    );
    // October net cash flow = 5.000.000 - 600.000 = +4.400.000
    expect(screen.getByTestId('period-net-cashflow-value')).toHaveTextContent(
      /\+Rp\s*4\.400\.000/,
    );

    // Cash-flow visual & top expense categories for October
    const cashflowVisual = screen.getByTestId('cashflow-overview-visual');
    expect(cashflowVisual).toBeInTheDocument();
    expect(
      within(cashflowVisual).getByText('Makanan & Minuman'),
    ).toBeInTheDocument();
    expect(
      within(cashflowVisual).getByText('Transportasi'),
    ).toBeInTheDocument();
    expect(within(cashflowVisual).getByText(/\(75%\)/)).toBeInTheDocument();
    expect(within(cashflowVisual).getByText(/\(25%\)/)).toBeInTheDocument();

    // Recent transactions list (sorted newest-first)
    const recentList = screen.getByRole('list', {
      name: /Daftar transaksi terakhir/i,
    });
    const items = within(recentList).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('Transportasi');
    expect(items[0]).toHaveTextContent('Bensin dan parkir');
    expect(items[0]).toHaveTextContent(/[-−]Rp\s*150\.000/);
    expect(items[2]).toHaveTextContent('Gaji & Upah');
    expect(items[2]).toHaveTextContent('Gaji Oktober');
    expect(items[2]).toHaveTextContent(/\+Rp\s*5\.000\.000/);

    // Switch to previous month (September 2026) and verify period summary updates while currentBalance stays all-time
    fireEvent.click(screen.getByRole('button', { name: /Bulan sebelumnya/i }));

    await waitFor(() => {
      expect(screen.getByTestId('period-expense-value')).toHaveTextContent(
        /[-−]Rp\s*250\.000/,
      );
    });
    expect(screen.getByTestId('period-income-value')).toHaveTextContent(
      /\+Rp\s*0/,
    );
    expect(screen.getByTestId('period-net-cashflow-value')).toHaveTextContent(
      /[-−]Rp\s*250\.000/,
    );
    // Recorded virtual balance remains all-time Rp 6.150.000
    expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
      /Rp\s*6\.150\.000/,
    );
    expect(
      within(screen.getByTestId('cashflow-overview-visual')).getByText(
        'Tempat Tinggal & Tagihan',
      ),
    ).toBeInTheDocument();
  });

  it('honestly displays negative recorded balance when expenses exceed opening balance plus income', async () => {
    await repo.initialize();
    await repo.saveOpeningBalance(100_000, { completeOnboarding: true });
    await repo.addTransaction({
      id: 'tx-oct-shopping',
      type: 'expense',
      amount: 350_000,
      categoryId: 'cat-exp-belanja',
      occurredAt: '2026-10-10',
      note: 'Kebutuhan mendadak',
    });

    render(
      <OverviewFoundationPage
        repository={repo}
        initialYearMonth={{ year: 2026, month: 10 }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
        /[-−]Rp\s*250\.000/,
      );
    });

    // Updating opening balance refreshes the recorded balance immediately
    fireEvent.click(screen.getByRole('button', { name: /Atur saldo awal/i }));
    const input = await screen.findByLabelText(/Nominal saldo awal \(IDR\)/i);
    fireEvent.change(input, { target: { value: '500000' } });
    fireEvent.click(screen.getByRole('button', { name: /Simpan saldo awal/i }));

    await waitFor(() => {
      expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
        /Rp\s*150\.000/,
      );
    });
  });

  it('renders an accessible storage error banner and recovers when retried', async () => {
    await repo.initialize();
    await repo.saveOpeningBalance(750_000, { completeOnboarding: true });

    let shouldFail = true;
    const flakyRepo: NotaRepository = {
      ...repo,
      loadWorkspaceState: vi.fn(async (period) => {
        if (shouldFail) {
          throw new NotaStorageError('Database lokal sedang terkunci.');
        }
        return repo.loadWorkspaceState(period);
      }),
    };

    render(
      <OverviewFoundationPage
        repository={flakyRepo}
        initialYearMonth={{ year: 2026, month: 10 }}
      />,
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Penyimpanan lokal tidak dapat diakses/i);
    expect(alert).toHaveTextContent(/Database lokal sedang terkunci/i);
    expect(screen.getByTestId('current-balance-value')).toHaveTextContent('—');

    shouldFail = false;
    fireEvent.click(screen.getByRole('button', { name: /Coba muat ulang/i }));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
        /Rp\s*750\.000/,
      );
    });
  });
});

