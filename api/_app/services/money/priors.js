/**
 * Borrowed strength: what other people's ledgers say about a place, and what a student's
 * month looks like before this one has shown its own.
 * ====================================================================================
 * A merchant seen three times by one person is a thin reading: three prices, two gaps.
 * The same merchant across other people's ledgers is a thick one. Each estimate is
 * shrunk toward the pooled prior with weight n / (n + phi), so three visits lean on the
 * pool and thirty barely notice it (partial pooling; Bai and Chu 2025, arXiv 2511.12749,
 * the hierarchical TSB; Zhang et al. 2018, arXiv 1806.05362, borrowing from similar
 * users). Only aggregates cross between people: a median amount, a median gap, a count.
 * Never a row, never a name, and never the person's own rows, which the caller leaves
 * out (leave-one-out), so one person alone gets no prior and nothing changes for them.
 *
 * Before there is any ledger at all, a student in Madrid is not a blank: transport and
 * groceries have known prices. The month prior below comes from the September 2026
 * research pass and is used only once the person's rent is known, because a student with
 * family and one with a room are a factor of three apart. The sentence that uses it names
 * it as a typical student month, never as this person's.
 *
 * Pure: rows in, numbers out.
 */

/** Charges' worth of weight the pool carries: at phi visits of their own, half and half. */
export const PHI = 4;
/** A merchant is pooled only once this many other people have it, so nobody's single
 *  ledger stands in for a population. */
export const MIN_POOL_USERS = 2;

const r2 = (n) => Math.round(Number(n) * 100) / 100;
function median(xs) {
  const s = xs.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * The pooled prior per merchant from OTHER people's stored profiles.
 * @param {object[]} others  money_merchant_profiles rows of other users:
 *                           { user_id, merchant_key, times, typical_amount, median_gap_days }
 * @returns {Map<string, {users:number, times:number, typical_amount:number|null, median_gap_days:number|null}>}
 */
export function poolMerchantPriors(others = []) {
  const byKey = new Map();
  for (const r of others || []) {
    if (!r || !r.merchant_key) continue;
    if (!byKey.has(r.merchant_key)) byKey.set(r.merchant_key, []);
    byKey.get(r.merchant_key).push(r);
  }
  const priors = new Map();
  for (const [key, rows] of byKey) {
    const users = new Set(rows.map((r) => r.user_id)).size;
    if (users < MIN_POOL_USERS) continue;
    priors.set(key, {
      users,
      times: rows.reduce((s, r) => s + (Number(r.times) || 0), 0),
      typical_amount: median(rows.map((r) => r.typical_amount).filter((x) => x !== null && x !== undefined)),
      median_gap_days: median(rows.map((r) => r.median_gap_days).filter((x) => x !== null && x !== undefined)),
    });
  }
  return priors;
}

/** Partial pooling of one estimate: n of the person's own against phi of the pool's. */
export function shrink(own, n, prior, phi = PHI) {
  if (prior === null || prior === undefined || !Number.isFinite(Number(prior))) return own;
  if (own === null || own === undefined || !Number.isFinite(Number(own))) return Number(prior);
  const w = n / (n + phi);
  return w * Number(own) + (1 - w) * Number(prior);
}

/**
 * The person's merchant profiles, each leaning on the pool in proportion to how little
 * it has seen. The profile records what it borrowed so a sentence can say so.
 * @param {object[]} profiles  from brain.learnMerchants
 * @param {Map} priors         from poolMerchantPriors
 */
export function applyPriors(profiles = [], priors = new Map()) {
  if (!priors || !priors.size) return profiles;
  return (profiles || []).map((p) => {
    const prior = priors.get(p.merchant_key);
    if (!prior) return p;
    const n = Number(p.times) || 0;
    const out = { ...p, prior: { users: prior.users, weight: r2(1 - n / (n + PHI)) } };
    if (prior.typical_amount !== null) out.typical_amount = r2(shrink(p.typical_amount, n, prior.typical_amount));
    /* Gaps count one fewer than visits; a merchant seen once has no gap of its own. */
    if (prior.median_gap_days !== null) {
      const gaps = Math.max(0, n - 1);
      out.median_gap_days = Math.round(shrink(p.median_gap_days, gaps, prior.median_gap_days) * 10) / 10;
    }
    return out;
  });
}

/* ------------------------------------------------------------------ a student's month */

/**
 * What a month costs a student living away from home in Madrid, on top of the rent:
 * abono joven 10 EUR, groceries 200 to 250, eating out and nights 100 to 200, phone,
 * gym and the odd thing, about 500 EUR (research pass of 2026-09-13: idealista Q1 2026,
 * Comunidad de Madrid, press compilations). The rent itself is the person's own number.
 */
export const LIVING_BEYOND_RENT = Object.freeze({ amount: 500, low: 400, high: 650 });
/** A rent-sized standing commitment is the sign of living away. */
const RENT_WORDS = /rent|alquiler|piso|habitaci|room|flat/i;
export const RENT_FLOOR = 200;

/**
 * The prior for this person's month, or null when it does not know where they live. It
 * speaks only once a rent is known, because a student with family and a student with a
 * room are a factor of three apart and guessing between them would be a number wearing
 * a suit. The label is the sentence's basis: a typical month, never this person's.
 * @param {object[]} facts  money_facts rows { kind, subject, amount }
 */
export function studentMonth(facts = []) {
  const rent = (facts || []).find((f) => f.kind === 'commitment' && Number(f.amount) > 0
    && (RENT_WORDS.test(String(f.subject || '')) || Number(f.amount) >= RENT_FLOOR));
  if (!rent) return null;
  const r = Number(rent.amount);
  return {
    amount: r2(r + LIVING_BEYOND_RENT.amount),
    low: r2(r + LIVING_BEYOND_RENT.low),
    high: r2(r + LIVING_BEYOND_RENT.high),
    rent: r2(r),
    basis: 'student_prior',
    label: 'a typical student month in Madrid on top of your rent',
  };
}
