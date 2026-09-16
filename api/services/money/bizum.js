/**
 * The Bizum ledger: money between people, and who still owes what.
 * ==================================================================
 * A bank row to a person is not a cost and a bank row from a person is not income; they
 * are one half of something between two people. A dinner paid on one card and settled by
 * four Bizums is the commonest shape a student's ledger has, and every app in the market
 * reads it as five unrelated lines. This module reads it as one thing with a state: paid
 * for, split so many ways, settled by these people, still open by this much.
 *
 * Two ways a split becomes known. The person says so, in Ask ("I paid dinner for five")
 * or by answering the question this module raises; or the ledger sees it on its own: an
 * outgoing payment followed within days by two or more incoming person movements that
 * each look like an equal share of it. The ledger's guess is only ever a question, never
 * a fact: a split is recorded as a fact of kind `split` (subject the payment's id, value
 * the number of ways) and read from there.
 *
 * Once a split is a fact, three things change: the person's own share of the payment is
 * one part, not the whole (forecast, allowance); the repayments are settlements, not
 * income; and the open amount is a finding with its receipts, said the same evening.
 * The discourse that shaped this: "cuando alguien paga y quedamos en hacerle Bizum, se le
 * hace ipsofacto, nada de luego te lo hago"; the win is timing, not arithmetic.
 *
 * Pure: rows and facts in, questions, findings and functions out.
 */

/** Days after a payment within which an incoming person movement can settle it. */
export const SETTLE_DAYS = 30;
/** Days after a payment within which incoming shares make the ledger suspect a split. */
export const DETECT_DAYS = 4;
/** How far a repayment may sit from the exact share and still be that share. */
export const SHARE_TOLERANCE = 0.15;
/** A payment under this is not worth a question about splitting. */
export const DETECT_MIN = 15;
/** How many ways a split can go. */
export const MIN_WAYS = 2;
export const MAX_WAYS = 12;
/** The kinds of fact this module writes and reads. */
export const SPLIT_KIND = 'split';
export const SPLIT_OPEN = 'split_open';
export const NOT_SPLIT = 'not split';

const DAY = 86400000;
const PERSON_CHANNELS = new Set(['bizum', 'transfer']);
const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
/* The same form the analyst uses on the screen: Intl's own, sign and no-break space kept. */
const euro = (n) => EUR.format(Math.abs(Number(n) || 0));
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const abs = (t) => Math.abs(Number(t.amount) || 0);
const at = (t) => new Date(t.occurred_at).getTime();
const nameOf = (t) => t.merchant_name || t.merchant_raw || t.merchant_key || 'someone';
/** A first name and an initial: what a person would say, not what the bank printed. */
export function shortName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'someone';
  const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
  return parts.length > 1 ? `${first} ${parts[1].charAt(0).toUpperCase()}.` : first;
}
/** "Ana L., Luis P. and Marta R." */
function listOf(names) { return names.length > 2 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join(' and '); }
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function dayWord(iso, now) {
  const d = new Date(iso); const diff = Math.round((new Date(now.toISOString().slice(0, 10)).getTime() - new Date(iso.slice(0, 10)).getTime()) / DAY);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 7) return WEEKDAYS[d.getUTCDay()];
  return `the ${d.getUTCDate()}${['th', 'st', 'nd', 'rd'][(d.getUTCDate() % 10 > 3 || [11, 12, 13].includes(d.getUTCDate() % 100)) ? 0 : d.getUTCDate() % 10]}`;
}

/* ------------------------------------------------------------------ people */

/** Every movement to or from a person: Bizum and transfers, both directions. */
export function personMovements(transactions = []) {
  return (transactions || [])
    .filter((t) => t && t.occurred_at && PERSON_CHANNELS.has(t.channel) && Number.isFinite(Number(t.amount)))
    .map((t) => ({ ...t, person: nameOf(t), direction: Number(t.amount) > 0 ? 'in' : 'out' }));
}

/* ------------------------------------------------------------------ splits as facts */

/** The splits the person has confirmed: payment id to number of ways. */
export function splitFacts(facts = []) {
  const out = new Map();
  for (const f of facts || []) {
    if (f.kind !== SPLIT_KIND || !f.subject) continue;
    const ways = Number(f.value);
    if (Number.isInteger(ways) && ways >= MIN_WAYS && ways <= MAX_WAYS) out.set(String(f.subject), ways);
  }
  return out;
}

/**
 * How one split stands: which incoming person movements settled a share of it, how many
 * shares are paid, and what is still open. A repayment is an incoming person movement in
 * the SETTLE_DAYS after the payment, within SHARE_TOLERANCE of one share, one per person.
 */
export function splitProgress(payment, ways, transactions = [], opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const total = abs(payment);
  const share = r2(total / ways);
  const from = at(payment);
  const until = Math.min(now.getTime(), from + SETTLE_DAYS * DAY);
  const seen = new Set();
  const repayments = personMovements(transactions)
    .filter((m) => m.direction === 'in' && at(m) >= from && at(m) <= until)
    .filter((m) => Math.abs(abs(m) - share) <= Math.max(0.5, share * SHARE_TOLERANCE))
    .sort((a, b) => at(a) - at(b))
    .filter((m) => { const k = m.merchant_key || m.person; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, ways - 1);
  const paid = repayments.length;
  const expected = ways - 1;
  return {
    payment_id: payment.id,
    ways,
    share,
    mine: share,
    expected,
    paid,
    open: r2(Math.max(0, (expected - paid) * share)),
    settled: paid >= expected,
    repayments,
    repayment_ids: repayments.map((m) => m.id),
  };
}

/** The person's own share of a payment, from the split facts, or null when it is theirs whole. */
export function splitShareOf(facts = []) {
  const splits = splitFacts(facts);
  return (t) => (t && t.id && splits.has(String(t.id)) ? 1 / splits.get(String(t.id)) : null);
}

/** Incoming rows that are settlements of a confirmed split: money coming back, not income. */
export function reimbursementIds(facts = [], transactions = [], opts = {}) {
  const splits = splitFacts(facts);
  const byId = new Map((transactions || []).map((t) => [String(t.id), t]));
  const out = new Set();
  for (const [id, ways] of splits) {
    const payment = byId.get(id);
    if (!payment) continue;
    for (const rid of splitProgress(payment, ways, transactions, opts).repayment_ids) out.add(rid);
  }
  return out;
}

/* ------------------------------------------------------------------ the ledger's own guess */

/**
 * Outgoing payments that look split: within DETECT_DAYS after, two or more incoming
 * person movements from different people that each look like an equal share for some
 * number of ways. Returns candidates, best first, none that is already a fact or refused.
 */
export function detectSplits(transactions = [], facts = [], opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const known = splitFacts(facts);
  const refused = new Set((facts || []).filter((f) => f.kind === SPLIT_KIND && String(f.value).toLowerCase() === NOT_SPLIT).map((f) => String(f.subject)));
  const incoming = personMovements(transactions).filter((m) => m.direction === 'in');
  const out = [];
  for (const p of transactions || []) {
    if (!p || !p.id || !p.occurred_at || Number(p.amount) >= 0 || PERSON_CHANNELS.has(p.channel)) continue;
    if (abs(p) < DETECT_MIN || known.has(String(p.id)) || refused.has(String(p.id))) continue;
    const from = at(p); const until = Math.min(now.getTime(), from + DETECT_DAYS * DAY);
    const after = incoming.filter((m) => at(m) >= from && at(m) <= until);
    if (after.length < 2) continue;
    let best = null;
    for (let ways = MIN_WAYS; ways <= MAX_WAYS; ways += 1) {
      const share = abs(p) / ways;
      const seen = new Set();
      const hits = after.filter((m) => Math.abs(abs(m) - share) <= Math.max(0.5, share * SHARE_TOLERANCE))
        .filter((m) => { const k = m.merchant_key || m.person; if (seen.has(k)) return false; seen.add(k); return true; });
      if (hits.length >= 2 && hits.length <= ways - 1 && (!best || hits.length > best.hits.length)) best = { ways, hits };
    }
    if (!best) continue;
    out.push({
      payment: p,
      ways: best.ways,
      repayments: best.hits,
      /* Two of four shares back is a fair guess; three of four is nearly certain. */
      confidence: r2(Math.min(0.95, 0.5 + 0.15 * best.hits.length)),
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence || abs(b.payment) - abs(a.payment));
}

/** The ledger's guess, as a question with its receipts, in the question layer's shape. */
export function splitQuestions(candidates = [], opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  return (candidates || []).slice(0, 3).map((c) => {
    const list = listOf(c.repayments.map((m) => shortName(m.person)));
    return {
      id: `split:${c.payment.id}`,
      kind: SPLIT_KIND,
      subject: String(c.payment.id),
      subjectLabel: nameOf(c.payment),
      ask: `You paid ${euro(abs(c.payment))} at ${nameOf(c.payment)} ${dayWord(c.payment.occurred_at, now)}, and ${list} sent you ${euro(abs(c.repayments[0]))} each. Was that split?`,
      say: { key: 'You paid {amount} at {name} {day}, and {who} sent you {each} each. Was that split?', vars: { amount: euro(abs(c.payment)), name: nameOf(c.payment), day: c.payment.occurred_at, who: list, each: euro(abs(c.repayments[0])) } },
      help: 'Say how many people it was for, you included.',
      why: 'A dinner split five ways is one fifth of your money, and the Bizums back are not income.',
      changes: 'your share of this payment, and who still owes you',
      input: `choice:${Array.from({ length: 7 }, (_, i) => String(i + 2)).join(',')},${NOT_SPLIT}`,
      receipts: [c.payment, ...c.repayments].slice(0, 3),
      weight: abs(c.payment),
      suggested: String(c.ways),
    };
  });
}

/* ------------------------------------------------------------------ what it says */

/**
 * One finding per confirmed split with something still open, newest first, with the
 * payment and the repayments as receipts. A settled split says nothing: the person can
 * see it in the ledger, and a line about money that already came back is noise.
 */
export function splitFindings(facts = [], transactions = [], opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const splits = splitFacts(facts);
  const byId = new Map((transactions || []).map((t) => [String(t.id), t]));
  const out = [];
  for (const [id, ways] of splits) {
    const payment = byId.get(id);
    if (!payment) continue;
    const s = splitProgress(payment, ways, transactions, { now });
    if (s.settled) continue;
    const who = s.repayments.map((m) => shortName(m.person));
    const paidText = s.paid === 0 ? 'nobody has paid yet' : `${listOf(who)} ${s.paid === 1 ? 'has' : 'have'} paid`;
    out.push({
      kind: SPLIT_OPEN,
      month: payment.occurred_at.slice(0, 10),
      sentence: `${nameOf(payment)} ${dayWord(payment.occurred_at, now)}, ${euro(abs(payment))} split ${ways} ways: ${paidText}, ${euro(s.open)} still open.`,
      detail: `Your share is ${euro(s.share)}. ${s.expected - s.paid} of ${s.expected} shares still to come.`,
      numbers: { name: nameOf(payment), who, on: payment.occurred_at, total: abs(payment), ways, share: s.share, paid: s.paid, expected: s.expected, open: s.open },
      receipts: [payment, ...s.repayments].slice(0, 3),
      evidence_count: 1 + s.paid,
    });
  }
  return out.sort((a, b) => (a.month < b.month ? 1 : -1));
}

/**
 * What stands between this person and each name in the window: sent, received, net, and
 * the role if known. Sorted by how much moved. For the twin's context and for a page.
 */
export function balances(transactions = [], facts = [], opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const days = opts.days ?? 90;
  const since = now.getTime() - days * DAY;
  const roles = new Map((facts || []).filter((f) => f.kind === 'person').map((f) => [f.subject, f.value]));
  const settlements = reimbursementIds(facts, transactions, { now });
  const by = new Map();
  for (const m of personMovements(transactions)) {
    if (at(m) < since) continue;
    const key = m.merchant_key || m.person;
    if (!by.has(key)) by.set(key, { key, name: shortName(m.person), role: roles.get(key) || null, sent: 0, received: 0, settlements: 0, count: 0, last: m.occurred_at });
    const b = by.get(key);
    if (m.direction === 'out') b.sent += abs(m); else if (settlements.has(m.id)) b.settlements += abs(m); else b.received += abs(m);
    b.count += 1;
    if (m.occurred_at > b.last) b.last = m.occurred_at;
  }
  return [...by.values()]
    .map((b) => ({ ...b, sent: r2(b.sent), received: r2(b.received), settlements: r2(b.settlements), net: r2(b.received + b.settlements - b.sent) }))
    .sort((a, b) => (b.sent + b.received + b.settlements) - (a.sent + a.received + a.settlements));
}

/** The same, as plain lines the twin can be handed. */
export function describeBetweenPeople(rows = []) {
  return (rows || []).slice(0, 8).map((b) => {
    const parts = [];
    if (b.received) parts.push(`sent you ${euro(b.received)}`);
    if (b.settlements) parts.push(`paid you back ${euro(b.settlements)}`);
    if (b.sent) parts.push(`you sent ${euro(b.sent)}`);
    return `${b.name}${b.role ? ` (${b.role})` : ''}: ${parts.join(', ')} in 90 days.`;
  });
}
