/**
 * Recurring series: what comes back on its own.
 * =============================================
 * A merchant is recurring when it charged at least MIN_OCCURRENCES times with
 * amounts within AMOUNT_CV of their median and intervals within INTERVAL_CV of
 * theirs. Cadence comes from the median interval. A recurring merchant that
 * maps to a connected platform is a subscription, and subscriptions are what
 * get measured against use. Pure.
 */

export const MIN_OCCURRENCES = 3;
export const AMOUNT_CV = 0.2;
export const INTERVAL_CV = 0.4;
const DAY = 86400000;

export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function cv(xs) {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (!m) return Infinity;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
  return Math.sqrt(v) / Math.abs(m);
}

export function cadenceOf(medianDays) {
  if (medianDays >= 5 && medianDays <= 9) return 'weekly';
  if (medianDays >= 12 && medianDays <= 16) return 'biweekly';
  if (medianDays >= 26 && medianDays <= 35) return 'monthly';
  if (medianDays >= 80 && medianDays <= 100) return 'quarterly';
  if (medianDays >= 350 && medianDays <= 380) return 'yearly';
  return null;
}

/**
 * @param {object[]} transactions  { merchant_key, amount (negative out), occurred_at }
 * @param {object} [opts] { now, windowDays = 400, platforms: { merchant_key: platform } }
 * @returns {object[]} series: { merchant_key, cadence, typical_amount, occurrences, first_seen, last_seen, next_expected, is_subscription, platform }
 */
export function detectRecurring(transactions, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const windowDays = opts.windowDays ?? 400;
  const platforms = opts.platforms || {};
  const since = now.getTime() - windowDays * DAY;
  const byMerchant = new Map();
  for (const t of transactions) {
    if (Number(t.amount) >= 0) continue;
    const at = new Date(t.occurred_at).getTime();
    if (at < since) continue;
    if (!byMerchant.has(t.merchant_key)) byMerchant.set(t.merchant_key, []);
    byMerchant.get(t.merchant_key).push({ at, amount: Math.abs(Number(t.amount)) });
  }
  const out = [];
  for (const [key, rows] of byMerchant) {
    if (rows.length < MIN_OCCURRENCES) continue;
    rows.sort((a, b) => a.at - b.at);
    const amounts = rows.map((r) => r.amount);
    if (cv(amounts) > AMOUNT_CV) continue;
    const intervals = rows.slice(1).map((r, i) => (r.at - rows[i].at) / DAY);
    if (cv(intervals) > INTERVAL_CV) continue;
    const med = median(intervals);
    const cadence = cadenceOf(med);
    if (!cadence) continue;
    const last = rows[rows.length - 1].at;
    out.push({
      merchant_key: key,
      cadence,
      typical_amount: Math.round(median(amounts) * 100) / 100,
      occurrences: rows.length,
      first_seen: new Date(rows[0].at).toISOString(),
      last_seen: new Date(last).toISOString(),
      next_expected: new Date(last + Math.round(med) * DAY).toISOString().slice(0, 10),
      is_subscription: Boolean(platforms[key]),
      platform: platforms[key] || null,
    });
  }
  return out.sort((a, b) => b.typical_amount - a.typical_amount);
}

/**
 * Subscriptions against use: one line per subscription with what it cost per use.
 * @param {object[]} series   from detectRecurring, is_subscription only
 * @param {Record<string, number>} usesByPlatform  events per platform in the same window (from user_platform_data)
 */
export function subscriptionsAgainstUse(series, usesByPlatform) {
  return series.filter((s) => s.is_subscription).map((s) => {
    const uses = usesByPlatform[s.platform] ?? null;
    return {
      ...s,
      uses,
      cost_per_use: uses ? Math.round((s.typical_amount / uses) * 100) / 100 : null,
    };
  });
}
