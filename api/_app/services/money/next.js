/**
 * What to ask next, computed.
 * ===========================
 * The Ask page offered six fixed questions to everyone, whatever the ledger held and whatever
 * had just been answered (the benchmark of 2026-09-23 left it open; Instinct's onboarding shows
 * what it can do with the person's own things, not a list). Two things here, both pure:
 *
 *   openers(ctx)              three questions for an empty conversation, each with the figure
 *                             the ledger would answer it with, so the page shows numbers, not
 *                             a menu; only questions the ledger can answer today are offered.
 *   nextAsks(message, reply)  two follow-ups after an answer, from what the answer was about:
 *                             a kind asks for last month and the place, a month asks where it
 *                             went, a person asks who else, and so on. Never the question just
 *                             asked, never one the reply already answered.
 *
 * Every line is in the person's language through say(); the figures are amountText() of what
 * the context holds, so nothing here can say a number the ledger does not.
 */
import { say, amountText, euroGlyphs, kindInMessage, asksWhereItWent, monthInMessage, kindWord } from './chat.js';
import { financialEvidenceBlocked } from './financialCompleteness.js';

const MONTH_LONG = { en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'], 'pt-BR': ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'] };
const monthName = (iso, L) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : (MONTH_LONG[L] || MONTH_LONG.en)[d.getUTCMonth()]; };
const cap = (w) => (w ? w[0].toUpperCase() + w.slice(1) : w);

export const OPENER_ASKS = Object.freeze({
  today: 'What can I spend today?',
  went: 'Where did the money go?',
  back: 'What comes back every month?',
  compare: 'How does this month compare?',
  week: 'What changed this week?',
});

/** Three openers with figures; fewer when the ledger holds less. */
export function openers(ctx) {
  if (ctx.forecast?.withheld || (ctx.reconciliation !== undefined && financialEvidenceBlocked(ctx.reconciliation))) return [];
  const L = ctx.language;
  const out = [];
  const cast = ctx.forecast;
  const segs = [...(ctx.segments || [])].sort((a, b) => new Date(b.month) - new Date(a.month));
  if (cast && Number(cast.spent) > 0) {
    out.push({ ask: say(L, OPENER_ASKS.went), figure: euroGlyphs(say(L, '{amount} in {month} so far', { amount: amountText(cast.spent), month: monthName(cast.month, L) })) });
  }
  const monthly = (ctx.recurring || []).filter((r) => r.cadence === 'monthly');
  if (monthly.length) {
    const total = monthly.reduce((s, r) => s + Number(r.typical_amount || 0), 0);
    out.push({ ask: say(L, OPENER_ASKS.back), figure: euroGlyphs(say(L, monthly.length === 1 ? '{amount}, one charge' : '{amount} in {n} charges', { amount: amountText(total), n: monthly.length })) });
  }
  if (segs.length >= 2 && Number(segs[1].spent) > 0) {
    out.push({ ask: say(L, OPENER_ASKS.compare), figure: euroGlyphs(say(L, '{month} closed at {amount}', { month: cap(monthName(segs[1].month, L)), amount: amountText(segs[1].spent) })) });
  }
  if (out.length < 3 && cast && cast.projected_p50 != null) {
    out.push({ ask: say(L, OPENER_ASKS.today), figure: euroGlyphs(say(L, 'likely {amount} by the end of the month', { amount: amountText(cast.projected_p50) })) });
  }
  if (out.length < 3) out.push({ ask: say(L, OPENER_ASKS.week), figure: null });
  return out.slice(0, 3);
}

/** Two follow-ups after an answer, or fewer; never the question just asked. */
export function nextAsks(message, reply, ctx) {
  const L = ctx.language;
  const m = String(message || '').toLowerCase();
  const kinds = new Set((reply?.figures || []).map((f) => f.kind));
  const kind = kindInMessage(message);
  const out = [];
  const push = (line, holes) => { const t = say(L, line, holes); if (t.toLowerCase() !== m.trim()) out.push(t); };
  const noted = Boolean(reply?.computed) && (reply?.actions || []).length > 0;
  /* What was drawn says what was asked better than the words do: "show me this week" holds
     the entertainment kind's word "show", and the week figure settles it. */
  if (noted) {
    push('What changed this week?');
  } else if (kinds.has('purchase')) {
    push('What is due before the month ends?');
    push('How does this month compare?');
  } else if (kinds.has('recurring') || /subscri|suscri|assinatura|comes? back/.test(m)) {
    push('Which subscription is the least worth it?');
    push('What is due before the month ends?');
  } else if (kinds.has('months')) {
    push('Where did the money go?');
    push('What can I spend today?');
  } else if (kinds.has('week') || kinds.has('weekdays')) {
    push('Which day of the week costs the most?');
    push('Where did the money go?');
  } else if (kind) {
    if (!/last month|mes pasado|m[e\u00ea]s passado|august|july|agosto|julho|julio/.test(m)) push('And {kind} last month?', { kind: kindWord(L, kind) });
    push('Which place took the most?');
  } else if (asksWhereItWent(message)) {
    if (!monthInMessage(message)) push('And last month?');
    push('What comes back every month?');
  } else if (/\b(sent me|sends me|father|mother|friend|padre|madre|pai|m[a\u00e3]e|amig)/.test(m)) {
    push('Who sent me money this month?');
    push('How much came in this month?');
  } else {
    push('Where did the money go?');
    push('What comes back every month?');
  }
  return out.slice(0, 2);
}
