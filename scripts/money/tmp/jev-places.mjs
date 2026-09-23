/**
 * Can a fast judge tell a person from a shop, where the place provider cannot?
 *
 * 25 of Stefano's 73 merchants have no kind of place, and most are people he sent money to
 * by Bizum: there is nothing for a places provider to look up. This asks jev-latest through
 * the OpenRouter key the project already has, scores it against the 48 the ledger already
 * knows, and prints what it says about the 25 it does not. Read-only: nothing is written.
 */
import 'dotenv/config';
const U = process.env.VITE_SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY, KEY = process.env.OPENROUTER_API_KEY;
const USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const h = { apikey: K, Authorization: `Bearer ${K}` };

const tx = await (await fetch(`${U}/rest/v1/money_transactions?select=merchant_key,merchant_raw&user_id=eq.${USER}&limit=5000`, { headers: h })).json();
const places = await (await fetch(`${U}/rest/v1/money_places?select=merchant_key,category&limit=5000`, { headers: h })).json();
const known = new Map(places.filter((p) => p.category).map((p) => [p.merchant_key, p.category]));
const raw = new Map();
for (const t of tx) if (t.merchant_key && !raw.has(t.merchant_key)) raw.set(t.merchant_key, t.merchant_raw || t.merchant_key);
const keys = [...raw.keys()];

const ask = async (name) => {
  const started = Date.now();
  const r = await fetch('https://openrouter.ai/api/alpha/decisions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: '~typesafe/jev-latest',
      state: { name_on_the_bank_line: name, country: 'Spain' },
      questions: {
        kind: {
          type: 'choice',
          instructions: 'A line on a Spanish bank statement. Is the counterparty a private individual (a friend paid by Bizum or transfer), a physical business, or an online service?',
          criteria: { person: 'a private individual, usually a full personal name', business: 'a shop, bar, restaurant, taxi, gym, transport or any physical business', service: 'an online service, software or subscription' },
        },
      },
    }),
  });
  const body = await r.json();
  return { ...body.answers?.kind, ms: Date.now() - started, cost: body.usage?.cost || 0 };
};

let cost = 0; const times = [];
const rows = [];
for (const key of keys) {
  const a = await ask(raw.get(key));
  cost += a.cost; times.push(a.ms);
  rows.push({ key, name: raw.get(key), said: a.choice, p: a.probabilities?.[a.choice] ?? null, ledger: known.get(key) || null });
}
const graded = rows.filter((r) => r.ledger);
const wrongOnKnown = graded.filter((r) => r.said === 'person');
console.log(`${rows.length} merchants judged, ${(cost * 1000).toFixed(2)} cents a thousand, median ${times.sort((a, b) => a - b)[Math.floor(times.length / 2)]} ms\n`);
console.log(`AGAINST WHAT THE LEDGER ALREADY KNOWS (${graded.length} merchants with a category):`);
console.log(`  called a person though the ledger has it as a place: ${wrongOnKnown.length}`);
for (const r of wrongOnKnown.sort((a, b) => (b.p || 0) - (a.p || 0))) console.log(`    ${String(r.name).slice(0, 30).padEnd(30)} ${((r.p || 0) * 100).toFixed(0).padStart(3)}%  (ledger: ${r.ledger})`);
/* Does confidence separate the right answers from the wrong ones? */
console.log('\n  at each threshold, of the merchants the ledger already places:');
for (const cut of [0.5, 0.8, 0.9, 0.95, 0.99, 1]) {
  const loud = graded.filter((r) => (r.p || 0) >= cut);
  const wrong = loud.filter((r) => r.said === 'person');
  const peopleFound = rows.filter((r) => !r.ledger && r.said === 'person' && (r.p || 0) >= cut).length;
  console.log(`    >= ${(cut * 100).toFixed(0).padStart(3)}%: ${String(wrong.length).padStart(2)} wrong of ${String(loud.length).padStart(2)} judged; people found among the unplaced: ${peopleFound}`);
}
console.log(`\nWHAT IT SAYS ABOUT THE ${rows.length - graded.length} THE LEDGER CANNOT PLACE:`);
for (const r of rows.filter((x) => !x.ledger)) console.log(`  ${String(r.name).slice(0, 34).padEnd(34)} ${r.said.padEnd(9)} ${r.p === null ? '' : (r.p * 100).toFixed(0) + '%'}`);
process.exit(0);
