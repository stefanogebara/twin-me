/**
 * The bank's alert mail is not a second payment.
 *
 * Santander mails "movimiento de -10,93 EUR en tu cuenta acabada en 7516": a figure, no
 * shop. Until 2026-09-24 findMatch refused any candidate whose merchant key was unknown, so
 * every such alert opened a ledger line of its own beside the bank row it was announcing.
 * Ten stood in production that day -- 80,99 EUR of spending and a 500,00 EUR arrival that
 * never happened twice -- and the week's review read them as the payments that weighed most.
 *
 * findMatch now joins a nameless sighting to a named line of the same figure, account and
 * card inside the four-day window. This repairs the lines already written, using that very
 * function, so the repair and the live rule cannot drift apart.
 *
 *   node --env-file=.env scripts/money/merge-nameless-alerts.mjs --user <uuid>
 *   node --env-file=.env scripts/money/merge-nameless-alerts.mjs --user <uuid> --apply
 *
 * By default it is as careful as the live rule and will not put a second alert on a line
 * that already carries one: two alerts usually mean two payments. --settled lifts that for
 * alerts older than the match window, where the argument is arithmetic rather than a guess.
 * The bank has had longer than the window to book a payment of its own and has not, so the
 * alert is announcing the booking that is already there. Three such lines stood after the
 * first pass of 2026-09-24: a second 19,00 EUR against one booked Bolt ride, a second
 * 22,36 EUR against one booked Playtomic, a second 3,00 EUR against one booked vending
 * machine. A line the bank may still book is younger than the window and is never touched.
 *
 * It reads and reports by default. With --apply it moves each alert's evidence onto the line
 * it belongs to and deletes the empty line, after writing every row it is about to touch to
 * --backup (default: money-nameless-backup.json).
 */
import { writeFileSync } from 'node:fs';
import { findMatch, MATCH_WINDOW_MS } from '../../api/_app/services/money/ledger.js';

const arg = (name, fallback = null) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && process.argv[at + 1] && !process.argv[at + 1].startsWith('--') ? process.argv[at + 1] : fallback;
};
const USER = arg('user');
const APPLY = process.argv.includes('--apply');
const SETTLED = process.argv.includes('--settled');
const BACKUP = arg('backup', 'money-nameless-backup.json');
const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!USER || !URL || !KEY) { console.error('Need --user <uuid>, VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function rest(path, init = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
async function all(path, page = 1000) {
  const rows = [];
  for (let at = 0; ; at += page) {
    const got = await rest(path, { headers: { Range: `${at}-${at + page - 1}` } });
    rows.push(...got);
    if (got.length < page) return rows;
  }
}

const eur = (n) => `${Number(n).toFixed(2)} EUR`;
const blank = (key) => !key || key === 'unknown';

const transactions = await all(`money_transactions?user_id=eq.${USER}&select=*&order=occurred_at.asc`);
const sightings = await all(`money_sightings?user_id=eq.${USER}&select=*&order=seen_at.asc`);

const backings = new Map();
for (const s of sightings) {
  if (!s.transaction_id) continue;
  if (!backings.has(s.transaction_id)) backings.set(s.transaction_id, []);
  backings.get(s.transaction_id).push(s);
}

/* A line worth repairing carries no name and rests on alert evidence alone: every sighting
   behind it names no shop. A line a person named by hand, or one the bank later named, is
   not touched. */
const orphans = transactions.filter((t) => {
  if (!blank(t.merchant_key) || t.merchant_raw || t.merchant_name) return false;
  const rows = backings.get(t.id) || [];
  return rows.length > 0 && rows.every((s) => blank(s.merchant_key) && !s.merchant_raw);
});

const byId = new Map(transactions.map((t) => [t.id, t]));
const moves = []; const kept = [];
const taken = new Set();
for (const orphan of orphans) {
  const rows = backings.get(orphan.id);
  const alert = rows[0];
  /* The same rule the ingestion runs: the orphan itself is out of the running, and so is any
     line already carrying evidence from this alert's own source, or already repaired in this
     pass. */
  const settled = Date.now() - Date.parse(orphan.occurred_at) > MATCH_WINDOW_MS;
  const exclude = new Set([orphan.id, ...(SETTLED && settled ? [] : taken)]);
  /* A line already carrying evidence from this alert's own source is out of the running, as
     it is in the live rule -- unless the alert has outlived the window the bank books in. */
  if (!(SETTLED && settled)) {
    for (const t of transactions) {
      if ((backings.get(t.id) || []).some((s) => s.source === alert.source)) exclude.add(t.id);
    }
  }
  const candidates = transactions.filter((t) => !orphans.some((o) => o.id === t.id));
  const match = findMatch({
    amount: Math.abs(Number(orphan.amount)),
    direction: Number(orphan.amount) >= 0 ? 'in' : 'out',
    currency: orphan.currency,
    merchant_key: 'unknown',
    occurred_at: orphan.occurred_at,
    account_id: orphan.account_id,
    card_last4: orphan.card_last4,
  }, candidates, { exclude });
  if (!match) {
    /* Say which of the two reasons it is, because they mean different things: a figure the
       bank never booked is a payment with no name, and one it booked on a line that already
       carries an alert is a second alert waiting for the window to pass. */
    const booked = findMatch({
      amount: Math.abs(Number(orphan.amount)), direction: Number(orphan.amount) >= 0 ? 'in' : 'out',
      currency: orphan.currency, merchant_key: 'unknown', occurred_at: orphan.occurred_at,
      account_id: orphan.account_id, card_last4: orphan.card_last4,
    }, candidates, { exclude: new Set([orphan.id]) });
    kept.push({ row: orphan, why: !booked
      ? `no booked line of that figure within ${MATCH_WINDOW_MS / 86400000} days`
      : settled ? 'its figure is booked on a line that already carries an alert (pass --settled)'
        : 'its figure is booked on a line that already carries an alert, and the bank may still book this one' });
    continue;
  }
  taken.add(match.id);
  moves.push({ orphan, match, alerts: rows });
}

console.log(`${transactions.length} lines, ${orphans.length} of them nameless and backed only by alerts.`);
for (const { orphan, match, alerts } of moves) {
  const name = match.merchant_name || match.merchant_raw || match.merchant_key;
  const days = ((Date.parse(match.occurred_at) - Date.parse(orphan.occurred_at)) / 86400000).toFixed(1);
  console.log(`  ${orphan.occurred_at.slice(0, 10)} ${eur(orphan.amount)} -> ${name} ${match.occurred_at.slice(0, 10)} (${days} days, ${alerts.length} alert${alerts.length === 1 ? '' : 's'})`);
}
for (const { row, why } of kept) console.log(`  kept ${row.occurred_at.slice(0, 10)} ${eur(row.amount)}: ${why}`);

const spend = moves.reduce((n, m) => n + (Number(m.orphan.amount) < 0 ? -Number(m.orphan.amount) : 0), 0);
const income = moves.reduce((n, m) => n + (Number(m.orphan.amount) > 0 ? Number(m.orphan.amount) : 0), 0);
console.log(`\n${moves.length} lines to fold: ${eur(spend)} of spending and ${eur(income)} of arrivals counted twice.`);

if (!moves.length) process.exit(0);
if (!APPLY) { console.log('\nRead only. Pass --apply to write.'); process.exit(0); }

writeFileSync(BACKUP, JSON.stringify({ at: new Date().toISOString(), user: USER, moves: moves.map((m) => ({ orphan: m.orphan, match: byId.get(m.match.id), alerts: m.alerts })) }, null, 2));
console.log(`\nBacked up to ${BACKUP}.`);

for (const { orphan, match, alerts } of moves) {
  for (const s of alerts) {
    await rest(`money_sightings?id=eq.${s.id}`, { method: 'PATCH', body: JSON.stringify({ transaction_id: match.id }) });
  }
  /* The alert never outranks the bank, so the line keeps its own primary evidence; only a
     line whose primary was the alert itself needs a new one, and that cannot happen here:
     the match is a line the alert never backed. */
  await rest(`money_transactions?id=eq.${orphan.id}`, { method: 'DELETE' });
  console.log(`  folded ${orphan.id.slice(0, 8)} into ${match.id.slice(0, 8)}`);
}
console.log(`\nDone. ${moves.length} lines folded.`);
