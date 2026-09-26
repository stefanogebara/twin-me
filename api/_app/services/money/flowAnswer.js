/**
 * Money in, money out and who paid, answered without a model.
 * ===========================================================
 * "How much came in this month, and how much went out?" was answered "The ledger cannot answer
 * that from what it has": the model wrote for 21.8 s and nothing it said survived. "Who paid me
 * this month?" ran out of patience with nothing said, and the answer that followed named a
 * salary line as a person and counted a payment dated the 30th on the 26th (production,
 * 2026-09-26). The month page already holds the answer: inflow.js's money in, money out, the
 * difference and the payers, what has happened so far and nothing after. This says it in the
 * language it was asked in, computed, the way plainSums answers "am I spending more than I
 * receive". Another month, a stretch, the month ahead, one payer or a place goes on to the other
 * answers and the lines the model reads.
 */
import { say, amountText, euroGlyphs, receiptsFor, languageOf } from './chat.js';
import { monthFlows, moneyInRows } from './inflow.js';
import { isMoneyOut, markOwnTransfers } from './spending.js';
import { askedWindows } from './asked.js';
import { monthIn } from './zone.js';
import { monthsAsked } from './askIntent.js';

/* Lower case, accents off, curly quotes straight, one space. */
const flat = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();
const escape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* What is asked, in the three languages; the language that matched is the one answered in. */
const ASKS = {
  in: {
    en: /\b(came in|come in|comes in|coming in|money in|incomes?|received|earned|got paid)\b/,
    es: /\b(entro|entrado|entraron|ingres(?:os|e|ado|aron)|recibi(?:do)?|cobre|cobrado|me (?:han |ha )?pagado|me pagaron)\b/,
    pt: /\b(entrou|entraram|recebi(?:do)?|ganhei|caiu|cairam|me pagaram)\b/,
  },
  out: {
    en: /\b(went out|go out|goes out|gone out|going out|money out|outgoings?|left (?:the|my) (?:account|bank))\b/,
    es: /\b(salio|salido|salieron|salidas)\b/,
    pt: /\b(saiu|sairam|saidas)\b/,
  },
  who: {
    en: /\b(who\b.{0,20}\b(?:paid|sent|gave|transferred)|from whom)\b/,
    es: /\b(quien(?:es)? me (?:ha |han )?(?:pagado|pago|pagaron|mandado|mando|mandaron|enviado|envio|enviaron|pasado|paso|pasaron|transferido|dado)|de quien)\b/,
    pt: /\b(quem me (?:pagou|pagaram|mandou|mandaram|enviou|enviaram|passou|transferiu|deu)|de quem)\b/,
  },
};
/* "income and expenses": beside a question about money in, the other side is what went out. */
const EXPENSES = /\b(expenses?|spending|spent|outgoings?|gastos?|gaste|gastado|despesas?|gastei)\b/;
const DIFFERENCE = /\b(difference|net|in minus out|more in than out|more out than in|diferencia|neto|diferenca|liquido)\b/;
const QUESTION = /\?|\b(how much|how many|what|who|did|tell me|cuanto|cuanta|que|quien|dime|quanto|quanta|quem|o que|me diz)\b/;
/* Another month, the month ahead, the year, or a day or a week (windows.js totals those, and
   askedWindows leaves them to it): the model has each one's line. */
const ELSEWHERE = /\b(next month|last month|previous month|last year|this year|will|going to|expect\w*|forecast|mes que viene|proximo mes|mes pasado|mes anterior|este ano|va a|voy a|vai|vou|mes passado|ano passado|today|tonight|yesterday|last night|this week|last week|weekend|hoy|anoche|ayer|esta semana|semana pasada|fin de semana|hoje|ontem|semana passada|fim de semana)\b/;

/** A payer (the first word of its name) or a place the words name: that one, not the month. */
function namesOne(m, flows, ctx) {
  const words = new Set();
  for (const p of flows.sources || []) { const first = flat(p.name || p.key).split(' ')[0]; if (first.length >= 4) words.add(first); }
  for (const k of ctx.placeByKey?.keys() || []) if (String(k).length >= 4) words.add(flat(k));
  return [...words].some((w) => new RegExp(`\\b${escape(w)}\\b`).test(m));
}

/** The language answered in: the one whose words asked, else the one the message is written in. */
function languageOfAsk(langs, message, ctx) {
  const count = (l) => langs.filter((x) => x === l).length;
  const [best, second] = ['es', 'pt', 'en'].sort((a, b) => count(b) - count(a));
  if (count(best) > count(second)) return best === 'pt' ? 'pt-BR' : best;
  const written = ctx.forceLanguage || languageOf(message);
  return written === 'pt' ? 'pt-BR' : (written || ctx.language || null);
}

/**
 * How much came in this month, how much went out, the difference, who paid: one or two
 * sentences with inflow.js's figures and the payments under them, or null when the question is
 * another one. Pure.
 */
export function flowAnswer(message, ctx) {
  const m = flat(message);
  if (!m || !QUESTION.test(m) || ELSEWHERE.test(m)) return null;
  const hits = (side) => Object.entries(ASKS[side]).filter(([, re]) => re.test(m)).map(([lang]) => lang);
  const inBy = hits('in');
  const outBy = hits('out');
  const whoBy = hits('who');
  const asksIn = inBy.length > 0;
  const asksWho = whoBy.length > 0;
  const asksOut = outBy.length > 0 || (asksIn && EXPENSES.test(m));
  const both = (asksIn && asksOut) || (DIFFERENCE.test(m) && (asksIn || asksOut));
  if (!asksIn && !asksOut && !asksWho) return null;
  /* a stretch, another month by name: the lines for those days and months answer it */
  if (askedWindows(message, ctx.now).length) return null;
  if (monthsAsked(message, ctx).some((key) => key !== monthIn(ctx.now))) return null;
  const flows = monthFlows(ctx.transactions, { now: ctx.now });
  if (namesOne(m, flows, ctx)) return null;

  const L = languageOfAsk([...inBy, ...outBy, ...whoBy], message, ctx);
  const holes = { in: amountText(flows.money_in), out: amountText(flows.money_out), net: amountText(Math.abs(flows.net)) };
  const cameIn = flows.money_in > 0;
  const parts = [];
  if (!cameIn && (asksIn || asksWho || both)) {
    parts.push(say(L, flows.money_out > 0 && (both || asksOut) ? 'Nothing has come in yet this month; {out} went out.' : 'Nothing has come in yet this month.', holes));
  } else if (both) {
    parts.push(say(L, flows.net > 0 ? 'This month {in} came in and {out} went out, so {net} more came in than went out.'
      : flows.net < 0 ? 'This month {in} came in and {out} went out, so {net} more went out than came in.'
        : 'This month {in} came in and {out} went out: the two are level.', holes));
  } else if (asksIn || asksWho) {
    parts.push(say(L, 'This month {in} came in.', holes));
  } else {
    parts.push(say(L, flows.money_out > 0 ? 'This month {out} went out, every payment and transfer that left, spending or not.' : 'Nothing has gone out yet this month.', holes));
  }
  if (asksWho && cameIn) {
    const more = flows.more_sources ? `; ${say(L, 'and {n} more, {amount} together', { n: flows.more_sources, amount: amountText(flows.more_amount) })}` : '';
    const list = flows.sources.map((p) => `${p.name || p.key} ${amountText(p.amount)}`).join('; ') + more;
    parts.push(flows.sources.length === 1 && !flows.more_sources
      ? say(L, 'All of it from {name}.', { name: flows.sources[0].name || flows.sources[0].key })
      : say(L, 'From {n} payers, largest first: {list}.', { n: flows.sources.length + flows.more_sources, list }));
  }
  /* The payments under the figures: what came in, or, asked only what went out, what left. */
  const rows = asksIn || asksWho || both
    ? moneyInRows(ctx.transactions, { now: ctx.now })
    : markOwnTransfers(ctx.transactions || []).filter((t) => isMoneyOut(t) && monthIn(t.occurred_at) === monthIn(ctx.now) && new Date(t.occurred_at).getTime() <= ctx.now.getTime())
      .sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)));
  return { text: euroGlyphs(parts.join(' ')), figures: [], actions: [], receipts: receiptsFor([{ rows }], ctx) };
}
