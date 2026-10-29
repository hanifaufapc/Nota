import { parseLocalDateString } from './date';

const idrCurrencyFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const monthYearFormatter = new Intl.DateTimeFormat('id-ID', {
  month: 'long',
  year: 'numeric',
});

const shortDateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/**
 * Formats an integer IDR amount into standard Indonesian Rupiah representation (e.g. "Rp 0").
 * Throws on non-integer or unsafe numbers to enforce domain invariants at boundaries.
 */
export function formatIDR(amount: number): string {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError('Nominal IDR harus berupa bilangan bulat yang valid.');
  }
  return idrCurrencyFormatter.format(amount);
}

/**
 * Formats a signed integer IDR amount with explicit `+` or `−` prefix for non-zero values
 * (e.g., `0` -> `"Rp 0"`, `250000` -> `"+Rp 250.000"`, `-250000` -> `"−Rp 250.000"`).
 */
export function formatSignedIDR(amount: number): string {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError('Nominal IDR harus berupa bilangan bulat yang valid.');
  }
  if (amount === 0) {
    return formatIDR(0);
  }
  if (amount > 0) {
    return `+${formatIDR(amount)}`;
  }
  return `−${formatIDR(Math.abs(amount))}`;
}

/**
 * Formats a Date object as Indonesian month and year (e.g. "Oktober 2026").
 */
export function formatMonthYearID(date: Date): string {
  return monthYearFormatter.format(date);
}

/**
 * Formats a 1-indexed `{ year, month }` pair as Indonesian month and year (e.g. "Oktober 2026").
 */
export function formatYearMonthID(year: number, month: number): string {
  const d = new Date(0);
  d.setFullYear(year, month - 1, 1);
  d.setHours(0, 0, 0, 0);
  return monthYearFormatter.format(d);
}

/**
 * Formats a validated `YYYY-MM-DD` local date string into a readable Indonesian short date
 * (e.g., `"2026-10-27"` -> `"27 Okt 2026"`) without UTC timezone shift.
 */
export function formatLocalDateID(dateStr: string): string {
  const localDate = parseLocalDateString(dateStr);
  return shortDateFormatter.format(localDate);
}

/**
 * Formats an integer IDR value using Indonesian thousands separators without the "Rp" prefix
 * (e.g., `1500000` -> `"1.500.000"`), useful inside currency input fields.
 */
export function formatIdrDigits(amount: number): string {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    return '0';
  }
  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Parses a user-entered string of digits/dots into a non-negative integer IDR value.
 * Returns `null` if the input contains no digits or exceeds safe integer bounds.
 */
export function parseIdrInputDigits(raw: string): number | null {
  const digitsOnly = raw.replace(/\D/g, '');
  if (digitsOnly.length === 0) {
    return null;
  }
  const parsed = Number(digitsOnly);
  if (!Number.isSafeInteger(parsed)) {
    return null;
  }
  return parsed;
}


