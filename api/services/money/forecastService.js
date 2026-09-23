/**
 * The month, forecast; the months, segmented; the twin's charges, scored.
 * =======================================================================
 * Orchestration that reads the ledger and computes what the pages show, pulled out of
 * store.js on 2026-09-19 so that predictions.js can call forecast() and months() without
 * importing the module that imports predictions.js. Everything here is a read followed by
 * pure computation (projection.js, calibration.js, analyst.js); the one write is the
 * forecast snapshot, kept for the record.
 */
import { ledgerCurrency } from './currency.js';
import { supabaseAdmin } from '../database.js';
import { withoutCancelled } from './recurring.js';
import { createLogger } from '../logger.js';
import { splitShareOf, reimbursementIds } from './bizum.js';
import { incomeEvents } from './income.js';
import { projectMonth } from './projection.js';
import { monthSegments } from './analyst.js';
import { spendingRule } from './spending.js';
import { calibrate, carriedWiden, dayStrip } from './calibration.js';
import { currentFigureScores } from './figureScoreStore.js';
import { calendarForecast } from './calendar.js';
import { dayIn } from './zone.js';
import { listOwnTransactions, listTransactions, selectTransactions } from './transactionRepository.js';
import { listFacts, publicFacts } from './factsRepository.js';
import { quietly } from './quietly.js';

const log = createLogger('money-forecast');

/**
 * @param {{ facts?: object[], transactions?: object[] }} given rows the caller already read:
 *   every fact with the internal ones, and the ledger with its rejected rows. The page and the
 *   chat read each once and hand them to every part (M2-A, 2026-09-22); alone, this reads.
 */
export async function forecast(userId, now = new Date(), given = {}) {
  const since = new Date(now.getTime() - 100 * 86400000).toISOString();
  const [rows, rec, facts] = await Promise.all([
    given.transactions ? selectTransactions(given.transactions, { since, limit: 5000, currency: ledgerCurrency() }) : listOwnTransactions(userId, { since, limit: 5000 }),
    supabaseAdmin.from('money_recurring').select('*').eq('user_id', userId).then((r) => {
      if (r.error) throw new Error(`Cannot read recurring commitments: ${r.error.message}`);
      return r.data || [];
    }),
    /* With the internal rows: the calendar's snapshot lives in one, and without it the
       forecast never saw what the diary said was coming. */
    given.facts ?? listFacts(userId, { includeInternal: true }),
  ]);

  /* What the person told us, turned into the four things it changes: money already spoken
     for, money coming in, the share of a split cost that is actually theirs, and which
     transfers are not spending at all. */
  const commitments = facts.filter((f) => f.kind === 'commitment' && f.amount);
  const recurring = withoutCancelled(rec, facts);
  const shares = new Map(facts.filter((f) => f.kind === 'shared_cost' && f.share != null)
    .map((f) => [String(f.subject || '').toLowerCase(), Number(f.share)]));

  const ownShare = splitShareOf(facts);
  const settlements = reimbursementIds(facts, rows, { now });
  const isIncome = (t) => !settlements.has(t.id);
  /* What comes in, as dated events (income.js): the stated incomes on the day and amount
     their arrivals support, with a confidence, and the regular senders nobody mentioned. */
  const income = incomeEvents({ facts, transactions: rows, isIncome, now })
    .map((e) => ({ subject: e.source, source: e.source, amount: e.amount, day: e.day, due_on: e.due_on, confidence: e.confidence, basis: e.basis, said: e.said, times: e.times ?? null }));
  const shareOf = (t) => {
    /* A payment the person said was split so many ways is theirs by one part. */
    const split = ownShare(t);
    if (split != null) return split;
    const exact = shares.get(t.merchant_key);
    if (exact != null) return Math.min(Math.max(exact, 0), 1);
    /* A named split can also be a whole category ("groceries"), which the merchant key
       will not match; the caller resolves that, and an unmatched payment is wholly theirs. */
    return 1;
  };
  /* Which transfers are not spending at all is one rule for the whole product; see
     spending.js. The forecast must never be the only place that knows it. */
  const isSpending = spendingRule(facts);

  /* What the band has earned from its scored days: one widening in euros per person, from
     calibration.js. A missing table or an empty record is a widening of zero. */
  const { figures } = await currentFigureScores(userId, { now });
  const figureDays = figures.filter((r) => r.kind === 'day_total');
  const band = calibrate((figureDays || []).filter((r) => r.scored_at));
  /* No scored day means no widening, which after a correction to the ledger is the state for
     four days while the days settle again. The band keeps the widening it was last issued
     with until it has earned a new one, and says that it is carried. */
  const carried = band.days === 0 ? carriedWiden(figureDays) : null;
  if (carried) { band.widen = carried.widen; band.carried_from = carried.from; }

  /* What the calendar expects before month end, read from the snapshot kept at the last
     calendar read, so this costs no request to Google. It goes into the projection itself:
     bolted on afterwards, the month band ignored it while the day's allowance subtracted it,
     and the two figures on one screen disagreed (2026-09-16). */
  const cal = calendarForecast(facts, { now });
  const expected = (cal.calendar_items || []).map((i) => ({ date: i.day, amount: i.amount, label: i.title }));
  const result = projectMonth({ transactions: rows, recurring, commitments, income, shareOf, isSpending, isIncome, now, widen: band.widen, expected });
  result.band_calibration = { widen: band.widen, days: band.days, coverage: band.coverage, trusted: band.trusted, carried_from: band.carried_from || null };
  /* The last thirty days as marks, with the range the twin gave each one and whether it
     held, and the range it has given tomorrow, widened by what it has earned so far. */
  result.days = dayStrip(rows, band.record, { now, isSpending });
  const tomorrowKey = dayIn(new Date(now.getTime() + 86400000));
  const open = (figureDays || []).filter((r) => !r.scored_at && r.predicted_for === tomorrowKey).pop();
  result.tomorrow = open ? { day: open.predicted_for, value: Number(open.value), low: Number(open.issued_low ?? Math.max(0, Number(open.low ?? open.value) - band.widen)), high: Number(open.issued_high ?? (Number(open.high ?? open.value) + band.widen)) } : null;
  /* What is still to come is named on the hero, so it needs a name and not a key. */
  const names = new Map();
  for (const t of rows) if (t.merchant_raw && !names.has(t.merchant_key)) names.set(t.merchant_key, t.merchant_raw);
  result.committed_items = (result.committed_items || []).map((c) => ({ ...c, merchant_name: names.get(c.merchant_key) || null }));
  result.expected_items = (result.expected_items || []).map((c) => ({ ...c, merchant_name: names.get(c.merchant_key) || null }));
  Object.assign(result, cal);
  await supabaseAdmin.from('money_forecasts').insert({
    user_id: userId, as_of: result.as_of, month: result.month, spent: result.spent, committed: result.committed,
    projected_p10: result.projected_p10, projected_p50: result.projected_p50, projected_p90: result.projected_p90,
  }).then(({ error }) => { if (error) log.warn(`forecast snapshot failed: ${error.message}`); });
  return result;
}

export async function months(userId, now = new Date(), given = {}) {
  const [transactions, facts] = await Promise.all([
    given.transactions ? selectTransactions(given.transactions, { limit: 5000, currency: ledgerCurrency() }) : listOwnTransactions(userId, { limit: 5000 }),
    given.facts ? publicFacts(given.facts) : listFacts(userId).catch(quietly('forecast/facts', () => [])),
  ]);
  return monthSegments(transactions, now, spendingRule(facts));
}

export async function scorePredictions(userId, now = new Date()) {
  const { data: open } = await supabaseAdmin
    .from('money_predictions')
    .select('id, merchant_key, expected_on, typical_amount')
    .eq('user_id', userId).is('happened', null).lt('expected_on', now.toISOString().slice(0, 10));
  if (!open?.length) return { scored: 0, hit: 0 };

  const transactions = await listOwnTransactions(userId, { limit: 5000 });
  let hit = 0;
  for (const p of open) {
    const target = new Date(`${p.expected_on}T12:00:00Z`).getTime();
    const match = transactions.find((t) => t.merchant_key === p.merchant_key
      && Number(t.amount) < 0
      && Math.abs(new Date(t.occurred_at).getTime() - target) <= 3 * 86400000
      && (!p.typical_amount || Math.abs(Math.abs(Number(t.amount)) - Number(p.typical_amount)) <= Number(p.typical_amount) * 0.25));
    const update = match
      ? { happened: true, happened_on: dayIn(match.occurred_at), happened_amount: Math.abs(Number(match.amount)), scored_at: now.toISOString() }
      : { happened: false, scored_at: now.toISOString() };
    if (match) hit += 1;
    await supabaseAdmin.from('money_predictions').update(update).eq('id', p.id);
  }
  return { scored: open.length, hit };
}
