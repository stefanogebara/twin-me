/**
 * Usage against charges: whether the money that leaves every month buys anything.
 * ==============================================================================
 * A bank app can tell a person that Spotify took 11,99 EUR. It cannot tell them
 * whether anybody listened. That second half is the only part worth a sentence, and
 * it can only be said where TwinMe holds a connection that would have recorded the
 * use: "ElevenLabs took 23,45 EUR and no call was made in 23 days" is a claim about
 * evidence, so it needs evidence on both sides -- the charge and the silence.
 *
 * Which means most subscriptions cannot be read at all. Fly.io, Render and
 * ElevenLabs have no connector here, and no amount of inference fixes that: absence
 * of data is not absence of use. Those series come back from `unmeasurable()` as an
 * honest gap the caller shows as a gap, and they never reach a verdict.
 *
 * Same three rules as analyst.js:
 *   1. Minimum evidence. Two charges before a series is spoken about at all, a known
 *      platform before use is judged, three weeks of window before silence is called
 *      silence.
 *   2. Numbers, never adjectives. "0 events in 40 days", not "you are wasting money".
 *   3. Nothing about a mood.
 *
 * Pure: rows in, findings out. No Supabase, no LLM, no network, and no clock except
 * the `now` passed in. Findings carry analyst.js's exact shape, so the two modules
 * pour into the same reader.
 */

const DAY = 86400000;
const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

function euro(n) { return EUR.format(Math.abs(Number(n) || 0)); }
function round2(n) { return Math.round(n * 100) / 100; }
function firstOfMonth(iso) { return `${String(iso).slice(0, 7)}-01`; }
function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }

/* Whole days, floored everywhere. A window of 20 days and 22 hours is 20 days of
   evidence, not 21: rounding up would let a claim start a day before it is earned. */
function daysBetween(from, to) {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.floor((b - a) / DAY);
}

/* ------------------------------------------------------------------ thresholds */

/** Two charges, or there is no pattern yet -- one charge is an event, not a series. */
export const MIN_CHARGES = 2;
/** Three weeks. Short enough to catch an abandoned tool, long enough that a holiday,
 *  a work trip or a fortnight of illness does not read as abandonment. */
export const UNUSED_MIN_DAYS = 21;
/** A full billing month, so "one use this month" is measured against a whole month. */
export const MONTH_MIN_DAYS = 28;
/** A subscription costing three times what the others cost per use is the one worth
 *  naming. Below that the differences are noise between tools of different shapes. */
export const COST_PER_USE_MULTIPLE = 3;
/** Two findings. A third is read as a list, and a list is not a verdict. */
export const MAX_FINDINGS = 2;

/* ------------------------------------------------------------------- platforms */

/**
 * The nine platforms TwinMe can actually connect (VALID_PROVIDERS in
 * api/routes/oauth-callback.js). Nothing outside this list can prove use, whatever
 * the merchant name suggests.
 */
export const CONNECTABLE_PLATFORMS = Object.freeze([
  'spotify', 'google_calendar', 'youtube', 'google_gmail', 'discord',
  'github', 'whoop', 'instagram', 'outlook',
]);

/** How a platform is named to a person. 'google_gmail' is a column name, not a word. */
export const PLATFORM_LABEL = Object.freeze({
  spotify: 'Spotify',
  google_calendar: 'Calendar',
  youtube: 'YouTube',
  google_gmail: 'Gmail',
  discord: 'Discord',
  github: 'GitHub',
  whoop: 'Whoop',
  instagram: 'Instagram',
  outlook: 'Outlook',
});

/**
 * Merchant name -> the connection whose activity would prove the charge was used.
 *
 * Deliberately short. A row belongs here only when the platform genuinely records
 * what the money bought: Spotify's charge is proved by plays, GitHub's by commits,
 * a Google Workspace bill by mail moving through the mailbox. There is no entry for
 * google_calendar because nobody is billed for a calendar, and none for the tools
 * this ledger actually pays -- Higgsfield, ElevenLabs, Fly.io, Render -- because
 * TwinMe has no connector for them. That silence is the point: no entry means no
 * verdict, not a bad verdict.
 *
 * Matched from the start of the name, the way places.js matches brands, because the
 * bank prints the brand first and truncates the rest ("SPOTIFY P3A4B5C6").
 */
export const PLATFORM_FOR_MERCHANT = Object.freeze({
  spotify: 'spotify',
  youtube: 'youtube',
  'google youtube': 'youtube',
  github: 'github',
  discord: 'discord',
  whoop: 'whoop',
  'google workspace': 'google_gmail',
  'google gsuite': 'google_gmail',
  gsuite: 'google_gmail',
  'microsoft 365': 'outlook',
  'office 365': 'outlook',
  'meta verified': 'instagram',
});

/* Longest prefix first, so a specific spelling is never shadowed by a shorter one. */
const MERCHANT_PREFIXES = Object.entries(PLATFORM_FOR_MERCHANT).sort((a, b) => b[0].length - a[0].length);

/**
 * One merchant key or printed name in, one platform id or null out. Accents dropped
 * and punctuation flattened to spaces, so "FLY.IO", "fly io" and "Fly.io" are one
 * name -- which is also how the reconciler spells merchant_key.
 */
export function platformForMerchant(name) {
  const n = String(name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!n) return null;
  for (const [prefix, platform] of MERCHANT_PREFIXES) {
    if (n.startsWith(prefix)) return platform;
  }
  return null;
}

/** A series' platform: what the caller resolved, else what the name says, else null. */
function resolvePlatform(series) {
  const declared = series?.platform;
  if (declared && CONNECTABLE_PLATFORMS.includes(declared)) return declared;
  return platformForMerchant(series?.merchant_name || series?.merchant_key);
}

/* ----------------------------------------------------------------- usage window */

/**
 * How much activity a platform recorded inside a window.
 *
 * @param {object[]} events  { at, kind } -- already fetched by the caller from the
 *                           memory stream / user_platform_data. `kind` is carried for
 *                           the caller's own filtering; counting does not read it.
 * @param {object} window    { from, to } -- both inclusive, either ISO or Date.
 * @returns {{count: number, first: string|null, last: string|null, days_since_last: number|null}}
 *          days_since_last is null when nothing was recorded, because "no last event"
 *          is not a number of days; the caller decides what the silence is measured from.
 */
export function usageWindow(events, { from = null, to = null } = {}) {
  const start = from ? new Date(from).getTime() : -Infinity;
  const end = to ? new Date(to).getTime() : Infinity;
  const times = [];
  for (const e of events || []) {
    const at = new Date(e?.at).getTime();
    if (!Number.isFinite(at) || at < start || at > end) continue;
    times.push(at);
  }
  times.sort((a, b) => a - b);
  const last = times.length ? times[times.length - 1] : null;
  return {
    count: times.length,
    first: times.length ? new Date(times[0]).toISOString() : null,
    last: last === null ? null : new Date(last).toISOString(),
    days_since_last: last === null || !Number.isFinite(end) ? null : Math.floor((end - last) / DAY),
  };
}

/* ------------------------------------------------------------- one subscription */

/** The charge rows the caller passed in: { id, occurred_at, amount }, oldest first. */
function chargeRows(series) {
  return (series?.charges || [])
    .filter((c) => c && c.occurred_at)
    .slice()
    .sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
}

/**
 * One recurring series measured against one platform's events.
 *
 * verdict_hint, and the reason for each:
 *   'unknown'  no platform to check, or a window too short to have proved anything.
 *              Never inferred from missing data -- a tool with no connector stays
 *              unknown forever, however many charges it makes.
 *   'unused'   nothing recorded at all across a window of UNUSED_MIN_DAYS or more,
 *              or nothing recorded since the last charge for that long. Money left
 *              and three weeks passed with no trace of what it bought.
 *   'thin'     used, but fewer times than it was charged -- a monthly bill touched
 *              once in three months.
 *   'used'     at least as many uses as charges.
 *
 * @returns {{merchant_key: string, platform: string|null, charges: number,
 *   typical_amount: number, period_days: number, uses: number|null,
 *   uses_per_charge: number|null, cost_per_use: number|null,
 *   days_since_last_use: number|null, verdict_hint: string}}
 */
export function subscriptionUse({ series, events = [], now = new Date() } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const rows = chargeRows(series);
  const chargeCount = Number(series?.occurrences) || rows.length;
  const typical = Math.abs(Number(series?.typical_amount) || 0);
  const platform = resolvePlatform(series);
  const firstSeen = series?.first_seen || rows[0]?.occurred_at || null;
  const lastSeen = series?.last_seen || rows[rows.length - 1]?.occurred_at || null;
  const periodDays = firstSeen ? Math.max(0, daysBetween(firstSeen, at) ?? 0) : 0;

  const overall = platform ? usageWindow(events, { from: firstSeen, to: at }) : null;
  const sinceCharge = platform && lastSeen ? usageWindow(events, { from: lastSeen, to: at }) : null;
  const sinceChargeDays = lastSeen ? Math.max(0, daysBetween(lastSeen, at) ?? 0) : 0;

  const uses = overall ? overall.count : null;
  /* Infinity is not a price. Zero uses means there is no cost per use to state, and a
     null keeps the caller from printing one. */
  const costPerUse = uses ? round2((typical * chargeCount) / uses) : null;

  let verdict = 'unknown';
  if (platform) {
    if (uses === 0) verdict = periodDays >= UNUSED_MIN_DAYS ? 'unused' : 'unknown';
    else if (sinceCharge && sinceCharge.count === 0 && sinceChargeDays >= UNUSED_MIN_DAYS) verdict = 'unused';
    else if (chargeCount && uses < chargeCount) verdict = 'thin';
    else verdict = 'used';
  }

  return {
    merchant_key: series?.merchant_key ?? null,
    platform,
    charges: chargeCount,
    typical_amount: round2(typical),
    period_days: periodDays,
    uses,
    uses_per_charge: uses === null || !chargeCount ? null : round2(uses / chargeCount),
    cost_per_use: costPerUse,
    days_since_last_use: overall ? overall.days_since_last : null,
    verdict_hint: verdict,
  };
}

/* --------------------------------------------------------------------- findings */

const CADENCE_PHRASE = {
  weekly: ' a week',
  biweekly: ' every two weeks',
  monthly: ' a month',
  quarterly: ' every three months',
  yearly: ' a year',
};

function nameOf(series) { return series.merchant_name || series.merchant_key; }

/** The days of silence a sentence may claim: since the last use, or the whole window
 *  when there has never been one. */
function silenceOf(use) {
  return use.uses === 0 ? use.period_days : (use.days_since_last_use ?? use.period_days);
}

function unusedFinding(series, use) {
  const rows = chargeRows(series);
  const total = round2(use.typical_amount * use.charges);
  const silence = silenceOf(use);
  const label = PLATFORM_LABEL[use.platform] || use.platform;
  return {
    kind: 'subscription_unused',
    month: series.last_seen ? firstOfMonth(series.last_seen) : null,
    sentence: `${nameOf(series)} took ${euro(use.typical_amount)}${CADENCE_PHRASE[series.cadence] || ''} and has not been used in ${silence} days.`,
    detail: `${plural(use.charges, 'charge', 'charges')}, ${euro(total)} together, and the ${label} connection recorded ${plural(use.uses, 'event', 'events')} in ${use.period_days} days.`,
    numbers: {
      typical_amount: use.typical_amount,
      charges: use.charges,
      total,
      uses: use.uses,
      days_silent: silence,
      period_days: use.period_days,
      platform: use.platform,
    },
    receipts: rows.slice().reverse().slice(0, 4),
    evidence_count: use.charges,
  };
}

function costPerUseFinding(series, use, peerCostPerUse) {
  const rows = chargeRows(series);
  const total = round2(use.typical_amount * use.charges);
  const label = PLATFORM_LABEL[use.platform] || use.platform;
  const detail = peerCostPerUse
    ? `${plural(use.charges, 'charge', 'charges')} over ${use.period_days} days. The other measurable subscriptions cost ${euro(peerCostPerUse)} a use.`
    : `${plural(use.charges, 'charge', 'charges')} over ${use.period_days} days, and the ${label} connection last recorded something ${plural(use.days_since_last_use, 'day', 'days')} ago.`;
  return {
    kind: 'subscription_cost_per_use',
    month: series.last_seen ? firstOfMonth(series.last_seen) : null,
    sentence: `${nameOf(series)} has taken ${euro(total)} for ${plural(use.uses, 'use', 'uses')}, ${euro(use.cost_per_use)} each.`,
    detail,
    numbers: {
      typical_amount: use.typical_amount,
      charges: use.charges,
      total,
      uses: use.uses,
      cost_per_use: use.cost_per_use,
      peer_cost_per_use: peerCostPerUse,
      period_days: use.period_days,
      platform: use.platform,
    },
    receipts: rows.slice().reverse().slice(0, 4),
    evidence_count: use.charges + use.uses,
  };
}

function medianOf(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Everything the connections can say about the charges today, strongest first and at
 * most MAX_FINDINGS of them. Silence is the honest output: a series with one charge,
 * a series with no connector, or a window under three weeks produces nothing at all
 * rather than a softened claim.
 *
 * @param {object} input
 * @param {object[]} input.recurring  series from detectRecurring, each optionally
 *   carrying its `charges`: { id, occurred_at, amount } rows from money_transactions.
 * @param {Record<string, object[]>} input.eventsByPlatform  { spotify: [{ at, kind }] }
 * @param {Date|string} input.now
 * @returns {object[]} findings in analyst.js's shape
 */
export function readUsage({ recurring = [], eventsByPlatform = {}, now = new Date() } = {}) {
  const measured = [];
  for (const series of recurring) {
    if (!series?.merchant_key) continue;
    const use = subscriptionUse({ series, events: eventsByPlatform[resolvePlatform(series)] || [], now });
    /* The two evidence rules that gate every sentence below: a rhythm needs two
       charges, and a verdict needs a connection that would have seen the use. */
    if (use.charges < MIN_CHARGES || !use.platform) continue;
    measured.push({ series, use });
  }

  const findings = [];
  for (const { series, use } of measured) {
    if (use.verdict_hint === 'unused') {
      findings.push({ finding: unusedFinding(series, use), rank: 0, weight: use.typical_amount * use.charges });
      continue;
    }
    if (use.uses < 1 || use.cost_per_use === null) continue;
    /* The comparison is against the other subscriptions that can be measured at all --
       a tool nobody can check has no cost per use to compare with. */
    const peers = measured
      .filter((m) => m.series.merchant_key !== series.merchant_key && m.use.cost_per_use !== null)
      .map((m) => m.use.cost_per_use);
    const peer = medianOf(peers);
    const dearer = peer !== null && peer > 0 && use.cost_per_use >= peer * COST_PER_USE_MULTIPLE;
    const barelyTouched = use.uses <= 2 && use.period_days >= MONTH_MIN_DAYS;
    if (!dearer && !barelyTouched) continue;
    findings.push({ finding: costPerUseFinding(series, use, dearer ? round2(peer) : null), rank: 1, weight: use.cost_per_use });
  }

  return findings
    .sort((a, b) => (a.rank - b.rank) || (b.weight - a.weight))
    .slice(0, MAX_FINDINGS)
    .map((f) => f.finding);
}

/**
 * The series whose use nobody here can check, because no connector exists for them.
 * The caller shows this as the gap it is -- "nothing here can see whether Fly.io was
 * used" -- which is a truer line than any verdict inferred from an empty table.
 *
 * @returns {{merchant_key: string, typical_amount: number}[]} dearest first
 */
export function unmeasurable(recurring = []) {
  return (recurring || [])
    .filter((s) => s?.merchant_key && !resolvePlatform(s))
    .map((s) => ({ merchant_key: s.merchant_key, typical_amount: round2(Math.abs(Number(s.typical_amount) || 0)) }))
    .sort((a, b) => b.typical_amount - a.typical_amount);
}
