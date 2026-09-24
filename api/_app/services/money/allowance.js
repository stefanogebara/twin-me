/**
 * Safe to spend today.
 * ====================
 * The one number a person opens a money app for: whether tonight is affordable. Everything
 * else in this product looks backwards; this looks at the days until the next money.
 *
 * It rests on what is in the account. The bank feed returns a balance on every read now, and
 * the page prints it as available, so a day computed from anything else sat two lines from a
 * figure it did not agree with: 1,97 EUR for the day over 447,98 EUR in the bank, because
 * the day was spreading what was left of a stated 1750 (Stefano, 2026-09-16). What is in the
 * account, less what is spoken for before the next money arrives, over the days until then:
 * a person can check that against their own bank app in one glance, which is the point.
 *
 * Without a fresh balance it falls back to a budget the person can recognise: what they said
 * comes in, else their own typical month, else a student prior. The sentence always names
 * which, because a number whose basis is hidden is a guess wearing a suit. The month itself
 * is still framed by what they said comes in; that is a different question from tonight.
 *
 * Silence over softening: with no balance, no stated income and fewer than two complete
 * months, this says nothing, and says what would let it speak.
 */

import { studentMonth } from './priors.js';
import { keepAmount } from './intention.js';
import { dayIn, weekdayIn, daysBetweenIn } from './zone.js';
import { ledgerCurrency, ours } from './currency.js';
/* The window reconciliation waits out before it calls two sightings different payments is
   also the window a bank books a card payment in. A payment older than it with no bank
   evidence of its own was paid from something this ledger does not read. */
import { MATCH_WINDOW_MS } from './ledger.js';

/** Two complete months is the least that can stand for "a typical month" of this person. */
export const MIN_MONTHS_FOR_TYPICAL = 2;

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function median(values) {
  const xs = [...values].sort((a, b) => a - b);
  if (!xs.length) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/** What the person said comes in each month, summed over everything they named. */
export function statedIncome(facts = []) {
  const amounts = facts
    .filter((f) => f && f.kind === 'income')
    .map((f) => Math.abs(Number(f.amount) || 0))
    .filter((n) => n > 0);
  return amounts.length ? r2(amounts.reduce((s, n) => s + n, 0)) : null;
}

/** Their own typical month: the middle of the complete months behind them. */
export function typicalMonth(segments = []) {
  const complete = segments.filter((m) => m && m.complete && Number(m.spent) > 0);
  if (complete.length < MIN_MONTHS_FOR_TYPICAL) return null;
  return r2(median(complete.map((m) => Number(m.spent))));
}

/** How far the day's share may move from an even split, either way. */
export const SHAPE_LIMIT = 0.3;

/**
 * Today's share of what is left, from the person's own week.
 *
 * `baseline` is the median spent on each weekday, Sunday first (projection.js). Returns
 * `{ share, ratio, weekday }` where share is today's part of the whole, and ratio is how it
 * compares with an even split; null when there is no shape to read.
 */
/** Weekdays with a non-zero median before the week is allowed to shape a day. */
export const SHAPE_MIN_WEEKDAYS = 4;

export function weekdayShare(baseline, now = new Date(), daysIncludingToday = 1) {
  if (!Array.isArray(baseline) || baseline.length !== 7) return null;
  const weights = baseline.map((x) => Math.max(0, Number(x) || 0));
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  /* A week of mostly zeros is not a shape, it is a person who pays by card twice a week:
     read as one, a Wednesday with a zero median fell to the floor and the line blamed the
     weekday (2026-09-16). */
  if (weights.filter((w) => w > 0).length < SHAPE_MIN_WEEKDAYS) return null;
  const from = weekdayIn(now);
  let sum = 0;
  for (let i = 0; i < daysIncludingToday; i += 1) sum += weights[(from + i) % 7];
  if (!(sum > 0)) return null;
  const share = weights[from] / sum;
  const even = 1 / daysIncludingToday;
  return { share, ratio: r2(share / even), weekday: from };
}

/** A balance is fresh for two days; a credit line is not money of theirs. */
export const BALANCE_FRESH_MS = 48 * 3600 * 1000;

/**
 * What the bank says is in the account, when it said so recently enough to act on.
 * Returns { amount, banks, at } summed over the accounts that qualify, or null.
 */
export function freshBalance(accounts = [], now = new Date(), facts = [], transactions = []) {
  const excluded = new Set(facts.filter((f) => f.kind === 'spend_account' && String(f.value).toLowerCase() === 'no').map((f) => String(f.subject)));
  const selected = accounts.filter((a) => a && !excluded.has(String(a.id)));
  if (!selected.length) return null;
  const current = now.getTime();
  const usable = (a) => {
    const at = Date.parse(a.balance_at); const observed = Date.parse(a.balance_observed_at);
    return ours(a.currency) && a.balance != null && Number.isFinite(Number(a.balance))
      && ['ITAV', 'XPCD', 'CLAV', 'ITBD', 'CLBD'].includes(a.balance_type)
      && Number.isFinite(at) && at <= current && current - at < BALANCE_FRESH_MS
      && Number.isFinite(observed) && observed >= at && observed <= current;
  };
  // A partial total silently excludes a stale/foreign account. Abstain instead.
  if (!selected.every(usable)) return null;
  let adjustment = 0;
  const selectedIds = new Set(selected.map((a) => a.id));
  for (const t of transactions) {
    if (Number(t.amount) >= 0 || !ours(t.currency)) continue;
    if (t.account_id && !selectedIds.has(t.account_id)) continue;
    const account = t.account_id ? selected.find((a) => a.id === t.account_id) : null;
    const candidates = account ? [account] : selected;
    const at = Date.parse(t.occurred_at);
    if (!Number.isFinite(at) || at > current) return null;
    /* A payment the phone or a receipt saw carries no account and no posting of its own, so
       whether the snapshot already holds it cannot be settled by its age -- a payment made
       before a snapshot may sit inside it or still be pending outside it. The bank's own
       reading settles it: read after the payment happened and still not reporting it, the
       bank does not hold it, so it comes off. That is the evidence reconciliation itself
       uses, and taking it off never overstates the money. Until the bank has been read
       again nothing honest can be said, and the figure is withheld rather than guessed.
       A payment later than every snapshot is settled by its date alone: it cannot be inside
       one. Age alone had been the test, in both directions: assuming an older payment was
       already booked let a real 260,16 EUR of unsettled payments stand inside the figure,
       and abstaining for it threw away a 398,93 EUR balance and sent the day back to the
       income the person had typed, which is the reading the balance replaced (2026-09-18). */
    const afterEvery = candidates.every((a) => at > Date.parse(a.balance_at));
    const readSince = candidates.every((a) => {
      const pulled = Date.parse(a.last_pulled_at);
      return Number.isFinite(pulled) && pulled > at;
    });
    if (!account && !t.posted_at && !afterEvery && !readSince) return null;
    /* A receipt from a card this ledger does not read. OpenAI charged 103,00 EUR on 17
       September 2026 and the receipt reached the inbox; the bank was read every hour for the
       seven days after and never booked it, because it was never paid from that bank. It came
       off the Santander balance all the same, so the day's number was 103,00 EUR short, and
       then stopped being short on the eighth day only because the caller passes eight days of
       payments: right by accident, having been wrong by rule. Once the bank has been read
       past the window it books inside and still shows nothing, the payment is not this
       account's and never was. Inside the window it still comes off: the bank may yet book
       it, and understating the money for a day or two is the safe side of that doubt. */
    if (!account && !t.posted_at && readSince && at < current - MATCH_WINDOW_MS) continue;
    const uncovered = !account || candidates.some((a) => at > Date.parse(a.balance_at)
      || (!t.posted_at && ['ITBD', 'CLBD'].includes(a.balance_type)));
    if (uncovered) adjustment += Math.abs(Number(t.amount));
  }
  const reported = r2(selected.reduce((sum, a) => sum + Number(a.balance), 0));
  return {
    amount: r2(reported - adjustment), reported, adjustment: r2(adjustment),
    banks: [...new Set(selected.map((a) => a.bank_name || 'your bank'))],
    at: selected.map((a) => a.balance_at).sort()[0], // the oldest contributing snapshot
  };
}

/**
 * The next money in, and the days until it: the earliest income the forecast expects after
 * today, else the end of the month. Returns { day, days, source }, days counting today.
 */
const SURE_ENOUGH = 0.75;
export function nextInflow(cast, now = new Date()) {
  const today = dayIn(now);
  const monthEnd = Math.max(1, (Number(cast?.days_left) || 0) + 1);
  /* An arrival nobody mentioned, seen a few times and on time half of them, is not a day to
     spread the money to: "it depends a lot" (the owner, 2026-09-23). It stays on the page as
     what may come; the day runs to the next money that is said, or sure. */
  const incomes = (cast?.income_items || [])
    .filter((i) => i && i.due_on && String(i.due_on).slice(0, 10) > today && Number(i.amount) > 0)
    .filter((i) => i.said !== false || Number(i.confidence) >= SURE_ENOUGH)
    .sort((a, b) => (a.due_on < b.due_on ? -1 : 1));
  const first = incomes[0];
  if (!first) return { day: null, days: monthEnd, source: null };
  const days = daysBetweenIn(now, `${String(first.due_on).slice(0, 10)}T12:00:00Z`);
  if (days === null || days < 1 || days >= monthEnd) return { day: null, days: monthEnd, source: null };
  return { day: String(first.due_on).slice(0, 10), days, source: first.source || first.subject || null };
}

/** What is spoken for before a day: the dated items of the forecast that land before it. */
function spokenBefore(cast, horizonDay) {
  const before = (on) => !horizonDay || !on || String(on).slice(0, 10) <= horizonDay;
  const committed = (cast.committed_items || []).length
    ? (cast.committed_items || []).filter((c) => before(c.next_expected)).reduce((s, c) => s + Math.abs(Number(c.typical_amount) || 0), 0)
    : Number(cast.committed) || 0;
  const stated = (cast.commitment_items || []).filter((c) => before(c.due_on)).reduce((s, c) => s + Math.abs(Number(c.amount) || 0), 0);
  const calendar = (cast.calendar_items || []).length
    ? (cast.calendar_items || []).filter((i) => before(i.day || i.on)).reduce((s, i) => s + (Number(i.amount ?? i.expected?.amount) || 0), 0)
    : Number(cast.calendar_ahead) || 0;
  return { committed: r2(committed + stated), calendar: r2(calendar) };
}

/**
 * The standing charges that land today or tomorrow (idea 2 of 2026-09-19: the charge before
 * it lands). Copilot's most-loved moment is catching a forgotten subscription after the fact;
 * the recurring series know it the day before. They are already inside the day's number
 * (spokenBefore takes them off), so the line says so, and names them.
 */
export function chargesSoon(items = [], now = new Date()) {
  const today = dayIn(now);
  const tomorrow = dayIn(new Date(now.getTime() + 86400000));
  return (items || [])
    .map((c) => ({ name: c.merchant_name || c.merchant_key || null, amount: r2(Math.abs(Number(c.typical_amount) || 0)), day: String(c.next_expected || '').slice(0, 10) }))
    .filter((c) => c.amount > 0 && (c.day === today || c.day === tomorrow))
    .map((c) => ({ name: c.name, amount: c.amount, when: c.day === today ? 'today' : 'tomorrow' }))
    .sort((a, b) => (a.when === b.when ? b.amount - a.amount : a.when === 'today' ? -1 : 1));
}

/** The events today that the calendar already expects to cost something. */
export function eventsToday(items = [], now = new Date()) {
  const today = dayIn(now);
  return items
    .filter((i) => i && i.day === today && Number(i.amount) > 0)
    .map((i) => ({ title: String(i.title || 'Something on today'), amount: r2(i.amount) }));
}

/**
 * The number and the words for it. Pure: everything it needs is passed in, so the rules can
 * be read in one place and tested without a database.
 */
export function safeToSpend({ cast = null, segments = [], facts = [], accounts = [], transactions = [], now = new Date() } = {}) {
  const none = (why) => ({
    amount: null, basis: null, base: null, income: statedIncome(facts), keep: null, budget: null, free: null, over: false,
    days_left: cast ? cast.days_left : null, horizon: null, balance: null, spent: null, committed: null, calendar_ahead: null, shape: null,
    basis_label: null, today_events: [], sentence: null, why,
  });

  if (!cast) return none('There is no month to read yet.');
  /* Money that is not this ledger's is refused rather than converted: a figure that quietly
     adds dollars to euros is worse than one that says it cannot. */
  if (cast.unsupported_currency || accounts.some((a) => !ours(a.currency))) return none(ledgerCurrency() === 'EUR' ? 'Spending guidance is available for euro accounts only. Foreign currencies have not been converted.' : `Spending guidance is available for ${ledgerCurrency()} accounts only. Foreign currencies have not been converted.`);

  const income = statedIncome(facts);
  const keep = keepAmount(facts);
  const balance = freshBalance(accounts, now, facts, transactions);
  const todays = eventsToday(cast.calendar_items || [], now);
  const todaysCost = r2(todays.reduce((s, e) => s + e.amount, 0));
  const spent = Number(cast.spent) || 0;

  /* Which days the number is spread over. With a balance it is the days until the next
     money arrives; a budget is a month's, so it runs to the month's end. */
  const monthDays = Math.max(1, (Number(cast.days_left) || 0) + 1);
  const horizon = balance ? nextInflow(cast, now) : { day: null, days: monthDays, source: null };
  const days = Math.max(1, horizon.days);

  let basis; let base; let budget; let free; let committed; let calendarAhead; let student = null; let typical = null;
  if (balance) {
    /* What is in the account, less what is spoken for before the next money, less what they
       want kept. The stated income does not enter here: it frames the month, not tonight. */
    const spoken = spokenBefore(cast, horizon.day);
    committed = spoken.committed;
    calendarAhead = spoken.calendar;
    basis = 'balance';
    base = balance.amount;
    budget = r2(balance.amount - (keep ?? 0));
    free = r2(budget - committed - calendarAhead);
  } else {
    typical = income === null ? typicalMonth(segments) : null;
    /* Before two full months and without a stated income, a student whose rent is known can
       still be read against a typical student month on top of that rent (priors.js). The
       sentence names it as typical, never as theirs. */
    student = income === null && typical === null ? studentMonth(facts) : null;
    base = income ?? typical ?? (student ? student.amount : null);
    if (base === null) {
      return none('It does not know what a month of yours looks like yet. Tell it what comes in, or give it one more full month.');
    }
    basis = income !== null ? 'income' : typical !== null ? 'typical' : 'student_prior';
    committed = Number(cast.committed) || 0;
    calendarAhead = Number(cast.calendar_ahead) || 0;
    budget = r2(base - (keep ?? 0));
    /* What is free for the rest of the month: the budget, less what has gone, less what is
       already spoken for, whether by a standing charge or by something in the diary. */
    free = r2(budget - spent - committed - calendarAhead);
  }

  /* Today counts: a person spending this evening has today, not only the days after it. */
  const perDay = free / days;
  /* The days left are not worth the same to this person. Their own week, from the projection,
     gives today its share: a Friday carries more than a Tuesday, because theirs does. The
     shape is held inside a third either way, so the number stays a number a person can act
     on and never swings on one loud weekend. */
  const shape = weekdayShare(cast.weekday_baseline, now, days);
  const shaped = shape ? free * shape.share : perDay;
  const bounded = Math.max(perDay * (1 - SHAPE_LIMIT), Math.min(perDay * (1 + SHAPE_LIMIT), shaped));
  /* Today's own events are already inside `free`; what is left for anything else today is
     the day's share minus what the diary expects of it. */
  const amount = r2(Math.max(0, bounded - todaysCost));
  const over = free < 0;

  /* The preposition travels inside the phrase. Composed as "From {basis}", Portuguese asked
     for "De os 447,98 EUR" where it says "Dos"; a language that contracts cannot glue a
     sentence together from parts that do not know what follows them (2026-09-16). */
  const keepWord = keep ? `, keeping ${money(keep)}` : '';
  const bareBasis = basis === 'balance'
    ? `the ${money(base)} in ${balance.banks.join(' and ')}${keepWord}`
    : income !== null
      ? `the ${money(base)} you said comes in${keepWord}`
      : typical !== null
        ? `your usual month of ${money(base)}${keepWord}`
        : `${student.label}, ${money(base)}${keepWord}`;
  const basisWord = `From ${bareBasis}`;
  const spoken = [];
  if (basis !== 'balance') spoken.push(`${money(spent)} spent`);
  if (balance?.adjustment > 0) spoken.push(`${money(balance.adjustment)} deducted for payments outside the bank snapshot`);
  if (committed > 0) spoken.push(`${money(committed)} still to be charged`);
  if (calendarAhead > 0) spoken.push(`${money(calendarAhead)} the diary expects`);
  /* "over until X arrives" is what happens when a phrase is dropped into a slot made for a
     count; the days stay in the sentence and the next money names its end. */
  const until = horizon.day && horizon.source
    ? `over the ${daysText(days)} until ${horizon.source} arrives`
    : `over ${daysText(days)}`;

  let sentence;
  if (over && basis === 'balance' && base < 0) {
    /* The bank itself is short: what it reports minus the payments it has not booked is below
       zero. "172,82 EUR past the 172,82 EUR in your bank" was the old line on that day
       (2026-09-23), the same figure twice and neither the bank's number. Say what the bank
       has, what is still to book, and what is still to come off. */
    const where = balance.banks.join(' and ');
    const parts = [`${money(balance.reported)} there`];
    if (balance.adjustment > 0) parts.push(`${money(balance.adjustment)} of payments not booked yet`);
    if (committed > 0) parts.push(`${money(committed)} still to be charged`);
    sentence = parts.length > 1
      ? `${where.charAt(0).toUpperCase()}${where.slice(1)} is ${money(base)} short: ${parts.join(', and ')}.`
      : `${where.charAt(0).toUpperCase()}${where.slice(1)} is ${money(base)} short, with ${daysText(days)} to go.`;
  } else if (over) {
    sentence = `That is ${money(Math.abs(free))} past ${bareBasis}, with ${daysText(days)} to go.`;
  } else {
    sentence = `${basisWord}${spoken.length ? `, after ${spoken.join(' and ')}` : ''}, ${until}.`;
  }

  return {
    amount: over ? 0 : amount,
    basis,
    /* What the day rests on: the balance, or the month the budget rests on before the keep
       comes off. The screen draws the month against `income`, whichever the day used. */
    base: r2(base),
    income,
    keep: keep ?? null,
    budget,
    free,
    over,
    days_left: Number(cast.days_left) || 0,
    /* The days the number is spread over, and what ends them: the next money in, or the month. */
    horizon: { day: horizon.day, days, source: horizon.source },
    balance: balance ? { amount: balance.amount, banks: balance.banks, at: balance.at, reported: balance.reported, adjustment: balance.adjustment } : null,
    /* What the screen needs to say this line itself: the numbers behind it, the word for a
       basis that is not theirs, and the shape of the week when it moved today's share. */
    basis_label: student ? student.label : null,
    spent: r2(spent),
    committed: r2(committed),
    calendar_ahead: r2(calendarAhead),
    shape: shape && Math.abs(shape.ratio - 1) >= 0.1 ? { weekday: shape.weekday, ratio: shape.ratio } : null,
    today_events: todays,
    charges_soon: chargesSoon(cast.committed_items, now),
    sentence,
    why: null,
  };
}

/* The sentence is written for the screen, so it carries the euro sign the rest of the app
   uses; the line that rides in a prompt trades it for the letters. */
function money(n) {
  const amount = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(Number(n) || 0));
  /* A narrow no-break space between the number and the sign. */
  return `${amount}\u202F\u20AC`;
}

function daysText(days) {
  return days === 1 ? 'today' : `${days} days`;
}

/** One line for a prompt, so the twin can answer "can I afford tonight?" the same way. */
export function allowanceLine(a) {
  if (!a || a.amount === null) return null;
  const line = a.over
    ? `Safe to spend today: nothing. ${a.sentence}`
    : `Safe to spend today: ${money(a.amount)}. ${a.sentence}`;
  return line.replace(/\u20ac/gi, 'EUR');
}
