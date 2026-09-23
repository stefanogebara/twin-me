/**
 * Relative date parsing for Whoop analytics tools.
 *
 * Converts expressions like "today", "last 7 days", "this week" into ISO
 * 8601 start/end pairs that the Whoop v2 REST API accepts. Anything not
 * explicitly supported is rejected so the caller can surface the error to
 * the twin (which then re-prompts the user).
 *
 * All math is in UTC — Whoop is timezone-naive at the API surface, and
 * mixing local time would cause off-by-one days for east-of-UTC users.
 *
 * Ported from shashankswe2020-ux/whoop-mcp (MIT, Copyright (c) 2025 Shashank Mishra).
 * Original: src/tools/date-utils.ts. Logic preserved; types stripped.
 */

export class InvalidDateExpression extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidDateExpression';
  }
}

const MAX_LAST_N_DAYS = 365;
const MAX_LAST_N_WEEKS = 52;
const MAX_LAST_N_MONTHS = 12;

const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?)?$/;
const LAST_N_DAYS_REGEX = /^last\s+(\d+)\s+days?$/i;
const LAST_N_WEEKS_REGEX = /^last\s+(\d+)\s+weeks?$/i;
const LAST_N_MONTHS_REGEX = /^last\s+(\d+)\s+months?$/i;
const THIS_QUARTER_REGEX = /^this\s+quarter$/i;
const LAST_QUARTER_REGEX = /^last\s+quarter$/i;
const LAST_YEAR_REGEX = /^last\s+year$/i;
const MONTH_LITERAL_REGEX = /^(\d{4})-(0[1-9]|1[0-2])$/;

function startOfDayUTC(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return d.toISOString();
}

function endOfDayUTC(date) {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999),
  );
  return d.toISOString();
}

// ISO week (Monday-anchored). Sunday is the trailing day, not the first day.
function getMondayUTC(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

function lastDayOfMonthUTC(year, month) {
  // month is 0-indexed; day 0 of next month gives last day of current month.
  return new Date(Date.UTC(year, month + 1, 0));
}

/**
 * Resolve a date expression to an ISO 8601 start/end range.
 *
 * Supported (case-insensitive):
 *   - ISO 8601 string (pass-through, start === end)
 *   - "today" | "yesterday"
 *   - "last N days" (1..365)
 *   - "last N weeks" (1..52)
 *   - "last N months" (1..12)
 *   - "this week" | "last week"
 *   - "this month" | "last month"
 *   - "this quarter" | "last quarter"
 *   - "last year"
 *   - "YYYY-MM" calendar month literal
 *
 * @param {string} expression
 * @returns {{ start: string, end: string }}
 * @throws {InvalidDateExpression}
 */
export function resolveDateExpression(expression) {
  const trimmed = String(expression ?? '').trim();
  if (trimmed.length === 0) {
    throw new InvalidDateExpression('Unrecognized date expression: empty string');
  }

  if (ISO_8601_REGEX.test(trimmed)) {
    return { start: trimmed, end: trimmed };
  }

  const lower = trimmed.toLowerCase();
  const now = new Date();

  if (lower === 'today') {
    return { start: startOfDayUTC(now), end: endOfDayUTC(now) };
  }

  if (lower === 'yesterday') {
    const yesterday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
    );
    return { start: startOfDayUTC(yesterday), end: endOfDayUTC(yesterday) };
  }

  const lastNMatch = lower.match(LAST_N_DAYS_REGEX);
  if (lastNMatch?.[1]) {
    const n = parseInt(lastNMatch[1], 10);
    if (n <= 0) {
      throw new InvalidDateExpression(
        `Invalid day count: ${n}. Must be between 1 and ${MAX_LAST_N_DAYS}.`,
      );
    }
    if (n > MAX_LAST_N_DAYS) {
      throw new InvalidDateExpression(
        `Day count ${n} exceeds maximum of ${MAX_LAST_N_DAYS} days.`,
      );
    }
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n));
    return { start: startOfDayUTC(start), end: endOfDayUTC(now) };
  }

  if (lower === 'this week') {
    const monday = getMondayUTC(now);
    return { start: startOfDayUTC(monday), end: endOfDayUTC(now) };
  }

  if (lower === 'last week') {
    const thisMonday = getMondayUTC(now);
    const lastMonday = new Date(thisMonday);
    lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);
    const lastSunday = new Date(thisMonday);
    lastSunday.setUTCDate(lastSunday.getUTCDate() - 1);
    return { start: startOfDayUTC(lastMonday), end: endOfDayUTC(lastSunday) };
  }

  if (lower === 'this month') {
    const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { start: startOfDayUTC(firstOfMonth), end: endOfDayUTC(now) };
  }

  if (lower === 'last month') {
    const lastMonthYear =
      now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
    const lastMonthMonth = now.getUTCMonth() === 0 ? 11 : now.getUTCMonth() - 1;
    const firstOfLastMonth = new Date(Date.UTC(lastMonthYear, lastMonthMonth, 1));
    const endOfLastMonth = lastDayOfMonthUTC(lastMonthYear, lastMonthMonth);
    return { start: startOfDayUTC(firstOfLastMonth), end: endOfDayUTC(endOfLastMonth) };
  }

  const lastNWeeksMatch = lower.match(LAST_N_WEEKS_REGEX);
  if (lastNWeeksMatch?.[1]) {
    const n = parseInt(lastNWeeksMatch[1], 10);
    if (n <= 0) {
      throw new InvalidDateExpression(
        `Invalid week count: ${n}. Must be between 1 and ${MAX_LAST_N_WEEKS}.`,
      );
    }
    if (n > MAX_LAST_N_WEEKS) {
      throw new InvalidDateExpression(
        `Week count ${n} exceeds maximum of ${MAX_LAST_N_WEEKS} weeks.`,
      );
    }
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n * 7),
    );
    return { start: startOfDayUTC(start), end: endOfDayUTC(now) };
  }

  const lastNMonthsMatch = lower.match(LAST_N_MONTHS_REGEX);
  if (lastNMonthsMatch?.[1]) {
    const n = parseInt(lastNMonthsMatch[1], 10);
    if (n <= 0) {
      throw new InvalidDateExpression(
        `Invalid month count: ${n}. Must be between 1 and ${MAX_LAST_N_MONTHS}.`,
      );
    }
    if (n > MAX_LAST_N_MONTHS) {
      throw new InvalidDateExpression(
        `Month count ${n} exceeds maximum of ${MAX_LAST_N_MONTHS} months.`,
      );
    }
    // Clamp to last valid day so "last 1 month" from Mar 31 → Feb 28/29.
    const targetYear = now.getUTCFullYear();
    const targetMonth = now.getUTCMonth() - n;
    const targetDay = now.getUTCDate();
    const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    const clampedDay = Math.min(targetDay, lastDay);
    const start = new Date(Date.UTC(targetYear, targetMonth, clampedDay));
    return { start: startOfDayUTC(start), end: endOfDayUTC(now) };
  }

  if (THIS_QUARTER_REGEX.test(lower)) {
    const quarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
    const quarterStart = new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth, 1));
    return { start: startOfDayUTC(quarterStart), end: endOfDayUTC(now) };
  }

  if (LAST_QUARTER_REGEX.test(lower)) {
    const currentQuarter = Math.floor(now.getUTCMonth() / 3);
    let qStartMonth;
    let qYear;
    if (currentQuarter === 0) {
      qStartMonth = 9; // Q4 of previous year starts in October
      qYear = now.getUTCFullYear() - 1;
    } else {
      qStartMonth = (currentQuarter - 1) * 3;
      qYear = now.getUTCFullYear();
    }
    const qEndMonth = qStartMonth + 2;
    const quarterStart = new Date(Date.UTC(qYear, qStartMonth, 1));
    const quarterEnd = lastDayOfMonthUTC(qYear, qEndMonth);
    return { start: startOfDayUTC(quarterStart), end: endOfDayUTC(quarterEnd) };
  }

  if (LAST_YEAR_REGEX.test(lower)) {
    const lastYear = now.getUTCFullYear() - 1;
    const yearStart = new Date(Date.UTC(lastYear, 0, 1));
    const yearEnd = new Date(Date.UTC(lastYear, 11, 31));
    return { start: startOfDayUTC(yearStart), end: endOfDayUTC(yearEnd) };
  }

  const monthLiteralMatch = trimmed.match(MONTH_LITERAL_REGEX);
  if (monthLiteralMatch?.[1] && monthLiteralMatch[2]) {
    const year = parseInt(monthLiteralMatch[1], 10);
    const month = parseInt(monthLiteralMatch[2], 10) - 1;
    const monthStart = new Date(Date.UTC(year, month, 1));
    const monthEnd = lastDayOfMonthUTC(year, month);
    return { start: startOfDayUTC(monthStart), end: endOfDayUTC(monthEnd) };
  }

  throw new InvalidDateExpression(
    `Unrecognized date expression: "${trimmed}". ` +
      'Supported: "today", "yesterday", "last N days", "last N weeks", "last N months", ' +
      '"this week", "last week", "this month", "last month", "this quarter", "last quarter", ' +
      '"last year", "YYYY-MM", or ISO 8601.',
  );
}

/**
 * Reject ranges that are inverted or wider than maxDays.
 *
 * Whoop's collection endpoints will happily accept a year-wide span and
 * return paginated results forever — the guard is for *our* sanity (token
 * budget, latency) not theirs.
 *
 * @param {string} start ISO 8601
 * @param {string} end ISO 8601
 * @param {number} [maxDays=365]
 * @throws {InvalidDateExpression}
 */
export function validateDateRange(start, end, maxDays = 365) {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    throw new InvalidDateExpression(
      `Invalid date string: start="${start}", end="${end}". Expected ISO 8601 format.`,
    );
  }

  if (endMs < startMs) {
    throw new InvalidDateExpression(`End date is before start date: ${end} < ${start}`);
  }

  const diffDays = (endMs - startMs) / (1000 * 60 * 60 * 24);
  if (diffDays > maxDays) {
    throw new InvalidDateExpression(
      `Date range of ${Math.ceil(diffDays)} days exceeds maximum of ${maxDays} days.`,
    );
  }
}
