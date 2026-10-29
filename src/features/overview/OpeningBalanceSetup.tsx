import { type FormEvent, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, ShieldCheck, X } from 'lucide-react';
import { MAX_IDR_AMOUNT, isValidOpeningBalance } from '../../domain/money';
import type { CashAccount, Fund } from '../../domain/mosque';
import { formatIDR, formatIdrDigits, parseIdrInputDigits } from '../../lib/format';

export interface OpeningBalanceSetupDetails {
  mosqueName?: string;
  mosqueAddress?: string;
  accountOpeningBalances?: Record<string, number>;
  fundOpeningBalances?: Record<string, number>;
}

interface OpeningBalanceSetupProps {
  /** Current total opening balance in integer IDR */
  initialOpeningBalance: number;
  /** True if this is the first-run onboarding flow; false if editing later */
  isFirstRun: boolean;
  /** Optional current mosque name */
  initialMosqueName?: string;
  /** Optional current mosque address */
  initialMosqueAddress?: string;
  /** Optional CashAccounts for detailed per-account opening balance setup */
  accounts?: readonly CashAccount[];
  /** Optional Funds for detailed per-fund opening balance setup */
  funds?: readonly Fund[];
  /** Async handler that persists the opening balance (and optional Mosque details) via the repository */
  onSave: (
    openingBalance: number,
    details?: OpeningBalanceSetupDetails,
  ) => Promise<void>;
  /** Optional cancel handler when editing an already-completed setup */
  onCancel?: () => void;
}

export function OpeningBalanceSetup({
  initialOpeningBalance,
  isFirstRun,
  initialMosqueName = '',
  initialMosqueAddress = '',
  accounts = [],
  funds = [],
  onSave,
  onCancel,
}: OpeningBalanceSetupProps) {
  const [mosqueName, setMosqueName] = useState<string>(initialMosqueName);
  const [mosqueAddress, setMosqueAddress] = useState<string>(
    initialMosqueAddress,
  );
  const [rawInput, setRawInput] = useState<string>(
    initialOpeningBalance > 0 ? formatIdrDigits(initialOpeningBalance) : '0',
  );
  const [showDetailedSplit, setShowDetailedSplit] = useState<boolean>(false);
  const [accountRawInputs, setAccountRawInputs] = useState<
    Record<string, string>
  >(() => {
    const map: Record<string, string> = {};
    for (const acc of accounts) {
      map[acc.id] =
        acc.openingBalance > 0 ? formatIdrDigits(acc.openingBalance) : '0';
    }
    return map;
  });
  const [fundRawInputs, setFundRawInputs] = useState<Record<string, string>>(
    () => {
      const map: Record<string, string> = {};
      for (const fund of funds) {
        map[fund.id] =
          fund.openingBalance > 0 ? formatIdrDigits(fund.openingBalance) : '0';
      }
      return map;
    },
  );

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const parsedValue = parseIdrInputDigits(rawInput);

  function sanitizeIdrInput(value: string): string | null {
    const digitsOnly = value.replace(/\D/g, '');
    if (digitsOnly.length === 0) {
      return '';
    }
    const numeric = Number(digitsOnly);
    if (Number.isSafeInteger(numeric) && numeric <= MAX_IDR_AMOUNT) {
      return formatIdrDigits(numeric);
    }
    return null;
  }

  function handleInputChange(value: string) {
    setErrorMessage(null);
    const formatted = sanitizeIdrInput(value);
    if (formatted !== null) {
      setRawInput(formatted);
    }
  }

  function handleAccountInputChange(accountId: string, value: string) {
    setErrorMessage(null);
    const formatted = sanitizeIdrInput(value);
    if (formatted === null) {
      return;
    }
    const nextMap = { ...accountRawInputs, [accountId]: formatted };
    setAccountRawInputs(nextMap);

    // Automatically update the primary total opening balance input to match sum of accounts
    let totalAcc = 0;
    for (const acc of accounts) {
      const rawVal = nextMap[acc.id] ?? '0';
      const parsed = rawVal.trim() === '' ? 0 : (parseIdrInputDigits(rawVal) ?? 0);
      totalAcc += parsed;
    }
    if (Number.isSafeInteger(totalAcc) && totalAcc <= MAX_IDR_AMOUNT) {
      setRawInput(formatIdrDigits(totalAcc));
    }
  }

  function handleFundInputChange(fundId: string, value: string) {
    setErrorMessage(null);
    const formatted = sanitizeIdrInput(value);
    if (formatted === null) {
      return;
    }
    setFundRawInputs((prev) => ({ ...prev, [fundId]: formatted }));
  }

  async function submitOpeningBalance(candidateAmount: number | null) {
    setErrorMessage(null);

    if (candidateAmount === null || !isValidOpeningBalance(candidateAmount)) {
      setErrorMessage(
        'Masukkan nominal saldo awal berupa bilangan bulat Rupiah (0 atau lebih besar).',
      );
      return;
    }

    const details: OpeningBalanceSetupDetails = {};
    if (mosqueName.trim().length > 0) {
      details.mosqueName = mosqueName.trim();
    }
    if (mosqueAddress.trim().length > 0) {
      details.mosqueAddress = mosqueAddress.trim();
    }

    if (showDetailedSplit && accounts.length > 0 && funds.length > 0) {
      const accMap: Record<string, number> = {};
      for (const acc of accounts) {
        const raw = accountRawInputs[acc.id] ?? '0';
        const val = raw.trim() === '' ? 0 : parseIdrInputDigits(raw);
        if (val === null || !isValidOpeningBalance(val)) {
          setErrorMessage(
            `Saldo awal untuk ${acc.name} harus berupa bilangan bulat Rupiah yang valid.`,
          );
          return;
        }
        accMap[acc.id] = val;
      }

      const fMap: Record<string, number> = {};
      for (const fund of funds) {
        const raw = fundRawInputs[fund.id] ?? '0';
        const val = raw.trim() === '' ? 0 : parseIdrInputDigits(raw);
        if (val === null || !isValidOpeningBalance(val)) {
          setErrorMessage(
            `Saldo awal untuk ${fund.name} harus berupa bilangan bulat Rupiah yang valid.`,
          );
          return;
        }
        fMap[fund.id] = val;
      }

      details.accountOpeningBalances = accMap;
      details.fundOpeningBalances = fMap;
    }

    setIsSaving(true);
    try {
      await onSave(
        candidateAmount,
        Object.keys(details).length > 0 ? details : undefined,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Gagal menyimpan saldo awal ke penyimpanan lokal browser.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidateAmount = rawInput.trim() === '' ? 0 : parsedValue;
    await submitOpeningBalance(candidateAmount);
  }

  return (
    <section
      aria-labelledby="opening-balance-heading"
      className="rounded-hero bg-nota-surface p-6 sm:p-7 border border-nota-border/80 space-y-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2
            id="opening-balance-heading"
            className="text-lg sm:text-xl font-semibold tracking-tight text-nota-ink"
          >
            {isFirstRun
              ? 'Atur saldo awal catatan Anda'
              : 'Ubah saldo awal catatan'}
          </h2>
          <p className="text-xs sm:text-sm text-nota-muted max-w-2xl">
            Saldo awal kas masjid menjadi titik mulai pembukuan DKM sebelum
            transaksi berjalan dihitung dan tidak dihitung sebagai pemasukan
            periode berjalan.
          </p>
        </div>

        {!isFirstRun && onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            aria-label="Tutup pengaturan saldo awal"
            className="inline-flex items-center gap-1.5 rounded-control border border-nota-border bg-nota-bg px-3.5 py-1.5 text-xs font-medium text-nota-ink hover:bg-nota-soft-green/50 transition-colors cursor-pointer"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Batal
          </button>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="setup-mosque-name-input"
              className="block text-xs font-medium text-nota-muted"
            >
              Nama Masjid / Musholla (opsional)
            </label>
            <input
              id="setup-mosque-name-input"
              name="mosqueName"
              type="text"
              disabled={isSaving}
              value={mosqueName}
              onChange={(e) => setMosqueName(e.target.value)}
              placeholder="Contoh: Masjid Jami Al-Ikhlas"
              maxLength={80}
              className="w-full rounded-panel border border-nota-border bg-nota-bg px-3.5 py-2 text-sm font-medium text-nota-ink placeholder:text-nota-muted/60 focus:border-nota-emerald focus:bg-nota-surface"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="setup-mosque-address-input"
              className="block text-xs font-medium text-nota-muted"
            >
              Alamat singkat masjid (opsional)
            </label>
            <input
              id="setup-mosque-address-input"
              name="mosqueAddress"
              type="text"
              disabled={isSaving}
              value={mosqueAddress}
              onChange={(e) => setMosqueAddress(e.target.value)}
              placeholder="Contoh: Jl. Melati No. 10, Kec. Sukmajaya"
              maxLength={160}
              className="w-full rounded-panel border border-nota-border bg-nota-bg px-3.5 py-2 text-sm font-medium text-nota-ink placeholder:text-nota-muted/60 focus:border-nota-emerald focus:bg-nota-surface"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="w-full sm:max-w-xs space-y-1.5">
            <label
              htmlFor="opening-balance-input"
              className="block text-xs font-medium text-nota-muted"
            >
              Nominal saldo awal (IDR)
            </label>
            <div className="relative flex items-center">
              <span
                className="pointer-events-none absolute left-4 text-sm font-semibold text-nota-muted select-none"
                aria-hidden="true"
              >
                Rp
              </span>
              <input
                id="opening-balance-input"
                name="openingBalance"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                disabled={isSaving}
                value={rawInput}
                onChange={(e) => handleInputChange(e.target.value)}
                placeholder="0"
                aria-describedby={
                  errorMessage
                    ? 'opening-balance-hint opening-balance-error'
                    : 'opening-balance-hint'
                }
                aria-invalid={errorMessage ? 'true' : 'false'}
                className="w-full rounded-panel border border-nota-border bg-nota-bg py-2.5 pl-11 pr-4 text-lg font-semibold text-nota-ink tabular-nums placeholder:text-nota-muted/60 focus:border-nota-emerald focus:bg-nota-surface"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center justify-center rounded-control bg-nota-emerald px-5 py-2.5 text-sm font-semibold text-white hover:bg-nota-emerald-hover disabled:opacity-60 transition-colors cursor-pointer"
            >
              {isSaving
                ? 'Menyimpan...'
                : isFirstRun
                  ? 'Simpan & mulai gunakan Nota'
                  : 'Simpan saldo awal'}
            </button>

            {isFirstRun ? (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => {
                  setRawInput('0');
                  void submitOpeningBalance(0);
                }}
                className="inline-flex items-center justify-center rounded-control border border-nota-border bg-nota-bg px-4 py-2.5 text-sm font-medium text-nota-ink hover:bg-nota-soft-green/50 disabled:opacity-60 transition-colors cursor-pointer"
              >
                Mulai dari Rp 0
              </button>
            ) : null}

            {accounts.length > 0 && funds.length > 0 ? (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => setShowDetailedSplit((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-control border border-nota-border bg-nota-bg px-3.5 py-2.5 text-xs font-medium text-nota-ink hover:bg-nota-soft-green/50 transition-colors cursor-pointer"
              >
                {showDetailedSplit ? (
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Rincian per Kas & Dana
              </button>
            ) : null}
          </div>
        </div>

        <p id="opening-balance-hint" className="text-xs text-nota-muted">
          Pratinjau:{' '}
          <span className="font-medium text-nota-ink tabular-nums">
            {formatIDR(parsedValue ?? 0)}
          </span>
        </p>

        {showDetailedSplit && accounts.length > 0 && funds.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 rounded-panel border border-nota-border/70 bg-nota-bg/60 p-4">
            <div className="space-y-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-nota-muted">
                Saldo Awal per Lokasi Kas
              </h3>
              {accounts
                .filter((acc) => !acc.archivedAt)
                .map((acc) => (
                  <div key={acc.id} className="space-y-1">
                    <label
                      htmlFor={`setup-acc-opening-${acc.id}`}
                      className="block text-xs font-medium text-nota-ink"
                    >
                      {acc.name} (IDR)
                    </label>
                    <input
                      id={`setup-acc-opening-${acc.id}`}
                      type="text"
                      inputMode="numeric"
                      disabled={isSaving}
                      value={accountRawInputs[acc.id] ?? '0'}
                      onChange={(e) =>
                        handleAccountInputChange(acc.id, e.target.value)
                      }
                      className="w-full rounded-panel border border-nota-border bg-nota-surface px-3 py-2 text-sm font-semibold text-nota-ink tabular-nums"
                    />
                  </div>
                ))}
            </div>

            <div className="space-y-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-nota-muted">
                Alokasi Saldo Awal per Dana Masjid
              </h3>
              {funds
                .filter((f) => !f.archivedAt)
                .map((fund) => (
                  <div key={fund.id} className="space-y-1">
                    <label
                      htmlFor={`setup-fund-opening-${fund.id}`}
                      className="block text-xs font-medium text-nota-ink"
                    >
                      {fund.name} (IDR)
                    </label>
                    <input
                      id={`setup-fund-opening-${fund.id}`}
                      type="text"
                      inputMode="numeric"
                      disabled={isSaving}
                      value={fundRawInputs[fund.id] ?? '0'}
                      onChange={(e) =>
                        handleFundInputChange(fund.id, e.target.value)
                      }
                      className="w-full rounded-panel border border-nota-border bg-nota-surface px-3 py-2 text-sm font-semibold text-nota-ink tabular-nums"
                    />
                  </div>
                ))}
            </div>
          </div>
        ) : null}

        {errorMessage ? (
          <div
            id="opening-balance-error"
            role="alert"
            className="flex items-center gap-2 rounded-badge bg-nota-expense-soft px-4 py-3 text-xs font-medium text-nota-expense border border-nota-expense/20 max-w-md"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        ) : null}
      </form>

      {/* Single concise local-privacy explanation located only inside setup/settings */}
      <div className="flex items-center gap-2 pt-3 border-t border-nota-border/60 text-xs text-nota-muted">
        <ShieldCheck
          className="h-4 w-4 text-nota-emerald shrink-0"
          aria-hidden="true"
        />
        <span>
          Data disimpan secara lokal di browser perangkat ini tanpa akun dan
          tanpa koneksi bank.
        </span>
      </div>
    </section>
  );
}
