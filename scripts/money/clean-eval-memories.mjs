/**
 * Remove the twin memories that chat evaluation left behind.
 *
 * Every money chat turn used to cross the bridge into the twin's memory stream, and the
 * evaluation runner deleted the turns it created but not the memory each one wrote. Found
 * on 2026-09-22: 517 of a person's 567 money memories were written on the two evenings the
 * chat was evaluated, and none of them is a conversation anybody had.
 *
 * A memory is evaluation residue when no surviving `money_chat_turns` row carries its text.
 * Real turns are never deleted, so a real memory always has its turn.
 *
 *   node --env-file=.env scripts/money/clean-eval-memories.mjs --user <uuid>          # count only
 *   node --env-file=.env scripts/money/clean-eval-memories.mjs --user <uuid> --apply  # delete
 *
 * `--apply` writes every row it is about to delete to a JSON file first, and says where.
 */
import fs from 'node:fs';

const arg = (name, fallback = null) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && process.argv[at + 1] && !process.argv[at + 1].startsWith('--') ? process.argv[at + 1] : fallback;
};
const USER = arg('user');
const APPLY = process.argv.includes('--apply');
const OUT = arg('out', 'eval-memories-removed.json');
const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!USER || !URL || !KEY) { console.error('Need --user <uuid>, VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const get = async (path) => {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
};

const memories = await get(`user_memories?select=id,content,created_at,importance_score,metadata&user_id=eq.${USER}&memory_type=eq.conversation&metadata->>source=eq.money&order=created_at.asc&limit=5000`);
const turns = await get(`money_chat_turns?select=text&user_id=eq.${USER}&limit=10000`);
const kept = new Set(turns.map((t) => String(t.text).trim().slice(0, 200)));
const strip = (c) => String(c).replace(/^Money, (they asked|the twin answered): /, '').trim().slice(0, 200);
const residue = memories.filter((m) => !kept.has(strip(m.content)));

const byDay = {};
for (const m of residue) byDay[m.created_at.slice(0, 10)] = (byDay[m.created_at.slice(0, 10)] || 0) + 1;
console.log(`${memories.length} money conversation memories, ${turns.length} surviving turns.`);
console.log(`${residue.length} have no turn behind them: ${Object.entries(byDay).map(([d, n]) => `${d} ${n}`).join(', ')}.`);
if (!residue.length || !APPLY) { console.log(APPLY ? 'Nothing to remove.' : 'Nothing removed. Pass --apply to delete them.'); process.exit(0); }

fs.writeFileSync(OUT, JSON.stringify(residue, null, 2) + '\n');
console.log(`Backed up to ${OUT}.`);
let removed = 0;
for (let at = 0; at < residue.length; at += 100) {
  const ids = residue.slice(at, at + 100).map((m) => m.id);
  const res = await fetch(`${URL}/rest/v1/user_memories?id=in.(${ids.join(',')})`, { method: 'DELETE', headers });
  if (!res.ok) { console.error(`batch failed: ${res.status} ${await res.text()}`); process.exit(1); }
  removed += ids.length;
}
console.log(`Removed ${removed}. The backup holds every row, so any of them can be put back.`);
