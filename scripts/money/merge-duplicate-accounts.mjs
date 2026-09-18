/**
 * One account, one row: join the rows a reconnect opened for the same bank account.
 *
 * Every bank session mints a new provider id, and a row opened before money_accounts had a
 * fingerprint carries nothing else to hold it together, so a reconnect opened a second row
 * for one account. save_money_bank_account now recognises such a row by its mask and gives it
 * a fingerprint (migration 20260918000400), so no new pair is made. This joins the pairs
 * already written.
 *
 * Two rows are one account when the bank, the mask and the currency agree and neither row
 * has a fingerprint the other contradicts. The row that survives is the one whose consent
 * runs longest, then the newest -- the same rule the app already reads them by
 * (store.newestConsent), so the merge cannot change which row the product was using.
 *
 *   node --env-file=.env scripts/money/merge-duplicate-accounts.mjs --user <uuid>
 *   node --env-file=.env scripts/money/merge-duplicate-accounts.mjs --user <uuid> --apply
 *
 * It reads and reports by default. With --apply it writes, after saving every row it is
 * about to touch to --backup (default: money-account-merge-backup.json).
 */
import { writeFileSync } from 'node:fs';

const arg = (name, fallback = null) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && process.argv[at + 1] && !process.argv[at + 1].startsWith('--') ? process.argv[at + 1] : fallback;
};
const USER = arg('user');
const APPLY = process.argv.includes('--apply');
const BACKUP = arg('backup', 'money-account-merge-backup.json');
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
    const got = await rest(`${path}&limit=${page}&offset=${at}`);
    rows.push(...got);
    if (got.length < page) return rows;
  }
}

const accounts = await all(`money_accounts?user_id=eq.${USER}&select=*&order=created_at`);
/* Only a bank's own rows: a statement account is made by the person and is never a duplicate
   of a connection. */
const bank = accounts.filter((a) => a.provider === 'enablebanking');
const groups = new Map();
for (const a of bank) {
  if (!a.iban_mask) continue;
  const key = `${a.bank_name || ''}:${a.currency || 'EUR'}:${a.iban_mask}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(a);
}

const merges = []; const left = [];
for (const [key, rows] of groups) {
  if (rows.length < 2) continue;
  /* Two fingerprints that disagree are two accounts, whatever the mask shows. */
  const prints = new Set(rows.map((a) => a.account_fingerprint).filter(Boolean));
  if (prints.size > 1) { left.push({ key, rows, why: 'each row carries a different fingerprint' }); continue; }
  const later = (a, b) => String(a.consent_expires_at || '') > String(b.consent_expires_at || '')
    || (String(a.consent_expires_at || '') === String(b.consent_expires_at || '') && String(a.created_at || '') > String(b.created_at || ''));
  const survivor = rows.slice().sort((a, b) => (later(b, a) ? 1 : -1))[0];
  merges.push({ key, survivor, losers: rows.filter((a) => a.id !== survivor.id) });
}

/* What each row is carrying, so the report says what actually moves. */
const carried = new Map();
for (const a of bank) {
  const [tx, sight] = await Promise.all([
    all(`money_transactions?user_id=eq.${USER}&account_id=eq.${a.id}&select=id`),
    all(`money_sightings?user_id=eq.${USER}&account_id=eq.${a.id}&select=id`),
  ]);
  carried.set(a.id, { payments: tx.length, evidence: sight.length });
}

console.log(`${bank.length} connected accounts. ${merges.length} held under more than one row.`);
for (const m of merges) {
  const keep = carried.get(m.survivor.id);
  console.log(`  ${m.key}`);
  console.log(`    keeps  ${m.survivor.id.slice(0, 8)}  balance ${m.survivor.balance ?? 'none'}  ${keep.payments} payments, ${keep.evidence} pieces of evidence`);
  for (const l of m.losers) {
    const moved = carried.get(l.id);
    console.log(`    joins  ${l.id.slice(0, 8)}  balance ${l.balance ?? 'none'}  ${moved.payments} payments, ${moved.evidence} pieces of evidence move across`);
  }
}
for (const l of left) console.log(`  left alone: ${l.key} -- ${l.why}`);
if (!merges.length || !APPLY) { console.log(merges.length ? '\nRead only. Add --apply to write.' : '\nNothing to join.'); process.exit(0); }

writeFileSync(BACKUP, JSON.stringify({ at: new Date().toISOString(), user: USER, accounts: merges.flatMap((m) => [m.survivor, ...m.losers]) }, null, 2));
console.log(`\nEvery row about to change is saved in ${BACKUP}.`);

for (const m of merges) {
  /* What the joining rows knew and the surviving one does not. A balance is never taken from
     a row that lost: it belongs to a reading of that row, at a moment that has passed. */
  const keep = {};
  for (const field of ['account_fingerprint', 'name', 'iban_mask', 'bank_name']) {
    const value = [m.survivor, ...m.losers].map((a) => a[field]).find((v) => v !== null && v !== undefined);
    if (value !== undefined && value !== null && m.survivor[field] !== value) keep[field] = value;
  }
  if (Object.keys(keep).length) {
    await rest(`money_accounts?id=eq.${m.survivor.id}&user_id=eq.${USER}`, { method: 'PATCH', body: JSON.stringify(keep) });
  }
  for (const loser of m.losers) {
    for (const table of ['money_transactions', 'money_sightings']) {
      await rest(`${table}?account_id=eq.${loser.id}&user_id=eq.${USER}`, { method: 'PATCH', body: JSON.stringify({ account_id: m.survivor.id }) });
    }
    await rest(`money_accounts?id=eq.${loser.id}&user_id=eq.${USER}`, { method: 'DELETE' });
    console.log(`  joined ${loser.id.slice(0, 8)} into ${m.survivor.id.slice(0, 8)}`);
  }
}
console.log('\nDone. Each account is held under one row.');
