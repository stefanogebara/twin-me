/**
 * Recurrence Detector
 * ====================
 * Separates recurring charges (Netflix monthly, gym membership, Friday iFood
 * habit) from genuine one-off impulses. Needed because the stress-shop
 * detector was flagging any discretionary charge on a high-stress day — but
 * a subscription bill happens regardless of how stressed you are that day.
 *
 * Heuristic: a transaction is recurring if the same user has 3+ charges to
 * the same merchant_normalized, with amounts clustered within ±20% of the
 * median, across the last 120 days.
 *
 * Pure SQL + JS aggregation. No LLM.
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';
import { DEFAULT_CURRENCY } from '../../config/financialThresholds.js';

const log = createLogger('recurrence-detector');

const WINDOW_DAYS = 120;
const MIN_OCCURRENCES = 3;
const AMOUNT_STDDEV_THRESHOLD = 0.20; // 20% coefficient of variation
// A real subscription's inter-charge intervals are tight (monthly = ~30d ± 2d
// = CV ~0.07; weekly = ~7d ± 1d = CV ~0.14). Random purchase patterns from the
// same merchant (Uber rides, Starbucks visits) have chaotic intervals (CV >>
// 0.4). 0.40 lets quirky-but-real subscriptions through (e.g. a monthly bill
// that lands on the 28th in February and 31st in March) while excluding the
// noise.
const INTERVAL_CV_THRESHOLD = 0.40;
// Minimum monthly-average cost to qualify as a subscription. Coffee/snack
// habit patterns (Starbucks $4.33 × 3/mo, McDonald's $12 × 3/mo) cluster like
// subscriptions in Plaid sandbox data but aren't paid services. Real
// subscriptions start at ~$4.99/mo (Apple Music Voice, Microsoft 365 Basic).
const MIN_MONTHLY_AVG_USD = 4.99;
// Known non-subscription brands. These are merchants whose business model is
// per-transaction (food, retail, rides), not a recurring service. Plaid
// sandbox generates monthly-cadence fake transactions for these — passing the
// amount + cadence heuristics — so a name-based veto is the only deterministic
// filter that survives synthetic data. Mirrors the merchant denylist every
// real subscription-tracker (Rocket Money, Truebill) maintains.
//
// Note: this denylist *vetoes the cohort*. If a real user actually subscribes
// to "Uber One" ($9.99/mo) the row still appears in their transactions; it
// just doesn't get auto-flagged as recurring by this detector. We tolerate
// that false-negative until we ship a positive-allowlist for known
// subscription brands (Netflix, Spotify, etc.).
const KNOWN_NON_SUBSCRIPTION_BRANDS = [
  /\bkfc\b/i,
  /mcdonald/i,
  /starbucks/i,
  /chipotle/i,
  /\bsubway\b/i,
  /domino/i,
  /\btaco\s+bell\b/i,
  /\buber\b/i,           // Uber rides — Uber One subs are rare in sandbox demo
  /\blyft\b/i,
  /\bdoordash\b/i,       // food delivery — DashPass sub is rare in sandbox
  /grubhub/i,
  /madison\s+bicycle/i,  // Plaid sandbox sample, one-off purchases
  /tectra/i,             // Plaid sandbox sample, opaque
  /^fun$/i,              // Plaid sandbox sample (literal token "FUN")
];

// Merchant-normalized patterns that look like money-movement, not subscriptions.
// Caught upstream of the recurrence check so the cohort never includes:
//   - ACH transfers (incl. Plaid sandbox's "Ach Electronic Creditgusto Pay")
//   - Credit-card autopay receipts ("Automatic Payment - Thank")
//   - Treasury bill purchases ("United States Treas Bills 0.000%...")
//   - CD / savings deposits ("CD Deposit Initial")
//   - Wire transfers, interbank movement, payroll inflows misclassified as outflow
// Subscriptions cluster the same way these do (tight amount, 3+ charges) so
// without this filter the audit gets polluted by money movement that isn't
// actually a "service the user is paying for monthly".
const NON_SUBSCRIPTION_MERCHANT_PATTERNS = [
  /\bach\b/i,
  /automatic\s+payment/i,
  /treas(ury)?\s+bill/i,
  /\bcd\s+deposit/i,
  /wire\s+(transfer|payment)/i,
  /\bpayment\s+thank\s+you\b/i,
  /credit\s+card\s+payment/i,
  // "Credit Card 3333 Payment" — Plaid sandbox CC payment receipts with the
  // last-4 inserted between "Card" and "Payment". credit_card_payment above
  // catches the underscore form, this catches the "Card NNNN Payment" form.
  /credit\s+card\s+\d+\s+payment/i,
  /\bdirect\s+deposit\b/i,
  /\bpayroll\b/i,
  /\binterest\s+(paid|earned|credit)\b/i,
];

// Category prefixes whose transactions should NEVER count as subscriptions —
// the brokerage activity surface owns these, not the subscription audit.
const NON_SUBSCRIPTION_CATEGORY_PREFIXES = [
  'investment_',
  'transfer',
  'loan_payment',
  'credit_card_payment',
  'interest',
  'dividend',
  'payroll',
];

function isExcludedMerchant(merchant) {
  if (!merchant) return true;
  return NON_SUBSCRIPTION_MERCHANT_PATTERNS.some(re => re.test(merchant))
    || KNOWN_NON_SUBSCRIPTION_BRANDS.some(re => re.test(merchant));
}

/**
 * Public version of isExcludedMerchant. The detection-time filter is
 * one-shot — old rows that already have is_recurring=true from before
 * the blocklist was added stay marked. Endpoints that READ the
 * subscriptions list call this to defensively re-filter, so a fresh
 * blocklist entry takes effect without rerunning the detector.
 *
 * Returns true if the merchant_normalized + category combination
 * should NOT be surfaced as a subscription.
 */
export function isNonSubscriptionRow(row) {
  const merchant = row?.merchant_normalized || row?.merchant_raw;
  if (isExcludedMerchant(merchant)) return true;
  const cat = String(row?.category || '').toLowerCase();
  if (NON_SUBSCRIPTION_CATEGORY_PREFIXES.some(p => cat.startsWith(p))) return true;
  return false;
}

// Inter-charge interval coefficient of variation. With <2 intervals (i.e. <3
// charges) we can't compute variance, so the caller already gates on
// MIN_OCCURRENCES = 3 → always ≥2 intervals here.
function intervalCV(sortedDates) {
  const intervals = [];
  for (let i = 1; i < sortedDates.length; i++) {
    const d1 = new Date(sortedDates[i - 1]).getTime();
    const d2 = new Date(sortedDates[i]).getTime();
    if (Number.isFinite(d1) && Number.isFinite(d2)) {
      intervals.push((d2 - d1) / (1000 * 60 * 60 * 24));
    }
  }
  if (intervals.length < 2) return 0; // degenerate, let caller decide
  const mean = intervals.reduce((s, x) => s + x, 0) / intervals.length;
  if (mean === 0) return Infinity;
  const variance = intervals.reduce((s, x) => s + (x - mean) ** 2, 0) / intervals.length;
  return Math.sqrt(variance) / mean;
}

function isExcludedCategory(category) {
  if (!category) return false;
  const c = String(category).toLowerCase();
  return NON_SUBSCRIPTION_CATEGORY_PREFIXES.some(prefix => c.startsWith(prefix));
}

/**
 * Detect recurring charges across all of a user's transactions and update
 * the `is_recurring` flag. Idempotent — safe to run after every upload or retag.
 *
 * Only considers transactions with a non-null `merchant_normalized` — the
 * grouping key. Transactions where the normalizer couldn't match a brand
 * stay marked non-recurring (we can't cluster unknown strings reliably).
 *
 * @returns {{ scanned: number, marked_recurring: number, groups: number }}
 */
export async function detectAndMarkRecurring(userId) {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await supabaseAdmin
    .from('user_transactions')
    .select('id, merchant_normalized, amount, currency, transaction_date, is_recurring, category, account_type')
    .eq('user_id', userId)
    .not('merchant_normalized', 'is', null)
    .neq('account_type', 'investment')   // brokerage trades own this surface
    .gte('transaction_date', since);
  // Note: outflow-only filter intentionally REMOVED — we want to see positive
  // amounts (refunds, returns) to detect sign-mixed merchants like
  // "United Airlines" where +$500 refunds and -$500 charges both exist.
  // A true subscription is monodirectional; refund-prone merchants get excluded
  // by the sign-consistency check below.

  if (error) {
    log.warn(`fetch failed for user ${userId}: ${error.message}`);
    return { scanned: 0, marked_recurring: 0, groups: 0 };
  }

  if (!rows?.length) return { scanned: 0, marked_recurring: 0, groups: 0 };

  // Partition into eligible (real subscription candidates) and excluded
  // (money movement that pattern-matches but isn't a paid service). The
  // excluded rows still need their is_recurring flag CLEARED if a prior
  // run had marked them true — otherwise old false-positives persist.
  const eligibleRows = [];
  const forceNonRecurringIds = [];
  for (const r of rows) {
    if (isExcludedMerchant(r.merchant_normalized) || isExcludedCategory(r.category)) {
      if (r.is_recurring) forceNonRecurringIds.push(r.id);
    } else {
      eligibleRows.push(r);
    }
  }

  // Group by (merchant_normalized, currency). Cross-currency merchants
  // (e.g. Netflix BR R$55 + Netflix ES €13) are separate groups so each
  // can qualify as recurring independently — the amount CV threshold makes
  // no sense across currencies.
  const groups = new Map();
  for (const r of eligibleRows) {
    const k = `${r.merchant_normalized}|${(r.currency || DEFAULT_CURRENCY).toUpperCase()}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }

  const recurringIds = [];
  const nonRecurringIds = [];
  let recurringGroupCount = 0;

  for (const [merchant, txs] of groups.entries()) {
    // Sign-consistency: a real subscription is monodirectional outflow. If a
    // merchant has ANY inflow in the window (refund, return, payroll credit
    // misclassified) the cohort isn't a paid recurring service. Catches the
    // "United Airlines +$500/-$500" Plaid sandbox case where uniform |amount|
    // would otherwise sneak past the CV check.
    const hasInflow = txs.some(t => Number(t.amount) > 0);
    if (hasInflow) {
      for (const t of txs) nonRecurringIds.push(t.id);
      continue;
    }

    if (txs.length < MIN_OCCURRENCES) {
      // Can't be recurring without 3+ occurrences
      for (const t of txs) nonRecurringIds.push(t.id);
      continue;
    }

    // Amount clustering: coefficient of variation < threshold
    const amounts = txs.map(t => Math.abs(t.amount));
    const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    if (mean === 0) {
      for (const t of txs) nonRecurringIds.push(t.id);
      continue;
    }
    const variance = amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length;
    const stddev = Math.sqrt(variance);
    const cv = stddev / mean;

    if (cv > AMOUNT_STDDEV_THRESHOLD) {
      // Same merchant but varied amounts (e.g. different iFood restaurants) = one-off
      for (const t of txs) nonRecurringIds.push(t.id);
      continue;
    }

    // Minimum monthly cost — kills the "habit pattern" cohort (Starbucks $4.33
    // × 3/mo, McDonald's $12 × 3/mo). Real subscriptions start at ~$4.99/mo.
    // mean here is in the transaction's currency; for FX-equivalent comparison
    // we'd need conversion, but the threshold is intentionally low enough that
    // even a euro/real-denominated $4.99-equivalent passes.
    if (mean < MIN_MONTHLY_AVG_USD) {
      for (const t of txs) nonRecurringIds.push(t.id);
      continue;
    }

    // Cadence regularity — real subscriptions charge at a regular cadence
    // (monthly ~ CV 0.07, weekly ~ CV 0.14). Random patterns from the same
    // merchant (Uber rides, retail visits) have chaotic intervals (CV > 0.4).
    // Catches the "Uber 6 charges over 78d at uneven gaps" case even though
    // Uber is also in the brand denylist above (defense in depth).
    const dates = txs.map(t => t.transaction_date).sort();
    const cadenceCV = intervalCV(dates);
    if (cadenceCV > INTERVAL_CV_THRESHOLD) {
      for (const t of txs) nonRecurringIds.push(t.id);
      continue;
    }

    // Passed all gates: same merchant + tight amount + monthly cadence + above
    // habit-spend floor + not a known non-subscription brand.
    recurringGroupCount++;
    for (const t of txs) recurringIds.push(t.id);
  }

  // Apply updates in two batches. Skip no-op writes.
  const toMarkRecurring = recurringIds.filter(id => {
    const r = rows.find(x => x.id === id);
    return r && !r.is_recurring;
  });
  // Non-recurring set = explicitly-failed-grouping rows + pattern-excluded
  // money movement rows that still had a stale is_recurring=true flag.
  const toMarkNonRecurring = [
    ...nonRecurringIds.filter(id => {
      const r = rows.find(x => x.id === id);
      return r && r.is_recurring;
    }),
    ...forceNonRecurringIds,
  ];

  if (toMarkRecurring.length > 0) {
    const { error: e1 } = await supabaseAdmin
      .from('user_transactions')
      .update({ is_recurring: true })
      .in('id', toMarkRecurring);
    if (e1) log.warn(`mark recurring failed: ${e1.message}`);
  }
  if (toMarkNonRecurring.length > 0) {
    const { error: e2 } = await supabaseAdmin
      .from('user_transactions')
      .update({ is_recurring: false })
      .in('id', toMarkNonRecurring);
    if (e2) log.warn(`mark non-recurring failed: ${e2.message}`);
  }

  log.info(
    `user ${userId}: scanned ${rows.length} tx across ${groups.size} merchants; ` +
    `${recurringGroupCount} recurring groups; +${toMarkRecurring.length}/-${toMarkNonRecurring.length} flags updated`,
  );

  return {
    scanned: rows.length,
    marked_recurring: toMarkRecurring.length,
    unmarked_recurring: toMarkNonRecurring.length,
    groups: groups.size,
    recurring_groups: recurringGroupCount,
  };
}
