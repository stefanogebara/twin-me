/**
 * GOAL: Vercel cost rules stay enforced in config (the $375 incident, March 2026).
 * =================================================================================
 * The two rules that actually caused the bill:
 *   1. No cron more frequent than every 15 minutes.
 *   2. maxDuration stays at or below 60s.
 *
 * This pins vercel.json itself, so the regression is caught in the PR that
 * introduces it — not on the invoice. Parser is deliberately FAIL-CLOSED:
 * a minute field it can't prove safe fails the goal and forces a human look,
 * which is exactly the review the cost rules demand for exotic schedules.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const vercelJson = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'));

/**
 * Minimum firing interval (minutes) provable from a cron minute field.
 * Returns a number of minutes, or -1 when the field can't be proven safe.
 */
function minIntervalMinutes(minuteField) {
  if (minuteField === '*') return 1; // every minute
  // Step syntax: "*/N" or "a-b/N" — the step IS the interval floor.
  const step = minuteField.match(/^(?:\*|\d+-\d+)\/(\d+)$/);
  if (step) return Number(step[1]);
  // Plain list of minutes: "0" or "0,30" — min gap around the hour wheel.
  if (/^\d+(,\d+)*$/.test(minuteField)) {
    const mins = [...new Set(minuteField.split(',').map(Number))].sort((a, b) => a - b);
    if (mins.length === 1) return 60;
    const gaps = mins.slice(1).map((m, i) => m - mins[i]);
    gaps.push(60 - mins[mins.length - 1] + mins[0]); // wraparound
    return Math.min(...gaps);
  }
  return -1; // ranges without step, or anything else: not provably safe
}

describe('goal: vercel cost rules', () => {
  it('no cron fires more often than every 15 minutes', () => {
    const offenders = [];
    for (const cron of vercelJson.crons || []) {
      const minuteField = cron.schedule.trim().split(/\s+/)[0];
      const interval = minIntervalMinutes(minuteField);
      if (interval < 15) {
        offenders.push({ path: cron.path, schedule: cron.schedule, provenIntervalMin: interval });
      }
    }
    expect(offenders, `cost rule: crons must be >= */15 (unprovable fields fail closed): ${JSON.stringify(offenders)}`).toEqual([]);
  });

  it('every function maxDuration is <= 60s', () => {
    const over = Object.entries(vercelJson.functions || {})
      .filter(([, cfg]) => (cfg.maxDuration ?? 0) > 60)
      .map(([fn, cfg]) => ({ fn, maxDuration: cfg.maxDuration }));
    expect(over).toEqual([]);
  });

  it('every cron routes through /api/cron/ (auth-gated by CRON_SECRET middleware)', () => {
    const stray = (vercelJson.crons || []).filter((c) => !c.path.startsWith('/api/cron/'));
    expect(stray).toEqual([]);
  });
});
