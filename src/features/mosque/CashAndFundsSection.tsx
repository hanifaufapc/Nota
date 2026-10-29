import { type FormEvent, useState } from 'react';
import {
  AlertCircle,
  ArrowLeftRight,
  Building2,
  Coins,
  Landmark,
  PencilLine,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import {
  MAX_IDR_AMOUNT,
  isValidOpeningBalance,
  isValidTransactionAmount,
} from '../../domain/money';
import {
  DEFAULT_CASH_ACCOUNT_BANK_ID,
  DEFAULT_CASH_ACCOUNT_TUNAI_ID,
  type CashAccount,
  type CashAccountInput,
  type CashAccountKind,
  type CashAccountPatch,
  type CashTransfer,
  type CashTransferInput,
  type Fund,
  type FundInput,
  type FundPatch,
  type FundRestriction,
  type MosqueBalanceSplit,
  getSelectableCashAccounts,
} from '../../domain/mosque';
import { toLocalDateString } from '../../lib/date';
import {
  formatIDR,
  formatIdrDigits,
  formatLocalDateID,
  formatSignedIDR,
  parseIdrInputDigits,
} from '../../lib/format';

interface CashAndFundsSectionProps {
  accounts: readonly CashAccount[];
  funds: readonly Fund[];
  cashTransfers: readonly CashTransfer[];
  mosqueBalanceSplit: MosqueBalanceSplit;
  onAddAccount: (input: CashAccountInput) => Promise<void>;
  onUpdateAccount: (accountId: string, patch: CashAccountPatch) => Promise<void>;
  onAddFund: (input: FundInput) => Promise<void>;
  onUpdateFund: (fundId: string, patch: FundPatch) => Promise<void>;
  onAddCashTransfer: (input: CashTransferInput) => Promise<void>;
  onDeleteCashTransfer: (transferId: string) => Promise<void>;
}

export function CashAndFundsSection({
  accounts,
  funds,
  cashTransfers,
  mosqueBalanceSplit,
  onAddAccount,
  onUpdateAccount,
  onAddFund,
  onUpdateFund,
  onAddCashTransfer,
  onDeleteCashTransfer,
}: CashAndFundsSectionProps) {
  const selectableAccounts = getSelectableCashAccounts(accounts);
  const accountNameMap = new Map(accounts.map((acc) => [acc.id, acc.name]));

  // Account Form State (Create or Edit)
  const [accountFormMode, setAccountFormMode] = useState<
    { type: 'create' } | { type: 'edit'; account: CashAccount } | null
  >(null);
  const [accName, setAccName] = useState('');
  const [accKind, setAccKind] = useState<CashAccountKind>('cash');
  const [accOpeningRaw, setAccOpeningRaw] = useState('0');
  const [accError, setAccError] = useState<string | null>(null);
  const [isSavingAcc, setIsSavingAcc] = useState(false);

  // Fund Form State (Create or Edit)
  const [fundFormMode, setFundFormMode] = useState<
    { type: 'create' } | { type: 'edit'; fund: Fund } | null
  >(null);
  const [fundName, setFundName] = useState('');
  const [fundRestriction, setFundRestriction] =
    useState<FundRestriction>('unrestricted');
  const [fundDescription, setFundDescription] = useState('');
  const [fundOpeningRaw, setFundOpeningRaw] = useState('0');
  const [fundError, setFundError] = useState<string | null>(null);
  const [isSavingFund, setIsSavingFund] = useState(false);

  // CashTransfer Form State
  const [isTransferFormOpen, setIsTransferFormOpen] = useState(false);
  const [fromAccountId, setFromAccountId] = useState<string>(
    DEFAULT_CASH_ACCOUNT_TUNAI_ID,
  );
  const [toAccountId, setToAccountId] = useState<string>(
    DEFAULT_CASH_ACCOUNT_BANK_ID,
  );
  const [transferAmountRaw, setTransferAmountRaw] = useState('');
  const [transferDate, setTransferDate] = useState<string>(() =>
    toLocalDateString(new Date()),
  );
  const [transferNote, setTransferNote] = useState('');
  const [transferError, setTransferError] = useState<string | null>(null);
  const [isSavingTransfer, setIsSavingTransfer] = useState(false);
  const [confirmDeleteTransferId, setConfirmDeleteTransferId] = useState<
    string | null
  >(null);

  function sanitizeDigits(value: string): string | null {
    const digits = value.replace(/\D/g, '');
    if (digits.length === 0) {
      return '';
    }
    const numeric = Number(digits);
    if (Number.isSafeInteger(numeric) && numeric <= MAX_IDR_AMOUNT) {
      return formatIdrDigits(numeric);
    }
    return null;
  }

  function openCreateAccount() {
    setAccError(null);
    setAccName('');
    setAccKind('bank_recorded');
    setAccOpeningRaw('0');
    setAccountFormMode({ type: 'create' });
  }

  function openEditAccount(account: CashAccount) {
    setAccError(null);
    setAccName(account.name);
    setAccKind(account.kind);
    setAccOpeningRaw(
      account.openingBalance > 0
        ? formatIdrDigits(account.openingBalance)
        : '0',
    );
    setAccountFormMode({ type: 'edit', account });
  }

  async function handleAccountSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccError(null);
    const parsedOpening =
      accOpeningRaw.trim() === '' ? 0 : parseIdrInputDigits(accOpeningRaw);

    if (parsedOpening === null || !isValidOpeningBalance(parsedOpening)) {
      setAccError(
        'Saldo awal lokasi kas harus berupa bilangan bulat Rupiah (0 atau lebih besar).',
      );
      return;
    }

    if (!accName.trim()) {
      setAccError('Nama lokasi kas wajib diisi.');
      return;
    }

    setIsSavingAcc(true);
    try {
      if (accountFormMode?.type === 'create') {
        await onAddAccount({
          id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: accName.trim(),
          kind: accKind,
          openingBalance: parsedOpening,
        });
      } else if (accountFormMode?.type === 'edit') {
        await onUpdateAccount(accountFormMode.account.id, {
          name: accName.trim(),
          kind: accKind,
          openingBalance: parsedOpening,
        });
      }
      setAccountFormMode(null);
    } catch (err) {
      setAccError(
        err instanceof Error ? err.message : 'Gagal menyimpan lokasi kas.',
      );
    } finally {
      setIsSavingAcc(false);
    }
  }

  function openCreateFund() {
    setFundError(null);
    setFundName('');
    setFundRestriction('restricted');
    setFundDescription('');
    setFundOpeningRaw('0');
    setFundFormMode({ type: 'create' });
  }

  function openEditFund(fund: Fund) {
    setFundError(null);
    setFundName(fund.name);
    setFundRestriction(fund.restriction);
    setFundDescription(fund.description ?? '');
    setFundOpeningRaw(
      fund.openingBalance > 0 ? formatIdrDigits(fund.openingBalance) : '0',
    );
    setFundFormMode({ type: 'edit', fund });
  }

  async function handleFundSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFundError(null);
    const parsedOpening =
      fundOpeningRaw.trim() === '' ? 0 : parseIdrInputDigits(fundOpeningRaw);

    if (parsedOpening === null || !isValidOpeningBalance(parsedOpening)) {
      setFundError(
        'Saldo awal dana masjid harus berupa bilangan bulat Rupiah (0 atau lebih besar).',
      );
      return;
    }

    if (!fundName.trim()) {
      setFundError('Nama dana masjid wajib diisi.');
      return;
    }

    setIsSavingFund(true);
    try {
      if (fundFormMode?.type === 'create') {
        await onAddFund({
          id: `fund-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: fundName.trim(),
          restriction: fundRestriction,
          openingBalance: parsedOpening,
          description: fundDescription.trim() || undefined,
        });
      } else if (fundFormMode?.type === 'edit') {
        await onUpdateFund(fundFormMode.fund.id, {
          name: fundName.trim(),
          restriction: fundRestriction,
          openingBalance: parsedOpening,
          description: fundDescription.trim(),
        });
      }
      setFundFormMode(null);
    } catch (err) {
      setFundError(
        err instanceof Error ? err.message : 'Gagal menyimpan dana masjid.',
      );
    } finally {
      setIsSavingFund(false);
    }
  }

  async function handleTransferSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTransferError(null);

    const parsedAmount = parseIdrInputDigits(transferAmountRaw);
    if (parsedAmount === null || !isValidTransactionAmount(parsedAmount)) {
      setTransferError(
        'Masukkan nominal mutasi berupa bilangan bulat Rupiah lebih besar dari 0.',
      );
      return;
    }

    if (fromAccountId === toAccountId) {
      setTransferError('Lokasi kas asal dan tujuan tidak boleh sama.');
      return;
    }

    setIsSavingTransfer(true);
    try {
      await onAddCashTransfer({
        fromAccountId,
        toAccountId,
        amount: parsedAmount,
        occurredAt: transferDate,
        note: transferNote.trim() || undefined,
      });
      setTransferAmountRaw('');
      setTransferNote('');
      setIsTransferFormOpen(false);
    } catch (err) {
      setTransferError(
        err instanceof Error
          ? err.message
          : 'Gagal menyimpan mutasi antar-kas.',
      );
    } finally {
      setIsSavingTransfer(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Summary Strip: Total Kas Masjid vs Alokasi Dana */}
      <section
        aria-label="Ringkasan posisi kas dan dana masjid"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3 rounded-hero border border-nota-border/70 bg-nota-surface p-5 sm:p-6"
      >
        <div className="rounded-panel bg-nota-bg/70 p-4 space-y-1">
          <span className="text-xs font-medium text-nota-muted block">
            Total Kas Masjid (Semua Lokasi Kas)
          </span>
          <span
            data-testid="cash-funds-total-balance"
            className="block text-xl sm:text-2xl font-semibold text-nota-ink tabular-nums"
          >
            {mosqueBalanceSplit.totalBalance < 0
              ? formatSignedIDR(mosqueBalanceSplit.totalBalance)
              : formatIDR(mosqueBalanceSplit.totalBalance)}
          </span>
        </div>

        <div className="rounded-panel bg-nota-soft-green/45 p-4 space-y-1">
          <span className="text-xs font-medium text-nota-emerald block">
            Dana Operasional Umum (Bebas)
          </span>
          <span
            data-testid="cash-funds-unrestricted-balance"
            className="block text-xl sm:text-2xl font-semibold text-nota-emerald tabular-nums"
          >
            {mosqueBalanceSplit.unrestrictedBalance < 0
              ? formatSignedIDR(mosqueBalanceSplit.unrestrictedBalance)
              : formatIDR(mosqueBalanceSplit.unrestrictedBalance)}
          </span>
        </div>

        <div className="rounded-panel bg-nota-bg/70 p-4 space-y-1 border border-nota-ink/10">
          <span className="text-xs font-medium text-nota-ink block">
            Total Dana Terikat (Amanah)
          </span>
          <span
            data-testid="cash-funds-restricted-balance"
            className="block text-xl sm:text-2xl font-semibold text-nota-ink tabular-nums"
          >
            {mosqueBalanceSplit.restrictedBalance < 0
              ? formatSignedIDR(mosqueBalanceSplit.restrictedBalance)
              : formatIDR(mosqueBalanceSplit.restrictedBalance)}
          </span>
        </div>
      </section>

      {/* Area 1: Lokasi Penyimpanan Kas (CashAccount) */}
      <section
        aria-label="Lokasi Penyimpanan Kas"
        className="rounded-hero bg-nota-surface p-6 sm:p-7 border border-nota-border/70 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Wallet
                className="h-4 w-4 text-nota-emerald"
                aria-hidden="true"
              />
              <h2 className="text-base sm:text-lg font-semibold text-nota-ink">
                Lokasi Penyimpanan Kas Masjid
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-nota-muted">
              Tempat uang fisik atau rekening bank masjid dicatat secara manual
              tanpa koneksi API perbankan.
            </p>
          </div>

          <button
            type="button"
            onClick={openCreateAccount}
            className="inline-flex items-center gap-1.5 rounded-control border border-nota-border bg-nota-bg px-3.5 py-2 text-xs sm:text-sm font-medium text-nota-ink hover:bg-nota-soft-green/50 transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5 text-nota-emerald" aria-hidden="true" />
            Tambah lokasi kas
          </button>
        </div>

        {accountFormMode ? (
          <form
            onSubmit={handleAccountSubmit}
            noValidate
            className="rounded-panel border border-nota-border bg-nota-bg/70 p-4 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-nota-ink">
                {accountFormMode.type === 'create'
                  ? 'Tambah Lokasi Kas Baru'
                  : `Ubah Lokasi Kas: ${accountFormMode.account.name}`}
              </h3>
              <button
                type="button"
                onClick={() => setAccountFormMode(null)}
                className="inline-flex items-center gap-1 text-xs font-medium text-nota-muted hover:text-nota-ink cursor-pointer"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Tutup
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label
                  htmlFor="account-name-input"
                  className="block text-xs font-medium text-nota-muted"
                >
                  Nama lokasi kas
                </label>
                <input
                  id="account-name-input"
                  type="text"
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  placeholder="Contoh: Rekening BSI Pembangunan"
                  className="w-full rounded-panel border border-nota-border bg-nota-surface px-3 py-2 text-sm font-medium text-nota-ink"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="account-kind-select"
                  className="block text-xs font-medium text-nota-muted"
                >
                  Jenis lokasi kas
                </label>
                <select
                  id="account-kind-select"
                  value={accKind}
                  onChange={(e) =>
                    setAccKind(e.target.value as CashAccountKind)
                  }
                  className="w-full rounded-panel border border-nota-border bg-nota-surface px-3 py-2 text-sm font-medium text-nota-ink"
                >
                  <option value="cash">Kas Tunai / Brankas Fisik</option>
                  <option value="bank_recorded">
                    Rekening Bank Tercatat (Manual)
                  </option>
                </select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="account-opening-input"
                  className="block text-xs font-medium text-nota-muted"
                >
                  Saldo awal (IDR)
                </label>
                <input
                  id="account-opening-input"
                  type="text"
                  inputMode="numeric"
                  value={accOpeningRaw}
                  onChange={(e) => {
                    const next = sanitizeDigits(e.target.value);
                    if (next !== null) setAccOpeningRaw(next);
                  }}
                  className="w-full rounded-panel border border-nota-border bg-nota-surface px-3 py-2 text-sm font-semibold text-nota-ink tabular-nums"
                />
              </div>
            </div>

            {accError ? (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-badge bg-nota-expense-soft px-3.5 py-2.5 text-xs font-medium text-nota-expense"
              >
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{accError}</span>
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={isSavingAcc}
                className="rounded-control bg-nota-emerald px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-nota-emerald-hover transition-colors cursor-pointer"
              >
                {isSavingAcc ? 'Menyimpan...' : 'Simpan lokasi kas'}
              </button>
              <button
                type="button"
                onClick={() => setAccountFormMode(null)}
                className="rounded-control border border-nota-border bg-nota-surface px-4 py-2 text-xs sm:text-sm font-medium text-nota-ink hover:bg-nota-soft-green/40 transition-colors cursor-pointer"
              >
                Batal
              </button>
            </div>
          </form>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {mosqueBalanceSplit.accountSummaries.map((acc) => {
            const rawAccount = accounts.find((a) => a.id === acc.accountId);
            return (
              <div
                key={acc.accountId}
                data-testid={`account-card-${acc.accountId}`}
                className="rounded-panel border border-nota-border/80 bg-nota-bg/50 p-5 space-y-4 flex flex-col justify-between"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-nota-soft-green text-nota-emerald">
                      {acc.kind === 'cash' ? (
                        <Coins className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Landmark className="h-4 w-4" aria-hidden="true" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-semibold text-nota-ink">
                        {acc.accountName}
                      </h3>
                      <span className="text-xs text-nota-muted">
                        {acc.kind === 'cash'
                          ? 'Uang Tunai / Brankas Masjid'
                          : 'Rekening Bank Tercatat Manual'}
                      </span>
                    </div>
                  </div>

                  {rawAccount ? (
                    <button
                      type="button"
                      onClick={() => openEditAccount(rawAccount)}
                      aria-label={`Ubah lokasi kas ${acc.accountName}`}
                      className="inline-flex items-center gap-1 rounded-control border border-nota-border bg-nota-surface px-2.5 py-1 text-xs font-medium text-nota-ink hover:bg-nota-soft-green/50 transition-colors cursor-pointer"
                    >
                      <PencilLine className="h-3 w-3" aria-hidden="true" />
                      Ubah
                    </button>
                  ) : null}
                </div>

                <div>
                  <span className="text-xs font-medium text-nota-muted block">
                    Saldo saat ini
                  </span>
                  <span
                    data-testid={`account-balance-${acc.accountId}`}
                    className={`mt-0.5 block text-xl sm:text-2xl font-semibold tabular-nums ${
                      acc.currentBalance < 0
                        ? 'text-nota-expense'
                        : 'text-nota-ink'
                    }`}
                  >
                    {acc.currentBalance < 0
                      ? formatSignedIDR(acc.currentBalance)
                      : formatIDR(acc.currentBalance)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-nota-border/60 text-xs">
                  <div>
                    <span className="text-nota-muted block">Saldo Awal</span>
                    <strong className="font-medium text-nota-ink tabular-nums">
                      {formatIDR(acc.openingBalance)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-nota-muted block">
                      Mutasi Antar-Kas
                    </span>
                    <strong className="font-medium text-nota-ink tabular-nums">
                      {formatSignedIDR(acc.transfersIn - acc.transfersOut)}
                    </strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Area 2: Dana Masjid (Fund — Amanah Peruntukan) */}
      <section
        aria-label="Dana Masjid dan Peruntukan Amanah"
        className="rounded-hero bg-nota-surface p-6 sm:p-7 border border-nota-border/70 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Building2
                className="h-4 w-4 text-nota-emerald"
                aria-hidden="true"
              />
              <h2 className="text-base sm:text-lg font-semibold text-nota-ink">
                Dana Masjid (Peruntukan Amanah)
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-nota-muted">
              Memisahkan dana operasional umum dari dana amanah terikat
              (Pembangunan & Sosial/Zakat) agar tidak tercampur.
            </p>
          </div>

          <button
            type="button"
            onClick={openCreateFund}
            className="inline-flex items-center gap-1.5 rounded-control border border-nota-border bg-nota-bg px-3.5 py-2 text-xs sm:text-sm font-medium text-nota-ink hover:bg-nota-soft-green/50 transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5 text-nota-emerald" aria-hidden="true" />
            Tambah dana masjid
          </button>
        </div>

        {fundFormMode ? (
          <form
            onSubmit={handleFundSubmit}
            noValidate
            className="rounded-panel border border-nota-border bg-nota-bg/70 p-4 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-nota-ink">
                {fundFormMode.type === 'create'
                  ? 'Tambah Dana Masjid Baru'
                  : `Ubah Dana: ${fundFormMode.fund.name}`}
              </h3>
              <button
                type="button"
                onClick={() => setFundFormMode(null)}
                className="inline-flex items-center gap-1 text-xs font-medium text-nota-muted hover:text-nota-ink cursor-pointer"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Tutup
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label
                  htmlFor="fund-name-input"
                  className="block text-xs font-medium text-nota-muted"
                >
                  Nama dana masjid
                </label>
                <input
                  id="fund-name-input"
                  type="text"
                  value={fundName}
                  onChange={(e) => setFundName(e.target.value)}
                  placeholder="Contoh: Dana Kurban & Idul Adha"
                  className="w-full rounded-panel border border-nota-border bg-nota-surface px-3 py-2 text-sm font-medium text-nota-ink"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="fund-restriction-select"
                  className="block text-xs font-medium text-nota-muted"
                >
                  Sifat amanah dana
                </label>
                <select
                  id="fund-restriction-select"
                  value={fundRestriction}
                  onChange={(e) =>
                    setFundRestriction(e.target.value as FundRestriction)
                  }
                  className="w-full rounded-panel border border-nota-border bg-nota-surface px-3 py-2 text-sm font-medium text-nota-ink"
                >
                  <option value="unrestricted">
                    Dana Umum (Bebas Operasional)
                  </option>
                  <option value="restricted">
                    Dana Terikat (Amanah Khusus)
                  </option>
                </select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="fund-opening-input"
                  className="block text-xs font-medium text-nota-muted"
                >
                  Saldo awal dana (IDR)
                </label>
                <input
                  id="fund-opening-input"
                  type="text"
                  inputMode="numeric"
                  value={fundOpeningRaw}
                  onChange={(e) => {
                    const next = sanitizeDigits(e.target.value);
                    if (next !== null) setFundOpeningRaw(next);
                  }}
                  className="w-full rounded-panel border border-nota-border bg-nota-surface px-3 py-2 text-sm font-semibold text-nota-ink tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="fund-desc-input"
                className="block text-xs font-medium text-nota-muted"
              >
                Keterangan peruntukan dana (opsional)
              </label>
              <input
                id="fund-desc-input"
                type="text"
                value={fundDescription}
                onChange={(e) => setFundDescription(e.target.value)}
                placeholder="Contoh: Khusus penerimaan dan penyaluran hewan kurban jamaah"
                className="w-full rounded-panel border border-nota-border bg-nota-surface px-3 py-2 text-sm text-nota-ink"
              />
            </div>

            {fundError ? (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-badge bg-nota-expense-soft px-3.5 py-2.5 text-xs font-medium text-nota-expense"
              >
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{fundError}</span>
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={isSavingFund}
                className="rounded-control bg-nota-emerald px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-nota-emerald-hover transition-colors cursor-pointer"
              >
                {isSavingFund ? 'Menyimpan...' : 'Simpan dana masjid'}
              </button>
              <button
                type="button"
                onClick={() => setFundFormMode(null)}
                className="rounded-control border border-nota-border bg-nota-surface px-4 py-2 text-xs sm:text-sm font-medium text-nota-ink hover:bg-nota-soft-green/40 transition-colors cursor-pointer"
              >
                Batal
              </button>
            </div>
          </form>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {mosqueBalanceSplit.fundSummaries.map((fund) => {
            const rawFund = funds.find((f) => f.id === fund.fundId);
            const isRestricted = fund.restriction === 'restricted';

            return (
              <div
                key={fund.fundId}
                data-testid={`fund-card-${fund.fundId}`}
                className="rounded-panel border border-nota-border/80 bg-nota-bg/50 p-5 space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-control px-2.5 py-0.5 text-[11px] font-semibold ${
                        isRestricted
                          ? 'border border-nota-ink/25 bg-nota-surface text-nota-ink'
                          : 'bg-nota-soft-green text-nota-emerald'
                      }`}
                    >
                      {isRestricted ? (
                        <ShieldAlert
                          className="h-3 w-3 text-nota-emerald"
                          aria-hidden="true"
                        />
                      ) : (
                        <ShieldCheck
                          className="h-3 w-3 text-nota-emerald"
                          aria-hidden="true"
                        />
                      )}
                      {isRestricted ? 'Dana Terikat · Amanah' : 'Dana Umum'}
                    </span>

                    {rawFund ? (
                      <button
                        type="button"
                        onClick={() => openEditFund(rawFund)}
                        aria-label={`Ubah dana ${fund.fundName}`}
                        className="inline-flex items-center gap-1 rounded-control border border-nota-border bg-nota-surface px-2 py-1 text-xs font-medium text-nota-ink hover:bg-nota-soft-green/50 transition-colors cursor-pointer"
                      >
                        <PencilLine className="h-3 w-3" aria-hidden="true" />
                        Ubah
                      </button>
                    ) : null}
                  </div>

                  <div>
                    <h3 className="text-sm sm:text-base font-semibold text-nota-ink">
                      {fund.fundName}
                    </h3>
                    {fund.description ? (
                      <p className="mt-1 text-xs text-nota-muted leading-relaxed">
                        {fund.description}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div>
                  <span className="text-xs font-medium text-nota-muted block">
                    Saldo dana tersedia
                  </span>
                  <span
                    data-testid={`fund-balance-${fund.fundId}`}
                    className={`mt-0.5 block text-xl font-semibold tabular-nums ${
                      fund.currentBalance < 0
                        ? 'text-nota-expense'
                        : 'text-nota-ink'
                    }`}
                  >
                    {fund.currentBalance < 0
                      ? formatSignedIDR(fund.currentBalance)
                      : formatIDR(fund.currentBalance)}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-nota-border/60 text-[11px]">
                  <div>
                    <span className="text-nota-muted block">Saldo Awal</span>
                    <strong className="font-medium text-nota-ink tabular-nums">
                      {formatIDR(fund.openingBalance)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-nota-muted block">Penerimaan</span>
                    <strong className="font-medium text-nota-emerald tabular-nums">
                      +{formatIDR(fund.totalIncome)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-nota-muted block">Pengeluaran</span>
                    <strong className="font-medium text-nota-expense tabular-nums">
                      −{formatIDR(fund.totalExpense)}
                    </strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Area 3: Mutasi Antar-Kas (CashTransfer) */}
      <section
        aria-label="Mutasi Antar-Kas Masjid"
        className="rounded-hero bg-nota-surface p-6 sm:p-7 border border-nota-border/70 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ArrowLeftRight
                className="h-4 w-4 text-nota-emerald"
                aria-hidden="true"
              />
              <h2 className="text-base sm:text-lg font-semibold text-nota-ink">
                Mutasi Antar-Kas (Setor / Tarik Kas Internal)
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-nota-muted max-w-2xl">
              Catat pemindahan uang antar lokasi kas (misalnya menyetor uang
              tunai kotak Jumat ke Rekening Bank Tercatat). Mutasi antar-kas
              tidak mengubah saldo Dana Masjid dan tidak menggandakan pemasukan
              atau pengeluaran.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setTransferError(null);
              setIsTransferFormOpen((prev) => !prev);
            }}
            className="inline-flex items-center gap-1.5 rounded-control bg-nota-emerald px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-nota-emerald-hover transition-colors cursor-pointer"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
            Catat mutasi antar-kas
          </button>
        </div>

        {isTransferFormOpen ? (
          <form
            onSubmit={handleTransferSubmit}
            noValidate
            className="rounded-panel border border-nota-border bg-nota-bg/70 p-4 space-y-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <label
                  htmlFor="transfer-from-account"
                  className="block text-xs font-medium text-nota-muted"
                >
                  Dari lokasi kas (Asal)
                </label>
                <select
                  id="transfer-from-account"
                  value={fromAccountId}
                  onChange={(e) => setFromAccountId(e.target.value)}
                  className="w-full rounded-panel border border-nota-border bg-nota-surface px-3 py-2 text-sm font-medium text-nota-ink"
                >
                  {selectableAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="transfer-to-account"
                  className="block text-xs font-medium text-nota-muted"
                >
                  Ke lokasi kas (Tujuan)
                </label>
                <select
                  id="transfer-to-account"
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                  className="w-full rounded-panel border border-nota-border bg-nota-surface px-3 py-2 text-sm font-medium text-nota-ink"
                >
                  {selectableAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="transfer-amount-input"
                  className="block text-xs font-medium text-nota-muted"
                >
                  Nominal mutasi (IDR)
                </label>
                <input
                  id="transfer-amount-input"
                  type="text"
                  inputMode="numeric"
                  value={transferAmountRaw}
                  onChange={(e) => {
                    const next = sanitizeDigits(e.target.value);
                    if (next !== null) setTransferAmountRaw(next);
                  }}
                  placeholder="0"
                  className="w-full rounded-panel border border-nota-border bg-nota-surface px-3 py-2 text-sm font-semibold text-nota-ink tabular-nums"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="transfer-date-input"
                  className="block text-xs font-medium text-nota-muted"
                >
                  Tanggal mutasi
                </label>
                <input
                  id="transfer-date-input"
                  type="date"
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  className="w-full rounded-panel border border-nota-border bg-nota-surface px-3 py-2 text-sm font-medium text-nota-ink"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="transfer-note-input"
                className="block text-xs font-medium text-nota-muted"
              >
                Catatan mutasi (opsional)
              </label>
              <input
                id="transfer-note-input"
                type="text"
                value={transferNote}
                onChange={(e) => setTransferNote(e.target.value)}
                placeholder="Contoh: Setor uang kotak amal Jumat ke Rekening Bank Masjid"
                className="w-full rounded-panel border border-nota-border bg-nota-surface px-3 py-2 text-sm text-nota-ink"
              />
            </div>

            {transferError ? (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-badge bg-nota-expense-soft px-3.5 py-2.5 text-xs font-medium text-nota-expense"
              >
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{transferError}</span>
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={isSavingTransfer}
                className="rounded-control bg-nota-emerald px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-nota-emerald-hover transition-colors cursor-pointer"
              >
                {isSavingTransfer ? 'Menyimpan...' : 'Simpan mutasi antar-kas'}
              </button>
              <button
                type="button"
                onClick={() => setIsTransferFormOpen(false)}
                className="rounded-control border border-nota-border bg-nota-surface px-4 py-2 text-xs sm:text-sm font-medium text-nota-ink hover:bg-nota-soft-green/40 transition-colors cursor-pointer"
              >
                Batal
              </button>
            </div>
          </form>
        ) : null}

        {cashTransfers.length === 0 ? (
          <div className="rounded-panel bg-nota-bg/70 px-5 py-7 text-center space-y-1">
            <p className="text-sm font-medium text-nota-ink">
              Belum ada mutasi antar-kas
            </p>
            <p className="text-xs text-nota-muted max-w-md mx-auto">
              Gunakan tombol &ldquo;Catat mutasi antar-kas&rdquo; ketika
              bendahara memindahkan uang tunai ke rekening bank atau sebaliknya.
            </p>
          </div>
        ) : (
          <ul
            aria-label="Riwayat mutasi antar-kas"
            className="divide-y divide-nota-border/60 rounded-panel bg-nota-bg/60 px-4 py-1"
          >
            {cashTransfers.map((tr) => {
              const fromName =
                accountNameMap.get(tr.fromAccountId) ?? tr.fromAccountId;
              const toName =
                accountNameMap.get(tr.toAccountId) ?? tr.toAccountId;
              const isConfirming = confirmDeleteTransferId === tr.id;

              return (
                <li
                  key={tr.id}
                  data-testid={`transfer-row-${tr.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-nota-ink">
                      <span>{fromName}</span>
                      <span className="text-nota-emerald font-semibold">→</span>
                      <span>{toName}</span>
                    </div>
                    <p className="text-xs text-nota-muted">
                      <span>{formatLocalDateID(tr.occurredAt)}</span>
                      {tr.note ? <span> · {tr.note}</span> : null}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-nota-ink tabular-nums">
                      {formatIDR(tr.amount)}
                    </span>

                    {isConfirming ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={async () => {
                            await onDeleteCashTransfer(tr.id);
                            setConfirmDeleteTransferId(null);
                          }}
                          className="rounded-control bg-nota-expense px-2.5 py-1 text-xs font-semibold text-white cursor-pointer"
                        >
                          Ya, hapus
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteTransferId(null)}
                          className="rounded-control border border-nota-border bg-nota-surface px-2.5 py-1 text-xs font-medium text-nota-ink cursor-pointer"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteTransferId(tr.id)}
                        aria-label={`Hapus mutasi ${fromName} ke ${toName}`}
                        className="inline-flex items-center gap-1 rounded-control border border-nota-border bg-nota-surface px-2.5 py-1 text-xs font-medium text-nota-expense hover:bg-nota-expense-soft transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                        Hapus
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
