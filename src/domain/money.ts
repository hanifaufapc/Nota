/**
 * Domain rules for Rupiah (IDR) monetary values.
 *
 * Source of truth: PRD.md §6, §7 & ARCHITECTURE.md §4:
 * - All monetary values are stored as integer IDR.
 * - Transaction amounts must be positive integers (> 0).
 * - Opening balance is a non-negative integer IDR (>= 0) per PRD.md §6 (`openingBalance: bilangan bulat Rupiah, boleh nol`).
 * - Current balance (`openingBalance + income - expense`) and net cash flow may legitimately be negative when expenses exceed available funds.
 */

/** Maximum reasonable IDR amount to guard against overflow before Number.MAX_SAFE_INTEGER (Rp 1.000.000.000.000.000 = 1 quadrillion IDR). */
export const MAX_IDR_AMOUNT = 1_000_000_000_000_000;

/**
 * Checks whether a value is a safe integer IDR amount within reasonable bounds.
 */
export function isSafeIdrInteger(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    Math.abs(value) <= MAX_IDR_AMOUNT
  );
}

/**
 * Checks whether a value is a valid positive transaction amount (> 0, safe integer IDR).
 */
export function isValidTransactionAmount(value: unknown): value is number {
  return isSafeIdrInteger(value) && value > 0;
}

/**
 * Checks whether a value is a valid opening balance (>= 0, safe integer IDR).
 * Per PRD.md §6: `openingBalance`: bilangan bulat Rupiah, boleh nol.
 */
export function isValidOpeningBalance(value: unknown): value is number {
  return isSafeIdrInteger(value) && value >= 0;
}

/**
 * Asserts that a transaction amount is a valid positive integer IDR.
 */
export function assertTransactionAmount(amount: unknown): number {
  if (!isValidTransactionAmount(amount)) {
    throw new RangeError(
      'Nominal transaksi harus berupa bilangan bulat Rupiah lebih besar dari 0.',
    );
  }
  return amount;
}

/**
 * Asserts that an opening balance is a valid non-negative integer IDR (>= 0).
 */
export function assertOpeningBalance(balance: unknown): number {
  if (!isValidOpeningBalance(balance)) {
    throw new RangeError(
      'Saldo awal harus berupa bilangan bulat Rupiah (0 atau lebih besar).',
    );
  }
  return balance;
}

/**
 * Safely adds two integer IDR values and verifies no precision loss or overflow occurs.
 */
export function addIdr(a: number, b: number): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) {
    throw new RangeError('Operasi nominal Rupiah wajib menggunakan bilangan bulat.');
  }
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) {
    throw new RangeError('Total nominal Rupiah melebihi batas aman bilangan bulat.');
  }
  return sum;
}

