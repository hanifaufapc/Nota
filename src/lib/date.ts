/**
 * Local date-only (`YYYY-MM-DD`) and period boundary utilities.
 *
 * Source of truth: PRD.md §7.6 & ARCHITECTURE.md §4:
 * - Store occurrence dates as local date-only strings (`YYYY-MM-DD`) so UTC offsets
 *   never shift a transaction into the previous or next calendar day.
 * - Period filters are inclusive of both startDate and endDate (`startDate <= occurredAt <= endDate`).
 */

const LOCAL_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface DateRangePeriod {
  /** Inclusive start date in `YYYY-MM-DD` format */
  startDate: string;
  /** Inclusive end date in `YYYY-MM-DD` format */
  endDate: string;
}

/**
 * Validates that a string is a real calendar date in `YYYY-MM-DD` format
 * (e.g., rejects `"2026-02-30"`, `"2026-13-01"`, or ISO timestamps with time components).
 */
export function isValidLocalDateString(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const match = LOCAL_DATE_REGEX.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1) {
    return false;
  }

  const maxDays = getDaysInMonth(year, month);
  return day <= maxDays;
}

/**
 * Returns the number of days in a 1-indexed month (`1` = January, `12` = December) for a given year.
 */
export function getDaysInMonth(year: number, month: number): number {
  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    year > 2100 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new RangeError(
      'Tahun (1900-2100) dan bulan (1-12) harus berupa bilangan bulat yang valid.',
    );
  }
  const d = new Date(0);
  d.setFullYear(year, month, 0);
  d.setHours(0, 0, 0, 0);
  return d.getDate();
}

/**
 * Converts a local `Date` instance into a `YYYY-MM-DD` string using local calendar fields
 * (`getFullYear`, `getMonth`, `getDate`), avoiding UTC shift.
 */
export function toLocalDateString(date: Date = new Date()): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new RangeError('Objek Date tidak valid.');
  }
  const year = date.getFullYear();
  if (year < 1900 || year > 2100) {
    throw new RangeError('Tahun pada objek Date harus berada di antara 1900 dan 2100.');
  }
  const y = String(year).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${month}-${day}`;
}

/**
 * Parses a validated `YYYY-MM-DD` string into a local `Date` at local midnight (`00:00:00`).
 */
export function parseLocalDateString(dateStr: string): Date {
  if (!isValidLocalDateString(dateStr)) {
    throw new RangeError(`Tanggal "${dateStr}" harus berformat YYYY-MM-DD yang valid.`);
  }
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const d = new Date(0);
  d.setFullYear(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Returns the inclusive `YYYY-MM-DD` start and end dates for a given calendar year and 1-indexed month (`1`–`12`).
 */
export function getMonthPeriod(year: number, month: number): DateRangePeriod {
  const days = getDaysInMonth(year, month);
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  const d = String(days).padStart(2, '0');

  return {
    startDate: `${y}-${m}-01`,
    endDate: `${y}-${m}-${d}`,
  };
}

/**
 * Returns the inclusive `YYYY-MM-DD` period for the calendar month of the given `Date` (defaults to today).
 */
export function getCurrentMonthPeriod(referenceDate: Date = new Date()): DateRangePeriod {
  return getMonthPeriod(referenceDate.getFullYear(), referenceDate.getMonth() + 1);
}

export interface YearMonth {
  year: number;
  /** 1-indexed month (`1` = January, `12` = December) */
  month: number;
}

/**
 * Shifts a `{ year, month }` pair by `deltaMonths` (positive or negative) and clamps/validates
 * within supported calendar years (`1900`–`2100`).
 */
export function shiftYearMonth(current: YearMonth, deltaMonths: number): YearMonth {
  if (!Number.isInteger(deltaMonths)) {
    throw new RangeError('Perubahan bulan harus berupa bilangan bulat.');
  }
  const totalMonths = current.year * 12 + (current.month - 1) + deltaMonths;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonth = (totalMonths % 12 + 12) % 12 + 1;

  if (nextYear < 1900 || nextYear > 2100) {
    throw new RangeError('Tahun periode harus berada di antara 1900 dan 2100.');
  }

  return { year: nextYear, month: nextMonth };
}

/**
 * Validates that a `DateRangePeriod` has valid `YYYY-MM-DD` boundaries and `startDate <= endDate`.
 */
export function isValidDateRangePeriod(period: unknown): period is DateRangePeriod {
  if (!period || typeof period !== 'object') {
    return false;
  }
  const candidate = period as Record<string, unknown>;
  if (
    !isValidLocalDateString(candidate.startDate) ||
    !isValidLocalDateString(candidate.endDate)
  ) {
    return false;
  }
  return candidate.startDate <= candidate.endDate;
}

/**
 * Checks if a transaction's `occurredAt` (`YYYY-MM-DD`) falls inclusively within `period`.
 * Throws if either the date or period is invalid so caller bugs are never silently ignored.
 */
export function isDateWithinPeriod(occurredAt: string, period: DateRangePeriod): boolean {
  if (!isValidLocalDateString(occurredAt)) {
    throw new RangeError(`Tanggal transaksi "${occurredAt}" tidak valid.`);
  }
  if (!isValidDateRangePeriod(period)) {
    const rawPeriod = period as Partial<DateRangePeriod> | undefined;
    throw new RangeError(
      `Periode tanggal (${rawPeriod?.startDate ?? ''} s/d ${rawPeriod?.endDate ?? ''}) tidak valid.`,
    );
  }
  return occurredAt >= period.startDate && occurredAt <= period.endDate;
}

/**
 * Shifts a `YYYY-MM-DD` local date string by `deltaDays` (positive or negative)
 * using local calendar arithmetic so daylight saving / UTC offsets never skew the day.
 */
export function shiftLocalDate(dateStr: string, deltaDays: number): string {
  if (!Number.isInteger(deltaDays)) {
    throw new RangeError('Perubahan hari harus berupa bilangan bulat.');
  }
  const d = parseLocalDateString(dateStr);
  d.setDate(d.getDate() + deltaDays);
  return toLocalDateString(d);
}

/**
 * Returns an inclusive rolling period of `days` ending on `endDateStr`
 * (e.g., `days = 7` for a 7-day / Friday-to-Friday Mosque Cash Report).
 */
export function getRollingDaysPeriod(
  endDateStr: string = toLocalDateString(new Date()),
  days: number = 7,
): DateRangePeriod {
  if (!Number.isInteger(days) || days < 1 || days > 366) {
    throw new RangeError('Jumlah hari rentang laporan harus antara 1 dan 366.');
  }
  const startDate = shiftLocalDate(endDateStr, -(days - 1));
  return {
    startDate,
    endDate: endDateStr,
  };
}

