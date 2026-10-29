/**
 * Milestone M2 Tests:
 * - 6-Tab Navigation (`Ringkasan`, `Transaksi`, `Kas & Dana`, `Anggaran / RAB`, `Laporan`, `Pengaturan`)
 * - Mosque Onboarding & Detailed Account/Fund Opening Balance Setup
 * - `Ringkasan` Mosque Balance Split (Dana Operasional Umum vs Dana Terikat, Posisi Dana Masjid, Posisi Lokasi Kas)
 * - `Kas & Dana` Management (`CashAccount`s, `Fund`s, and `CashTransfer` internal transfers without altering Fund balances)
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../app/App';
import { NotaDatabase } from '../data/db';
import { createNotaRepository } from '../data/repositories/notaRepository';
import {
  DEFAULT_CASH_ACCOUNT_BANK_ID,
  DEFAULT_CASH_ACCOUNT_TUNAI_ID,
  DEFAULT_FUND_OPERASIONAL_ID,
  DEFAULT_FUND_PEMBANGUNAN_ID,
} from '../domain/mosque';
import { OverviewFoundationPage } from '../features/overview/OverviewFoundationPage';

describe('Milestone M2 — 6-Tab Navigation, Mosque Onboarding, Ringkasan Split & Kas & Dana', () => {
  const activeDatabases: NotaDatabase[] = [];

  function createIsolatedRepo() {
    const db = new NotaDatabase(
      `NotaMosqueM2Test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    );
    activeDatabases.push(db);
    return createNotaRepository(db);
  }

  afterEach(async () => {
    while (activeDatabases.length > 0) {
      const db = activeDatabases.pop();
      if (db) {
        await db.delete();
      }
    }
  });

  it('renders all 6 primary navigation tabs in AppShell and switches routes cleanly', async () => {
    render(<App />);

    const navButtons = [
      'Ringkasan',
      'Transaksi',
      'Kas & Dana',
      'Anggaran / RAB',
      'Laporan',
      'Pengaturan',
    ];

    for (const label of navButtons) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }

    // Switch to Kas & Dana tab
    const kasDanaBtn = screen.getByRole('button', { name: 'Kas & Dana' });
    fireEvent.click(kasDanaBtn);
    expect(kasDanaBtn).toHaveAttribute('aria-current', 'page');

    expect(
      await screen.findByRole('heading', {
        name: /Lokasi Kas & Dana Masjid/i,
      }),
    ).toBeInTheDocument();
  });

  it('supports Mosque onboarding with detailed per-Account and per-Fund opening balances and displays the split on Ringkasan', async () => {
    const repo = createIsolatedRepo();
    render(
      <OverviewFoundationPage
        repository={repo}
        initialYearMonth={{ year: 2026, month: 3 }}
        activeRoute="overview"
      />,
    );

    const mosqueNameInput = await screen.findByLabelText(
      /Nama Masjid \/ Musholla/i,
    );
    fireEvent.change(mosqueNameInput, {
      target: { value: 'Masjid Jami Al-Muhajirin' },
    });

    // Open detailed Kas & Dana split inside setup
    fireEvent.click(
      screen.getByRole('button', { name: /Rincian per Kas & Dana/i }),
    );

    const kasTunaiInput = screen.getByLabelText(/Kas Tunai \(IDR\)/i);
    const bankInput = screen.getByLabelText(/Rekening Bank Tercatat \(IDR\)/i);
    fireEvent.change(kasTunaiInput, { target: { value: '2000000' } });
    fireEvent.change(bankInput, { target: { value: '5000000' } });

    const operasionalInput = screen.getByLabelText(
      /Dana Operasional Umum \(IDR\)/i,
    );
    const pembangunanInput = screen.getByLabelText(
      /Dana Pembangunan \(IDR\)/i,
    );
    fireEvent.change(operasionalInput, { target: { value: '3000000' } });
    fireEvent.change(pembangunanInput, { target: { value: '4000000' } });

    fireEvent.click(
      screen.getByRole('button', { name: /Simpan & mulai gunakan Nota/i }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', {
          name: /Atur saldo awal catatan Anda/i,
        }),
      ).not.toBeInTheDocument();
    });

    // Verify Ringkasan Hero & Split cards reflect Rp 7.000.000 total, Rp 3.000.000 unrestricted, Rp 4.000.000 restricted
    expect(screen.getByTestId('current-balance-value')).toHaveTextContent(
      /Rp\s*7\.000\.000/,
    );
    expect(
      screen.getByTestId('overview-unrestricted-balance'),
    ).toHaveTextContent(/Rp\s*3\.000\.000/);
    expect(screen.getByTestId('overview-restricted-balance')).toHaveTextContent(
      /Rp\s*4\.000\.000/,
    );
    expect(
      screen.getByTestId(`overview-account-pill-${DEFAULT_CASH_ACCOUNT_TUNAI_ID}`),
    ).toHaveTextContent(/Rp\s*2\.000\.000/);
    expect(
      screen.getByTestId(
        `overview-account-pill-${DEFAULT_CASH_ACCOUNT_BANK_ID}`,
      ),
    ).toHaveTextContent(/Rp\s*5\.000\.000/);
  });

  it('records and deletes internal CashTransfers on Kas & Dana tab, updating CashAccount balances without altering Fund balances', async () => {
    const repo = createIsolatedRepo();
    await repo.saveInitialSetup({
      mosqueName: 'Masjid Al-Falah',
      accountOpeningBalances: {
        [DEFAULT_CASH_ACCOUNT_TUNAI_ID]: 3_000_000,
        [DEFAULT_CASH_ACCOUNT_BANK_ID]: 4_000_000,
      },
      fundOpeningBalances: {
        [DEFAULT_FUND_OPERASIONAL_ID]: 2_500_000,
        [DEFAULT_FUND_PEMBANGUNAN_ID]: 4_500_000,
      },
    });

    render(
      <OverviewFoundationPage
        repository={repo}
        initialYearMonth={{ year: 2026, month: 3 }}
        activeRoute="cash-and-funds"
      />,
    );

    // Verify initial balances on Kas & Dana
    expect(
      await screen.findByTestId('cash-funds-total-balance'),
    ).toHaveTextContent(/Rp\s*7\.000\.000/);
    expect(
      screen.getByTestId(`account-balance-${DEFAULT_CASH_ACCOUNT_TUNAI_ID}`),
    ).toHaveTextContent(/Rp\s*3\.000\.000/);
    expect(
      screen.getByTestId(`account-balance-${DEFAULT_CASH_ACCOUNT_BANK_ID}`),
    ).toHaveTextContent(/Rp\s*4\.000\.000/);

    // Record a Rp 1.000.000 transfer from Kas Tunai -> Rekening Bank Tercatat
    fireEvent.click(
      screen.getByRole('button', { name: /Catat mutasi antar-kas/i }),
    );

    const amountInput = screen.getByLabelText(/Nominal mutasi \(IDR\)/i);
    fireEvent.change(amountInput, { target: { value: '1000000' } });

    const noteInput = screen.getByLabelText(/Catatan mutasi/i);
    fireEvent.change(noteInput, {
      target: { value: 'Setor kotak Jumat ke rekening BSI' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: /Simpan mutasi antar-kas/i }),
    );

    // Kas Tunai becomes Rp 2.000.000, Rekening Bank becomes Rp 5.000.000
    await waitFor(() => {
      expect(
        screen.getByTestId(`account-balance-${DEFAULT_CASH_ACCOUNT_TUNAI_ID}`),
      ).toHaveTextContent(/Rp\s*2\.000\.000/);
    });
    expect(
      screen.getByTestId(`account-balance-${DEFAULT_CASH_ACCOUNT_BANK_ID}`),
    ).toHaveTextContent(/Rp\s*5\.000\.000/);

    // Total Kas Masjid (Rp 7.000.000) and Fund balances (Rp 2.500.000 & Rp 4.500.000) are UNCHANGED!
    expect(screen.getByTestId('cash-funds-total-balance')).toHaveTextContent(
      /Rp\s*7\.000\.000/,
    );
    expect(
      screen.getByTestId(`fund-balance-${DEFAULT_FUND_OPERASIONAL_ID}`),
    ).toHaveTextContent(/Rp\s*2\.500\.000/);
    expect(
      screen.getByTestId(`fund-balance-${DEFAULT_FUND_PEMBANGUNAN_ID}`),
    ).toHaveTextContent(/Rp\s*4\.500\.000/);

    // Delete the transfer and verify balances revert cleanly
    fireEvent.click(
      screen.getByRole('button', {
        name: /Hapus mutasi Kas Tunai ke Rekening Bank Tercatat/i,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Ya, hapus/i }));

    await waitFor(() => {
      expect(
        screen.getByTestId(`account-balance-${DEFAULT_CASH_ACCOUNT_TUNAI_ID}`),
      ).toHaveTextContent(/Rp\s*3\.000\.000/);
    });
  });
});
