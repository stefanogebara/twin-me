/**
 * The ledger against the bank, read only.
 *
 * Asked on 2026-09-24 why the week's review named 30,00 EUR as what weighed most, the answer
 * was in the data, not the page: ten lines opened by the bank's own alert mails stood beside
 * the rows they announced. This reads a person's ledger and says, in order, the things that
 * would make a figure on a screen wrong:
 *
 *   1. lines with no shop, and whether a booked line of that figure sits beside them
 *   2. pairs that look like one payment counted twice
 *   3. what comes back every month, and whether the detector still sees it
 *   4. how old the newest payment and the newest bank row are
 *
 *   node --env-file=.env scripts/money/audit-ledger.mjs --user <uuid>
 *   node --env-file=.env scripts/money/audit-ledger.mjs --user <uuid> --days 30
 *
 * It writes nothing. It exits 1 when a rule is broken, so a schedule can run it.
 */
import { findMatch, MATCH_WINDOW_MS } from '../../api/_app/services/money/ledger.js';

const arg = (name, fallback = null) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && process.argv[at + 1] && !process.argv[at + 1].startsWith('--') ? process.argv[at + 1] : fallback;
};
const USER = arg('user');
const DAYS = Number(arg('days', '30'));
const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!USER || !URL || !KEY) { console.error('Need --user <uuid>, VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function all(path, page = 1000) {
  const rows = [];
  for (let at = 0; ; at += page) {
    const res = await fetch(`${URL}/rest/v1/${path}`, { headers: { ...headers, Range: `${at}-${at + page - 1}` } });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 200)}`);
    const got = JSON.parse(text);
    rows.push(...got);
    if (got.length < page) return rows;
  }
}

const eur = (n) => `${Math.abs(Number(n)).toFixed(2)} EUR`;
const day = (s) => String(s).slice(0, 10);
const blank = (key) => !key || key === 'unknown';
const ageDays = (s) => (Date.now() - Date.parse(s)) / 86400000;

const since = new Date(Date.now() - DAYS * 86400000).toISOString();
const transactions = await all(`money_transactions?user_id=eq.${USER}&occurred_at=gte.${since}&select=*&order=occurred_at.asc`);
const sightings = await all(`money_sightings?user_id=eq.${USER}&select=*&order=seen_at.asc`);
const recurring = await all(`money_recurring?user_id=eq.${USER}&select=*`);

const backings = new Map();
for (const s of sightings) {
  if (!s.transaction_id) continue;
  if (!backings.has(s.transaction_id)) backings.set(s.transaction_id, []);
  backings.get(s.transaction_id).push(s);
}
const faults = [];
console.log(`${transactions.length} payments in the last ${DAYS} days.\n`);

/* 1. A line with no shop. The bank's alert mail carries a figure and nothing else, so a line
      resting on one alone can only be read as "a payment without a name". */
const nameless = transactions.filter((t) => blank(t.merchant_key) && !t.merchant_raw && !t.merchant_name);
console.log(`Lines with no shop: ${nameless.length}`);
let twinned = 0;
for (const t of nameless) {
  const others = transactions.filter((x) => x.id !== t.id && !blank(x.merchant_key));
  const twin = findMatch({
    amount: Math.abs(Number(t.amount)), direction: Number(t.amount) >= 0 ? 'in' : 'out',
    currency: t.currency, merchant_key: 'unknown', occurred_at: t.occurred_at,
    account_id: t.account_id, card_last4: t.card_last4,
  }, others);
  const evidence = (backings.get(t.id) || []).map((s) => s.source).join('+') || 'none';
  if (twin) { twinned += 1; console.log(`  ${day(t.occurred_at)} ${eur(t.amount)} (${evidence}) sits beside ${twin.merchant_raw || twin.merchant_key} of ${day(twin.occurred_at)}`); }
  else console.log(`  ${day(t.occurred_at)} ${eur(t.amount)} (${evidence}) has no booked line of that figure`);
}
if (twinned) faults.push(`${twinned} nameless line${twinned === 1 ? '' : 's'} beside a booked line of the same figure: run merge-nameless-alerts.mjs`);

/* 2. One payment counted twice. Two lines of one figure on one account inside the window,
      each resting on evidence the other does not share. */
console.log('\nPairs that look like one payment counted twice:');
const pairs = [];
for (let i = 0; i < transactions.length; i += 1) {
  for (let j = i + 1; j < transactions.length; j += 1) {
    const a = transactions[i]; const b = transactions[j];
    if (Number(a.amount) !== Number(b.amount)) continue;
    if ((a.currency || 'EUR') !== (b.currency || 'EUR')) continue;
    if (Math.abs(Date.parse(a.occurred_at) - Date.parse(b.occurred_at)) > MATCH_WINDOW_MS) continue;
    const ka = a.merchant_key; const kb = b.merchant_key;
    if (!blank(ka) && !blank(kb) && ka !== kb) continue;
    const sa = new Set((backings.get(a.id) || []).map((s) => s.source));
    const sb = new Set((backings.get(b.id) || []).map((s) => s.source));
    if ([...sa].some((s) => sb.has(s))) continue; // two bank rows of one figure are two payments
    pairs.push([a, b]);
  }
}
if (!pairs.length) console.log('  none');
for (const [a, b] of pairs) console.log(`  ${eur(a.amount)}: ${day(a.occurred_at)} ${a.merchant_raw || 'no name'} and ${day(b.occurred_at)} ${b.merchant_raw || 'no name'}`);
if (pairs.length) faults.push(`${pairs.length} pair${pairs.length === 1 ? '' : 's'} may be one payment counted twice`);

/* 3. What comes back every month. is_subscription read false for everyone until 2026-09-24,
      because it was a lookup in a table that has never held a row. */
const subs = recurring.filter((r) => r.is_subscription);
console.log(`\nCharges that come back: ${recurring.length}, of them subscriptions: ${subs.length}`);
for (const r of recurring) console.log(`  ${r.merchant_key} ${r.cadence} ${eur(r.typical_amount)}, last ${day(r.last_seen)}, next ${day(r.next_expected)}${r.is_subscription ? ', a subscription' : ''}`);
if (recurring.length && !subs.length) faults.push('no series is marked a subscription: the flag is dead again');
for (const r of subs) {
  if (ageDays(r.next_expected) > 7) faults.push(`${r.merchant_key} was due ${day(r.next_expected)} and has not been seen`);
}

/* 4. How old the newest thing is. A ledger that stopped is the loudest fault of all and the
      hardest to see on a page, because a page full of last week looks like a page. */
const newest = transactions[transactions.length - 1];
const bank = sightings.filter((s) => s.source === 'bankfeed');
const newestBank = bank[bank.length - 1];
console.log('\nFreshness:');
console.log(`  newest payment ${newest ? `${day(newest.occurred_at)}, ${ageDays(newest.occurred_at).toFixed(1)} days old` : 'none'}`);
console.log(`  newest bank row ${newestBank ? `${day(newestBank.seen_at)}, ${ageDays(newestBank.seen_at).toFixed(1)} days old` : 'none'}`);
if (newest && ageDays(newest.occurred_at) > 3) faults.push(`the newest payment is ${ageDays(newest.occurred_at).toFixed(1)} days old`);
if (newestBank && ageDays(newestBank.seen_at) > 2) faults.push(`the newest bank row is ${ageDays(newestBank.seen_at).toFixed(1)} days old: the pull may have stopped`);

console.log('');
if (!faults.length) { console.log('Nothing to answer for.'); process.exit(0); }
for (const f of faults) console.log(`FAULT ${f}`);
process.exit(1);
