/**
 * One payment, one line: merge the copies the feed made before it carried its old names.
 *
 * Until 2026-09-18 a bank row that changed identity -- pending, then booked with no
 * reference of its own, then booked with the reference the bank hands out -- opened a new
 * ledger line each time, because the new name carried no trace of the old one. The feed now
 * carries every earlier name (enableBanking.toSighting), so no new copies are made. This
 * repairs the ones already written.
 *
 * Two payments are the same payment when their bank rows have the same fingerprint: the same
 * account, date, amount, currency, direction and narrative -- the same identity the feed
 * itself computes. A fingerprint shared by rows carrying two different bank references is two
 * real payments (two coffees at one price on one day), and is left alone and reported.
 *
 *   node --env-file=.env scripts/money/merge-duplicate-payments.mjs --user <uuid>
 *   node --env-file=.env scripts/money/merge-duplicate-payments.mjs --user <uuid> --apply
 *
 * It reads and reports by default. With --apply it writes, after saving every row it is
 * about to touch to --backup (default: money-merge-backup.json).
 */
import { writeFileSync } from 'node:fs';
import { toSighting } from '../../api/services/money/feeds/enableBanking.js';

const arg = (name, fallback = null) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && process.argv[at + 1] && !process.argv[at + 1].startsWith('--') ? process.argv[at + 1] : fallback;
};
const USER = arg('user');
const APPLY = process.argv.includes('--apply');
const BACKUP = arg('backup', 'money-merge-backup.json');
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
/** PostgREST caps a page; walk it. */
async function all(path, page = 1000) {
  const rows = [];
  for (let at = 0; ; at += page) {
    const got = await rest(`${path}&limit=${page}&offset=${at}`);
    rows.push(...got);
    if (got.length < page) return rows;
  }
}

/** The identity the feed computes for a bank row, with the bank's own reference removed. */
function fingerprintOf(sighting) {
  if (sighting.source !== 'bankfeed' || !sighting.raw_json) return null;
  const bare = { ...sighting.raw_json, entry_reference: undefined, transaction_id: undefined, status: 'BOOK' };
  const ref = toSighting(bare, sighting.account_id || null).source_ref;
  return ref.startsWith('bank:fallback:') ? ref.slice('bank:fallback:'.length) : null;
}

const euros = (n) => `${Number(n).toFixed(2).replace('.', ',')} EUR`;

const transactions = await all(`money_transactions?user_id=eq.${USER}&select=*&order=occurred_at`);
const sightings = await all(`money_sightings?user_id=eq.${USER}&select=*&order=created_at`);
const byId = new Map(transactions.map((t) => [t.id, t]));
const sightingsOf = new Map();
for (const s of sightings) {
  if (!s.transaction_id) continue;
  if (!sightingsOf.has(s.transaction_id)) sightingsOf.set(s.transaction_id, []);
  sightingsOf.get(s.transaction_id).push(s);
}

/* Group the lines by the identity of the bank rows behind them. */
const groups = new Map();
for (const s of sightings) {
  const print = fingerprintOf(s);
  if (!print || !s.transaction_id) continue;
  if (!groups.has(print)) groups.set(print, new Set());
  groups.get(print).add(s.transaction_id);
}

let merges = []; const ambiguous = [];
for (const [print, ids] of groups) {
  if (ids.size < 2) continue;
  const lines = [...ids].map((id) => byId.get(id)).filter(Boolean);
  if (lines.length < 2) continue;
  const evidence = lines.flatMap((t) => sightingsOf.get(t.id) || []);
  const references = new Set(evidence.map((s) => s.raw_json?.entry_reference).filter(Boolean));
  if (references.size > 1) { ambiguous.push({ print, lines, references: [...references] }); continue; }
  /* The line that keeps the payment: the one the bank has booked, else the one seen first. */
  const survivor = lines.slice().sort((a, b) => (
    Number(Boolean(b.posted_at)) - Number(Boolean(a.posted_at))
    || Number(Boolean(b.account_id)) - Number(Boolean(a.account_id))
    || Date.parse(a.created_at) - Date.parse(b.created_at)
  ))[0];
  merges.push({ print, survivor, losers: lines.filter((t) => t.id !== survivor.id), evidence });
}

/* The same payment, settled. A bank re-words its own narrative between the pending reading
   and the booked one -- "CONCEPTO Sin concepto" becomes "CONCEPTO: Sin concepto" -- and the
   narrative is inside every name the feed computes, so the two readings share no identity at
   all and the fingerprints above cannot see they are one payment. What they do share is the
   account, the shop, the amount and the day the money left. A line still waiting on the bank
   and a line the bank has settled are the two halves of one payment, never two payments: two
   payments of one amount on one day are both settled, or both waiting.

   Only a pair. Where more than one of each is waiting -- five Renfe journeys at 1,70 EUR in a
   week -- nothing here can say which settled which, and they are left alone. */
const settledPairs = [];
const paired = new Set(merges.flatMap((m) => [m.survivor.id, ...m.losers.map((t) => t.id)]));
const byPayment = new Map();
for (const t of transactions) {
  if (Number(t.amount) >= 0 || paired.has(t.id)) continue;
  const evidence = sightingsOf.get(t.id) || [];
  if (!evidence.some((s) => s.source === 'bankfeed')) continue;
  const key = `${t.account_id || ''}|${t.merchant_key}|${Math.abs(Number(t.amount))}|${String(t.occurred_at).slice(0, 10)}`;
  if (!byPayment.has(key)) byPayment.set(key, []);
  byPayment.get(key).push(t);
}
for (const [key, lines] of byPayment) {
  const waiting = lines.filter((t) => !t.posted_at);
  const settled = lines.filter((t) => t.posted_at);
  if (waiting.length !== 1 || settled.length !== 1) {
    if (lines.length > 1) ambiguous.push({ print: key, lines, references: [`${waiting.length} waiting on the bank, ${settled.length} settled`] });
    continue;
  }
  settledPairs.push({ print: key, survivor: settled[0], losers: waiting, evidence: lines.flatMap((t) => sightingsOf.get(t.id) || []) });
}
merges = merges.concat(settledPairs);

/* A line that turns up in two groups would be merged twice, and the second pass could delete
   the line the first pass had just kept. Those groups are left for a person to read. */
const seen = new Map();
for (const m of merges) for (const t of [m.survivor, ...m.losers]) seen.set(t.id, (seen.get(t.id) || 0) + 1);
const overlapping = merges.filter((m) => [m.survivor, ...m.losers].some((t) => seen.get(t.id) > 1));
for (const m of overlapping) ambiguous.push({ print: m.print, lines: [m.survivor, ...m.losers], references: ['a line shared with another group'] });
merges = merges.filter((m) => !overlapping.includes(m));

const doubled = merges.reduce((sum, m) => sum + m.losers.reduce((s, t) => s + Math.abs(Number(t.amount)), 0), 0);
console.log(`${transactions.length} payments, ${sightings.length} pieces of evidence.`);
console.log(`${merges.length} payments held more than one line; ${euros(doubled)} counted twice.`);
for (const m of merges) {
  console.log(`  ${m.survivor.occurred_at.slice(0, 10)}  ${String(m.survivor.amount).padStart(9)}  ${m.survivor.merchant_key.slice(0, 28).padEnd(28)} keeps ${m.survivor.id.slice(0, 8)}, drops ${m.losers.map((t) => t.id.slice(0, 8)).join(' ')}`);
}
if (ambiguous.length) {
  console.log(`\n${ambiguous.length} left alone: same shop, same price, same day, but the bank gave each its own reference.`);
  for (const a of ambiguous) console.log(`  ${a.lines[0].occurred_at.slice(0, 10)}  ${a.lines[0].amount}  ${a.lines[0].merchant_key}  refs ${a.references.join(', ')}`);
}
/* The same plan as statements, for a database that is written to through SQL rather than
   through this client. The grouping is computed here, where the feed's own fingerprint
   lives; the file holds only what the plan decided. */
const SQL = arg('sql');
/* Whatever is about to change is written down first, whether this client applies it or a
   database does. */
if (merges.length && (SQL || APPLY)) {
  writeFileSync(BACKUP, JSON.stringify({
    at: new Date().toISOString(), user: USER,
    transactions: merges.flatMap((m) => [m.survivor, ...m.losers]),
    sightings: merges.flatMap((m) => m.evidence),
  }, null, 2));
  console.log(`\nEvery row about to change is saved in ${BACKUP}.`);
}
if (SQL && merges.length) {
  const lines = ['-- One payment, one line. Generated by scripts/money/merge-duplicate-payments.mjs', 'BEGIN;'];
  for (const m of merges) {
    const keep = {};
    const first = (field) => [m.survivor, ...m.losers].map((t) => t[field]).find((v) => v !== null && v !== undefined);
    for (const field of ['account_id', 'card_last4', 'merchant_name', 'merchant_city', 'category', 'verdict', 'verdict_at', 'recurring_id', 'episode_id']) {
      const value = first(field);
      if (value !== undefined && value !== null && m.survivor[field] !== value) keep[field] = value;
    }
    const posted = [m.survivor, ...m.losers].map((t) => t.posted_at).filter(Boolean).sort()[0];
    if (posted && !m.survivor.posted_at) keep.posted_at = posted;
    if (m.losers.some((t) => t.is_recurring) && !m.survivor.is_recurring) keep.is_recurring = true;
    const quoted = (v) => (typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
    lines.push(`-- ${m.survivor.occurred_at.slice(0, 10)} ${m.survivor.amount} ${m.survivor.merchant_key}`);
    if (Object.keys(keep).length) {
      lines.push(`UPDATE money_transactions SET ${Object.entries(keep).map(([k, v]) => `${k}=${quoted(v)}`).join(', ')} WHERE id='${m.survivor.id}' AND user_id='${USER}';`);
    }
    const moving = m.evidence.filter((s) => s.transaction_id !== m.survivor.id).map((s) => `'${s.id}'`);
    if (moving.length) lines.push(`UPDATE money_sightings SET transaction_id='${m.survivor.id}' WHERE user_id='${USER}' AND id IN (${moving.join(',')});`);
    lines.push(`DELETE FROM money_transactions WHERE user_id='${USER}' AND id IN (${m.losers.map((t) => `'${t.id}'`).join(',')});`);
  }
  lines.push('COMMIT;');
  writeFileSync(SQL, `${lines.join('\n')}\n`);
  console.log(`\nThe plan is written as SQL in ${SQL}: ${merges.length} merges, ${euros(doubled)}.`);
}
if (!merges.length || !APPLY) { console.log(APPLY ? '\nNothing to do.' : SQL ? '\nRead only here. Run the SQL to write.' : '\nRead only. Add --apply to write.'); process.exit(0); }

for (const m of merges) {
  /* What the losing lines knew and the survivor does not. A verdict the person gave, the
     account the bank named, the minute the phone saw: none of it is thrown away. */
  const keep = {};
  const first = (field) => [m.survivor, ...m.losers].map((t) => t[field]).find((v) => v !== null && v !== undefined);
  for (const field of ['account_id', 'card_last4', 'merchant_name', 'merchant_city', 'category', 'verdict', 'verdict_at', 'recurring_id', 'episode_id']) {
    const value = first(field);
    if (value !== undefined && value !== null && m.survivor[field] !== value) keep[field] = value;
  }
  const posted = [m.survivor, ...m.losers].map((t) => t.posted_at).filter(Boolean).sort()[0];
  if (posted && !m.survivor.posted_at) keep.posted_at = posted;
  if (m.losers.some((t) => t.is_recurring) && !m.survivor.is_recurring) keep.is_recurring = true;
  if (Object.keys(keep).length) {
    await rest(`money_transactions?id=eq.${m.survivor.id}&user_id=eq.${USER}`, { method: 'PATCH', body: JSON.stringify(keep) });
  }
  for (const s of m.evidence) {
    if (s.transaction_id === m.survivor.id) continue;
    await rest(`money_sightings?id=eq.${s.id}&user_id=eq.${USER}`, { method: 'PATCH', body: JSON.stringify({ transaction_id: m.survivor.id }) });
  }
  for (const loser of m.losers) {
    await rest(`money_transactions?id=eq.${loser.id}&user_id=eq.${USER}`, { method: 'DELETE' });
  }
  console.log(`  merged ${m.survivor.occurred_at.slice(0, 10)} ${m.survivor.merchant_key}: ${m.losers.length + 1} lines into one`);
}
console.log(`\nDone. ${euros(doubled)} is no longer counted twice.`);
