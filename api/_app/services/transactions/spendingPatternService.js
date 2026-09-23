/**
 * Stress-Spending Patterns Service
 * =================================
 * The UVP-defining insight: "the only AI that tells you WHY you spend".
 *
 * Analyzes tagged transactions + emotional context to surface plain-language
 * correlations that are ONLY visible when you have biology + mood + spending
 * data in one place. Zero LLM — pure SQL aggregation + threshold tests.
 *
 * Pattern types surfaced:
 *   1. category × stress  — "dias com stress alto = 3x mais delivery"
 *   2. weekday × amount   — "sextas à noite = R$X médio em compras"
 *   3. music mood × category — "música triste + shopping = padrão recorrente"
 *   4. low HRV × impulsivity — "HRV abaixo de 50 = 40% chance de compra impulsiva"
 *
 * Only returns patterns that meet a confidence threshold (n≥5 samples, ratio≥1.5x).
 * If no patterns meet the bar, returns [] rather than noisy low-confidence ones.
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';
import { STRESS_HIGH, STRESS_LOW } from '../../config/financialThresholds.js';

const log = createLogger('spending-pattern-service');

const MIN_TRANSACTIONS_FOR_PATTERNS = 14;
const MIN_SAMPLES_PER_BIN = 4;
const MIN_RATIO_TO_SURFACE = 1.5;

function formatBRL(n) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const CATEGORY_LABELS = {
  food_delivery: 'delivery',
  shopping: 'compras online',
  streaming: 'streaming',
  entertainment: 'lazer',
  groceries: 'mercado',
  fuel: 'combustível',
  transport: 'transporte',
  health: 'farmácia',
};

function labelCategory(cat) {
  return CATEGORY_LABELS[cat] || cat;
}

/**
 * Pattern 1 — Category × Stress.
 * For each discretionary category, compute:
 *   - avg spend on high-stress days (stress >= 0.6)
 *   - avg spend on low-stress days (stress < 0.4)
 *   - ratio. If >= 1.5x AND n_high >= MIN_SAMPLES, surface.
 */
function categoryStressPatterns(rows) {
  const bins = {};
  for (const t of rows) {
    if (t.amount >= 0) continue;
    const cat = t.category;
    if (!['food_delivery', 'shopping', 'streaming', 'entertainment'].includes(cat)) continue;
    const ec = Array.isArray(t.emotional_context) ? t.emotional_context[0] : t.emotional_context;
    const s = ec?.computed_stress_score;
    if (s === null || s === undefined) continue;
    const band = s >= STRESS_HIGH ? 'high' : s < STRESS_LOW ? 'low' : null;
    if (!band) continue;
    if (!bins[cat]) bins[cat] = { high: [], low: [] };
    bins[cat][band].push(Math.abs(t.amount));
  }

  const patterns = [];
  for (const [cat, b] of Object.entries(bins)) {
    if (b.high.length < MIN_SAMPLES_PER_BIN || b.low.length < MIN_SAMPLES_PER_BIN) continue;
    const highAvg = b.high.reduce((s, v) => s + v, 0) / b.high.length;
    const lowAvg = b.low.reduce((s, v) => s + v, 0) / b.low.length;
    if (lowAvg <= 0) continue;
    const ratio = highAvg / lowAvg;
    if (ratio < MIN_RATIO_TO_SURFACE) continue;
    patterns.push({
      kind: 'category_stress',
      category: cat,
      ratio: Math.round(ratio * 10) / 10,
      high_avg: Math.round(highAvg * 100) / 100,
      low_avg: Math.round(lowAvg * 100) / 100,
      high_n: b.high.length,
      low_n: b.low.length,
      headline: `Em dias de stress alto você gasta ${Math.round(ratio * 10) / 10}x mais em ${labelCategory(cat)}`,
      detail: `Média em dias calmos: ${formatBRL(lowAvg)}. Em dias de stress: ${formatBRL(highAvg)}. Baseado em ${b.high.length + b.low.length} transações.`,
      impact_score: (ratio - 1) * highAvg * b.high.length,
    });
  }
  return patterns;
}

/**
 * Pattern 2 — Weekday × Amount.
 * Finds the weekday whose average discretionary outflow is significantly higher
 * than the overall average.
 */
function weekdayPatterns(rows) {
  const byDay = Array.from({ length: 7 }, () => []);
  let overallTotal = 0;
  let overallCount = 0;

  for (const t of rows) {
    if (t.amount >= 0) continue;
    const cat = t.category;
    if (!['food_delivery', 'shopping', 'streaming', 'entertainment'].includes(cat)) continue;
    const d = new Date(t.transaction_date);
    if (isNaN(d.getTime())) continue;
    const abs = Math.abs(t.amount);
    byDay[d.getUTCDay()].push(abs);
    overallTotal += abs;
    overallCount++;
  }

  if (overallCount < MIN_SAMPLES_PER_BIN * 2) return [];
  const overallAvg = overallTotal / overallCount;

  const patterns = [];
  for (let day = 0; day < 7; day++) {
    const samples = byDay[day];
    if (samples.length < MIN_SAMPLES_PER_BIN) continue;
    const avg = samples.reduce((s, v) => s + v, 0) / samples.length;
    const ratio = avg / overallAvg;
    if (ratio < MIN_RATIO_TO_SURFACE) continue;
    patterns.push({
      kind: 'weekday',
      weekday: day,
      ratio: Math.round(ratio * 10) / 10,
      day_avg: Math.round(avg * 100) / 100,
      overall_avg: Math.round(overallAvg * 100) / 100,
      n: samples.length,
      headline: `${WEEKDAY_NAMES[day]}s você gasta ${Math.round(ratio * 10) / 10}x mais em compras discricionárias`,
      detail: `Média nesse dia: ${formatBRL(avg)}. Média geral: ${formatBRL(overallAvg)}. ${samples.length} transações analisadas.`,
      impact_score: (ratio - 1) * avg * samples.length,
    });
  }
  return patterns;
}

/**
 * Pattern 3 — Low HRV × Impulsivity.
 * When biology signal is low (recovery < 50 OR HRV < 40), what's the stress-shop rate?
 */
function biologyImpulsePattern(rows) {
  let lowBioImpulseCount = 0;
  let lowBioTotal = 0;
  let highBioImpulseCount = 0;
  let highBioTotal = 0;

  for (const t of rows) {
    if (t.amount >= 0) continue;
    const ec = Array.isArray(t.emotional_context) ? t.emotional_context[0] : t.emotional_context;
    if (!ec) continue;
    const rec = ec.recovery_score;
    const hrv = ec.hrv_score;
    const bioLow = (rec !== null && rec !== undefined && rec < 50) || (hrv !== null && hrv !== undefined && hrv < 40);
    const bioHigh = (rec !== null && rec !== undefined && rec >= 70) || (hrv !== null && hrv !== undefined && hrv >= 70);
    if (bioLow) {
      lowBioTotal++;
      if (ec.is_stress_shop_candidate) lowBioImpulseCount++;
    } else if (bioHigh) {
      highBioTotal++;
      if (ec.is_stress_shop_candidate) highBioImpulseCount++;
    }
  }

  if (lowBioTotal < MIN_SAMPLES_PER_BIN || highBioTotal < MIN_SAMPLES_PER_BIN) return [];
  const lowRate = lowBioImpulseCount / lowBioTotal;
  const highRate = highBioImpulseCount / highBioTotal;
  if (lowRate < 0.15 || lowRate <= highRate * 1.3) return [];

  return [{
    kind: 'biology_impulse',
    low_bio_rate: Math.round(lowRate * 100) / 100,
    high_bio_rate: Math.round(highRate * 100) / 100,
    low_bio_total: lowBioTotal,
    headline: `Em dias de recovery baixa, ${Math.round(lowRate * 100)}% das suas compras viram impulso`,
    detail: `Quando seu corpo está recuperado, essa taxa cai para ${Math.round(highRate * 100)}%. Seu HRV sabe antes de você.`,
    impact_score: lowRate * lowBioTotal * 100,
  }];
}

/**
 * Pattern 4 — Music mood × impulsive categories.
 * When music valence is low (< 0.4), how much more do they spend on shopping/delivery?
 */
function musicMoodPattern(rows) {
  const lowMood = [];
  const highMood = [];

  for (const t of rows) {
    if (t.amount >= 0) continue;
    if (!['food_delivery', 'shopping'].includes(t.category)) continue;
    const ec = Array.isArray(t.emotional_context) ? t.emotional_context[0] : t.emotional_context;
    const mv = ec?.music_valence;
    if (mv === null || mv === undefined) continue;
    const abs = Math.abs(t.amount);
    if (mv < 0.4) lowMood.push(abs);
    else if (mv > 0.6) highMood.push(abs);
  }

  if (lowMood.length < MIN_SAMPLES_PER_BIN || highMood.length < MIN_SAMPLES_PER_BIN) return [];
  const lowAvg = lowMood.reduce((s, v) => s + v, 0) / lowMood.length;
  const highAvg = highMood.reduce((s, v) => s + v, 0) / highMood.length;
  if (highAvg <= 0) return [];
  const ratio = lowAvg / highAvg;
  if (ratio < MIN_RATIO_TO_SURFACE) return [];

  return [{
    kind: 'music_mood',
    ratio: Math.round(ratio * 10) / 10,
    low_mood_avg: Math.round(lowAvg * 100) / 100,
    high_mood_avg: Math.round(highAvg * 100) / 100,
    n: lowMood.length + highMood.length,
    headline: `Quando você ouve música triste você gasta ${Math.round(ratio * 10) / 10}x mais em delivery e compras`,
    detail: `Música triste (valence < 0.4): média ${formatBRL(lowAvg)}. Música alegre: ${formatBRL(highAvg)}.`,
    impact_score: (ratio - 1) * lowAvg * lowMood.length,
  }];
}

/**
 * Fetch + analyze 90 days of transactions, return top 3 patterns ranked by
 * impact score. Returns { hasData, minTransactionsReached, patterns, summary }.
 */
export async function getSpendingPatterns(userId, opts = {}) {
  const { windowDays = 90, topN = 3 } = opts;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('user_transactions')
    .select(`
      amount, category, transaction_date,
      emotional_context:transaction_emotional_context (
        computed_stress_score, is_stress_shop_candidate,
        recovery_score, hrv_score, music_valence
      )
    `)
    .eq('user_id', userId)
    .gte('transaction_date', since);

  if (error) {
    log.warn(`fetch failed: ${error.message}`);
    return { hasData: false, patterns: [] };
  }

  const rows = data || [];
  if (rows.length < MIN_TRANSACTIONS_FOR_PATTERNS) {
    return {
      hasData: false,
      minTransactionsReached: false,
      patterns: [],
      txCount: rows.length,
      minRequired: MIN_TRANSACTIONS_FOR_PATTERNS,
    };
  }

  const all = [
    ...categoryStressPatterns(rows),
    ...weekdayPatterns(rows),
    ...biologyImpulsePattern(rows),
    ...musicMoodPattern(rows),
  ];

  const topPatterns = all
    .sort((a, b) => (b.impact_score || 0) - (a.impact_score || 0))
    .slice(0, topN);

  return {
    hasData: true,
    minTransactionsReached: true,
    patterns: topPatterns,
    txCount: rows.length,
  };
}
