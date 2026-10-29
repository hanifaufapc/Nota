import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../app/App';
import { serializeBackupPayload } from '../data/backup/notaBackup';
import { NotaDatabase } from '../data/db';
import {
  createNotaRepository,
  type LocalWorkspaceState,
  type NotaRepository,
} from '../data/repositories/notaRepository';
import { OverviewFoundationPage } from '../features/overview/OverviewFoundationPage';

describe('Nota Milestone 6 — Quality, Accessibility, Reliability & Race-Condition Audit', () => {
  let db: NotaDatabase;
  let repo: NotaRepository;
  let dbCounter = 0;

  beforeEach(async () => {
    dbCounter += 1;
    db = new NotaDatabase(`nota_test_quality_${Date.now()}_${dbCounter}`);
    repo = createNotaRepository(db);
    await repo.initialize();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('verifies keyboard focus rings, valid aria-describedby references, Escape key dismissal, and route navigation', async () => {
    render(<App />);

    // Skip link exists and targets #main-content
    const skipLink = screen.getByRole('link', {
      name: /Langsung ke konten utama/i,
    });
    expect(skipLink).toHaveAttribute('href', '#main-content');
    expect(document.getElementById('main-content')).toBeInTheDocument();

    // Wait for first-run setup panel to load
    const onboardingInput = await screen.findByLabelText(
      /Nominal saldo awal \(IDR\)/i,
    );
    // When valid (no error message), aria-describedby only references existing #opening-balance-hint
    expect(onboardingInput).toHaveAttribute(
      'aria-describedby',
      'opening-balance-hint',
    );
    expect(onboardingInput).toHaveAttribute('aria-invalid', 'false');

    // Complete onboarding with Rp 0
    fireEvent.click(screen.getByRole('button', { name: /Mulai dari Rp 0/i }));
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', {
          name: /Atur saldo awal catatan Anda/i,
        }),
      ).not.toBeInTheDocument();
    });

    // Open transaction form and verify auto-focus, no focus:outline-none, error aria-describedby, and Escape dismissal
    fireEvent.click(screen.getByRole('button', { name: /Tambah pemasukan/i }));

    const amountInput = await screen.findByLabelText(
      /Nominal transaksi \(IDR\)/i,
    );
    expect(amountInput).toHaveFocus();
    expect(amountInput.className).not.toContain('focus:outline-none');
    expect(amountInput).toHaveAttribute('aria-invalid', 'false');

    // Trigger validation error and verify aria-invalid + aria-describedby point to the alert element
    fireEvent.click(screen.getByRole('button', { name: /Simpan transaksi/i }));
    const alertEl = await screen.findByRole('alert');
    expect(amountInput).toHaveAttribute('aria-invalid', 'true');
    expect(amountInput).toHaveAttribute('aria-describedby', alertEl.id);

    // Press Escape inside the form to dismiss it via keyboard
    fireEvent.keyDown(amountInput, { key: 'Escape' });
    await waitFor(() => {
      expect(
        screen.queryByLabelText(/Nominal transaksi \(IDR\)/i),
      ).not.toBeInTheDocument();
    });

    // Verify Ringkasan tab has its distinct identity and does NOT duplicate full transaction management, planning, or backup/restore
    expect(
      screen.getByRole('heading', { name: /Ringkasan Keuangan/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Arus Kas Bulan Ini/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Transaksi terakhir/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: /Manajemen dan daftar transaksi/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: /Anggaran Bulanan per Kategori/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', {
        name: /Cadangan dan pemulihan data lokal/i,
      }),
    ).not.toBeInTheDocument();

    // Navigate to 'Transaksi' route in AppShell and verify distinct ledger identity
    const txNavBtn = screen.getByRole('button', { name: /^Transaksi$/i });
    fireEvent.click(txNavBtn);
    expect(txNavBtn).toHaveAttribute('aria-current', 'page');
    expect(
      screen.getByRole('heading', { name: /Manajemen Transaksi/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: /Manajemen dan daftar transaksi/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /Arus Kas Bulan Ini/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', {
        name: /Cadangan dan pemulihan data lokal/i,
      }),
    ).not.toBeInTheDocument();

    // Navigate to 'Anggaran / RAB' route in AppShell and verify distinct planning identity
    const planNavBtn = screen.getByRole('button', {
      name: /^Anggaran \/ RAB$/i,
    });
    fireEvent.click(planNavBtn);
    expect(planNavBtn).toHaveAttribute('aria-current', 'page');
    expect(
      screen.getByRole('heading', { name: /Perencanaan Keuangan/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: /Anggaran Bulanan per Kategori/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: /Target Tabungan/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: /Catatan Utang & Piutang/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: /Manajemen dan daftar transaksi/i }),
    ).not.toBeInTheDocument();

    // Navigate to 'Pengaturan' route in AppShell and verify canonical settings & backup/restore home
    const settingsNavBtn = screen.getByRole('button', {
      name: /^Pengaturan$/i,
    });
    fireEvent.click(settingsNavBtn);
    expect(settingsNavBtn).toHaveAttribute('aria-current', 'page');
    expect(
      screen.getByRole('heading', { name: /Pengaturan & Data Lokal/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', {
        name: /Pengaturan saldo awal dan penyimpanan/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', {
        name: /Cadangan dan pemulihan data lokal/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: /Manajemen dan daftar transaksi/i }),
    ).not.toBeInTheDocument();
  });

  it('ignores stale out-of-order responses when the user switches periods rapidly', async () => {
    await repo.saveOpeningBalance(1_000_000, { completeOnboarding: true });
    await repo.addTransaction({
      id: 'tx-sep',
      type: 'expense',
      amount: 300_000,
      categoryId: 'cat-exp-makanan',
      occurredAt: '2026-09-10',
      note: 'Pengeluaran September',
    });
    await repo.addTransaction({
      id: 'tx-aug',
      type: 'expense',
      amount: 125_000,
      categoryId: 'cat-exp-transportasi',
      occurredAt: '2026-08-10',
      note: 'Pengeluaran Agustus',
    });

    let resolveSeptember: ((state: LocalWorkspaceState) => void) | null = null;

    const delayedRepo: NotaRepository = {
      ...repo,
      loadWorkspaceState: vi.fn((period) => {
        if (period?.startDate === '2026-09-01') {
          return new Promise<LocalWorkspaceState>((resolve) => {
            resolveSeptember = resolve;
          });
        }
        return repo.loadWorkspaceState(period);
      }),
    };

    render(
      <OverviewFoundationPage
        repository={delayedRepo}
        initialYearMonth={{ year: 2026, month: 10 }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
        /Rp\s*575\.000/,
      );
    });

    // Rapidly click 'Bulan sebelumnya' twice: Oct -> Sep (slow) -> Aug (fast)
    const prevBtn = screen.getByRole('button', { name: /Bulan sebelumnya/i });
    fireEvent.click(prevBtn); // triggers Sep (held pending)
    fireEvent.click(prevBtn); // triggers Aug (resolves immediately)

    await waitFor(() => {
      expect(screen.getByTestId('period-expense-value')).toHaveTextContent(
        /[-−]Rp\s*125\.000/,
      );
    });

    // Now resolve the stale September promise AFTER August is already displayed
    const sepState = await repo.loadWorkspaceState({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });
    expect(resolveSeptember).not.toBeNull();
    resolveSeptember!(sepState);

    // Ensure August's Rp 125.000 was NOT overwritten by stale September's Rp 300.000
    await waitFor(() => {
      expect(screen.getByTestId('period-expense-value')).toHaveTextContent(
        /[-−]Rp\s*125\.000/,
      );
    });
  });

  it('maintains end-to-end financial integrity across create, edit, backup, delete, restore, and database reopen', async () => {
    const dbName = `nota_e2e_integrity_${Date.now()}`;
    const db1 = new NotaDatabase(dbName);
    const repo1 = createNotaRepository(db1);

    await repo1.initialize();
    await repo1.saveOpeningBalance(1_500_000, { completeOnboarding: true });

    await repo1.addTransaction({
      id: 'tx-1',
      type: 'income',
      amount: 3_000_000,
      categoryId: 'cat-inc-gaji',
      occurredAt: '2026-10-05',
      note: 'Gaji',
    });
    await repo1.addTransaction({
      id: 'tx-2',
      type: 'expense',
      amount: 450_000,
      categoryId: 'cat-exp-makanan',
      occurredAt: '2026-10-09',
      note: 'Makan minggu 1',
    });

    // Edit tx-2 from 450.000 to 500.000
    await repo1.updateTransaction('tx-2', {
      amount: 500_000,
      note: 'Makan minggu 1 (revisi)',
    });

    // Export backup at this checkpoint (balance = 1.500.000 + 3.000.000 - 500.000 = 4.000.000)
    const checkpointBackup = await repo1.exportBackup(
      '2026-10-27T16:00:00.000Z',
    );
    const backupJson = serializeBackupPayload(checkpointBackup);

    // Delete tx-1 and verify balance drops to 1.000.000
    await repo1.deleteTransaction('tx-1');
    const afterDelete = await repo1.loadWorkspaceState({
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    });
    expect(afterDelete.overview.currentBalance).toBe(1_000_000);

    // Restore from backup and reopen a fresh NotaDatabase instance
    await repo1.restoreBackup(backupJson);
    db1.close();

    const db2 = new NotaDatabase(dbName);
    const repo2 = createNotaRepository(db2);
    const finalState = await repo2.loadWorkspaceState({
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    });

    expect(finalState.settings.openingBalance).toBe(1_500_000);
    expect(finalState.overview.currentBalance).toBe(4_000_000);
    expect(finalState.overview.periodSummary.income).toBe(3_000_000);
    expect(finalState.overview.periodSummary.expense).toBe(500_000);
    expect(finalState.overview.periodSummary.netCashFlow).toBe(2_500_000);
    expect(finalState.transactions).toHaveLength(2);

    await db2.delete();
  });
});

