/**
 * Format analytics tool output as compact text for the twin's system prompt.
 *
 * The twin sees this as part of the WHOOP context section, so the
 * formatters aim for one-line-per-fact density — no JSON, no headings,
 * just sentences a downstream LLM can read and quote.
 *
 * Each formatter returns a string OR null (null means "don't emit a
 * section, the data was uninteresting").
 */

function fmtNum(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Number(n).toFixed(digits);
}

function fmtInt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return String(Math.round(n));
}

// "recovery", "hrv", "rhr", "sleep_duration", "sleep_performance", "strain" →
// human-readable label for the twin's prose.
const METRIC_LABELS = {
  recovery: 'recovery score',
  hrv: 'HRV (ms)',
  rhr: 'resting heart rate (bpm)',
  sleep_duration: 'sleep duration (hours)',
  sleep_performance: 'sleep performance (%)',
  strain: 'daily strain',
};

/**
 * @param {object} trend  Output of analytics/getTrend.js
 * @returns {string}
 */
export function formatTrend(trend) {
  if (!trend) return null;
  const label = METRIC_LABELS[trend.metric] ?? trend.metric;
  const days = trend.period?.days ?? '?';
  const s = trend.statistics ?? {};
  const t = trend.trend ?? {};

  // Headline + statistics, then trend verdict, then anomaly count if any.
  // No raw arrays — the twin doesn't need every value.
  const parts = [
    `${label} over the last ${days} days: ${t.direction ?? 'stable'} (${t.confidence ?? 'low'} confidence, slope ${fmtNum(t.slope, 2)}).`,
    `mean ${fmtNum(s.mean)}, median ${fmtNum(s.median)}, range ${fmtNum(s.min)}–${fmtNum(s.max)}, σ ${fmtNum(s.std_dev, 2)}.`,
  ];
  if (Array.isArray(trend.anomalies) && trend.anomalies.length > 0) {
    const top = trend.anomalies[0];
    const when = top.date && top.date !== 'unknown' ? top.date.slice(0, 10) : 'unknown';
    parts.push(
      `${trend.anomalies.length} anomaly point${trend.anomalies.length > 1 ? 's' : ''} (most extreme: ${fmtNum(top.value)} on ${when}, ${fmtNum(top.deviation_from_mean, 1)}σ).`,
    );
  }
  return parts.join(' ');
}

/**
 * @param {object} cmp  Output of analytics/comparePeriods.js
 * @returns {string}
 */
export function formatCompare(cmp) {
  if (!cmp) return null;
  const a = cmp.period_a ?? {};
  const b = cmp.period_b ?? {};
  const aLabel = `${a.start?.slice(0, 10) ?? '?'}…${a.end?.slice(0, 10) ?? '?'}`;
  const bLabel = `${b.start?.slice(0, 10) ?? '?'}…${b.end?.slice(0, 10) ?? '?'}`;

  const line = (name, x, suffix = '') => {
    const av = fmtNum(x.period_a_avg ?? x.period_a_avg_hours);
    const bv = fmtNum(x.period_b_avg ?? x.period_b_avg_hours);
    const pct = fmtNum(x.change_pct, 1);
    return `${name}: ${av}${suffix} → ${bv}${suffix} (${x.direction}, ${pct}%)`;
  };

  return [
    `Comparing ${aLabel} (A) vs ${bLabel} (B).`,
    line('recovery', cmp.recovery),
    line('sleep', cmp.sleep, 'h'),
    line('strain', cmp.strain),
  ].join(' ');
}

/**
 * @param {object} week  Output of analytics/getWeeklySummary.js
 * @returns {string}
 */
export function formatWeekly(week) {
  if (!week) return null;
  const start = week.week_start?.slice(0, 10) ?? '?';
  const end = week.week_end?.slice(0, 10) ?? '?';
  const r = week.recovery ?? {};
  const s = week.sleep ?? {};
  const w = week.workouts ?? {};
  const st = week.strain ?? {};

  const sports = Object.entries(w.sport_breakdown ?? {})
    .map(([name, count]) => `${name}×${count}`)
    .join(', ');

  const parts = [
    `Week ${start} → ${end}:`,
    `recovery avg ${fmtInt(r.average_score)} (range ${fmtInt(r.min_score)}–${fmtInt(r.max_score)}, trend ${r.trend ?? 'stable'}); HRV avg ${fmtInt(r.average_hrv)}ms, RHR avg ${fmtInt(r.average_rhr)}bpm.`,
    `sleep avg ${fmtNum(s.average_duration_hours)}h, performance ${fmtInt(s.average_performance_pct)}%, efficiency ${fmtInt(s.average_efficiency_pct)}%.`,
    `${w.count ?? 0} workout${w.count === 1 ? '' : 's'}${sports ? ` (${sports})` : ''}, total strain ${fmtNum(w.total_strain)}, ${fmtInt(w.total_calories_kj)}kJ.`,
    `daily strain avg ${fmtNum(st.average_daily_strain)}, max ${fmtNum(st.max_daily_strain)}.`,
  ];
  if (Array.isArray(week.warnings) && week.warnings.length > 0) {
    parts.push(`(partial: ${week.warnings.length} endpoint${week.warnings.length > 1 ? 's' : ''} unavailable)`);
  }
  return parts.join(' ');
}
