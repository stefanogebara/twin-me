/**
 * Tests for whoop/dateUtils.js — ported from
 * shashankswe2020-ux/whoop-mcp tests/tools/date-utils.test.ts (MIT).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveDateExpression,
  validateDateRange,
  InvalidDateExpression,
} from '../../../../api/services/whoop/dateUtils.js';

const FIXED_NOW = new Date('2026-03-15T12:00:00.000Z');

describe('InvalidDateExpression', () => {
  it('extends Error', () => {
    const error = new InvalidDateExpression('bad input');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(InvalidDateExpression);
  });
  it("has name 'InvalidDateExpression'", () => {
    expect(new InvalidDateExpression('bad').name).toBe('InvalidDateExpression');
  });
  it('carries a descriptive message', () => {
    expect(new InvalidDateExpression('unrecognized: foo bar').message).toBe(
      'unrecognized: foo bar',
    );
  });
});

describe('resolveDateExpression', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes through ISO 8601 date-time strings unchanged', () => {
    const iso = '2026-01-15T00:00:00.000Z';
    expect(resolveDateExpression(iso)).toEqual({ start: iso, end: iso });
  });
  it('passes through ISO 8601 date-only strings unchanged', () => {
    const iso = '2026-01-15';
    expect(resolveDateExpression(iso)).toEqual({ start: iso, end: iso });
  });
  it('passes through ISO 8601 with timezone offset', () => {
    const iso = '2026-01-15T08:30:00+05:30';
    expect(resolveDateExpression(iso)).toEqual({ start: iso, end: iso });
  });

  it('resolves "today" to current day UTC boundaries', () => {
    const r = resolveDateExpression('today');
    expect(r.start).toBe('2026-03-15T00:00:00.000Z');
    expect(r.end).toBe('2026-03-15T23:59:59.999Z');
  });
  it('resolves "Today" (case-insensitive)', () => {
    const r = resolveDateExpression('Today');
    expect(r.start).toBe('2026-03-15T00:00:00.000Z');
    expect(r.end).toBe('2026-03-15T23:59:59.999Z');
  });

  it('resolves "yesterday" to previous day UTC boundaries', () => {
    const r = resolveDateExpression('yesterday');
    expect(r.start).toBe('2026-03-14T00:00:00.000Z');
    expect(r.end).toBe('2026-03-14T23:59:59.999Z');
  });

  it('resolves "last 7 days" to 7-day range ending now', () => {
    const r = resolveDateExpression('last 7 days');
    expect(r.start).toBe('2026-03-08T00:00:00.000Z');
    expect(r.end).toBe('2026-03-15T23:59:59.999Z');
  });
  it('resolves "last 1 days" to single day range', () => {
    const r = resolveDateExpression('last 1 days');
    expect(r.start).toBe('2026-03-14T00:00:00.000Z');
    expect(r.end).toBe('2026-03-15T23:59:59.999Z');
  });
  it('resolves "last 1 day" (singular) to single day range', () => {
    const r = resolveDateExpression('last 1 day');
    expect(r.start).toBe('2026-03-14T00:00:00.000Z');
    expect(r.end).toBe('2026-03-15T23:59:59.999Z');
  });
  it('resolves "Last 30 Days" (case-insensitive)', () => {
    const r = resolveDateExpression('Last 30 Days');
    expect(r.start).toBe('2026-02-13T00:00:00.000Z');
    expect(r.end).toBe('2026-03-15T23:59:59.999Z');
  });
  it('resolves "last 365 days" (maximum allowed)', () => {
    const r = resolveDateExpression('last 365 days');
    expect(r.start).toBe('2025-03-15T00:00:00.000Z');
    expect(r.end).toBe('2026-03-15T23:59:59.999Z');
  });
  it('throws for "last 366 days" (exceeds 365 limit)', () => {
    expect(() => resolveDateExpression('last 366 days')).toThrow(InvalidDateExpression);
    expect(() => resolveDateExpression('last 366 days')).toThrow(/exceeds maximum/i);
  });
  it('throws for "last 0 days"', () => {
    expect(() => resolveDateExpression('last 0 days')).toThrow(InvalidDateExpression);
  });
  it('throws for "last -5 days"', () => {
    expect(() => resolveDateExpression('last -5 days')).toThrow(InvalidDateExpression);
  });

  it('resolves "this week" to Monday 00:00 UTC to now', () => {
    const r = resolveDateExpression('this week');
    expect(r.start).toBe('2026-03-09T00:00:00.000Z');
    expect(r.end).toBe('2026-03-15T23:59:59.999Z');
  });
  it('resolves "this week" when today is Monday', () => {
    vi.setSystemTime(new Date('2026-03-09T10:00:00.000Z'));
    const r = resolveDateExpression('this week');
    expect(r.start).toBe('2026-03-09T00:00:00.000Z');
    expect(r.end).toBe('2026-03-09T23:59:59.999Z');
  });

  it('resolves "last week" to previous Monday–Sunday', () => {
    const r = resolveDateExpression('last week');
    expect(r.start).toBe('2026-03-02T00:00:00.000Z');
    expect(r.end).toBe('2026-03-08T23:59:59.999Z');
  });

  it('resolves "this month" to 1st of month to today end-of-day', () => {
    const r = resolveDateExpression('this month');
    expect(r.start).toBe('2026-03-01T00:00:00.000Z');
    expect(r.end).toBe('2026-03-15T23:59:59.999Z');
  });

  it('resolves "last month" to full previous month', () => {
    const r = resolveDateExpression('last month');
    expect(r.start).toBe('2026-02-01T00:00:00.000Z');
    expect(r.end).toBe('2026-02-28T23:59:59.999Z');
  });
  it('resolves "last month" correctly for January (wraps to December)', () => {
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
    const r = resolveDateExpression('last month');
    expect(r.start).toBe('2025-12-01T00:00:00.000Z');
    expect(r.end).toBe('2025-12-31T23:59:59.999Z');
  });

  it('handles leap year February correctly', () => {
    vi.setSystemTime(new Date('2024-03-15T12:00:00.000Z'));
    const r = resolveDateExpression('last month');
    expect(r.start).toBe('2024-02-01T00:00:00.000Z');
    expect(r.end).toBe('2024-02-29T23:59:59.999Z');
  });
  it('"last 365 days" starting from Feb 29 leap year works', () => {
    vi.setSystemTime(new Date('2024-02-29T12:00:00.000Z'));
    const r = resolveDateExpression('last 365 days');
    expect(r.start).toBe('2023-03-01T00:00:00.000Z');
    expect(r.end).toBe('2024-02-29T23:59:59.999Z');
  });

  it('resolves "last 2 weeks" to 14 days back from now', () => {
    const r = resolveDateExpression('last 2 weeks');
    expect(r.start).toBe('2026-03-01T00:00:00.000Z');
    expect(r.end).toBe('2026-03-15T23:59:59.999Z');
  });
  it('resolves "last 1 week" (singular)', () => {
    const r = resolveDateExpression('last 1 week');
    expect(r.start).toBe('2026-03-08T00:00:00.000Z');
    expect(r.end).toBe('2026-03-15T23:59:59.999Z');
  });
  it('resolves "Last 4 Weeks" (case-insensitive)', () => {
    const r = resolveDateExpression('Last 4 Weeks');
    expect(r.start).toBe('2026-02-15T00:00:00.000Z');
    expect(r.end).toBe('2026-03-15T23:59:59.999Z');
  });
  it('resolves "last 52 weeks" (maximum)', () => {
    const r = resolveDateExpression('last 52 weeks');
    expect(r.start).toBe('2025-03-16T00:00:00.000Z');
    expect(r.end).toBe('2026-03-15T23:59:59.999Z');
  });
  it('throws for "last 53 weeks"', () => {
    expect(() => resolveDateExpression('last 53 weeks')).toThrow(InvalidDateExpression);
    expect(() => resolveDateExpression('last 53 weeks')).toThrow(/exceeds maximum/i);
  });
  it('throws for "last 0 weeks"', () => {
    expect(() => resolveDateExpression('last 0 weeks')).toThrow(InvalidDateExpression);
  });

  it('resolves "last 3 months" to 3 calendar months back', () => {
    const r = resolveDateExpression('last 3 months');
    expect(r.start).toBe('2025-12-15T00:00:00.000Z');
    expect(r.end).toBe('2026-03-15T23:59:59.999Z');
  });
  it('resolves "last 1 month" (singular)', () => {
    const r = resolveDateExpression('last 1 month');
    expect(r.start).toBe('2026-02-15T00:00:00.000Z');
    expect(r.end).toBe('2026-03-15T23:59:59.999Z');
  });
  it('resolves "Last 6 Months" (case-insensitive)', () => {
    const r = resolveDateExpression('Last 6 Months');
    expect(r.start).toBe('2025-09-15T00:00:00.000Z');
    expect(r.end).toBe('2026-03-15T23:59:59.999Z');
  });
  it('resolves "last 12 months" (maximum)', () => {
    const r = resolveDateExpression('last 12 months');
    expect(r.start).toBe('2025-03-15T00:00:00.000Z');
    expect(r.end).toBe('2026-03-15T23:59:59.999Z');
  });
  it('throws for "last 13 months"', () => {
    expect(() => resolveDateExpression('last 13 months')).toThrow(InvalidDateExpression);
    expect(() => resolveDateExpression('last 13 months')).toThrow(/exceeds maximum/i);
  });
  it('throws for "last 0 months"', () => {
    expect(() => resolveDateExpression('last 0 months')).toThrow(InvalidDateExpression);
  });

  it('"last 1 month" on March 31 handles February overflow', () => {
    vi.setSystemTime(new Date('2026-03-31T12:00:00.000Z'));
    const r = resolveDateExpression('last 1 month');
    expect(r.start).toBe('2026-02-28T00:00:00.000Z');
    expect(r.end).toBe('2026-03-31T23:59:59.999Z');
  });
  it('"last 1 month" on Jan 31 wraps to Dec 31', () => {
    vi.setSystemTime(new Date('2026-01-31T12:00:00.000Z'));
    const r = resolveDateExpression('last 1 month');
    expect(r.start).toBe('2025-12-31T00:00:00.000Z');
    expect(r.end).toBe('2026-01-31T23:59:59.999Z');
  });

  it('resolves "this quarter" in Q1 (March)', () => {
    const r = resolveDateExpression('this quarter');
    expect(r.start).toBe('2026-01-01T00:00:00.000Z');
    expect(r.end).toBe('2026-03-15T23:59:59.999Z');
  });
  it('resolves "this quarter" in Q2 (May)', () => {
    vi.setSystemTime(new Date('2026-05-20T12:00:00.000Z'));
    const r = resolveDateExpression('this quarter');
    expect(r.start).toBe('2026-04-01T00:00:00.000Z');
    expect(r.end).toBe('2026-05-20T23:59:59.999Z');
  });
  it('resolves "this quarter" in Q3 (August)', () => {
    vi.setSystemTime(new Date('2026-08-01T12:00:00.000Z'));
    const r = resolveDateExpression('this quarter');
    expect(r.start).toBe('2026-07-01T00:00:00.000Z');
    expect(r.end).toBe('2026-08-01T23:59:59.999Z');
  });
  it('resolves "this quarter" in Q4 (November)', () => {
    vi.setSystemTime(new Date('2026-11-10T12:00:00.000Z'));
    const r = resolveDateExpression('this quarter');
    expect(r.start).toBe('2026-10-01T00:00:00.000Z');
    expect(r.end).toBe('2026-11-10T23:59:59.999Z');
  });
  it('resolves "This Quarter" (case-insensitive)', () => {
    const r = resolveDateExpression('This Quarter');
    expect(r.start).toBe('2026-01-01T00:00:00.000Z');
    expect(r.end).toBe('2026-03-15T23:59:59.999Z');
  });

  it('resolves "last quarter" from Q1 → Q4 of previous year', () => {
    const r = resolveDateExpression('last quarter');
    expect(r.start).toBe('2025-10-01T00:00:00.000Z');
    expect(r.end).toBe('2025-12-31T23:59:59.999Z');
  });
  it('resolves "last quarter" from Q2 → Q1', () => {
    vi.setSystemTime(new Date('2026-05-20T12:00:00.000Z'));
    const r = resolveDateExpression('last quarter');
    expect(r.start).toBe('2026-01-01T00:00:00.000Z');
    expect(r.end).toBe('2026-03-31T23:59:59.999Z');
  });
  it('resolves "last quarter" from Q3 → Q2', () => {
    vi.setSystemTime(new Date('2026-08-01T12:00:00.000Z'));
    const r = resolveDateExpression('last quarter');
    expect(r.start).toBe('2026-04-01T00:00:00.000Z');
    expect(r.end).toBe('2026-06-30T23:59:59.999Z');
  });
  it('resolves "last quarter" from Q4 → Q3', () => {
    vi.setSystemTime(new Date('2026-11-10T12:00:00.000Z'));
    const r = resolveDateExpression('last quarter');
    expect(r.start).toBe('2026-07-01T00:00:00.000Z');
    expect(r.end).toBe('2026-09-30T23:59:59.999Z');
  });

  it('resolves "last year" to full previous calendar year', () => {
    const r = resolveDateExpression('last year');
    expect(r.start).toBe('2025-01-01T00:00:00.000Z');
    expect(r.end).toBe('2025-12-31T23:59:59.999Z');
  });
  it('resolves "Last Year" (case-insensitive)', () => {
    const r = resolveDateExpression('Last Year');
    expect(r.start).toBe('2025-01-01T00:00:00.000Z');
    expect(r.end).toBe('2025-12-31T23:59:59.999Z');
  });
  it('"last year" from Jan 1 2026 still returns 2025', () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const r = resolveDateExpression('last year');
    expect(r.start).toBe('2025-01-01T00:00:00.000Z');
    expect(r.end).toBe('2025-12-31T23:59:59.999Z');
  });

  it('resolves "2026-05" to full May 2026', () => {
    const r = resolveDateExpression('2026-05');
    expect(r.start).toBe('2026-05-01T00:00:00.000Z');
    expect(r.end).toBe('2026-05-31T23:59:59.999Z');
  });
  it('resolves "2026-02" to full February (non-leap)', () => {
    const r = resolveDateExpression('2026-02');
    expect(r.start).toBe('2026-02-01T00:00:00.000Z');
    expect(r.end).toBe('2026-02-28T23:59:59.999Z');
  });
  it('resolves "2024-02" to full February (leap year)', () => {
    const r = resolveDateExpression('2024-02');
    expect(r.start).toBe('2024-02-01T00:00:00.000Z');
    expect(r.end).toBe('2024-02-29T23:59:59.999Z');
  });
  it('resolves "2026-12" to full December', () => {
    const r = resolveDateExpression('2026-12');
    expect(r.start).toBe('2026-12-01T00:00:00.000Z');
    expect(r.end).toBe('2026-12-31T23:59:59.999Z');
  });
  it('resolves "2026-01" to full January', () => {
    const r = resolveDateExpression('2026-01');
    expect(r.start).toBe('2026-01-01T00:00:00.000Z');
    expect(r.end).toBe('2026-01-31T23:59:59.999Z');
  });
  it('does not match invalid month "2026-13"', () => {
    expect(() => resolveDateExpression('2026-13')).toThrow(InvalidDateExpression);
  });
  it('does not match invalid month "2026-00"', () => {
    expect(() => resolveDateExpression('2026-00')).toThrow(InvalidDateExpression);
  });

  it('throws InvalidDateExpression for unrecognized expressions', () => {
    expect(() => resolveDateExpression('next week')).toThrow(InvalidDateExpression);
    expect(() => resolveDateExpression('foo bar')).toThrow(InvalidDateExpression);
    expect(() => resolveDateExpression('')).toThrow(InvalidDateExpression);
  });
  it('throws InvalidDateExpression with descriptive message for unknown input', () => {
    expect(() => resolveDateExpression('random text')).toThrow(/unrecognized date expression/i);
  });
  it('throws for whitespace-only input', () => {
    expect(() => resolveDateExpression('   ')).toThrow(InvalidDateExpression);
  });
});

describe('validateDateRange', () => {
  it('does not throw for a valid range within maxDays', () => {
    expect(() =>
      validateDateRange('2026-03-01T00:00:00.000Z', '2026-03-10T23:59:59.999Z'),
    ).not.toThrow();
  });
  it('does not throw for exactly maxDays', () => {
    expect(() =>
      validateDateRange('2025-03-15T00:00:00.000Z', '2026-03-15T00:00:00.000Z', 365),
    ).not.toThrow();
  });
  it('throws InvalidDateExpression when range exceeds maxDays', () => {
    expect(() =>
      validateDateRange('2025-01-01T00:00:00.000Z', '2026-03-15T00:00:00.000Z', 365),
    ).toThrow(InvalidDateExpression);
    expect(() =>
      validateDateRange('2025-01-01T00:00:00.000Z', '2026-03-15T00:00:00.000Z', 365),
    ).toThrow(/exceeds maximum/i);
  });
  it('defaults maxDays to 365', () => {
    expect(() =>
      validateDateRange('2025-01-01T00:00:00.000Z', '2026-02-05T00:00:00.000Z'),
    ).toThrow(InvalidDateExpression);
  });
  it('accepts custom maxDays', () => {
    expect(() =>
      validateDateRange('2026-03-01T00:00:00.000Z', '2026-03-15T00:00:00.000Z', 90),
    ).not.toThrow();
  });
  it('throws for custom maxDays exceeded', () => {
    expect(() =>
      validateDateRange('2026-01-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z', 90),
    ).toThrow(InvalidDateExpression);
  });
  it('throws for end before start', () => {
    expect(() =>
      validateDateRange('2026-03-15T00:00:00.000Z', '2026-03-01T00:00:00.000Z'),
    ).toThrow(InvalidDateExpression);
    expect(() =>
      validateDateRange('2026-03-15T00:00:00.000Z', '2026-03-01T00:00:00.000Z'),
    ).toThrow(/end.*before.*start/i);
  });
  it('throws for unparseable date strings (NaN guard)', () => {
    expect(() => validateDateRange('not-a-date', '2026-03-15T00:00:00.000Z')).toThrow(
      InvalidDateExpression,
    );
    expect(() => validateDateRange('2026-03-01T00:00:00.000Z', 'garbage')).toThrow(
      InvalidDateExpression,
    );
    expect(() => validateDateRange('nope', 'nope')).toThrow(/invalid date string/i);
  });
});
