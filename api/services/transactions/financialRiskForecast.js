/**
 * Financial Risk Forecast — pre-transaction nudge (Renan's "before it happens")
 * ===============================================================================
 * Computes a daily risk score by correlating the user's current biology +
 * calendar load with their historical impulse-spend pattern.
 *
 * Heuristic: "stress profile" = recovery_score < 40 OR sleep_score < 60.
 * On past stress-profile days the user tends to spend more in discretionary
 * categories. If today matches that profile, we issue a forecast.
 *
 * Output is deliberately cheap to compute (no LLM, pure SQL aggregation) so it
 * can be called on every Money page view without latency or cost concerns.
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from './../logger.js';

const log = createLogger('risk-forecast');

const WINDOW_DAYS = 90;
const RECOVERY_STRESS_THRESHOLD = 40;
const SLEEP_STRESS_THRESHOLD = 60;
const DISCRETIONARY = new Set([
  'food_delivery', 'shopping', 'entertainment', 'ride_sharing', 'clothing',
]);

function isStressProfile(rec, sleep) {
  if (rec !== null && rec !== undefined && rec < RECOVERY_STRESS_THRESHOLD) return true;
  if (sleep !== null && sleep !== undefined && sleep < SLEEP_STRESS_THRESHOLD) return true;
  return false;
}

/**
 * Latest known biology for the user — pulls the most recent Whoop / Oura
 * platform_data row. Returns null if no biometric signal available.
 */
async function getCurrentBiology(userId) {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('user_platform_data')
    .select('raw_data, extracted_at, platform')
    .eq('user_id', userId)
    .in('platform', ['whoop', 'oura'])
    .gte('extracted_at', since)
    .order('extracted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const d = data.raw_data || {};
  return {
    recovery: Number(d.recovery ?? d.recovery_score ?? d.recoveryScore) || null,
    sleep: Number(d.sleep_score ?? d.sleepScore ?? d.sleep_performance_percentage ?? d.sleep) || null,
    hrv: Number(d.hrv ?? d.hrv_score ?? d.hrvScore) || null,
    source: data.platform,
    at: data.extracted_at,
  };
}

/**
 * Historical split: on stress-profile days vs normal days, what's the average
 * daily discretionary outflow? Only counts days where both biometric and tx
 * rows exist.
 */
async function getHistoricalBaseline(userId) {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('user_transactions')
    .select(`
      amount, category, transaction_date, currency,
      emotional_context:transaction_emotional_context (
        recovery_score, sleep_score
      )
    `)
    .eq('user_id', userId)
    .lt('amount', 0)
    .gte('transaction_date', since);

  if (error) {
    log.warn(`baseline fetch failed user ${userId}: ${error.message}`);
    return null;
  }

  const rows = data || [];
  if (!rows.length) return null;

  // Group by day so we compute daily totals, not per-tx.
  const days = new Map();
  for (const t of rows) {
    const day = String(t.transaction_date).slice(0, 10);
    const ec = Array.isArray(t.emotional_context) ? t.emotional_context[0] : t.emotional_context;
    if (!days.has(day)) days.set(day, {
      outflow: 0,
      discretionary: 0,
      currency: t.currency || 'BRL',
      recovery: null,
      sleep: null,
    });
    const bucket = days.get(day);
    bucket.outflow += Math.abs(Number(t.amount) || 0);
    if (DISCRETIONARY.has(t.category)) bucket.discretionary += Math.abs(Number(t.amount) || 0);
    // Take the first non-null biometric sample per day (tagger joins per tx
    // but biometrics don't change every transaction).
    if (bucket.recovery === null && ec?.recovery_score !== null && ec?.recovery_score !== undefined) bucket.recovery = ec.recovery_score;
    if (bucket.sleep === null && ec?.sleep_score !== null && ec?.sleep_score !== undefined) bucket.sleep = ec.sleep_score;
  }

  let stressDays = 0, normalDays = 0;
  let stressDiscSum = 0, normalDiscSum = 0;

  for (const b of days.values()) {
    // Skip days with no biometric signal — can't classify
    if (b.recovery === null && b.sleep === null) continue;
    if (isStressProfile(b.recovery, b.sleep)) {
      stressDays++;
      stressDiscSum += b.discretionary;
    } else {
      normalDays++;
      normalDiscSum += b.discretionary;
    }
  }

  const dominantCurrency = (() => {
    const count = new Map();
    for (const b of days.values()) count.set(b.currency, (count.get(b.currency) || 0) + 1);
    const sorted = [...count.entries()].sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || 'BRL';
  })();

  return {
    stress_days: stressDays,
    normal_days: normalDays,
    stress_avg_discretionary: stressDays > 0 ? Math.round((stressDiscSum / stressDays) * 100) / 100 : null,
    normal_avg_discretionary: normalDays > 0 ? Math.round((normalDiscSum / normalDays) * 100) / 100 : null,
    currency: dominantCurrency,
  };
}

/**
 * Produce a forecast for the user right now. Returns null if we don't have
 * enough data to say anything meaningful — frontend renders a "not enough
 * signal yet" state in that case.
 */
export async function computeRiskForecast(userId) {
  const [bio, baseline] = await Promise.all([
    getCurrentBiology(userId),
    getHistoricalBaseline(userId),
  ]);

  if (!baseline) {
    return { status: 'no_history', message: 'Ainda coletando histórico — conecte seu banco para começar.' };
  }
  if (!bio || (bio.recovery === null && bio.sleep === null)) {
    return {
      status: 'no_biology',
      message: 'Sem sinal de recuperação hoje — conecte Whoop/Oura para uma previsão.',
      baseline,
    };
  }

  // Need at least 3 stress days AND 3 normal days to draw a comparison.
  if (baseline.stress_days < 3 || baseline.normal_days < 3) {
    return {
      status: 'insufficient_data',
      message: `Precisa de mais dias de dados para correlacionar (temos ${baseline.stress_days} dias de stress e ${baseline.normal_days} normais).`,
      baseline,
      current_biology: bio,
    };
  }

  const todayMatchesStress = isStressProfile(bio.recovery, bio.sleep);
  const lift = baseline.stress_avg_discretionary !== null && baseline.normal_avg_discretionary !== null
    ? baseline.stress_avg_discretionary - baseline.normal_avg_discretionary
    : null;

  if (todayMatchesStress && lift !== null && lift > 0) {
    return {
      status: 'high_risk',
      headline: 'Dia de atenção',
      detail: `Recuperação ${bio.recovery !== null ? `${Math.round(bio.recovery)}%` : 'baixa'}${
        bio.sleep !== null ? ` · sono ${Math.round(bio.sleep)}%` : ''
      }. Em dias parecidos você gastou em média ${formatCurrency(baseline.stress_avg_discretionary, baseline.currency)} em discricionário (vs ${formatCurrency(baseline.normal_avg_discretionary, baseline.currency)} em dias normais).`,
      expected_extra: Math.round(lift * 100) / 100,
      current_biology: bio,
      baseline,
    };
  }

  return {
    status: 'low_risk',
    headline: 'Dia tranquilo',
    detail: `${bio.recovery !== null ? `Recuperação ${Math.round(bio.recovery)}%` : 'Biologia estável'}. Historicamente você se mantém perto da média em dias assim.`,
    current_biology: bio,
    baseline,
  };
}

function formatCurrency(n, cur) {
  const locale = cur === 'BRL' ? 'pt-BR' : cur === 'EUR' ? 'es-ES' : cur === 'GBP' ? 'en-GB' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: cur || 'BRL', maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${cur || 'BRL'} ${n}`;
  }
}
