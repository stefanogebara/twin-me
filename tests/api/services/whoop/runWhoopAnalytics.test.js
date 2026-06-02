/**
 * Integration test for the dispatch path inside twinContextBuilder.js.
 *
 * twinContextBuilder is heavy — we don't import it directly. Instead we
 * import the parts the dispatch composes (detectWhoopIntent +
 * createWhoopClient + analytics tools + formatters) and assert they
 * cooperate. If this test passes but production is silent, the wiring
 * inside twinContextBuilder.js is the suspect.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));

import axios from 'axios';
import { detectWhoopIntent } from '../../../../api/services/whoop/detectIntent.js';
import { createWhoopClient } from '../../../../api/services/whoop/client.js';
import { resolveDateExpression } from '../../../../api/services/whoop/dateUtils.js';
import {
  getTrend,
  comparePeriods,
  getWeeklySummary,
} from '../../../../api/services/whoop/analytics/index.js';
import {
  formatTrend,
  formatCompare,
  formatWeekly,
} from '../../../../api/services/whoop/formatAnalytics.js';

// Same minimal record builders the upstream-port tests use.
function recovery(score) {
  return {
    cycle_id: 1,
    sleep_id: 's1',
    user_id: 100,
    created_at: '2026-05-26T06:00:00.000Z',
    updated_at: '2026-05-26T06:00:00.000Z',
    score_state: 'SCORED',
    score: {
      user_calibrating: false,
      recovery_score: score,
      resting_heart_rate: 55,
      hrv_rmssd_milli: 60,
      spo2_percentage: 98,
      skin_temp_celsius: 33,
    },
  };
}

const ax = (records) => ({ data: { records } });

// Mirror the runWhoopAnalytics dispatch from twinContextBuilder.js. If
// you change the wiring there, mirror it here.
async function runWhoopAnalytics(intent, accessToken) {
  if (!intent || intent.kind === 'snapshot' || intent.kind === null) return null;
  const client = createWhoopClient({ accessToken });
  if (intent.kind === 'trend') {
    const trend = await getTrend(client, { metric: intent.metric, days: intent.days });
    return { kind: 'trend', summary: formatTrend(trend) };
  }
  if (intent.kind === 'weekly') {
    const week = await getWeeklySummary(client, { week_start: intent.weekStart });
    return { kind: 'weekly', summary: formatWeekly(week) };
  }
  if (intent.kind === 'compare') {
    const a = resolveDateExpression(intent.periodA);
    const b = resolveDateExpression(intent.periodB);
    const cmp = await comparePeriods(client, {
      period_a_start: a.start,
      period_a_end: a.end,
      period_b_start: b.start,
      period_b_end: b.end,
    });
    return { kind: 'compare', summary: formatCompare(cmp) };
  }
  return null;
}

describe('runWhoopAnalytics dispatch', () => {
  beforeEach(() => {
    axios.get.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-28T12:00:00.000Z'));
  });

  it('routes a trend question to the recovery endpoint and returns a formatted summary', async () => {
    // detect → run → format, all glued together
    axios.get.mockResolvedValueOnce(ax([60, 65, 70, 75, 80].map(recovery)));

    const intent = detectWhoopIntent('how is my recovery trending over the last 14 days?');
    expect(intent.kind).toBe('trend');
    expect(intent.metric).toBe('recovery');
    expect(intent.days).toBe(14);

    const out = await runWhoopAnalytics(intent, 'tok-trend');
    expect(out.kind).toBe('trend');
    expect(out.summary).toMatch(/recovery score over the last 14 days: improving/);
    expect(out.summary).toContain('high confidence');
    expect(axios.get.mock.calls[0][0]).toContain('/v2/recovery');
    expect(axios.get.mock.calls[0][1].headers.Authorization).toBe('Bearer tok-trend');
  });

  it('routes a weekly question to all four endpoints and returns a weekly summary', async () => {
    axios.get.mockResolvedValue(ax([])); // empty responses are fine — formatter handles zero state
    const intent = detectWhoopIntent('how is my recovery this week');
    expect(intent.kind).toBe('weekly');
    const out = await runWhoopAnalytics(intent, 'tok-week');
    expect(out.kind).toBe('weekly');
    expect(out.summary).toMatch(/^Week \d{4}-\d{2}-\d{2}/);
    // Four endpoints fetched.
    expect(axios.get).toHaveBeenCalledTimes(4);
  });

  it('routes a compare question to 6 endpoints and emits a comparison string', async () => {
    // Sequence: period A recovery, sleep, cycle, then period B recovery, sleep, cycle.
    axios.get
      .mockResolvedValueOnce(ax([recovery(60), recovery(60)]))
      .mockResolvedValueOnce(ax([]))
      .mockResolvedValueOnce(ax([]))
      .mockResolvedValueOnce(ax([recovery(80), recovery(80)]))
      .mockResolvedValueOnce(ax([]))
      .mockResolvedValueOnce(ax([]));

    const intent = detectWhoopIntent('compare my recovery this week vs last week');
    expect(intent.kind).toBe('compare');

    const out = await runWhoopAnalytics(intent, 'tok-cmp');
    expect(out.kind).toBe('compare');
    expect(out.summary).toContain('recovery: 60.0 → 80.0 (improved');
    expect(axios.get).toHaveBeenCalledTimes(6);
  });

  it('returns null for snapshot intent (no analytics needed)', async () => {
    const intent = detectWhoopIntent('how is my recovery?');
    expect(intent.kind).toBe('snapshot');
    const out = await runWhoopAnalytics(intent, 'tok');
    expect(out).toBeNull();
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('returns null for non-Whoop messages', async () => {
    const intent = detectWhoopIntent('what should I make for dinner?');
    expect(intent.kind).toBeNull();
    const out = await runWhoopAnalytics(intent, 'tok');
    expect(out).toBeNull();
    expect(axios.get).not.toHaveBeenCalled();
  });
});
