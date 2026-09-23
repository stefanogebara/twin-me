/**
 * The question that is actually worth asking: which kind of place is this merchant?
 *
 * Person-vs-business added nothing, because every person in the ledger arrives by bizum or
 * transfer and CHANNEL_CATEGORY already files those as transfers. What is genuinely unplaced
 * are card payments whose merchant no provider knows. Scored against the 48 the provider has
 * already placed, then asked about the ones it cannot. Read-only.
 */
import 'dotenv/config';
const U = process.env.VITE_SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY, KEY = process.env.OPENROUTER_API_KEY;
const USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const h = { apikey: K, Authorization: `Bearer ${K}` };
/* The kinds the product knows (moneyAPI.CATEGORIES). */
const CATEGORIES = ['groceries', 'eating out', 'coffee', 'transport', 'taxi', 'fuel', 'health', 'pharmacy', 'sport', 'education', 'clothing', 'home', 'rent', 'electronics', 'entertainment', 'software', 'advertising', 'travel', 'lodging', 'cash', 'fees', 'bills', 'other'];
const CRITERIA = Object.fromEntries(CATEGORIES.map((c) => [c, `a payment at a place of this kind: ${c}`]));

const tx = await (await fetch(`${U}/rest/v1/money_transactions?select=merchant_key,merchant_raw,channel,amount,occurred_at&user_id=eq.${USER}&limit=5000`, { headers: h })).json();
const places = await (await fetch(`${U}/rest/v1/money_places?select=merchant_key,category&limit=5000`, { headers: h })).json();
const known = new Map(places.filter((p) => p.category).map((p) => [p.merchant_key, p.category]));
/* Everything the ledger holds about a merchant, not just the truncated string: how many
   payments, what they cost, and at what hours. "Empresa Municip" at 4,50 EUR four times is
   a bus company; the name alone cannot say that. */
const seen = new Map();
for (const t of tx) {
  if (!t.merchant_key) continue;
  const e = seen.get(t.merchant_key) || { name: t.merchant_raw || t.merchant_key, channel: t.channel, amounts: [], hours: [] };
  e.amounts.push(Math.abs(Number(t.amount) || 0));
  const iso = t.occurred_at ? new Date(t.occurred_at).toISOString() : null;
  if (iso && !iso.endsWith('T12:00:00.000Z')) e.hours.push(Number(iso.slice(11, 13)));
  seen.set(t.merchant_key, e);
}

const ask = async (m) => {
  const amounts = m.amounts.slice().sort((a, b) => a - b);
  const mid = amounts[Math.floor(amounts.length / 2)];
  const r = await fetch('https://openrouter.ai/api/alpha/decisions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: '~typesafe/jev-latest',
      state: {
        name_on_the_bank_line: m.name, paid_by: m.channel, country: 'Spain',
        the_person: 'a university student in Madrid',
        payments_seen: m.amounts.length,
        typical_amount_eur: Number(mid.toFixed(2)),
        cheapest_eur: Number(amounts[0].toFixed(2)),
        dearest_eur: Number(amounts[amounts.length - 1].toFixed(2)),
        hours_of_day_when_known: m.hours.length ? m.hours : 'the bank booked these without an hour',
      },
      questions: { kind: { type: 'choice', instructions: 'A line on a Spanish bank statement, often truncated by the bank. What kind of place took this payment?', criteria: CRITERIA } },
    }),
  });
  const b = await r.json();
  return { said: b.answers?.kind?.choice || null, p: b.answers?.kind?.probabilities?.[b.answers?.kind?.choice] ?? null, cost: b.usage?.cost || 0 };
};

let cost = 0; const graded = []; const fresh = [];
for (const [key, m] of seen) {
  if (m.channel !== 'card') continue;
  const a = await ask(m); cost += a.cost;
  (known.has(key) ? graded : fresh).push({ ...m, said: a.said, p: a.p, ledger: known.get(key) || null });
}
const right = graded.filter((r) => r.said === r.ledger);
console.log(`${graded.length + fresh.length} card merchants judged, ${(cost * 1000).toFixed(2)} cents a thousand\n`);
console.log(`AGAINST THE ${graded.length} THE PROVIDER ALREADY PLACED: ${right.length} the same (${Math.round((right.length / graded.length) * 100)}%)`);
for (const cut of [0, 0.8, 0.9, 0.95, 1]) {
  const loud = graded.filter((r) => (r.p || 0) >= cut);
  const ok = loud.filter((r) => r.said === r.ledger);
  console.log(`  at >= ${(cut * 100).toFixed(0).padStart(3)}%: ${ok.length}/${loud.length} agree${loud.length ? ` (${Math.round((ok.length / loud.length) * 100)}%)` : ''}`);
}
console.log('\n  where they differ, most confident first:');
for (const r of graded.filter((x) => x.said !== x.ledger).sort((a, b) => (b.p || 0) - (a.p || 0)).slice(0, 10)) {
  console.log(`    ${String(r.name).slice(0, 26).padEnd(26)} jev: ${String(r.said).padEnd(13)} ${((r.p || 0) * 100).toFixed(0).padStart(3)}%   ledger: ${r.ledger}`);
}
console.log(`\nWHAT IT SAYS ABOUT THE ${fresh.length} NOBODY HAS PLACED:`);
for (const r of fresh.sort((a, b) => (b.p || 0) - (a.p || 0))) console.log(`  ${String(r.name).slice(0, 26).padEnd(26)} ${String(r.said).padEnd(13)} ${((r.p || 0) * 100).toFixed(0)}%`);
process.exit(0);
