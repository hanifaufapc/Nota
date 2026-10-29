import { describe, expect, it } from 'vitest';
import {
  getCurrentMonthPeriod,
  getDaysInMonth,
  getMonthPeriod,
  isDateWithinPeriod,
  isValidDateRangePeriod,
  isValidLocalDateString,
  parseLocalDateString,
  toLocalDateString,
} from '../lib/date';
import {
  MAX_IDR_AMOUNT,
  addIdr,
  assertOpeningBalance,
  assertTransactionAmount,
  isSafeIdrInteger,
  isValidOpeningBalance,
  isValidTransactionAmount,
} from '../domain/money';
import {
  calculateCategoryTotals,
  calculateCurrentBalance,
  calculateIncomeAndExpenseTotals,
  calculateOverviewSnapshot,
  calculatePeriodSummary,
  filterTransactions,
  filterTransactionsByPeriod,
  sortTransactions,
} from '../domain/summaries';
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_CATEGORIES,
  MAX_CATEGORY_NAME_LENGTH,
  MAX_TRANSACTION_NOTE_LENGTH,
  applyTransactionEdit,
  archiveCategory,
  createCategory,
  createTransaction,
  getSelectableCategories,
  removeTransactionFromList,
  renameCategory,
  replaceTransactionInList,
  type Category,
  type Transaction,
} from '../domain/transaction';
import {
  isValidTransactionType,
  validateAppSettings,
  validateCategoryInput,
  validateTransactionDraft,
} from '../domain/validation';

describe('Nota Milestone 1 — Domain Model & Financial Rules', () => {
  describe('Money & IDR integer invariants (domain/money.ts)', () => {
    it('accepts positive integer IDR amounts for transactions and rejects zero, negative, or floating-point values', () => {
      expect(isValidTransactionAmount(1)).toBe(true);
      expect(isValidTransactionAmount(50_000)).toBe(true);
      expect(isValidTransactionAmount(MAX_IDR_AMOUNT)).toBe(true);

      expect(isValidTransactionAmount(0)).toBe(false);
      expect(isValidTransactionAmount(-10_000)).toBe(false);
      expect(isValidTransactionAmount(1500.5)).toBe(false);
      expect(isValidTransactionAmount(Number.NaN)).toBe(false);
      expect(isValidTransactionAmount(Number.POSITIVE_INFINITY)).toBe(false);
      expect(isValidTransactionAmount('50000')).toBe(false);
      expect(isValidTransactionAmount(MAX_IDR_AMOUNT + 1)).toBe(false);

      expect(() => assertTransactionAmount(0)).toThrow(RangeError);
      expect(() => assertTransactionAmount(-500)).toThrow(RangeError);
      expect(() => assertTransactionAmount(99.99)).toThrow(RangeError);
    });

    it('accepts zero or positive integer IDR for opening balance and rejects negative or non-integer values', () => {
      expect(isValidOpeningBalance(0)).toBe(true);
      expect(isValidOpeningBalance(2_500_000)).toBe(true);
      expect(isValidOpeningBalance(-1)).toBe(false);
      expect(isValidOpeningBalance(10.25)).toBe(false);

      expect(assertOpeningBalance(0)).toBe(0);
      expect(() => assertOpeningBalance(-100)).toThrow(RangeError);
    });

    it('performs safe integer addition and guards against float/overflow values across single and cumulative operations', () => {
      expect(addIdr(100_000, 250_000)).toBe(350_000);
      expect(addIdr(100_000, -40_000)).toBe(60_000);
      expect(() => addIdr(100.5, 200)).toThrow(RangeError);
      expect(isSafeIdrInteger(Number.MAX_SAFE_INTEGER)).toBe(false);

      // Cumulative overflow when summing many large transactions exceeding Number.MAX_SAFE_INTEGER
      const hugeTransactions: Transaction[] = Array.from({ length: 10 }, (_, idx) => ({
        id: `tx-huge-${idx}`,
        type: 'income',
        amount: MAX_IDR_AMOUNT,
        categoryId: 'cat-inc-gaji',
        occurredAt: '2026-10-15',
        createdAt: '2026-10-15T00:00:00.000Z',
        updatedAt: '2026-10-15T00:00:00.000Z',
      }));

      expect(() => calculateIncomeAndExpenseTotals(hugeTransactions)).toThrow(
        RangeError,
      );
      expect(() => calculateCurrentBalance(0, hugeTransactions)).toThrow(
        RangeError,
      );
    });

    it('rejects invalid transaction amounts or unknown types inside balance, period, and category calculations', () => {
      const octPeriod = getMonthPeriod(2026, 10);
      const corruptedZeroTx = [
        {
          id: 'tx-bad-0',
          type: 'expense' as const,
          amount: 0,
          categoryId: 'cat-exp-makanan',
          occurredAt: '2026-10-10',
          createdAt: '2026-10-10T00:00:00.000Z',
          updatedAt: '2026-10-10T00:00:00.000Z',
        },
      ];
      const corruptedFloatTx = [
        {
          id: 'tx-bad-float',
          type: 'income' as const,
          amount: 12500.75,
          categoryId: 'cat-inc-gaji',
          occurredAt: '2026-10-10',
          createdAt: '2026-10-10T00:00:00.000Z',
          updatedAt: '2026-10-10T00:00:00.000Z',
        },
      ];
      const corruptedTypeTx = [
        {
          id: 'tx-bad-type',
          type: 'transfer' as unknown as 'income',
          amount: 50_000,
          categoryId: 'cat-inc-gaji',
          occurredAt: '2026-10-10',
          createdAt: '2026-10-10T00:00:00.000Z',
          updatedAt: '2026-10-10T00:00:00.000Z',
        },
      ];

      expect(() => calculateCurrentBalance(0, corruptedZeroTx)).toThrow(RangeError);
      expect(() => calculatePeriodSummary(corruptedFloatTx, octPeriod)).toThrow(
        RangeError,
      );
      expect(() =>
        calculateCategoryTotals(corruptedZeroTx, DEFAULT_CATEGORIES),
      ).toThrow(RangeError);
      expect(() => calculateIncomeAndExpenseTotals(corruptedTypeTx)).toThrow(
        /Jenis transaksi tidak dikenal/i,
      );
    });

    it('handles negative currentBalance and negative netCashFlow when expenses exceed openingBalance + income', () => {
      const octPeriod = getMonthPeriod(2026, 10);
      const deficitTransactions: Transaction[] = [
        createTransaction(
          {
            id: 'tx-inc-small',
            type: 'income',
            amount: 200_000,
            categoryId: 'cat-inc-usaha',
            occurredAt: '2026-10-02',
          },
          DEFAULT_CATEGORIES,
        ),
        createTransaction(
          {
            id: 'tx-exp-large',
            type: 'expense',
            amount: 750_000,
            categoryId: 'cat-exp-tempat-tinggal',
            occurredAt: '2026-10-03',
          },
          DEFAULT_CATEGORIES,
        ),
      ];

      const snapshot = calculateOverviewSnapshot(
        100_000,
        deficitTransactions,
        octPeriod,
      );
      // 100.000 + 200.000 - 750.000 = -450.000
      expect(snapshot.currentBalance).toBe(-450_000);
      // 200.000 - 750.000 = -550.000
      expect(snapshot.periodSummary.netCashFlow).toBe(-550_000);
    });
  });

  describe('Local date & period boundary rules (lib/date.ts)', () => {
    it('validates real calendar dates in YYYY-MM-DD format and rejects impossible dates or timestamps', () => {
      expect(isValidLocalDateString('2026-10-27')).toBe(true);
      expect(isValidLocalDateString('2024-02-29')).toBe(true); // 2024 is a leap year

      expect(isValidLocalDateString('2026-02-29')).toBe(false); // 2026 is not a leap year
      expect(isValidLocalDateString('2026-04-31')).toBe(false); // April has 30 days
      expect(isValidLocalDateString('2026-13-01')).toBe(false);
      expect(isValidLocalDateString('2026-00-10')).toBe(false);
      expect(isValidLocalDateString('2026-10-27T10:00:00Z')).toBe(false);
      expect(isValidLocalDateString('27-10-2026')).toBe(false);
    });

    it('converts local Date to YYYY-MM-DD without UTC day shift and computes inclusive month boundaries', () => {
      const localDate = new Date(2026, 9, 1, 0, 15, 0); // Oct 1, 2026 00:15 local
      expect(toLocalDateString(localDate)).toBe('2026-10-01');

      const parsed = parseLocalDateString('2026-10-01');
      expect(parsed.getFullYear()).toBe(2026);
      expect(parsed.getMonth()).toBe(9);
      expect(parsed.getDate()).toBe(1);

      const octPeriod = getMonthPeriod(2026, 10);
      expect(octPeriod).toEqual({
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });

      const febLeapPeriod = getMonthPeriod(2024, 2);
      expect(febLeapPeriod).toEqual({
        startDate: '2024-02-01',
        endDate: '2024-02-29',
      });

      expect(getDaysInMonth(2026, 2)).toBe(28);
      expect(getCurrentMonthPeriod(localDate)).toEqual(octPeriod);
    });

    it('includes start and end dates inclusively when checking period membership and rejects malformed dates/periods', () => {
      const octPeriod = getMonthPeriod(2026, 10);

      expect(isDateWithinPeriod('2026-09-30', octPeriod)).toBe(false);
      expect(isDateWithinPeriod('2026-10-01', octPeriod)).toBe(true); // first day included
      expect(isDateWithinPeriod('2026-10-15', octPeriod)).toBe(true);
      expect(isDateWithinPeriod('2026-10-31', octPeriod)).toBe(true); // last day included
      expect(isDateWithinPeriod('2026-11-01', octPeriod)).toBe(false);

      // Century leap year rules: 2000 is a leap year, 1900 and 2100 are not
      expect(isValidLocalDateString('2000-02-29')).toBe(true);
      expect(isValidLocalDateString('1900-02-29')).toBe(false);
      expect(isValidLocalDateString('2100-02-29')).toBe(false);

      expect(
        isValidDateRangePeriod({
          startDate: '2026-10-31',
          endDate: '2026-10-01',
        }),
      ).toBe(false);

      expect(() => isDateWithinPeriod('invalid-date', octPeriod)).toThrow(
        RangeError,
      );
      expect(() =>
        isDateWithinPeriod('2026-10-15', {
          startDate: '2026-10-31',
          endDate: '2026-10-01',
        }),
      ).toThrow(RangeError);
      expect(() => parseLocalDateString('2026-02-30')).toThrow(RangeError);
      expect(() => toLocalDateString(new Date('invalid'))).toThrow(RangeError);
      expect(() => getDaysInMonth(1800, 5)).toThrow(RangeError);
    });
  });

  describe('Validation & entity lifecycle rules (domain/validation.ts & domain/transaction.ts)', () => {
    it('provides sensible default Indonesian categories for both income and expense without fake transactions', () => {
      const incomeCategories = DEFAULT_CATEGORIES.filter((c) => c.type === 'income');
      const expenseCategories = DEFAULT_CATEGORIES.filter((c) => c.type === 'expense');

      expect(incomeCategories.length).toBeGreaterThan(0);
      expect(expenseCategories.length).toBeGreaterThan(0);
      expect(DEFAULT_APP_SETTINGS).toMatchObject({
        openingBalance: 0,
        currency: 'IDR',
        onboardingCompleted: false,
      });
    });

    it('rejects transfers, unknown transaction types, mismatched category types, and overly long notes', () => {
      expect(isValidTransactionType('income')).toBe(true);
      expect(isValidTransactionType('expense')).toBe(true);
      expect(isValidTransactionType('transfer')).toBe(false);

      // Mismatched category type: using an expense category for an income transaction
      const mismatchResult = validateTransactionDraft(
        {
          id: 'tx-1',
          type: 'income',
          amount: 100_000,
          categoryId: 'cat-exp-makanan',
          occurredAt: '2026-10-27',
        },
        DEFAULT_CATEGORIES,
      );
      expect(mismatchResult.valid).toBe(false);
      expect(mismatchResult.errors[0]).toMatch(/tidak sesuai dengan jenis transaksi/i);

      // Overly long note
      const longNoteResult = validateTransactionDraft({
        id: 'tx-2',
        type: 'expense',
        amount: 25_000,
        categoryId: 'cat-exp-makanan',
        occurredAt: '2026-10-27',
        note: 'a'.repeat(MAX_TRANSACTION_NOTE_LENGTH + 1),
      });
      expect(longNoteResult.valid).toBe(false);
    });

    it('supports creating, renaming, and archiving categories while preserving historical transaction meaning', () => {
      const customCat = createCategory({
        id: 'cat-exp-kopi',
        name: '  Kopi & Camilan  ',
        type: 'expense',
        color: 'expense',
      });
      expect(customCat.name).toBe('Kopi & Camilan');
      expect(customCat.isDefault).toBe(false);

      const renamedCat = renameCategory(customCat, 'Kopi Harian');
      expect(renamedCat.name).toBe('Kopi Harian');

      const archivedCat = archiveCategory(renamedCat, '2026-10-27T12:00:00.000Z');
      expect(archivedCat.archivedAt).toBe('2026-10-27T12:00:00.000Z');

      const categories: Category[] = [...DEFAULT_CATEGORIES, archivedCat];

      // New transactions cannot select an archived category
      expect(
        getSelectableCategories(categories, 'expense').some(
          (c) => c.id === 'cat-exp-kopi',
        ),
      ).toBe(false);
      expect(() =>
        createTransaction(
          {
            id: 'tx-new-archived',
            type: 'expense',
            amount: 20_000,
            categoryId: 'cat-exp-kopi',
            occurredAt: '2026-10-27',
          },
          categories,
        ),
      ).toThrow(/sudah diarsipkan/i);

      // Existing transaction created before archiving can still be edited while keeping its archived category
      const historicalTx: Transaction = {
        id: 'tx-old',
        type: 'expense',
        amount: 18_000,
        categoryId: 'cat-exp-kopi',
        occurredAt: '2026-10-10',
        note: 'Es kopi susu',
        createdAt: '2026-10-10T08:00:00.000Z',
        updatedAt: '2026-10-10T08:00:00.000Z',
      };

      expect(
        getSelectableCategories(categories, 'expense', historicalTx.categoryId).some(
          (c) => c.id === 'cat-exp-kopi',
        ),
      ).toBe(true);

      const editedHistoricalTx = applyTransactionEdit(
        historicalTx,
        { amount: 22_000, note: 'Es kopi susu + roti' },
        '2026-10-27T13:00:00.000Z',
        categories,
      );
      expect(editedHistoricalTx.amount).toBe(22_000);
      expect(editedHistoricalTx.categoryId).toBe('cat-exp-kopi');

      // Validate category name length limit
      expect(
        validateCategoryInput({
          id: 'cat-long',
          name: 'x'.repeat(MAX_CATEGORY_NAME_LENGTH + 1),
          type: 'expense',
          color: 'expense',
        }).valid,
      ).toBe(false);
    });

    it('validates AppSettings properly', () => {
      expect(
        validateAppSettings({
          openingBalance: 1_000_000,
          currency: 'IDR',
          onboardingCompleted: true,
        }).valid,
      ).toBe(true);

      expect(
        validateAppSettings({
          openingBalance: -500,
          currency: 'IDR',
          onboardingCompleted: true,
        }).valid,
      ).toBe(false);
    });
  });

  describe('Balance, period summaries, and edit/delete recalculation (domain/summaries.ts)', () => {
    const sampleTransactions: Transaction[] = [
      createTransaction(
        {
          id: 'tx-sep-inc',
          type: 'income',
          amount: 5_000_000,
          categoryId: 'cat-inc-gaji',
          occurredAt: '2026-09-25',
          note: 'Gaji September',
          nowIso: '2026-09-25T09:00:00.000Z',
        },
        DEFAULT_CATEGORIES,
      ),
      createTransaction(
        {
          id: 'tx-oct-inc-1',
          type: 'income',
          amount: 6_000_000,
          categoryId: 'cat-inc-gaji',
          occurredAt: '2026-10-01',
          note: 'Gaji Oktober',
          nowIso: '2026-10-01T09:00:00.000Z',
        },
        DEFAULT_CATEGORIES,
      ),
      createTransaction(
        {
          id: 'tx-oct-exp-1',
          type: 'expense',
          amount: 1_500_000,
          categoryId: 'cat-exp-tempat-tinggal',
          occurredAt: '2026-10-05',
          note: 'Sewa kos & listrik',
          nowIso: '2026-10-05T10:00:00.000Z',
        },
        DEFAULT_CATEGORIES,
      ),
      createTransaction(
        {
          id: 'tx-oct-exp-2',
          type: 'expense',
          amount: 250_000,
          categoryId: 'cat-exp-makanan',
          occurredAt: '2026-10-31',
          note: 'Belanja bahan masakan akhir bulan',
          nowIso: '2026-10-31T18:00:00.000Z',
        },
        DEFAULT_CATEGORIES,
      ),
    ];

    it('handles an empty transaction list safely and preserves opening balance outside period income', () => {
      const octPeriod = getMonthPeriod(2026, 10);
      const snapshot = calculateOverviewSnapshot(1_250_000, [], octPeriod);

      expect(snapshot.currentBalance).toBe(1_250_000);
      expect(snapshot.totalAllTimeIncome).toBe(0);
      expect(snapshot.totalAllTimeExpense).toBe(0);
      expect(snapshot.periodSummary).toEqual({
        period: octPeriod,
        income: 0,
        expense: 0,
        netCashFlow: 0,
        transactionCount: 0,
      });
    });

    it('computes all-time virtual balance and period summaries without counting openingBalance or prior-month transactions as current-month income', () => {
      const openingBalance = 2_000_000;
      const octPeriod = getMonthPeriod(2026, 10);

      // All-time: 2.000.000 + (5.000.000 + 6.000.000) - (1.500.000 + 250.000) = 11.250.000
      const currentBalance = calculateCurrentBalance(
        openingBalance,
        sampleTransactions,
      );
      expect(currentBalance).toBe(11_250_000);

      // October period only: income = 6.000.000, expense = 1.750.000, net = 4.250.000 (count = 3)
      const octSummary = calculatePeriodSummary(sampleTransactions, octPeriod);
      expect(octSummary).toEqual({
        period: octPeriod,
        income: 6_000_000,
        expense: 1_750_000,
        netCashFlow: 4_250_000,
        transactionCount: 3,
      });
    });

    it('recalculates balance and period summaries accurately without double-counting after editing or deleting a transaction', () => {
      const openingBalance = 2_000_000;
      const octPeriod = getMonthPeriod(2026, 10);

      // Edit tx-oct-exp-2 from 250.000 to 400.000
      const updatedTx = applyTransactionEdit(
        sampleTransactions[3],
        { amount: 400_000 },
        '2026-10-31T19:00:00.000Z',
        DEFAULT_CATEGORIES,
      );
      const afterEditList = replaceTransactionInList(
        sampleTransactions,
        updatedTx,
      );

      expect(afterEditList).toHaveLength(4);
      expect(calculateCurrentBalance(openingBalance, afterEditList)).toBe(
        11_100_000,
      );
      expect(calculatePeriodSummary(afterEditList, octPeriod).expense).toBe(
        1_900_000,
      );
      expect(calculatePeriodSummary(afterEditList, octPeriod).netCashFlow).toBe(
        4_100_000,
      );

      // Delete tx-oct-exp-1 (1.500.000)
      const afterDeleteList = removeTransactionFromList(
        afterEditList,
        'tx-oct-exp-1',
      );
      expect(afterDeleteList).toHaveLength(3);
      expect(calculateCurrentBalance(openingBalance, afterDeleteList)).toBe(
        12_600_000,
      );
      expect(calculatePeriodSummary(afterDeleteList, octPeriod)).toEqual({
        period: octPeriod,
        income: 6_000_000,
        expense: 400_000,
        netCashFlow: 5_600_000,
        transactionCount: 2,
      });

      // Deleting a non-existent ID leaves the list and totals unchanged
      const afterMissingDelete = removeTransactionFromList(
        afterDeleteList,
        'tx-does-not-exist',
      );
      expect(afterMissingDelete).toEqual(afterDeleteList);

      // Replacing a non-existent ID throws an explicit error
      expect(() =>
        replaceTransactionInList(afterDeleteList, {
          ...updatedTx,
          id: 'tx-does-not-exist',
        }),
      ).toThrow(/tidak ditemukan untuk diperbarui/i);

      // Replacing in a list that has duplicate IDs throws an explicit error
      expect(() =>
        replaceTransactionInList([updatedTx, updatedTx], updatedTx),
      ).toThrow(/duplikasi transaksi/i);
    });

    it('handles multiple transactions on start/end boundary dates and deterministic tie-breaker sorting', () => {
      const octPeriod = getMonthPeriod(2026, 10);
      const boundaryTransactions: Transaction[] = [
        createTransaction(
          {
            id: 'tx-b-1',
            type: 'expense',
            amount: 50_000,
            categoryId: 'cat-exp-makanan',
            occurredAt: '2026-10-01',
            nowIso: '2026-10-01T08:00:00.000Z',
          },
          DEFAULT_CATEGORIES,
        ),
        createTransaction(
          {
            id: 'tx-b-2',
            type: 'expense',
            amount: 75_000,
            categoryId: 'cat-exp-transportasi',
            occurredAt: '2026-10-01',
            nowIso: '2026-10-01T08:00:00.000Z', // identical occurredAt and createdAt to test id tie-breaker
          },
          DEFAULT_CATEGORIES,
        ),
        createTransaction(
          {
            id: 'tx-b-3',
            type: 'income',
            amount: 300_000,
            categoryId: 'cat-inc-bonus',
            occurredAt: '2026-10-31',
            nowIso: '2026-10-31T09:00:00.000Z',
          },
          DEFAULT_CATEGORIES,
        ),
        createTransaction(
          {
            id: 'tx-b-4',
            type: 'expense',
            amount: 25_000,
            categoryId: 'cat-exp-kopi',
            occurredAt: '2026-10-31',
            nowIso: '2026-10-31T21:00:00.000Z',
          },
        ),
      ];

      const summary = calculatePeriodSummary(boundaryTransactions, octPeriod);
      expect(summary).toEqual({
        period: octPeriod,
        income: 300_000,
        expense: 150_000,
        netCashFlow: 150_000,
        transactionCount: 4,
      });

      const newest = sortTransactions(boundaryTransactions, 'newest');
      expect(newest.map((t) => t.id)).toEqual([
        'tx-b-4',
        'tx-b-3',
        'tx-b-2',
        'tx-b-1',
      ]);

      const oldest = sortTransactions(boundaryTransactions, 'oldest');
      expect(oldest.map((t) => t.id)).toEqual([
        'tx-b-1',
        'tx-b-2',
        'tx-b-3',
        'tx-b-4',
      ]);

      // Empty categories array passed to validateTransactionDraft rejects unknown categoryId
      expect(
        validateTransactionDraft(
          {
            id: 'tx-empty-cats',
            type: 'expense',
            amount: 10_000,
            categoryId: 'cat-exp-makanan',
            occurredAt: '2026-10-15',
          },
          [],
        ).valid,
      ).toBe(false);
    });

    it('filters by period, type, category, and keyword search, and sorts newest/oldest deterministically', () => {
      const octPeriod = getMonthPeriod(2026, 10);

      const octExpenses = filterTransactions(
        sampleTransactions,
        { period: octPeriod, type: 'expense' },
        DEFAULT_CATEGORIES,
      );
      expect(octExpenses.map((t) => t.id)).toEqual([
        'tx-oct-exp-1',
        'tx-oct-exp-2',
      ]);

      const searchByCategoryName = filterTransactions(
        sampleTransactions,
        { searchQuery: 'makanan' },
        DEFAULT_CATEGORIES,
      );
      expect(searchByCategoryName.map((t) => t.id)).toEqual(['tx-oct-exp-2']);

      const searchByNote = filterTransactions(
        sampleTransactions,
        { searchQuery: 'listrik' },
        DEFAULT_CATEGORIES,
      );
      expect(searchByNote.map((t) => t.id)).toEqual(['tx-oct-exp-1']);

      const newestFirst = sortTransactions(sampleTransactions, 'newest');
      expect(newestFirst.map((t) => t.id)).toEqual([
        'tx-oct-exp-2',
        'tx-oct-exp-1',
        'tx-oct-inc-1',
        'tx-sep-inc',
      ]);

      const oldestFirst = sortTransactions(sampleTransactions, 'oldest');
      expect(oldestFirst.map((t) => t.id)).toEqual([
        'tx-sep-inc',
        'tx-oct-inc-1',
        'tx-oct-exp-1',
        'tx-oct-exp-2',
      ]);

      expect(filterTransactionsByPeriod(sampleTransactions, octPeriod)).toHaveLength(3);
    });

    it('aggregates category totals in descending order and preserves archived category names', () => {
      const archivedFoodCategory = archiveCategory(
        DEFAULT_CATEGORIES.find((c) => c.id === 'cat-exp-makanan')!,
        '2026-11-01T00:00:00.000Z',
      );
      const categoriesWithArchived = DEFAULT_CATEGORIES.map((c) =>
        c.id === archivedFoodCategory.id ? archivedFoodCategory : c,
      );

      const octPeriod = getMonthPeriod(2026, 10);
      const expenseBreakdown = calculateCategoryTotals(
        sampleTransactions,
        categoriesWithArchived,
        { type: 'expense', period: octPeriod },
      );

      expect(expenseBreakdown).toEqual([
        {
          categoryId: 'cat-exp-tempat-tinggal',
          categoryName: 'Tempat Tinggal & Tagihan',
          type: 'expense',
          totalAmount: 1_500_000,
          transactionCount: 1,
          isArchived: false,
        },
        {
          categoryId: 'cat-exp-makanan',
          categoryName: 'Makanan & Minuman',
          type: 'expense',
          totalAmount: 250_000,
          transactionCount: 1,
          isArchived: true,
        },
      ]);

      expect(calculateIncomeAndExpenseTotals(sampleTransactions)).toEqual({
        totalIncome: 11_000_000,
        totalExpense: 1_750_000,
      });
    });
  });
});

