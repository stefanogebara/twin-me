/**
 * Recurring series: what comes back on its own.
 * =============================================
 * A merchant is recurring when it charged at least MIN_OCCURRENCES times with
 * amounts within AMOUNT_CV of their median and intervals within INTERVAL_CV of
 * theirs. Cadence comes from the median interval. A recurring merchant that
 * maps to a connected platform is a subscription, and subscriptions are what
 * get measured against use. Pure.
 *
 * One merchant is not one series. Amazon is a 4,99 subscription and a 89,00 purchase;
 * Higgsfield is two plans. Read as one list of amounts those fail the spread test and
 * nothing is found, so the charges are first grouped by amount (Ibrain, Hernandez and
 * Peinado, BBVA AI Factory, ICAIF 2024: split a beneficiary's charges into homogeneous
 * sub-series before forecasting them), and the largest group that keeps a rhythm is
 * the merchant's series. The other groups are counted on it as `variants`, so a reader
 * can say "and another charge at 89,00" without a second row: the ledger keeps one
 * series per merchant. The rows in the series are named by id, so only those are
 * flagged recurring and the odd purchase stays in the day's spending.
 */
import { dayIn } from './zone.js';

export const MIN_OCCURRENCES = 3;

/**
 * The series minus the ones the person said they ended: a merchant_kind fact with the value
 * "cancelled" on the merchant key. Answered on You or in the chat since 2026-09-16, the
 * answer changed nothing until 2026-09-21.
 */
export function cancelledKeys(facts = []) {
  return new Set((facts || []).filter((f) => f && f.kind === 'merchant_kind' && String(f.value || '').toLowerCase() === 'cancelled').map((f) => String(f.subject || '').toLowerCase()));
}
export function withoutCancelled(series = [], facts = []) {
  const gone = cancelledKeys(facts);
  return gone.size ? (series || []).filter((s) => !gone.has(String(s.merchant_key || '').toLowerCase())) : (series || []);
}
export const AMOUNT_CV = 0.2;
export const INTERVAL_CV = 0.4;
const DAY = 86400000;

export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
/**
 * Amounts grouped so that every member sits within AMOUNT_CV of its group's median:
 * sorted, then split wherever the next amount is too far from the running group.
 * Pure; the order of groups is by size, largest first.
 */
export function amountGroups(rows) {
  const sorted = [...rows].sort((a, b) => a.amount - b.amount);
  const groups = [];
  for (const r of sorted) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(r.amount - median(g.map((x) => x.amount))) <= AMOUNT_CV * median(g.map((x) => x.amount))) g.push(r);
    else groups.push([r]);
  }
  return groups.sort((a, b) => b.length - a.length || median(b.map((x) => x.amount)) - median(a.map((x) => x.amount)));
}

function cv(xs) {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (!m) return Infinity;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
  return Math.sqrt(v) / Math.abs(m);
}

/* A calendar beat of a month or longer is something signed up for; a weekly or biweekly
   rhythm at a steady figure is a habit - the commute, the Friday shop - and is not.
   is_subscription was Boolean(platforms[key]) alone, and money_merchants has never held a
   row, so every series in production read false and no subscription finding could fire
   (2026-09-24). The catalogue was the retired twin's platform list; the beat is evidence
   the ledger holds by itself. */
export const SUBSCRIPTION_CADENCES = new Set(['monthly', 'quarterly', 'yearly']);

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
/** The first date on the series' beat that is not before now. Pure. */
export function nextAfter(lastMs, stepMs, now) {
  let next = lastMs + stepMs;
  const floor = new Date(now).getTime() - 12 * 3600000;
  for (let i = 0; i < 24 && next < floor && stepMs > 0; i += 1) next += stepMs;
  return new Date(next);
}

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
    byMerchant.get(t.merchant_key).push({ id: t.id, at, amount: Math.abs(Number(t.amount)) });
  }
  const out = [];
  for (const [key, all] of byMerchant) {
    if (all.length < MIN_OCCURRENCES) continue;
    /* Each amount group is tried for a rhythm; the largest that has one is the series. */
    const groups = amountGroups(all);
    let found = null;
    for (const rows of groups) {
      if (rows.length < MIN_OCCURRENCES) break;
      rows.sort((a, b) => a.at - b.at);
      const amounts = rows.map((r) => r.amount);
      if (cv(amounts) > AMOUNT_CV) continue;
      const intervals = rows.slice(1).map((r, i) => (r.at - rows[i].at) / DAY);
      if (cv(intervals) > INTERVAL_CV) continue;
      const med = median(intervals);
      const cadence = cadenceOf(med);
      if (!cadence) continue;
      found = { rows, amounts, med, cadence };
      break;
    }
    if (!found) continue;
    const { rows, amounts, med, cadence } = found;
    const last = rows[rows.length - 1].at;
    const others = all.filter((r) => !rows.includes(r));
    out.push({
      merchant_key: key,
      cadence,
      typical_amount: Math.round(median(amounts) * 100) / 100,
      occurrences: rows.length,
      first_seen: new Date(rows[0].at).toISOString(),
      last_seen: new Date(last).toISOString(),
      /* Rolled forward past today: a biweekly last seen on 22 August is next due in the
         future, not "around 5 September" said on the 15th. */
      next_expected: dayIn(nextAfter(last, Math.round(med) * DAY, now)),
      is_subscription: Boolean(platforms[key]) || SUBSCRIPTION_CADENCES.has(cadence),
      platform: platforms[key] || null,
      transaction_ids: rows.map((r) => r.id).filter(Boolean),
      /* The charges at this merchant that are not the series: their count and their
         amounts, so a card can say what else the name carries. */
      variants: others.length,
      variant_amounts: [...new Set(others.map((r) => Math.round(r.amount * 100) / 100))].sort((a, b) => b - a).slice(0, 3),
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
