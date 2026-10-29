import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileText,
  PencilLine,
  RefreshCw,
} from 'lucide-react';
import type { ActiveRoute } from '../../components/layout/AppShell';
import {
  type LocalWorkspaceState,
  type MosqueProfileInput,
  type NotaRepository,
  notaRepository as defaultRepository,
} from '../../data/repositories/notaRepository';
import type {
  BudgetPlanInput,
  BudgetPlanPatch,
} from '../../domain/budgetPlan';
import type {
  DebtRecordInput,
  DebtRecordPatch,
} from '../../domain/debtRecord';
import {
  type CashAccountInput,
  type CashAccountPatch,
  type CashTransferInput,
  DEFAULT_CASH_ACCOUNT_TUNAI_ID,
  DEFAULT_FUND_OPERASIONAL_ID,
  type FundInput,
  type FundPatch,
  type FundRestriction,
} from '../../domain/mosque';
import type {
  SavingsGoalInput,
  SavingsGoalPatch,
} from '../../domain/savingsGoal';
import { calculateCategoryTotals } from '../../domain/summaries';
import type {
  CategoryInput,
  Transaction,
  TransactionDraft,
  TransactionPatch,
  TransactionType,
} from '../../domain/transaction';
import {
  type YearMonth,
  getMonthPeriod,
  shiftYearMonth,
} from '../../lib/date';
import {
  formatIDR,
  formatLocalDateID,
  formatSignedIDR,
  formatYearMonthID,
} from '../../lib/format';
import { BackupRestoreSection } from '../backup/BackupRestoreSection';
import { CashAndFundsSection } from '../mosque/CashAndFundsSection';
import { BudgetPlanSection } from '../planning/BudgetPlanSection';
import { CategoryBudgetSection } from '../planning/CategoryBudgetSection';
import { DebtRecordSection } from '../planning/DebtRecordSection';
import { SavingsGoalSection } from '../planning/SavingsGoalSection';
import { MosqueReportSection } from '../reports/MosqueReportSection';
import { MosqueSettingsSection } from '../settings/MosqueSettingsSection';
import { TransactionFormModal } from '../transactions/TransactionFormModal';
import { TransactionListSection } from '../transactions/TransactionListSection';
import {
  OpeningBalanceSetup,
  type OpeningBalanceSetupDetails,
} from './OpeningBalanceSetup';

const RECENT_TRANSACTIONS_LIMIT = 5;
const TOP_EXPENSE_CATEGORIES_LIMIT = 4;

type ActiveTransactionFormState =
  | { mode: 'create'; initialType: TransactionType }
  | { mode: 'edit'; transaction: Transaction }
  | null;

interface OverviewFoundationPageProps {
  repository?: NotaRepository;
  initialYearMonth?: YearMonth;
  activeRoute?: ActiveRoute;
  onNavigate?: (route: ActiveRoute) => void;
  onMosqueNameChange?: (mosqueName: string | undefined) => void;
}

function getDefaultYearMonth(): YearMonth {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };
}

export function OverviewFoundationPage({
  repository = defaultRepository,
  initialYearMonth,
  activeRoute = 'overview',
  onNavigate,
  onMosqueNameChange,
}: OverviewFoundationPageProps) {
  const todayYearMonth = useMemo(() => getDefaultYearMonth(), []);
  const [selectedYearMonth, setSelectedYearMonth] = useState<YearMonth>(
    () => initialYearMonth ?? todayYearMonth,
  );

  const selectedPeriod = useMemo(
    () => getMonthPeriod(selectedYearMonth.year, selectedYearMonth.month),
    [selectedYearMonth.year, selectedYearMonth.month],
  );

  const periodLabel = useMemo(
    () => formatYearMonthID(selectedYearMonth.year, selectedYearMonth.month),
    [selectedYearMonth.year, selectedYearMonth.month],
  );

  const isViewingCurrentMonth =
    selectedYearMonth.year === todayYearMonth.year &&
    selectedYearMonth.month === todayYearMonth.month;

  const [workspace, setWorkspace] = useState<LocalWorkspaceState | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [isEditingOpeningBalance, setIsEditingOpeningBalance] = useState(false);
  const [transactionFormState, setTransactionFormState] =
    useState<ActiveTransactionFormState>(null);

  const latestLoadIdRef = useRef<number>(0);

  const loadData = useCallback(async () => {
    const requestId = latestLoadIdRef.current + 1;
    latestLoadIdRef.current = requestId;
    setIsLoading(true);
    setStorageError(null);
    try {
      const state = await repository.loadWorkspaceState(selectedPeriod);
      if (latestLoadIdRef.current === requestId) {
        setWorkspace(state);
      }
    } catch (error) {
      if (latestLoadIdRef.current === requestId) {
        setStorageError(
          error instanceof Error
            ? error.message
            : 'Gagal membaca database lokal di browser.',
        );
      }
    } finally {
      if (latestLoadIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [repository, selectedPeriod]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    onMosqueNameChange?.(workspace?.settings.mosqueName);
  }, [workspace?.settings.mosqueName, onMosqueNameChange]);

  async function handleSaveMosqueProfile(profile: MosqueProfileInput) {
    await repository.saveMosqueProfile(profile);
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
  }

  async function handleAddCategory(input: CategoryInput) {
    await repository.addCategory(input);
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
  }

  async function handleUpdateCategoryName(
    categoryId: string,
    newName: string,
  ) {
    await repository.updateCategoryName(categoryId, newName);
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
  }

  async function handleArchiveCategory(categoryId: string) {
    await repository.archiveCategoryById(categoryId);
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
  }

  async function handleSaveOpeningBalance(
    newOpeningBalance: number,
    details?: OpeningBalanceSetupDetails,
  ) {
    if (
      details &&
      (details.mosqueName !== undefined ||
        details.mosqueAddress !== undefined ||
        details.accountOpeningBalances !== undefined ||
        details.fundOpeningBalances !== undefined)
    ) {
      if (details.accountOpeningBalances || details.fundOpeningBalances) {
        await repository.saveInitialSetup({
          mosqueName: details.mosqueName,
          mosqueAddress: details.mosqueAddress,
          accountOpeningBalances: details.accountOpeningBalances,
          fundOpeningBalances: details.fundOpeningBalances,
          completeOnboarding: true,
        });
      } else {
        await repository.saveOpeningBalance(newOpeningBalance, {
          completeOnboarding: true,
        });
        if (details.mosqueName) {
          await repository.saveMosqueProfile({
            mosqueName: details.mosqueName,
            mosqueAddress: details.mosqueAddress,
          });
        }
      }
    } else {
      await repository.saveOpeningBalance(newOpeningBalance, {
        completeOnboarding: true,
      });
    }
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
    setIsEditingOpeningBalance(false);
  }

  async function handleAddAccount(input: CashAccountInput) {
    await repository.addAccount(input);
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
  }

  async function handleUpdateAccount(
    accountId: string,
    patch: CashAccountPatch,
  ) {
    await repository.updateAccount(accountId, patch);
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
  }

  async function handleAddFund(input: FundInput) {
    await repository.addFund(input);
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
  }

  async function handleUpdateFund(fundId: string, patch: FundPatch) {
    await repository.updateFund(fundId, patch);
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
  }

  async function handleAddCashTransfer(input: CashTransferInput) {
    await repository.addCashTransfer(input);
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
  }

  async function handleDeleteCashTransfer(transferId: string) {
    await repository.deleteCashTransfer(transferId);
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
  }

  async function handleCreateTransaction(draft: TransactionDraft) {
    await repository.addTransaction(draft);
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
    setTransactionFormState(null);
  }

  async function handleUpdateTransaction(
    transactionId: string,
    patch: TransactionPatch,
  ) {
    await repository.updateTransaction(transactionId, patch);
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
    setTransactionFormState(null);
  }

  async function handleDeleteTransaction(transactionId: string) {
    await repository.deleteTransaction(transactionId);
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
    if (
      transactionFormState?.mode === 'edit' &&
      transactionFormState.transaction.id === transactionId
    ) {
      setTransactionFormState(null);
    }
  }

  async function handleExportBackup() {
    return repository.exportBackup();
  }

  async function handleCreateBudgetPlan(input: BudgetPlanInput) {
    await repository.addBudgetPlan(input);
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
  }

  async function handleUpdateBudgetPlan(
    planId: string,
    patch: BudgetPlanPatch,
  ) {
    await repository.updateBudgetPlan(planId, patch);
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
  }

  async function handleDeleteBudgetPlan(planId: string) {
    await repository.deleteBudgetPlan(planId);
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
  }

  async function handleSaveCategoryBudget(input: {
    categoryId: string;
    monthlyLimit: number;
  }) {
    await repository.saveCategoryBudget(input);
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
  }

  async function handleDeleteCategoryBudget(categoryId: string) {
    await repository.deleteCategoryBudget(categoryId);
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
  }

  async function handleCreateSavingsGoal(input: SavingsGoalInput) {
    await repository.addSavingsGoal(input);
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
  }

  async function handleUpdateSavingsGoal(
    goalId: string,
    patch: SavingsGoalPatch,
  ) {
    await repository.updateSavingsGoal(goalId, patch);
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
  }

  async function handleDeleteSavingsGoal(goalId: string) {
    await repository.deleteSavingsGoal(goalId);
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
  }

  async function handleCreateDebtRecord(input: DebtRecordInput) {
    await repository.addDebtRecord(input);
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
  }

  async function handleUpdateDebtRecord(
    debtId: string,
    patch: DebtRecordPatch,
  ) {
    await repository.updateDebtRecord(debtId, patch);
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
  }

  async function handleSettleDebtRecord(debtId: string) {
    await repository.settleDebtRecordById(debtId);
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
  }

  async function handleDeleteDebtRecord(debtId: string) {
    await repository.deleteDebtRecord(debtId);
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
  }

  async function handleRestoreBackup(rawJson: string) {
    const restoredPreview = await repository.restoreBackup(rawJson);
    const refreshed = await repository.loadWorkspaceState(selectedPeriod);
    setWorkspace(refreshed);
    setTransactionFormState(null);
    setIsEditingOpeningBalance(false);
    return restoredPreview;
  }

  function openCreateForm(type: TransactionType) {
    setTransactionFormState({ mode: 'create', initialType: type });
  }

  function openEditForm(transaction: Transaction) {
    setTransactionFormState({ mode: 'edit', transaction });
  }

  function handleShiftMonth(delta: number) {
    setSelectedYearMonth((prev) => shiftYearMonth(prev, delta));
  }

  function handleResetToCurrentMonth() {
    setSelectedYearMonth(todayYearMonth);
  }

  const categoryMap = useMemo(() => {
    if (!workspace) {
      return new Map<string, { name: string; isArchived: boolean }>();
    }
    return new Map(
      workspace.categories.map((cat) => [
        cat.id,
        { name: cat.name, isArchived: Boolean(cat.archivedAt) },
      ]),
    );
  }, [workspace]);

  const fundMap = useMemo(() => {
    if (!workspace) {
      return new Map<string, { name: string; restriction: FundRestriction }>();
    }
    return new Map(
      workspace.funds.map((fund) => [
        fund.id,
        { name: fund.name, restriction: fund.restriction },
      ]),
    );
  }, [workspace]);

  const accountMap = useMemo(() => {
    if (!workspace) {
      return new Map<string, { name: string }>();
    }
    return new Map(
      workspace.accounts.map((acc) => [acc.id, { name: acc.name }]),
    );
  }, [workspace]);

  const topExpenseCategories = useMemo(() => {
    if (!workspace) {
      return [];
    }
    return calculateCategoryTotals(
      workspace.transactions,
      workspace.categories,
      {
        type: 'expense',
        period: selectedPeriod,
      },
    ).slice(0, TOP_EXPENSE_CATEGORIES_LIMIT);
  }, [workspace, selectedPeriod]);

  const recentTransactions = useMemo(() => {
    if (!workspace) {
      return [];
    }
    return workspace.transactions.slice(0, RECENT_TRANSACTIONS_LIMIT);
  }, [workspace]);

  const showSetupPanel =
    workspace !== null &&
    (!workspace.settings.onboardingCompleted || isEditingOpeningBalance);

  const openingBalance = workspace?.overview.openingBalance ?? 0;
  const currentBalance = workspace?.overview.currentBalance ?? 0;
  const periodIncome = workspace?.overview.periodSummary.income ?? 0;
  const periodExpense = workspace?.overview.periodSummary.expense ?? 0;
  const periodNetCashFlow = workspace?.overview.periodSummary.netCashFlow ?? 0;
  const periodTransactionCount =
    workspace?.overview.periodSummary.transactionCount ?? 0;

  const totalPeriodFlow = periodIncome + periodExpense;
  const incomeFlowPercent =
    totalPeriodFlow > 0
      ? Math.round((periodIncome / totalPeriodFlow) * 100)
      : 0;
  const expenseFlowPercent =
    totalPeriodFlow > 0 ? 100 - incomeFlowPercent : 0;

  return (
    <div
      className="space-y-5 sm:space-y-6"
      aria-busy={isLoading && workspace === null}
    >
      {/* Page Heading & Period Controls */}
      <div className="print:hidden flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-nota-ink">
              {activeRoute === 'transactions'
                ? 'Manajemen Transaksi'
                : activeRoute === 'cash-and-funds'
                  ? 'Lokasi Kas & Dana Masjid'
                  : activeRoute === 'planning'
                    ? 'Anggaran / RAB & Perencanaan Keuangan'
                    : activeRoute === 'reports'
                      ? 'Laporan Keuangan Masjid'
                      : activeRoute === 'settings'
                        ? 'Pengaturan & Data Lokal'
                        : 'Ringkasan Keuangan'}
            </h1>
            {isLoading && workspace === null && !storageError ? (
              <span
                role="status"
                aria-live="polite"
                className="text-xs font-medium text-nota-muted"
              >
                Memuat data...
              </span>
            ) : null}
          </div>
          <p className="text-xs sm:text-sm text-nota-muted">
            {activeRoute === 'transactions'
              ? 'Catat, cari, saring, dan kelola seluruh riwayat pemasukan serta pengeluaran Anda.'
              : activeRoute === 'cash-and-funds'
                ? 'Kelola posisi Kas Tunai, Rekening Bank Tercatat, alokasi Dana Amanah, dan mutasi antar-kas masjid.'
                : activeRoute === 'planning'
                  ? 'Kelola anggaran kategori bulanan, target tabungan, serta catatan utang dan piutang.'
                  : activeRoute === 'reports'
                    ? 'Ringkasan pertanggungjawaban kas masjid untuk jamaah dan pengurus DKM.'
                    : activeRoute === 'settings'
                      ? 'Kelola saldo awal pencatatan serta pencadangan dan pemulihan data lokal di perangkat ini.'
                      : 'Posisi saldo tercatat dan pergerakan arus kas periode terpilih.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Interactive Month Period Selector (shown on period-aware tabs) */}
          {activeRoute !== 'settings' ? (
            <>
              <div
                role="group"
                aria-label="Pemilih periode bulan"
                className="inline-flex items-center rounded-control border border-nota-border bg-nota-surface p-0.5 text-xs sm:text-sm font-medium text-nota-ink"
              >
                <button
                  type="button"
                  onClick={() => handleShiftMonth(-1)}
                  aria-label="Bulan sebelumnya"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-control text-nota-muted hover:bg-nota-soft-green/60 hover:text-nota-ink transition-colors cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>

                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 whitespace-nowrap select-none"
                  aria-live="polite"
                >
                  <Calendar
                    className="h-3.5 w-3.5 text-nota-emerald shrink-0"
                    aria-hidden="true"
                  />
                  <span>{periodLabel}</span>
                </span>

                <button
                  type="button"
                  onClick={() => handleShiftMonth(1)}
                  aria-label="Bulan berikutnya"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-control text-nota-muted hover:bg-nota-soft-green/60 hover:text-nota-ink transition-colors cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              {!isViewingCurrentMonth ? (
                <button
                  type="button"
                  onClick={handleResetToCurrentMonth}
                  className="inline-flex items-center rounded-control border border-nota-border bg-nota-surface px-3 py-1.5 text-xs sm:text-sm font-medium text-nota-emerald hover:bg-nota-soft-green/50 transition-colors cursor-pointer"
                >
                  Bulan ini
                </button>
              ) : null}
            </>
          ) : null}

          {activeRoute === 'overview' &&
          workspace?.settings.onboardingCompleted &&
          !isEditingOpeningBalance ? (
            <button
              type="button"
              onClick={() => setIsEditingOpeningBalance(true)}
              className="inline-flex items-center gap-1.5 rounded-control border border-nota-border bg-nota-surface px-3.5 py-1.5 text-xs sm:text-sm font-medium text-nota-ink hover:bg-nota-soft-green/50 transition-colors cursor-pointer"
            >
              <PencilLine
                className="h-3.5 w-3.5 text-nota-emerald"
                aria-hidden="true"
              />
              Atur saldo awal
            </button>
          ) : null}

          {activeRoute === 'transactions' ? (
            <>
              <button
                type="button"
                disabled={Boolean(storageError) || workspace === null}
                onClick={() => openCreateForm('income')}
                className="inline-flex items-center gap-1.5 rounded-control bg-nota-emerald px-4 py-1.5 text-xs sm:text-sm font-medium text-white hover:bg-nota-emerald-hover transition-colors cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
              >
                <ArrowDownLeft className="h-4 w-4" aria-hidden="true" />
                Tambah pemasukan
              </button>

              <button
                type="button"
                disabled={Boolean(storageError) || workspace === null}
                onClick={() => openCreateForm('expense')}
                className="inline-flex items-center gap-1.5 rounded-control border border-nota-border bg-nota-surface px-4 py-1.5 text-xs sm:text-sm font-medium text-nota-ink hover:bg-nota-soft-green/50 transition-colors cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
              >
                <ArrowUpRight
                  className="h-4 w-4 text-nota-expense"
                  aria-hidden="true"
                />
                Tambah pengeluaran
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Honest Storage Error Banner (PRD.md §5.1 & §7.10) */}
      {storageError ? (
        <div
          role="alert"
          className="rounded-panel border border-nota-expense/30 bg-nota-expense-soft p-5 text-nota-ink space-y-3"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="h-5 w-5 text-nota-expense shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-nota-expense">
                Penyimpanan lokal tidak dapat diakses
              </h2>
              <p className="text-xs sm:text-sm text-nota-ink/90">
                {storageError}
              </p>
            </div>
          </div>
          <div>
            <button
              type="button"
              onClick={() => void loadData()}
              className="inline-flex items-center gap-1.5 rounded-control bg-nota-emerald px-4 py-2 text-xs font-semibold text-white hover:bg-nota-emerald-hover transition-colors cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Coba muat ulang
            </button>
          </div>
        </div>
      ) : null}

      {/* First-Run Onboarding or Edit Opening Balance Panel (shown on Overview first-run/edit or Settings edit) */}
      {(activeRoute === 'overview' || activeRoute === 'settings') &&
      showSetupPanel &&
      workspace ? (
        <OpeningBalanceSetup
          key={`${workspace.settings.onboardingCompleted}-${workspace.settings.openingBalance}`}
          initialOpeningBalance={workspace.settings.openingBalance}
          initialMosqueName={workspace.settings.mosqueName}
          initialMosqueAddress={workspace.settings.mosqueAddress}
          accounts={workspace.accounts}
          funds={workspace.funds}
          isFirstRun={!workspace.settings.onboardingCompleted}
          onSave={handleSaveOpeningBalance}
          onCancel={
            workspace.settings.onboardingCompleted
              ? () => setIsEditingOpeningBalance(false)
              : undefined
          }
        />
      ) : null}

      {/* =====================================================================
          TAB 1: RINGKASAN (Overview Hero + Mosque Fund/Account Split + Cashflow)
         ===================================================================== */}
      {activeRoute === 'overview' ? (
        <>
          {/* Hero 2-Column Asymmetric Grid (DESIGN_BRIEF.md §3 & visual reference) */}
          <section
            aria-label="Ringkasan utama"
            className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5"
          >
            {/* Left Primary Balance Area (7 cols on desktop) */}
            <div className="lg:col-span-7 rounded-hero bg-nota-surface p-6 sm:p-8 border border-nota-border/70 flex flex-col justify-between gap-6">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-nota-muted">
                    Saldo tercatat
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-control bg-nota-bg px-3 py-1 text-xs font-medium text-nota-muted tabular-nums">
                    Saldo awal:{' '}
                    <strong className="font-semibold text-nota-ink">
                      {storageError ? '—' : formatIDR(openingBalance)}
                    </strong>
                  </span>
                </div>

                <p
                  data-testid="current-balance-value"
                  className={`text-3xl sm:text-5xl font-medium tracking-tight tabular-nums break-words ${
                    !storageError && currentBalance < 0
                      ? 'text-nota-expense'
                      : 'text-nota-ink'
                  }`}
                  aria-live="polite"
                >
                  {storageError
                    ? '—'
                    : currentBalance < 0
                      ? formatSignedIDR(currentBalance)
                      : formatIDR(currentBalance)}
                </p>

                {/* Mosque Fund Split: Dana Operasional Umum vs Dana Terikat (Amanah) */}
                {!storageError && workspace ? (
                  <div
                    data-testid="overview-mosque-fund-split"
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1"
                  >
                    <div className="rounded-panel bg-nota-soft-green/45 px-3.5 py-2.5 border border-nota-emerald/15">
                      <span className="text-[11px] font-medium text-nota-emerald block">
                        Dana Operasional Umum (Bebas)
                      </span>
                      <span
                        data-testid="overview-unrestricted-balance"
                        className="mt-0.5 block text-sm sm:text-base font-semibold text-nota-emerald tabular-nums"
                      >
                        {workspace.mosqueBalanceSplit.unrestrictedBalance < 0
                          ? formatSignedIDR(
                              workspace.mosqueBalanceSplit.unrestrictedBalance,
                            )
                          : formatIDR(
                              workspace.mosqueBalanceSplit.unrestrictedBalance,
                            )}
                      </span>
                    </div>

                    <div className="rounded-panel bg-nota-bg/80 px-3.5 py-2.5 border border-nota-border">
                      <span className="text-[11px] font-medium text-nota-muted block">
                        Total Dana Terikat (Amanah)
                      </span>
                      <span
                        data-testid="overview-restricted-balance"
                        className="mt-0.5 block text-sm sm:text-base font-semibold text-nota-ink tabular-nums"
                      >
                        {workspace.mosqueBalanceSplit.restrictedBalance < 0
                          ? formatSignedIDR(
                              workspace.mosqueBalanceSplit.restrictedBalance,
                            )
                          : formatIDR(
                              workspace.mosqueBalanceSplit.restrictedBalance,
                            )}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Primary Quick-Entry Actions */}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={Boolean(storageError) || workspace === null}
                  onClick={() => openCreateForm('income')}
                  className="inline-flex items-center gap-2 rounded-control bg-nota-emerald px-5 py-2.5 text-sm font-medium text-white hover:bg-nota-emerald-hover transition-colors cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
                >
                  <ArrowDownLeft className="h-4 w-4" aria-hidden="true" />
                  Tambah pemasukan
                </button>

                <button
                  type="button"
                  disabled={Boolean(storageError) || workspace === null}
                  onClick={() => openCreateForm('expense')}
                  className="inline-flex items-center gap-2 rounded-control border border-nota-border bg-nota-bg px-5 py-2.5 text-sm font-medium text-nota-ink hover:bg-nota-soft-green/50 transition-colors cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
                >
                  <ArrowUpRight
                    className="h-4 w-4 text-nota-expense"
                    aria-hidden="true"
                  />
                  Tambah pengeluaran
                </button>
              </div>
            </div>

            {/* Right Lime Accent Area — Period Summary Focus (5 cols on desktop) */}
            <div className="lg:col-span-5 rounded-hero bg-nota-lime p-6 sm:p-8 text-nota-ink flex flex-col justify-between gap-6">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center rounded-control bg-nota-ink px-3 py-1 text-xs font-medium text-nota-lime">
                    {periodLabel}
                  </span>
                  {!storageError && workspace && periodTransactionCount > 0 ? (
                    <span className="text-xs font-medium text-nota-ink/75 tabular-nums">
                      {periodTransactionCount} transaksi
                    </span>
                  ) : null}
                </div>

                <div>
                  <span className="text-sm font-medium text-nota-ink/80">
                    Selisih bulan ini
                  </span>
                  <p
                    data-testid="period-net-cashflow-value"
                    className="mt-1.5 text-2xl sm:text-4xl font-medium tracking-tight text-nota-ink tabular-nums break-words"
                  >
                    {storageError ? '—' : formatSignedIDR(periodNetCashFlow)}
                  </p>
                </div>
              </div>

              {/* Income & Expense breakdown inside the lime focal box */}
              <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-3">
                <div className="rounded-panel bg-white/60 p-4 min-w-0">
                  <span className="text-xs font-medium text-nota-ink/75 block">
                    Pemasukan
                  </span>
                  <span
                    data-testid="period-income-value"
                    className="mt-1 block text-base sm:text-lg font-semibold text-nota-emerald tabular-nums break-words"
                  >
                    {storageError ? '—' : `+${formatIDR(periodIncome)}`}
                  </span>
                </div>

                <div className="rounded-panel bg-white/60 p-4 min-w-0">
                  <span className="text-xs font-medium text-nota-ink/75 block">
                    Pengeluaran
                  </span>
                  <span
                    data-testid="period-expense-value"
                    className="mt-1 block text-base sm:text-lg font-semibold text-nota-expense tabular-nums break-words"
                  >
                    {storageError ? '—' : `−${formatIDR(periodExpense)}`}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Mosque Funds & Cash Accounts Position Strip */}
          {!storageError && workspace ? (
            <section
              aria-label="Posisi dana dan lokasi kas masjid"
              className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5"
            >
              {/* 3 Mosque Funds (7 cols) */}
              <div className="lg:col-span-7 rounded-hero bg-nota-surface p-5 sm:p-6 border border-nota-border/70 space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm sm:text-base font-semibold text-nota-ink">
                    Posisi Dana Masjid (Amanah)
                  </h2>
                  {onNavigate ? (
                    <button
                      type="button"
                      onClick={() => onNavigate('cash-and-funds')}
                      className="text-xs font-medium text-nota-emerald hover:underline cursor-pointer"
                    >
                      Kelola Kas & Dana
                    </button>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {workspace.mosqueBalanceSplit.fundSummaries.map((fund) => (
                    <div
                      key={fund.fundId}
                      data-testid={`overview-fund-pill-${fund.fundId}`}
                      className="rounded-panel border border-nota-border/70 bg-nota-bg/60 p-3.5 space-y-1"
                    >
                      <span
                        className={`inline-block rounded-control px-2 py-0.5 text-[10px] font-semibold ${
                          fund.restriction === 'restricted'
                            ? 'border border-nota-ink/20 bg-nota-surface text-nota-ink'
                            : 'bg-nota-soft-green text-nota-emerald'
                        }`}
                      >
                        {fund.restriction === 'restricted'
                          ? 'Dana Terikat'
                          : 'Dana Umum'}
                      </span>
                      <p className="text-xs font-medium text-nota-ink truncate">
                        {fund.fundName}
                      </p>
                      <p className="text-sm sm:text-base font-semibold text-nota-ink tabular-nums">
                        {fund.currentBalance < 0
                          ? formatSignedIDR(fund.currentBalance)
                          : formatIDR(fund.currentBalance)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2 Mosque Cash Accounts (5 cols) */}
              <div className="lg:col-span-5 rounded-hero bg-nota-surface p-5 sm:p-6 border border-nota-border/70 space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm sm:text-base font-semibold text-nota-ink">
                    Posisi Lokasi Kas
                  </h2>
                  <span className="text-xs text-nota-muted">
                    Tunai & Rekening Tercatat
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {workspace.mosqueBalanceSplit.accountSummaries.map((acc) => (
                    <div
                      key={acc.accountId}
                      data-testid={`overview-account-pill-${acc.accountId}`}
                      className="rounded-panel border border-nota-border/70 bg-nota-bg/60 p-3.5 space-y-1"
                    >
                      <span className="text-[10px] font-medium text-nota-muted block">
                        {acc.kind === 'cash' ? 'Kas Tunai' : 'Rekening Bank'}
                      </span>
                      <p className="text-xs font-medium text-nota-ink truncate">
                        {acc.accountName}
                      </p>
                      <p className="text-sm sm:text-base font-semibold text-nota-ink tabular-nums">
                        {acc.currentBalance < 0
                          ? formatSignedIDR(acc.currentBalance)
                          : formatIDR(acc.currentBalance)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {/* Overview Cashflow & Recent Transactions */}
          <section
            aria-label="Aktivitas dan arus kas"
            className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5"
          >
            {/* Cashflow Visual Region (6 cols) */}
            <div className="lg:col-span-6 rounded-hero bg-nota-surface p-6 sm:p-7 border border-nota-border/70 flex flex-col justify-between gap-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-control border border-nota-border bg-nota-bg text-nota-ink">
                    <BarChart3 className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <h2 className="text-base font-semibold text-nota-ink">
                    Arus Kas Bulan Ini
                  </h2>
                </div>
                <span className="rounded-control border border-nota-border bg-nota-bg px-3 py-1 text-xs font-medium text-nota-muted">
                  {periodLabel}
                </span>
              </div>

              {storageError || !workspace || periodTransactionCount === 0 ? (
                <div className="rounded-panel bg-nota-bg/80 px-5 py-7 text-center space-y-1.5">
                  <p className="text-sm font-medium text-nota-ink">
                    Belum ada data arus kas
                  </p>
                  <p className="text-xs text-nota-muted max-w-xs mx-auto leading-relaxed">
                    Perbandingan pemasukan dan pengeluaran akan tampil setelah
                    transaksi pertama dicatat.
                  </p>
                </div>
              ) : (
                <div
                  data-testid="cashflow-overview-visual"
                  className="space-y-5"
                >
                  {/* Proportional Income vs Expense Bar */}
                  <div className="rounded-panel bg-nota-bg/70 p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs font-medium text-nota-muted">
                      <span>Perbandingan arus kas</span>
                      <span className="tabular-nums">
                        {incomeFlowPercent}% masuk · {expenseFlowPercent}%
                        keluar
                      </span>
                    </div>

                    <div
                      role="img"
                      aria-label={`Proporsi arus kas ${periodLabel}: pemasukan ${incomeFlowPercent} persen, pengeluaran ${expenseFlowPercent} persen`}
                      className="flex h-3 w-full overflow-hidden rounded-control bg-nota-border/50 gap-0.5"
                    >
                      {periodIncome > 0 ? (
                        <div
                          style={{
                            width: `${Math.max(incomeFlowPercent, 4)}%`,
                          }}
                          className="h-full bg-nota-emerald transition-all"
                        />
                      ) : null}
                      {periodExpense > 0 ? (
                        <div
                          style={{
                            width: `${Math.max(expenseFlowPercent, 4)}%`,
                          }}
                          className="h-full bg-nota-expense transition-all"
                        />
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="inline-flex items-center gap-1.5 text-nota-ink">
                        <span
                          className="h-2.5 w-2.5 rounded-full bg-nota-emerald shrink-0"
                          aria-hidden="true"
                        />
                        <span className="text-nota-muted">Masuk:</span>
                        <strong className="font-semibold tabular-nums">
                          {formatIDR(periodIncome)}
                        </strong>
                      </div>
                      <div className="inline-flex items-center gap-1.5 text-nota-ink">
                        <span
                          className="h-2.5 w-2.5 rounded-full bg-nota-expense shrink-0"
                          aria-hidden="true"
                        />
                        <span className="text-nota-muted">Keluar:</span>
                        <strong className="font-semibold tabular-nums">
                          {formatIDR(periodExpense)}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Top Expense Categories Breakdown */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-nota-muted">
                        Pengeluaran per kategori
                      </h3>
                      {topExpenseCategories.length > 0 ? (
                        <span className="text-xs text-nota-muted tabular-nums">
                          {topExpenseCategories.length} kategori
                        </span>
                      ) : null}
                    </div>

                    {topExpenseCategories.length === 0 ? (
                      <p className="rounded-panel bg-nota-bg/60 px-4 py-3 text-xs text-nota-muted">
                        Belum ada pengeluaran yang tercatat pada periode ini.
                      </p>
                    ) : (
                      <ul
                        aria-label="Rincian kategori pengeluaran"
                        className="space-y-2.5"
                      >
                        {topExpenseCategories.map((item) => {
                          const sharePercent =
                            periodExpense > 0
                              ? Math.round(
                                  (item.totalAmount / periodExpense) * 100,
                                )
                              : 0;

                          return (
                            <li
                              key={item.categoryId}
                              className="rounded-panel bg-nota-bg/60 px-3.5 py-2.5 space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                                <span className="font-medium text-nota-ink truncate inline-flex items-center gap-1.5">
                                  <span>{item.categoryName}</span>
                                  {item.isArchived ? (
                                    <span className="rounded-control border border-nota-border bg-nota-surface px-1.5 py-0.5 text-[10px] font-medium text-nota-muted">
                                      Arsip
                                    </span>
                                  ) : null}
                                </span>
                                <span className="font-semibold text-nota-ink tabular-nums shrink-0">
                                  {formatIDR(item.totalAmount)}{' '}
                                  <span className="text-xs font-normal text-nota-muted">
                                    ({sharePercent}%)
                                  </span>
                                </span>
                              </div>
                              <div className="h-1.5 w-full overflow-hidden rounded-control bg-nota-border/50">
                                <div
                                  style={{
                                    width: `${Math.max(sharePercent, 4)}%`,
                                  }}
                                  className="h-full rounded-control bg-nota-ink/80"
                                />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Recent Transactions Region (6 cols) */}
            <div className="lg:col-span-6 rounded-hero bg-nota-surface p-6 sm:p-7 border border-nota-border/70 flex flex-col justify-between gap-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-control border border-nota-border bg-nota-bg text-nota-ink">
                    <FileText className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <h2 className="text-base font-semibold text-nota-ink">
                    Transaksi terakhir
                  </h2>
                </div>
                {!storageError &&
                workspace &&
                workspace.transactions.length > 0 ? (
                  onNavigate ? (
                    <button
                      type="button"
                      onClick={() => onNavigate('transactions')}
                      className="rounded-control border border-nota-border bg-nota-bg px-3 py-1 text-xs font-medium text-nota-emerald hover:bg-nota-soft-green/50 transition-colors cursor-pointer"
                    >
                      Lihat semua ({workspace.transactions.length})
                    </button>
                  ) : (
                    <span className="rounded-control border border-nota-border bg-nota-bg px-3 py-1 text-xs font-medium text-nota-muted tabular-nums">
                      {workspace.transactions.length} tercatat
                    </span>
                  )
                ) : null}
              </div>

              {storageError ||
              !workspace ||
              recentTransactions.length === 0 ? (
                <div className="rounded-panel bg-nota-bg/80 px-5 py-7 text-center space-y-1.5">
                  <p className="text-sm font-medium text-nota-ink">
                    Belum ada transaksi
                  </p>
                  <p className="text-xs text-nota-muted max-w-xs mx-auto leading-relaxed">
                    Catatan pemasukan dan pengeluaran terbaru Anda akan tersusun
                    di sini.
                  </p>
                </div>
              ) : (
                <ul
                  aria-label="Daftar transaksi terakhir"
                  className="divide-y divide-nota-border/60 rounded-panel bg-nota-bg/60 px-4 py-1"
                >
                  {recentTransactions.map((tx) => {
                    const categoryInfo = categoryMap.get(tx.categoryId);
                    const categoryName =
                      categoryInfo?.name ?? 'Kategori tidak dikenal';
                    const fundInfo = fundMap.get(
                      tx.fundId ?? DEFAULT_FUND_OPERASIONAL_ID,
                    );
                    const accountInfo = accountMap.get(
                      tx.accountId ?? DEFAULT_CASH_ACCOUNT_TUNAI_ID,
                    );
                    const isIncome = tx.type === 'income';

                    return (
                      <li
                        key={tx.id}
                        className="flex items-center justify-between gap-3 py-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-control ${
                              isIncome
                                ? 'bg-nota-soft-green text-nota-emerald'
                                : 'bg-nota-expense-soft text-nota-expense'
                            }`}
                            aria-hidden="true"
                          >
                            {isIncome ? (
                              <ArrowDownLeft className="h-4 w-4" />
                            ) : (
                              <ArrowUpRight className="h-4 w-4" />
                            )}
                          </div>

                          <div className="min-w-0 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="text-sm font-medium text-nota-ink truncate">
                                {categoryName}
                              </p>
                              {categoryInfo?.isArchived ? (
                                <span className="rounded-control border border-nota-border bg-nota-surface px-1.5 py-0.5 text-[10px] font-medium text-nota-muted shrink-0">
                                  Arsip
                                </span>
                              ) : null}
                              {fundInfo ? (
                                <span
                                  className={`rounded-control px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${
                                    fundInfo.restriction === 'restricted'
                                      ? 'border border-nota-ink/20 bg-nota-surface text-nota-ink'
                                      : 'bg-nota-soft-green text-nota-emerald'
                                  }`}
                                >
                                  {fundInfo.name}
                                </span>
                              ) : null}
                              {accountInfo ? (
                                <span className="rounded-control border border-nota-border bg-nota-surface px-1.5 py-0.5 text-[10px] font-medium text-nota-muted shrink-0">
                                  {accountInfo.name}
                                </span>
                              ) : null}
                            </div>
                            <p className="text-xs text-nota-muted truncate">
                              <span>{formatLocalDateID(tx.occurredAt)}</span>
                              {tx.donorOrPayee ? (
                                <span> · {tx.donorOrPayee}</span>
                              ) : null}
                              {tx.note ? <span> · {tx.note}</span> : null}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`text-sm font-semibold tabular-nums shrink-0 ${
                            isIncome ? 'text-nota-emerald' : 'text-nota-expense'
                          }`}
                        >
                          {isIncome
                            ? `+${formatIDR(tx.amount)}`
                            : `−${formatIDR(tx.amount)}`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </>
      ) : null}

      {/* =====================================================================
          TAB 2: TRANSAKSI (Compact Context Bar + Authoritative Ledger CRUD)
         ===================================================================== */}
      {activeRoute === 'transactions' ? (
        <>
          <section
            aria-label="Ringkasan konteks transaksi"
            className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-panel border border-nota-border/70 bg-nota-surface p-4"
          >
            <div className="space-y-0.5 min-w-0">
              <span className="text-xs font-medium text-nota-muted block">
                Saldo tercatat
              </span>
              <span
                data-testid="current-balance-value"
                className={`block text-base sm:text-lg font-semibold tabular-nums truncate ${
                  !storageError && currentBalance < 0
                    ? 'text-nota-expense'
                    : 'text-nota-ink'
                }`}
              >
                {storageError
                  ? '—'
                  : currentBalance < 0
                    ? formatSignedIDR(currentBalance)
                    : formatIDR(currentBalance)}
              </span>
            </div>

            <div className="space-y-0.5 min-w-0">
              <span className="text-xs font-medium text-nota-muted block">
                Pemasukan ({periodLabel})
              </span>
              <span
                data-testid="period-income-value"
                className="block text-base sm:text-lg font-semibold text-nota-emerald tabular-nums truncate"
              >
                {storageError ? '—' : `+${formatIDR(periodIncome)}`}
              </span>
            </div>

            <div className="space-y-0.5 min-w-0">
              <span className="text-xs font-medium text-nota-muted block">
                Pengeluaran ({periodLabel})
              </span>
              <span
                data-testid="period-expense-value"
                className="block text-base sm:text-lg font-semibold text-nota-expense tabular-nums truncate"
              >
                {storageError ? '—' : `−${formatIDR(periodExpense)}`}
              </span>
            </div>

            <div className="space-y-0.5 min-w-0">
              <span className="text-xs font-medium text-nota-muted block">
                Selisih bulan ini
              </span>
              <span
                data-testid="period-net-cashflow-value"
                className="block text-base sm:text-lg font-semibold text-nota-ink tabular-nums truncate"
              >
                {storageError ? '—' : formatSignedIDR(periodNetCashFlow)}
              </span>
            </div>
          </section>

          {!storageError && workspace ? (
            <TransactionListSection
              transactions={workspace.transactions}
              categories={workspace.categories}
              accounts={workspace.accounts}
              funds={workspace.funds}
              selectedPeriod={selectedPeriod}
              periodLabel={periodLabel}
              onEditTransaction={openEditForm}
              onDeleteTransaction={handleDeleteTransaction}
              onAddIncome={() => openCreateForm('income')}
              onAddExpense={() => openCreateForm('expense')}
            />
          ) : null}
        </>
      ) : null}

      {/* =====================================================================
          TAB 3: KAS & DANA (Cash Accounts, Mosque Funds & Internal Transfers)
         ===================================================================== */}
      {activeRoute === 'cash-and-funds' && !storageError && workspace ? (
        <CashAndFundsSection
          accounts={workspace.accounts}
          funds={workspace.funds}
          cashTransfers={workspace.cashTransfers}
          mosqueBalanceSplit={workspace.mosqueBalanceSplit}
          onAddAccount={handleAddAccount}
          onUpdateAccount={handleUpdateAccount}
          onAddFund={handleAddFund}
          onUpdateFund={handleUpdateFund}
          onAddCashTransfer={handleAddCashTransfer}
          onDeleteCashTransfer={handleDeleteCashTransfer}
        />
      ) : null}

      {/* =====================================================================
          TAB 4: ANGGARAN / RAB (Budgets, Savings Goals & Debt/Receivable Records)
         ===================================================================== */}
      {activeRoute === 'planning' ? (
        <>
          <section
            aria-label="Ringkasan konteks perencanaan"
            className="grid grid-cols-1 gap-3 sm:grid-cols-3 rounded-panel border border-nota-border/70 bg-nota-surface p-4"
          >
            <div className="space-y-0.5 min-w-0">
              <span className="text-xs font-medium text-nota-muted block">
                Saldo tercatat (acuan kas)
              </span>
              <span
                data-testid="current-balance-value"
                className={`block text-base sm:text-lg font-semibold tabular-nums truncate ${
                  !storageError && currentBalance < 0
                    ? 'text-nota-expense'
                    : 'text-nota-ink'
                }`}
              >
                {storageError
                  ? '—'
                  : currentBalance < 0
                    ? formatSignedIDR(currentBalance)
                    : formatIDR(currentBalance)}
              </span>
            </div>

            <div className="space-y-0.5 min-w-0">
              <span className="text-xs font-medium text-nota-muted block">
                Pengeluaran ({periodLabel})
              </span>
              <span
                data-testid="period-expense-value"
                className="block text-base sm:text-lg font-semibold text-nota-expense tabular-nums truncate"
              >
                {storageError ? '—' : `−${formatIDR(periodExpense)}`}
              </span>
            </div>

            <div className="space-y-0.5 min-w-0">
              <span className="text-xs font-medium text-nota-muted block">
                Selisih ({periodLabel})
              </span>
              <span
                data-testid="period-net-cashflow-value"
                className="block text-base sm:text-lg font-semibold text-nota-ink tabular-nums truncate"
              >
                {storageError ? '—' : formatSignedIDR(periodNetCashFlow)}
              </span>
            </div>
          </section>

          {!storageError && workspace ? (
            <div className="space-y-5 sm:space-y-6">
              <BudgetPlanSection
                budgetPlans={workspace.budgetPlans}
                transactions={workspace.transactions}
                categories={workspace.categories}
                funds={workspace.funds}
                selectedPeriod={selectedPeriod}
                periodLabel={periodLabel}
                onCreateBudgetPlan={handleCreateBudgetPlan}
                onUpdateBudgetPlan={handleUpdateBudgetPlan}
                onDeleteBudgetPlan={handleDeleteBudgetPlan}
              />
              <CategoryBudgetSection
                budgets={workspace.budgets}
                transactions={workspace.transactions}
                categories={workspace.categories}
                selectedPeriod={selectedPeriod}
                periodLabel={periodLabel}
                onSaveBudget={handleSaveCategoryBudget}
                onDeleteBudget={handleDeleteCategoryBudget}
              />
              <SavingsGoalSection
                savingsGoals={workspace.savingsGoals}
                currentBalance={currentBalance}
                onCreateGoal={handleCreateSavingsGoal}
                onUpdateGoal={handleUpdateSavingsGoal}
                onDeleteGoal={handleDeleteSavingsGoal}
              />
              <DebtRecordSection
                debtRecords={workspace.debtRecords}
                onCreateDebtRecord={handleCreateDebtRecord}
                onUpdateDebtRecord={handleUpdateDebtRecord}
                onSettleDebtRecord={handleSettleDebtRecord}
                onDeleteDebtRecord={handleDeleteDebtRecord}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {/* =====================================================================
          TAB 5: LAPORAN (Mosque Financial Reports — Congregation Ready & Printable)
         ===================================================================== */}
      {activeRoute === 'reports' && !storageError && workspace ? (
        <MosqueReportSection
          settings={workspace.settings}
          accounts={workspace.accounts}
          funds={workspace.funds}
          categories={workspace.categories}
          transactions={workspace.transactions}
          cashTransfers={workspace.cashTransfers}
          selectedPeriod={selectedPeriod}
          periodLabel={periodLabel}
        />
      ) : null}

      {/* =====================================================================
          TAB 6: PENGATURAN (Mosque Profile, Categories, Opening Balance & Backup)
         ===================================================================== */}
      {activeRoute === 'settings' ? (
        <div className="space-y-5 sm:space-y-6">
          {!storageError && workspace ? (
            <MosqueSettingsSection
              settings={workspace.settings}
              categories={workspace.categories}
              funds={workspace.funds}
              onSaveMosqueProfile={handleSaveMosqueProfile}
              onAddCategory={handleAddCategory}
              onUpdateCategoryName={handleUpdateCategoryName}
              onArchiveCategory={handleArchiveCategory}
            />
          ) : null}

          <section
            aria-label="Pengaturan saldo awal dan penyimpanan"
            className="rounded-hero bg-nota-surface p-6 sm:p-8 border border-nota-border/70 space-y-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-nota-ink">
                  Saldo Awal & Penyimpanan Lokal
                </h2>
                <p className="text-xs sm:text-sm text-nota-muted max-w-2xl">
                  Saldo awal menjadi titik mulai perhitungan saldo tercatat
                  Anda. Seluruh catatan disimpan secara lokal di browser
                  perangkat ini (IndexedDB) tanpa akun, server, atau sinkronisasi
                  cloud otomatis.
                </p>
              </div>

              {!isEditingOpeningBalance && workspace ? (
                <button
                  type="button"
                  onClick={() => setIsEditingOpeningBalance(true)}
                  className="inline-flex items-center gap-1.5 rounded-control border border-nota-border bg-nota-bg px-4 py-2 text-xs sm:text-sm font-medium text-nota-ink hover:bg-nota-soft-green/50 transition-colors cursor-pointer"
                >
                  <PencilLine
                    className="h-3.5 w-3.5 text-nota-emerald"
                    aria-hidden="true"
                  />
                  Atur saldo awal
                </button>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-panel border border-nota-border/60 bg-nota-bg/60 p-4">
                <span className="block text-xs font-medium text-nota-muted">
                  Saldo awal tercatat
                </span>
                <span
                  data-testid="settings-opening-balance-value"
                  className="mt-1 block text-lg font-semibold text-nota-ink tabular-nums"
                >
                  {storageError ? '—' : formatIDR(openingBalance)}
                </span>
              </div>

              <div className="rounded-panel border border-nota-border/60 bg-nota-bg/60 p-4">
                <span className="block text-xs font-medium text-nota-muted">
                  Saldo tercatat saat ini
                </span>
                <span
                  data-testid="current-balance-value"
                  className={`mt-1 block text-lg font-semibold tabular-nums ${
                    !storageError && currentBalance < 0
                      ? 'text-nota-expense'
                      : 'text-nota-ink'
                  }`}
                >
                  {storageError
                    ? '—'
                    : currentBalance < 0
                      ? formatSignedIDR(currentBalance)
                      : formatIDR(currentBalance)}
                </span>
              </div>

              <div className="rounded-panel border border-nota-border/60 bg-nota-bg/60 p-4">
                <span className="block text-xs font-medium text-nota-muted">
                  Pemasukan ({periodLabel})
                </span>
                <span
                  data-testid="period-income-value"
                  className="mt-1 block text-lg font-semibold text-nota-emerald tabular-nums"
                >
                  {storageError ? '—' : `+${formatIDR(periodIncome)}`}
                </span>
              </div>
            </div>
          </section>

          {!storageError && workspace ? (
            <BackupRestoreSection
              transactions={workspace.transactions}
              categories={workspace.categories}
              onExportBackup={handleExportBackup}
              onRestoreBackup={handleRestoreBackup}
            />
          ) : null}
        </div>
      ) : null}

      {/* Quick-Entry / Edit Transaction Form Panel */}
      {transactionFormState && workspace ? (
        <TransactionFormModal
          key={
            transactionFormState.mode === 'edit'
              ? `edit-${transactionFormState.transaction.id}-${transactionFormState.transaction.updatedAt}`
              : `create-${transactionFormState.initialType}`
          }
          mode={transactionFormState.mode}
          initialType={
            transactionFormState.mode === 'create'
              ? transactionFormState.initialType
              : undefined
          }
          editingTransaction={
            transactionFormState.mode === 'edit'
              ? transactionFormState.transaction
              : undefined
          }
          categories={workspace.categories}
          accounts={workspace.accounts}
          funds={workspace.funds}
          transactions={workspace.transactions}
          cashTransfers={workspace.cashTransfers}
          budgetPlans={workspace.budgetPlans}
          onCreate={handleCreateTransaction}
          onUpdate={handleUpdateTransaction}
          onClose={() => setTransactionFormState(null)}
        />
      ) : null}
    </div>
  );
}
