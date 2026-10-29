import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotaDatabase } from '../data/db';
import { createNotaRepository } from '../data/repositories/notaRepository';
import {
  DEFAULT_CASH_ACCOUNT_BANK_ID,
  DEFAULT_CASH_ACCOUNT_TUNAI_ID,
  DEFAULT_FUND_OPERASIONAL_ID,
  DEFAULT_FUND_PEMBANGUNAN_ID,
  DEFAULT_FUND_SOSIAL_ZAKAT_ID,
} from '../domain/mosque';
import { OverviewFoundationPage } from '../features/overview/OverviewFoundationPage';

describe('Nota Mosque Milestone M5 — Laporan Pertanggungjawaban Jamaah & Pengaturan Masjid', () => {
  const activeDatabases: NotaDatabase[] = [];

  function createIsolatedDb() {
    const dbName = `nota-m5-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const database = new NotaDatabase(dbName);
    activeDatabases.push(database);
    return database;
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    while (activeDatabases.length > 0) {
      const db = activeDatabases.pop();
      if (db) {
        await db.delete();
      }
    }
  });

  it('renders congregation-ready Laporan with Weekly Friday / Monthly / Custom presets, Fund filter, print trigger, and CSV export', async () => {
    const db = createIsolatedDb();
    const repository = createNotaRepository(db);

    await repository.saveInitialSetup({
      mosqueName: 'Masjid Raya Al-Falah',
      mosqueAddress: 'Jl. Diponegoro No. 45, Bandung',
      chairpersonName: 'KH. Abdullah Gymnastiar',
      treasurerName: 'H. Salman Al-Farisi',
      accountOpeningBalances: {
        [DEFAULT_CASH_ACCOUNT_TUNAI_ID]: 3_000_000,
        [DEFAULT_CASH_ACCOUNT_BANK_ID]: 7_000_000,
      },
      fundOpeningBalances: {
        [DEFAULT_FUND_OPERASIONAL_ID]: 4_000_000,
        [DEFAULT_FUND_PEMBANGUNAN_ID]: 6_000_000,
        [DEFAULT_FUND_SOSIAL_ZAKAT_ID]: 0,
      },
      completeOnboarding: true,
    });

    // Prior month transaction (September 2026) -> increases opening balance of October 2026
    await repository.addTransaction({
      id: 'tx-sep-infak',
      type: 'income',
      amount: 1_000_000,
      categoryId: 'cat-inc-jumat',
      accountId: DEFAULT_CASH_ACCOUNT_TUNAI_ID,
      fundId: DEFAULT_FUND_OPERASIONAL_ID,
      occurredAt: '2026-09-25',
      note: 'Infak Jumat akhir September',
    });

    // Early October transaction (2026-10-05)
    await repository.addTransaction({
      id: 'tx-oct-early',
      type: 'expense',
      amount: 500_000,
      categoryId: 'cat-exp-listrik-air',
      accountId: DEFAULT_CASH_ACCOUNT_TUNAI_ID,
      fundId: DEFAULT_FUND_OPERASIONAL_ID,
      occurredAt: '2026-10-05',
      note: 'Tagihan listrik dan air masjid',
    });

    // Late October Friday transactions (within last 7 days of 2026-10-31: 2026-10-25..2026-10-31)
    await repository.addTransaction({
      id: 'tx-oct-friday',
      type: 'income',
      amount: 2_500_000,
      categoryId: 'cat-inc-pembangunan',
      accountId: DEFAULT_CASH_ACCOUNT_BANK_ID,
      fundId: DEFAULT_FUND_PEMBANGUNAN_ID,
      occurredAt: '2026-10-30',
      donorOrPayee: 'Jamaah Jumat',
      note: 'Wakaf semen & keramik teras',
    });

    const printSpy = vi.fn();
    Object.defineProperty(window, 'print', {
      configurable: true,
      writable: true,
      value: printSpy,
    });

    render(
      <OverviewFoundationPage
        repository={repository}
        initialYearMonth={{ year: 2026, month: 10 }}
        activeRoute="reports"
      />,
    );

    // Verify Mosque Identity & Officers on Report Sheet
    const mosqueHeading = await screen.findByTestId('report-mosque-name');
    expect(mosqueHeading).toHaveTextContent('Masjid Raya Al-Falah');
    expect(
      screen.getByText(/Jl\. Diponegoro No\. 45, Bandung/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId('report-chairperson-name')).toHaveTextContent(
      'KH. Abdullah Gymnastiar',
    );
    expect(screen.getByTestId('report-treasurer-name')).toHaveTextContent(
      'H. Salman Al-Farisi',
    );

    // Monthly Report (October 2026):
    // Opening Balance = 10.000.000 + 1.000.000 (Sep) = Rp 11.000.000
    // Period Income = +Rp 2.500.000
    // Period Expense = -Rp 500.000
    // Closing Balance = Rp 13.000.000
    expect(screen.getByTestId('report-opening-balance')).toHaveTextContent(
      /Rp\s*11\.000\.000/,
    );
    expect(screen.getByTestId('report-period-income')).toHaveTextContent(
      /\+Rp\s*2\.500\.000/,
    );
    expect(screen.getByTestId('report-period-expense')).toHaveTextContent(
      /[-−]Rp\s*500\.000/,
    );
    expect(screen.getByTestId('report-closing-balance')).toHaveTextContent(
      /Rp\s*13\.000\.000/,
    );

    // Switch preset to "Laporan Kas Jumat (7 Hari)" (2026-10-25..2026-10-31)
    // Prior to 2026-10-25: 10.000.000 + 1.000.000 (Sep) - 500.000 (Oct 5) = Rp 10.500.000
    // Period Income (Oct 25..31): +Rp 2.500.000, Period Expense: Rp 0
    // Closing Balance: Rp 13.000.000
    fireEvent.click(
      screen.getByRole('radio', { name: /Laporan Kas Jumat \(7 Hari\)/i }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('report-opening-balance')).toHaveTextContent(
        /Rp\s*10\.500\.000/,
      );
    });
    expect(screen.getByTestId('report-period-expense')).toHaveTextContent(
      /[-−]Rp\s*0/,
    );
    expect(screen.getByTestId('report-closing-balance')).toHaveTextContent(
      /Rp\s*13\.000\.000/,
    );

    // Filter by specific Fund: Dana Pembangunan
    const fundFilter = screen.getByLabelText(/Filter Dana Amanah/i);
    fireEvent.change(fundFilter, {
      target: { value: DEFAULT_FUND_PEMBANGUNAN_ID },
    });

    await waitFor(() => {
      expect(screen.getByTestId('report-opening-balance')).toHaveTextContent(
        /Rp\s*6\.000\.000/,
      );
    });
    expect(screen.getByTestId('report-closing-balance')).toHaveTextContent(
      /Rp\s*8\.500\.000/,
    );

    // Trigger Print / Save PDF
    fireEvent.click(
      screen.getByRole('button', { name: /Cetak \/ Simpan PDF/i }),
    );
    expect(printSpy).toHaveBeenCalledTimes(1);

    // Trigger CSV Export
    fireEvent.click(
      screen.getByRole('button', { name: /Ekspor CSV Laporan/i }),
    );
    expect(
      await screen.findByText(/Berhasil menyiapkan CSV laporan/i),
    ).toBeInTheDocument();
  });

  it('saves Mosque Profile & Officers and manages Mosque Categories (create, rename, archive) on Pengaturan tab', async () => {
    const db = createIsolatedDb();
    const repository = createNotaRepository(db);

    await repository.saveOpeningBalance(1_000_000, {
      completeOnboarding: true,
    });

    render(
      <OverviewFoundationPage
        repository={repository}
        initialYearMonth={{ year: 2026, month: 10 }}
        activeRoute="settings"
      />,
    );

    const profileRegion = await screen.findByRole('region', {
      name: /Profil dan pengurus masjid/i,
    });

    fireEvent.change(
      within(profileRegion).getByLabelText(/Nama Masjid \/ Musholla/i),
      { target: { value: 'Masjid Agung Al-Ukhuwah' } },
    );
    fireEvent.change(
      within(profileRegion).getByLabelText(/Alamat Lengkap Masjid/i),
      { target: { value: 'Jl. Wastukencana No. 27' } },
    );
    fireEvent.change(
      within(profileRegion).getByLabelText(/Nama Ketua DKM \/ Takmir/i),
      { target: { value: 'Dr. H. Ridwan' } },
    );
    fireEvent.change(
      within(profileRegion).getByLabelText(/Nama Bendahara Masjid/i),
      { target: { value: 'Ir. H. Lukman' } },
    );

    fireEvent.click(
      within(profileRegion).getByRole('button', {
        name: /Simpan Profil Masjid/i,
      }),
    );

    expect(
      await within(profileRegion).findByText(
        /Profil dan pengurus masjid berhasil disimpan/i,
      ),
    ).toBeInTheDocument();

    const updatedSettings = await repository.getSettings();
    expect(updatedSettings.mosqueName).toBe('Masjid Agung Al-Ukhuwah');
    expect(updatedSettings.chairpersonName).toBe('Dr. H. Ridwan');
    expect(updatedSettings.treasurerName).toBe('Ir. H. Lukman');

    // Category Management: Create new category, rename it, and archive it
    const categoryRegion = screen.getByRole('region', {
      name: /Manajemen kategori masjid/i,
    });

    fireEvent.click(
      within(categoryRegion).getByRole('button', {
        name: /Tambah Kategori Masjid/i,
      }),
    );

    fireEvent.change(
      within(categoryRegion).getByLabelText(/Nama Kategori Baru/i),
      { target: { value: 'Wakaf Al-Quran & Kitab' } },
    );
    fireEvent.click(
      within(categoryRegion).getByRole('button', {
        name: /Simpan Kategori/i,
      }),
    );

    await waitFor(() => {
      expect(
        within(categoryRegion).getByText('Wakaf Al-Quran & Kitab'),
      ).toBeInTheDocument();
    });

    // Rename category
    fireEvent.click(
      within(categoryRegion).getByRole('button', {
        name: /Ubah nama kategori Wakaf Al-Quran & Kitab/i,
      }),
    );
    const renameInput = within(categoryRegion).getByLabelText(
      /Nama baru untuk Wakaf Al-Quran & Kitab/i,
    );
    fireEvent.change(renameInput, {
      target: { value: 'Wakaf Mushaf Al-Quran' },
    });
    fireEvent.click(
      within(categoryRegion).getByRole('button', { name: /Simpan Nama/i }),
    );

    await waitFor(() => {
      expect(
        within(categoryRegion).getByText('Wakaf Mushaf Al-Quran'),
      ).toBeInTheDocument();
    });

    // Archive category
    fireEvent.click(
      within(categoryRegion).getByRole('button', {
        name: /Arsipkan kategori Wakaf Mushaf Al-Quran/i,
      }),
    );

    await waitFor(() => {
      expect(within(categoryRegion).getByText('Diarsipkan')).toBeInTheDocument();
    });
  });
});
