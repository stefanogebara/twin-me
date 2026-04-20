/**
 * Financial Weekly Report Service
 * ================================
 * Compiles a 7-day financial-emotional summary per user. Used by the Sunday
 * 8am cron + email template.
 *
 * Output shape:
 *   {
 *     hasData: boolean,
 *     windowStart: ISO, windowEnd: ISO,
 *     totalOutflow, totalInflow, txCount,
 *     topCategories: [{category, total}],
 *     stressShopCount, stressShopTotal,
 *     emotionalSpendRatio,
 *     topStressPurchases: [{merchant, amount, date, stress_score}],
 *     savings: { saved, waited, biggestSave },
 *     weekOverWeek: { outflow_delta_pct, stress_shop_delta }
 *   }
 */

import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('financial-weekly-report');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

async function fetchWeekWindow(userId, windowStart, windowEnd) {
  const { data, error } = await supabaseAdmin
    .from('user_transactions')
    .select(`
      amount, merchant_raw, merchant_normalized, category, transaction_date,
      emotional_context:transaction_emotional_context (
        computed_stress_score, is_stress_shop_candidate
      )
    `)
    .eq('user_id', userId)
    .gte('transaction_date', windowStart.toISOString())
    .lt('transaction_date', windowEnd.toISOString());

  if (error) {
    log.warn(`fetch week failed for ${userId}: ${error.message}`);
    return [];
  }
  return data || [];
}

async function fetchSavings(userId, windowStart, windowEnd) {
  const { data, error } = await supabaseAdmin
    .from('user_platform_data')
    .select('raw_data, extracted_at')
    .eq('user_id', userId)
    .eq('platform', 'twinme')
    .eq('data_type', 'stress_shop_nudge')
    .gte('extracted_at', windowStart.toISOString())
    .lt('extracted_at', windowEnd.toISOString());

  if (error) return { saved: 0, waited: 0, biggestSave: 0 };

  let saved = 0;
  let waited = 0;
  let biggestSave = 0;
  for (const row of data || []) {
    const d = row.raw_data || {};
    if (d.outcome !== 'waited') continue;
    waited++;
    const amt = typeof d.amount === 'number' && d.amount > 0 ? d.amount : 80;
    saved += amt;
    if (amt > biggestSave) biggestSave = amt;
  }
  return {
    saved: Math.round(saved * 100) / 100,
    waited,
    biggestSave: Math.round(biggestSave * 100) / 100,
  };
}

function summarize(rows) {
  let totalOutflow = 0;
  let totalInflow = 0;
  let stressShopCount = 0;
  let stressShopTotal = 0;
  let highStressOutflow = 0;
  const categoryTotals = {};
  const stressPurchases = [];

  for (const t of rows) {
    const ec = Array.isArray(t.emotional_context) ? t.emotional_context[0] : t.emotional_context;
    const abs = Math.abs(t.amount);
    if (t.amount < 0) {
      totalOutflow += abs;
      const cat = t.category || 'other';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + abs;
    } else {
      totalInflow += t.amount;
    }
    if (ec?.is_stress_shop_candidate && t.amount < 0) {
      stressShopCount++;
      stressShopTotal += abs;
      stressPurchases.push({
        merchant: t.merchant_normalized || t.merchant_raw,
        amount: abs,
        date: t.transaction_date,
        stress_score: ec.computed_stress_score,
      });
    }
    if (ec?.computed_stress_score !== null && ec?.computed_stress_score !== undefined && ec.computed_stress_score >= 0.6 && t.amount < 0) {
      highStressOutflow += abs;
    }
  }

  const topCategories = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }));

  const topStressPurchases = stressPurchases
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)
    .map((p) => ({ ...p, amount: Math.round(p.amount * 100) / 100 }));

  return {
    totalOutflow: Math.round(totalOutflow * 100) / 100,
    totalInflow: Math.round(totalInflow * 100) / 100,
    txCount: rows.length,
    stressShopCount,
    stressShopTotal: Math.round(stressShopTotal * 100) / 100,
    highStressOutflow: Math.round(highStressOutflow * 100) / 100,
    emotionalSpendRatio: totalOutflow > 0 ? highStressOutflow / totalOutflow : null,
    topCategories,
    topStressPurchases,
  };
}

/**
 * Build the weekly report for one user. Returns hasData=false when no
 * transactions are found in the last 7 days (email should be skipped).
 */
export async function buildWeeklyReport(userId, now = new Date()) {
  const windowEnd = now;
  const windowStart = new Date(now.getTime() - 7 * MS_PER_DAY);
  const priorStart = new Date(now.getTime() - 14 * MS_PER_DAY);

  const [thisWeek, priorWeek, savings] = await Promise.all([
    fetchWeekWindow(userId, windowStart, windowEnd),
    fetchWeekWindow(userId, priorStart, windowStart),
    fetchSavings(userId, windowStart, windowEnd),
  ]);

  if (!thisWeek.length) {
    return { hasData: false };
  }

  const current = summarize(thisWeek);
  const prior = summarize(priorWeek);

  const weekOverWeek = {
    outflow_delta_pct: prior.totalOutflow > 0
      ? Math.round(((current.totalOutflow - prior.totalOutflow) / prior.totalOutflow) * 100)
      : null,
    stress_shop_delta: current.stressShopCount - prior.stressShopCount,
  };

  return {
    hasData: true,
    userId,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    ...current,
    savings,
    weekOverWeek,
    priorWeekOutflow: prior.totalOutflow,
  };
}
