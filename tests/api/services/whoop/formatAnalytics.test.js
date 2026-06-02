/**
 * Tests for whoop/formatAnalytics.js. These formatters are pure — given
 * the analytics output shape (see getTrend/comparePeriods/getWeeklySummary
 * tests for examples), they return prompt-ready strings.
 */

import { describe, it, expect } from 'vitest';
import { formatTrend, formatCompare, formatWeekly } from '../../../../api/services/whoop/formatAnalytics.js';

describe('formatTrend', () => {
  const baseTrend = {
    metric: 'recovery',
    period: { start: '2026-04-28T00:00:00.000Z', end: '2026-05-28T00:00:00.000Z', days: 30 },
    values: [70, 72, 75, 78, 80],
    statistics: { mean: 75, median: 75, std_dev: 4.05, min: 70, max: 80 },
    trend: { direction: 'improving', slope: 2.5, confidence: 'high' },
    anomalies: [],
  };

  it('returns null for null input', () => {
    expect(formatTrend(null)).toBeNull();
  });

  it('includes the metric label, direction, confidence, and slope', () => {
    const out = formatTrend(baseTrend);
    expect(out).toContain('recovery score');
    expect(out).toContain('over the last 30 days');
    expect(out).toContain('improving');
    expect(out).toContain('high confidence');
    expect(out).toContain('slope 2.50');
  });

  it('includes statistics summary', () => {
    const out = formatTrend(baseTrend);
    expect(out).toContain('mean 75.0');
    expect(out).toContain('median 75.0');
    expect(out).toContain('range 70.0–80.0');
    expect(out).toContain('σ 4.05');
  });

  it('mentions anomalies when present', () => {
    const out = formatTrend({
      ...baseTrend,
      anomalies: [{ date: '2026-05-12T06:00:00.000Z', value: 20, deviation_from_mean: 3.4 }],
    });
    expect(out).toContain('1 anomaly point');
    expect(out).toContain('20.0');
    expect(out).toContain('2026-05-12');
    expect(out).toContain('3.4σ');
  });

  it('uses human-readable label for sleep_performance', () => {
    const out = formatTrend({ ...baseTrend, metric: 'sleep_performance' });
    expect(out).toContain('sleep performance (%)');
  });

  it('uses human-readable label for hrv', () => {
    const out = formatTrend({ ...baseTrend, metric: 'hrv' });
    expect(out).toContain('HRV (ms)');
  });
});

describe('formatCompare', () => {
  const baseCmp = {
    period_a: { start: '2026-05-01T00:00:00.000Z', end: '2026-05-07T23:59:59.999Z', days: 7 },
    period_b: { start: '2026-05-08T00:00:00.000Z', end: '2026-05-14T23:59:59.999Z', days: 7 },
    recovery: { period_a_avg: 60, period_b_avg: 80, change_pct: 33.33, direction: 'improved' },
    sleep: { period_a_avg_hours: 7, period_b_avg_hours: 7.5, change_pct: 7.14, direction: 'improved' },
    strain: { period_a_avg: 10, period_b_avg: 15, change_pct: 50, direction: 'increased' },
  };

  it('returns null for null input', () => {
    expect(formatCompare(null)).toBeNull();
  });

  it('includes both period labels in YYYY-MM-DD form', () => {
    const out = formatCompare(baseCmp);
    expect(out).toContain('2026-05-01…2026-05-07');
    expect(out).toContain('2026-05-08…2026-05-14');
  });

  it('renders recovery / sleep / strain lines with direction tags', () => {
    const out = formatCompare(baseCmp);
    expect(out).toContain('recovery: 60.0 → 80.0 (improved, 33.3%)');
    expect(out).toContain('sleep: 7.0h → 7.5h (improved, 7.1%)');
    expect(out).toContain('strain: 10.0 → 15.0 (increased, 50.0%)');
  });
});

describe('formatWeekly', () => {
  const baseWeek = {
    week_start: '2026-05-25T00:00:00.000Z',
    week_end: '2026-05-31T23:59:59.999Z',
    recovery: { average_score: 72, min_score: 60, max_score: 85, average_hrv: 58, average_rhr: 53, trend: 'improving' },
    sleep: { average_duration_hours: 7.4, average_performance_pct: 82, average_efficiency_pct: 88 },
    workouts: { count: 3, total_strain: 30.5, total_calories_kj: 3100, sport_breakdown: { Running: 2, Cycling: 1 } },
    strain: { average_daily_strain: 12.1, max_daily_strain: 14.2 },
  };

  it('returns null for null input', () => {
    expect(formatWeekly(null)).toBeNull();
  });

  it('renders the week range', () => {
    const out = formatWeekly(baseWeek);
    expect(out).toContain('Week 2026-05-25 → 2026-05-31');
  });

  it('renders recovery aggregates and trend', () => {
    const out = formatWeekly(baseWeek);
    expect(out).toContain('recovery avg 72');
    expect(out).toContain('60–85');
    expect(out).toContain('trend improving');
    expect(out).toContain('HRV avg 58ms');
    expect(out).toContain('RHR avg 53bpm');
  });

  it('renders sleep aggregates', () => {
    const out = formatWeekly(baseWeek);
    expect(out).toContain('sleep avg 7.4h');
    expect(out).toContain('performance 82%');
    expect(out).toContain('efficiency 88%');
  });

  it('renders workout count + sport breakdown', () => {
    const out = formatWeekly(baseWeek);
    expect(out).toContain('3 workouts');
    expect(out).toContain('Running×2');
    expect(out).toContain('Cycling×1');
    expect(out).toContain('total strain 30.5');
    expect(out).toContain('3100kJ');
  });

  it('renders strain aggregates', () => {
    const out = formatWeekly(baseWeek);
    expect(out).toContain('daily strain avg 12.1');
    expect(out).toContain('max 14.2');
  });

  it('handles singular workout count', () => {
    const out = formatWeekly({ ...baseWeek, workouts: { ...baseWeek.workouts, count: 1, sport_breakdown: { Running: 1 } } });
    expect(out).toContain('1 workout (Running×1)');
  });

  it('appends a (partial) note when warnings present', () => {
    const out = formatWeekly({ ...baseWeek, warnings: ['sleep: 500'] });
    expect(out).toContain('partial: 1 endpoint unavailable');
  });
});
