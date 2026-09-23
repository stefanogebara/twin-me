/**
 * Score the days again against the ledger as it stands now.
 *
 * A figure is scored once and then left alone, which is right while the ledger only grows.
 * It is wrong after the ledger is corrected: the days of 15 to 17 September were scored
 * against lines that held the same payment two and three times, so 15 September was recorded
 * as costing 505,73 EUR when it cost 182,80 EUR. The band widens itself from those misses,
 * so a wrong actual teaches the day's range to be wider than the person's life.
 *
 * It uses the product's own scoring (predictions.scoreOne) and the person's own spending
 * rule, so a day is counted here exactly as the cron counts it.
 *
 *   node --env-file=.env scripts/money/rescore-figures.mjs --user <uuid>
 *   node --env-file=.env scripts/money/rescore-figures.mjs --user <uuid> --apply
 */
import { scoreOne } from '../../api/_app/services/money/predictions.js';
import { spendingRule } from '../../api/_app/services/money/spending.js';
import { listTransactions, listFacts } from '../../api/_app/services/money/store.js';
import { calibrate } from '../../api/_app/services/money/calibration.js';
import { supabaseAdmin } from '../../api/_app/services/database.js';

const arg = (name) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && process.argv[at + 1] && !process.argv[at + 1].startsWith('--') ? process.argv[at + 1] : null;
};
const USER = arg('user');
const APPLY = process.argv.includes('--apply');
if (!USER) { console.error('Need --user <uuid>.'); process.exit(1); }

const now = new Date();
if (APPLY) {
  const { currentFigureScores } = await import('../../api/_app/services/money/figureScoreStore.js');
  const result = await currentFigureScores(USER);
  console.log(`${result.changed} outcomes reconciled at evidence revision ${result.revision}.`);
  process.exit(0);
}

const [transactions, facts] = await Promise.all([
  listTransactions(USER, { currency: 'EUR', limit: 5000 }),
  listFacts(USER),
]);
const counts = spendingRule(facts);
const { data: rows, error } = await supabaseAdmin
  .from('money_figure_scores').select('*').eq('user_id', USER).not('scored_at', 'is', null).order('predicted_for');
if (error) { console.error(error.message); process.exit(1); }

const euros = (n) => `${Number(n).toFixed(2).replace('.', ',')} EUR`;
const changed = [];
for (const row of rows || []) {
  const said = scoreOne(row, transactions, counts, now);
  if (!said) continue;
  if (Math.abs(Number(said.actual) - Number(row.actual)) < 0.005 && said.hit === row.hit) continue;
  changed.push({ row, said });
}

console.log(`${(rows || []).length} scored figures. ${changed.length} disagree with the ledger as it stands.`);
for (const { row, said } of changed) {
  console.log(`  ${row.kind.padEnd(11)} ${row.predicted_for}  recorded ${euros(row.actual).padStart(12)} -> ${euros(said.actual).padStart(12)}  [${euros(row.low ?? row.value)} - ${euros(row.high ?? row.value)}]  hit ${row.hit} -> ${said.hit}`);
}
const band = (list) => calibrate(list.filter((r) => r.kind === 'day_total'));
const before = band(rows || []);
const after = band((rows || []).map((r) => {
  const found = changed.find((c) => c.row.id === r.id);
  return found ? { ...r, ...found.said } : r;
}));
console.log(`\nThe day's band: widening ${euros(before.widen)} -> ${euros(after.widen)}, coverage ${before.coverage} -> ${after.coverage}, over ${after.days} scored days.`);

console.log('\nRead-only arithmetic comparison. --apply uses the production settling/source gates and atomic audit, so its eligible rows may differ.');
