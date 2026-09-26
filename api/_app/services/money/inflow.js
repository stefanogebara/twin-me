/**
 * Money in, beside money out: the month as it moved.
 * ===================================================
 * Every figure the product showed was spending, and the money that came in appeared only in
 * passing ("{amount} in" on a month of the ledger, "came in" on a quiet day of the plan). The
 * owner, 2026-09-26: "we need to account for the money that comes in into the account, not
 * all money is only spent". This reads a month from both sides, each with its one rule
 * (spending.js): what came in (isInflow), what went out (isMoneyOut), the difference, and who
 * the money came from, largest first; then the same for every month the ledger holds.
 *
 * Out here is every euro that left, not the month's spending. A Bizum to a flatmate is not a
 * purchase, so the month's spent leaves it aside, but it left the account, and a difference
 * that ignored it would be a figure the bank contradicts. A move between the person's own
 * accounts is neither in nor out, where the ledger can tell one (markOwnTransfers).
 *
 * Months are the person's own (zone.js); a row dated after `now` has not come yet. Pure: rows
 * in, figures out, and no clock but the `now` passed. The page reads it (pageRead.js) and the
 * chat quotes and draws it (chat.js), so both say the same euros.
 */
import { isInflow, isMoneyOut, markOwnTransfers } from './spending.js';
import { monthIn } from './zone.js';
import { eur } from './windows.js';

/** How many months the page is given, newest first. */
export const FLOW_MONTHS = 12;
/** How many payers a month names before the rest is a count and a sum: what the page lists. */
export const FLOW_SOURCES = 5;
/** How many months the chat's line and its figure carry. */
export const FLOW_FIGURE_MONTHS = 6;

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const nameOf = (t) => t.merchant_name || t.merchant_raw || t.merchant_key || null;
const MONTH_WORDS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthWord = (first) => MONTH_WORDS[Number(String(first).slice(5, 7)) - 1] || String(first).slice(0, 7);

/** The rows that count on one side or the other, marked, grouped by the person's month. */
function byMonth(transactions, now) {
  const until = now.getTime();
  const groups = new Map();
  for (const t of markOwnTransfers(transactions || [])) {
    if (!t || !t.occurred_at || !(isInflow(t) || isMoneyOut(t))) continue;
    const at = new Date(t.occurred_at).getTime();
    if (!Number.isFinite(at) || at > until) continue;
    const key = monthIn(t.occurred_at);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  return groups;
}

/** One month, added up: in, out, the difference, and the payers, largest first. */
function flowOf(month, rows, max) {
  let moneyIn = 0; let moneyOut = 0;
  const payers = new Map();
  for (const t of rows) {
    const amount = Math.abs(Number(t.amount) || 0);
    if (isMoneyOut(t)) { moneyOut += amount; continue; }
    moneyIn += amount;
    const key = String(t.merchant_key || nameOf(t) || 'unknown');
    const p = payers.get(key) || { key, name: null, amount: 0, count: 0, last_at: null };
    p.amount += amount; p.count += 1;
    /* The name the bank uses now: the newest row that has one. */
    if (!p.last_at || t.occurred_at > p.last_at) { p.last_at = t.occurred_at; p.name = nameOf(t) || p.name; }
    payers.set(key, p);
  }
  const all = [...payers.values()].map((p) => ({ ...p, amount: r2(p.amount) }))
    .sort((a, b) => b.amount - a.amount || (a.key < b.key ? -1 : 1));
  const rest = all.slice(max);
  const inRounded = r2(moneyIn); const outRounded = r2(moneyOut);
  return {
    month,
    money_in: inRounded,
    money_out: outRounded,
    /* In minus out as the two figures read, so the three always add up on the screen. */
    net: r2(inRounded - outRounded),
    sources: all.slice(0, max),
    more_sources: rest.length,
    more_amount: r2(rest.reduce((s, p) => s + p.amount, 0)),
  };
}

/**
 * This month from both sides, with the months before it.
 * @returns {{ month: string, money_in: number, money_out: number, net: number,
 *   sources: { key: string, name: string|null, amount: number, count: number, last_at: string }[],
 *   more_sources: number, more_amount: number, months: object[] }} this month's figures at the
 *   top (zeros and no payers when nothing moved), and `months`, newest first, each in the same
 *   shape: every month the ledger holds a counted row in, up to `months` of them.
 */
export function monthFlows(transactions = [], { now = new Date(), months = FLOW_MONTHS, sources = FLOW_SOURCES } = {}) {
  const groups = byMonth(transactions, now);
  const here = monthIn(now);
  const list = [...groups.keys()].sort().reverse().slice(0, months)
    .map((key) => flowOf(`${key}-01`, groups.get(key), sources));
  const current = list.find((m) => m.month === `${here}-01`) || flowOf(`${here}-01`, [], sources);
  return { ...current, months: list };
}

/** This month's money in, largest first: the rows a figure about it stands on. */
export function moneyInRows(transactions = [], { now = new Date() } = {}) {
  const rows = byMonth(transactions, now).get(monthIn(now)) || [];
  return rows.filter(isInflow).sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)));
}

/**
 * The same as lines the chat can quote, so "how much came in", "who paid me" and "did more come
 * in than go out" are read, never added up: this month's two sides and their difference, who
 * paid, and each month's two sides. A month with nothing in says so rather than a zero.
 */
export function describeFlows(flows) {
  if (!flows || !flows.month) return [];
  const name = monthWord(flows.month);
  const lines = [];
  if (flows.money_in > 0) {
    const difference = flows.net === 0
      ? 'the two are level'
      : `${eur(flows.net)} more ${flows.net > 0 ? 'came in than went out' : 'went out than came in'}`;
    lines.push(`Money in this month (${name}): ${eur(flows.money_in)} came in and ${eur(flows.money_out)} went out, so ${difference}. Went out is every payment and transfer that left, spending or not; a move between their own accounts is neither, and a refund from a shop is money in.`);
    const payers = flows.sources.map((p) => `${p.name || p.key} ${eur(p.amount)} (${p.count})`).join('; ');
    lines.push(`Money in this month by who paid, largest first (payments): ${payers}${flows.more_sources ? `; and ${flows.more_sources} more, ${eur(flows.more_amount)} together` : ''}.`);
  } else {
    lines.push(`Money in this month (${name}): nothing has come in yet${flows.money_out ? `; ${eur(flows.money_out)} went out` : ''}.`);
  }
  const shown = (flows.months || []).slice(0, FLOW_FIGURE_MONTHS).reverse();
  if (shown.length > 1) {
    lines.push(`Money in and out per month, came in / went out: ${shown.map((m) => `${monthWord(m.month)} ${eur(m.money_in)} / ${eur(m.money_out)}${m.month === flows.month ? ' so far' : ''}`).join('; ')}.`);
  }
  return lines;
}
