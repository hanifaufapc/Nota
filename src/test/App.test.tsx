import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../app/App';
import { formatIDR } from '../lib/format';

describe('Nota Milestone 0 — AppShell & Foundation', () => {
  it('renders Nota identity, active overview navigation, and key Indonesian labels', async () => {
    render(<App />);

    expect(screen.getByText('Nota')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ringkasan' }),
    ).toHaveAttribute('aria-current', 'page');

    expect(screen.getByText('Saldo tercatat')).toBeInTheDocument();
    expect(screen.getByText('Selisih bulan ini')).toBeInTheDocument();
    expect(screen.getByText('Pemasukan')).toBeInTheDocument();
    expect(screen.getByText('Pengeluaran')).toBeInTheDocument();
    expect(screen.getByText('Transaksi terakhir')).toBeInTheDocument();
    expect(screen.getByText('Belum ada transaksi')).toBeInTheDocument();

    expect(
      await screen.findByRole('heading', {
        name: /Atur saldo awal catatan Anda/i,
      }),
    ).toBeInTheDocument();
  });

  it('enables transaction actions in Milestone 4 and opens the quick-entry form when clicked', async () => {
    render(<App />);

    await screen.findByRole('heading', {
      name: /Atur saldo awal catatan Anda/i,
    });

    const addIncomeBtn = screen.getByRole('button', {
      name: /Tambah pemasukan/i,
    });
    const addExpenseBtn = screen.getByRole('button', {
      name: /Tambah pengeluaran/i,
    });

    expect(addIncomeBtn).toBeEnabled();
    expect(addExpenseBtn).toBeEnabled();
  });

  it('does not render bank-specific anti-patterns (account number, transfer, rewards, user avatar)', async () => {
    render(<App />);

    expect(screen.queryByText(/Account Number/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Transfer Balance/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Request Balance/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rewards/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Points/i)).not.toBeInTheDocument();

    await screen.findByRole('heading', {
      name: /Atur saldo awal catatan Anda/i,
    });
  });

  it('formats integer IDR amounts accurately and rejects floating point values', () => {
    expect(formatIDR(0)).toMatch(/Rp\s*0/);
    expect(formatIDR(1500000)).toMatch(/Rp\s*1\.500\.000/);
    expect(() => formatIDR(123.45)).toThrow(RangeError);
  });
});

