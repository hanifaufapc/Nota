import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NotaDatabase } from '../data/db';
import {
  createNotaRepository,
  type NotaRepository,
} from '../data/repositories/notaRepository';
import {
  DEFAULT_CASH_ACCOUNT_BANK_ID,
  DEFAULT_CASH_ACCOUNT_TUNAI_ID,
  DEFAULT_FUND_OPERASIONAL_ID,
  DEFAULT_FUND_PEMBANGUNAN_ID,
  DEFAULT_FUND_SOSIAL_ZAKAT_ID,
} from '../domain/mosque';
import { OverviewFoundationPage } from '../features/overview/OverviewFoundationPage';

describe('Nota Mosque Milestone M3 — Mosque Transactions, Fund/Account Filters, & Soft Guard Confirmation', () => {
  let db: NotaDatabase;
  let repo: NotaRepository;
  let dbCounter = 0;

  beforeEach(async () => {
    dbCounter += 1;
    db = new NotaDatabase(`nota_test_mosque_tx_${Date.now()}_${dbCounter}`);
    repo = createNotaRepository(db);
    await repo.initialize();
    await repo.saveInitialSetup({
      mosqueName: 'Masjid Al-Ikhlas',
      accountOpeningBalances: {
        [DEFAULT_CASH_ACCOUNT_TUNAI_ID]: 2_000_000,
        [DEFAULT_CASH_ACCOUNT_BANK_ID]: 5_000_000,
      },
      fundOpeningBalances: {
        [DEFAULT_FUND_OPERASIONAL_ID]: 2_000_000,
        [DEFAULT_FUND_PEMBANGUNAN_ID]: 4_000_000,
        [DEFAULT_FUND_SOSIAL_ZAKAT_ID]: 1_000_000,
      },
      completeOnboarding: true,
    });
  });

  afterEach(async () => {
    await db.delete();
  });

  it('auto-selects default Fund from Mosque category and persists accountId, fundId, donorOrPayee, and referenceNo', async () => {
    render(
      <OverviewFoundationPage
        repository={repo}
        initialYearMonth={{ year: 2026, month: 10 }}
        activeRoute="transactions"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
        /Rp\s*7\.000\.000/,
      );
    });

    fireEvent.click(screen.getByRole('button', { name: /Tambah pemasukan/i }));

    const amountInput = await screen.findByLabelText(
      /Nominal transaksi \(IDR\)/i,
    );
    fireEvent.change(amountInput, { target: { value: '1500000' } });

    const categorySelect = screen.getByLabelText(
      /Kategori transaksi/i,
    ) as HTMLSelectElement;
    const fundSelect = screen.getByLabelText(
      /Dana masjid \(Amanah\)/i,
    ) as HTMLSelectElement;
    const accountSelect = screen.getByLabelText(
      /Lokasi kas transaksi/i,
    ) as HTMLSelectElement;

    // Selecting 'Infak Pembangunan & Renovasi' auto-selects 'Dana Pembangunan'
    fireEvent.change(categorySelect, {
      target: { value: 'cat-inc-pembangunan' },
    });
    expect(fundSelect.value).toBe(DEFAULT_FUND_PEMBANGUNAN_ID);

    // Record into Rekening Bank Tercatat
    fireEvent.change(accountSelect, {
      target: { value: DEFAULT_CASH_ACCOUNT_BANK_ID },
    });

    fireEvent.change(screen.getByLabelText(/Tanggal transaksi/i), {
      target: { value: '2026-10-12' },
    });
    fireEvent.change(screen.getByLabelText(/Donatur \/ Penerima/i), {
      target: { value: 'H. Sulaiman' },
    });
    fireEvent.change(screen.getByLabelText(/Nomor bukti \/ referensi/i), {
      target: { value: 'KW-2026-101' },
    });
    fireEvent.change(screen.getByLabelText(/Catatan transaksi \(opsional\)/i), {
      target: { value: 'Wakaf semen dan pasir' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Simpan transaksi/i }));

    await waitFor(() => {
      expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
        /Rp\s*8\.500\.000/,
      );
    });

    const list = screen.getByRole('list', {
      name: /Daftar seluruh transaksi/i,
    });
    expect(within(list).getByText('Dana Pembangunan')).toBeInTheDocument();
    expect(
      within(list).getByText('Rekening Bank Tercatat'),
    ).toBeInTheDocument();
    expect(within(list).getByText(/H\. Sulaiman/i)).toBeInTheDocument();
    expect(within(list).getByText(/#KW-2026-101/i)).toBeInTheDocument();

    const stored = await repo.getTransactions();
    expect(stored).toHaveLength(1);
    expect(stored[0].accountId).toBe(DEFAULT_CASH_ACCOUNT_BANK_ID);
    expect(stored[0].fundId).toBe(DEFAULT_FUND_PEMBANGUNAN_ID);
    expect(stored[0].donorOrPayee).toBe('H. Sulaiman');
    expect(stored[0].referenceNo).toBe('KW-2026-101');
  });

  it('enforces Soft Guard confirmation when an expense exceeds Fund/Account balance or uses a restricted Fund with an operational category', async () => {
    render(
      <OverviewFoundationPage
        repository={repo}
        initialYearMonth={{ year: 2026, month: 10 }}
        activeRoute="transactions"
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Tambah pengeluaran/i }),
      ).toBeEnabled();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /Tambah pengeluaran/i }),
    );

    // Enter Rp 2.500.000 expense from Kas Tunai (which only has Rp 2.000.000)
    // using operational category 'Listrik, Air & Internet' charged to restricted 'Dana Pembangunan'
    const amountInput = await screen.findByLabelText(
      /Nominal transaksi \(IDR\)/i,
    );
    fireEvent.change(amountInput, { target: { value: '2500000' } });

    const categorySelect = screen.getByLabelText(/Kategori transaksi/i);
    fireEvent.change(categorySelect, {
      target: { value: 'cat-exp-listrik-air' },
    });

    const fundSelect = screen.getByLabelText(/Dana masjid \(Amanah\)/i);
    fireEvent.change(fundSelect, {
      target: { value: DEFAULT_FUND_PEMBANGUNAN_ID },
    });

    // Soft Guard warning banner appears with ACCOUNT_DEFICIT and RESTRICTED_FUND_CATEGORY_MISMATCH
    const warningBanner = await screen.findByTestId('soft-guard-warning-banner');
    expect(warningBanner).toBeInTheDocument();
    expect(
      screen.getByTestId('soft-guard-warning-ACCOUNT_DEFICIT'),
    ).toHaveTextContent(/Saldo Kas Tunai tidak mencukupi/i);
    expect(
      screen.getByTestId(
        'soft-guard-warning-RESTRICTED_FUND_CATEGORY_MISMATCH',
      ),
    ).toHaveTextContent(/Penggunaan Dana Terikat \(Dana Pembangunan\)/i);

    // Clicking 'Simpan transaksi' without confirming blocks immediate save
    fireEvent.click(screen.getByRole('button', { name: /Simpan transaksi/i }));
    expect(await repo.getTransactions()).toHaveLength(0);

    // Prompt button 'Ya, konfirmasi & simpan pengeluaran' is now shown
    const confirmAndSaveBtn = await screen.findByRole('button', {
      name: /Ya, konfirmasi & simpan pengeluaran/i,
    });
    fireEvent.click(confirmAndSaveBtn);

    // Transaction is now saved and balance updates: 7.000.000 - 2.500.000 = 4.500.000
    await waitFor(() => {
      expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
        /Rp\s*4\.500\.000/,
      );
    });
    expect(await repo.getTransactions()).toHaveLength(1);
  });

  it('filters transactions by Dana Masjid (fundId), Lokasi Kas (accountId), and searches by donorOrPayee and referenceNo', async () => {
    await repo.addTransaction({
      id: 'tx-m3-1',
      type: 'income',
      amount: 900_000,
      accountId: DEFAULT_CASH_ACCOUNT_TUNAI_ID,
      fundId: DEFAULT_FUND_OPERASIONAL_ID,
      categoryId: 'cat-inc-jumat',
      occurredAt: '2026-10-04',
      donorOrPayee: 'Jamaah Jumat Pekan 1',
      referenceNo: 'BM-001',
      note: 'Kotak amal utama',
    });

    await repo.addTransaction({
      id: 'tx-m3-2',
      type: 'income',
      amount: 3_000_000,
      accountId: DEFAULT_CASH_ACCOUNT_BANK_ID,
      fundId: DEFAULT_FUND_PEMBANGUNAN_ID,
      categoryId: 'cat-inc-pembangunan',
      occurredAt: '2026-10-10',
      donorOrPayee: 'Keluarga H. Ridwan',
      referenceNo: 'TF-202',
      note: 'Donasi renovasi kubah',
    });

    await repo.addTransaction({
      id: 'tx-m3-3',
      type: 'expense',
      amount: 500_000,
      accountId: DEFAULT_CASH_ACCOUNT_TUNAI_ID,
      fundId: DEFAULT_FUND_SOSIAL_ZAKAT_ID,
      categoryId: 'cat-exp-penyaluran-zakat',
      occurredAt: '2026-10-15',
      donorOrPayee: 'Santunan Yatim RW 04',
      referenceNo: 'BK-303',
      note: 'Penyaluran santunan bulanan',
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

    // 1. Filter by Dana Masjid: Dana Pembangunan
    fireEvent.change(screen.getByLabelText(/Filter dana masjid/i), {
      target: { value: DEFAULT_FUND_PEMBANGUNAN_ID },
    });
    expect(screen.getByTestId('filtered-transaction-count')).toHaveTextContent(
      '1 dari 3 transaksi',
    );
    expect(
      within(fullList).getByText(/Donasi renovasi kubah/i),
    ).toBeInTheDocument();

    // Reset filter
    fireEvent.click(screen.getByRole('button', { name: /Reset filter/i }));
    expect(screen.getByTestId('filtered-transaction-count')).toHaveTextContent(
      '3 dari 3 transaksi',
    );

    // 2. Filter by Lokasi Kas: Kas Tunai
    fireEvent.change(screen.getByLabelText(/Filter lokasi kas/i), {
      target: { value: DEFAULT_CASH_ACCOUNT_TUNAI_ID },
    });
    expect(screen.getByTestId('filtered-transaction-count')).toHaveTextContent(
      '2 dari 3 transaksi',
    );

    // 3. Search by donorOrPayee ('Santunan Yatim RW 04')
    fireEvent.change(screen.getByLabelText(/Cari transaksi/i), {
      target: { value: 'Yatim RW 04' },
    });
    expect(screen.getByTestId('filtered-transaction-count')).toHaveTextContent(
      '1 dari 3 transaksi',
    );
    expect(
      within(fullList).getByText(/Penyaluran santunan bulanan/i),
    ).toBeInTheDocument();

    // 4. Search by referenceNo ('TF-202') after resetting account filter
    fireEvent.click(screen.getByRole('button', { name: /Reset filter/i }));
    fireEvent.change(screen.getByLabelText(/Cari transaksi/i), {
      target: { value: 'TF-202' },
    });
    expect(screen.getByTestId('filtered-transaction-count')).toHaveTextContent(
      '1 dari 3 transaksi',
    );
    expect(
      within(fullList).getByText(/Keluarga H\. Ridwan/i),
    ).toBeInTheDocument();
  });
});
