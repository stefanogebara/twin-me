/**
 * Ledger: sightings become transactions.
 * ======================================
 * A sighting is what one channel saw. A transaction is the reconciled fact.
 * reconcile() matches a new sighting to an existing transaction when merchant
 * key, amount (within 1%) and time (within 36 hours) agree, otherwise it opens
 * a new transaction. The bank feed wins on amount and posting date; the phone
 * wins on the minute. Pure: arrays in, decisions out; store.js applies them.
 */

export const MATCH_WINDOW_MS = 36 * 60 * 60 * 1000;
export const AMOUNT_TOLERANCE = 0.01;
const SOURCE_PRIORITY = { bankfeed: 3, statement: 2, phone: 1, bizum: 1, gmail: 0 };

/** Signed amount: out is negative, in is positive. */
export function signedAmount(s) {
  const a = Math.abs(Number(s.amount) || 0);
  return s.direction === 'in' ? a : -a;
}

function closeEnough(a, b) {
  const x = Math.abs(a); const y = Math.abs(b);
  if (x === 0 && y === 0) return true;
  return Math.abs(x - y) <= Math.max(x, y) * AMOUNT_TOLERANCE + 0.005;
}

function sameMerchant(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  // "mercadona" vs "mercadona madrid": one key is a prefix of the other.
  return a.startsWith(b + ' ') || b.startsWith(a + ' ');
}

/**
 * Find the transaction a sighting belongs to, if any.
 * @param {object} sighting  { amount, direction, merchant_key, occurred_at }
 * @param {object[]} transactions  candidate rows { id, amount, merchant_key, occurred_at }
 */
export function findMatch(sighting, transactions) {
  const t0 = new Date(sighting.occurred_at).getTime();
  const signed = signedAmount(sighting);
  let best = null; let bestDt = Infinity;
  for (const t of transactions) {
    if (!closeEnough(Number(t.amount), signed) || Math.sign(Number(t.amount)) !== Math.sign(signed)) continue;
    if (!sameMerchant(t.merchant_key, sighting.merchant_key) && sighting.merchant_key !== 'unknown' && t.merchant_key !== 'unknown') continue;
    const dt = Math.abs(new Date(t.occurred_at).getTime() - t0);
    if (dt <= MATCH_WINDOW_MS && dt < bestDt) { best = t; bestDt = dt; }
  }
  return best;
}

/**
 * Decide what a sighting does to the ledger.
 * @returns {{ action: 'create'|'attach', transaction: object, sighting: object }}
 *   create: transaction is a new row to insert; attach: transaction is the existing row with the fields to update.
 */
export function reconcile(sighting, transactions, primarySightingSource = null) {
  const match = findMatch(sighting, transactions);
  if (!match) {
    return {
      action: 'create',
      transaction: {
        occurred_at: sighting.occurred_at,
        posted_at: sighting.source === 'bankfeed' || sighting.source === 'statement' ? sighting.occurred_at : null,
        amount: signedAmount(sighting),
        currency: sighting.currency || 'EUR',
        merchant_raw: sighting.merchant_raw || null,
        merchant_key: sighting.merchant_key || 'unknown',
        channel: sighting.channel || null,
        card_last4: sighting.card_last4 || null,
      },
      sighting,
    };
  }
  // Attach: a higher-priority source corrects amount and posting date; the phone keeps the minute.
  const incoming = SOURCE_PRIORITY[sighting.source] ?? 0;
  const current = SOURCE_PRIORITY[primarySightingSource] ?? -1;
  const update = {};
  if (incoming > current) {
    update.amount = signedAmount(sighting);
    if (sighting.source === 'bankfeed' || sighting.source === 'statement') update.posted_at = sighting.occurred_at;
    if (sighting.merchant_raw && (!match.merchant_raw || sighting.source === 'bankfeed')) update.merchant_raw = sighting.merchant_raw;
    update.primary_sighting_id = sighting.id ?? null;
  }
  if ((sighting.source === 'phone' || sighting.source === 'bizum') && match.posted_at && !match.occurred_from_phone) {
    update.occurred_at = sighting.occurred_at; // the swipe, not the booking
  }
  if (!match.card_last4 && sighting.card_last4) update.card_last4 = sighting.card_last4;
  return { action: 'attach', transaction: { id: match.id, ...update }, sighting };
}

/** Group transactions into episodes: within `gapMs` of the previous one and, when known, the same place. */
export function clusterEpisodes(transactions, gapMs = 3 * 60 * 60 * 1000) {
  const sorted = [...transactions].filter((t) => Number(t.amount) < 0).sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
  const episodes = [];
  for (const t of sorted) {
    const last = episodes[episodes.length - 1];
    const at = new Date(t.occurred_at).getTime();
    if (last && at - last.endMs <= gapMs && (!t.place_class || !last.place_class || t.place_class === last.place_class)) {
      last.transactions.push(t); last.endMs = at; last.total += Math.abs(Number(t.amount));
      last.place_class = last.place_class || t.place_class || null;
    } else {
      episodes.push({ startMs: at, endMs: at, total: Math.abs(Number(t.amount)), place_class: t.place_class || null, transactions: [t] });
    }
  }
  return episodes.map((e) => ({
    started_at: new Date(e.startMs).toISOString(),
    ended_at: new Date(e.endMs).toISOString(),
    total: Math.round(e.total * 100) / 100,
    transaction_count: e.transactions.length,
    place_class: e.place_class,
    transaction_ids: e.transactions.map((t) => t.id).filter(Boolean),
  }));
}
