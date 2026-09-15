/**
 * The money chat.
 * ===============
 * A person asks their ledger a question, or tells it something is wrong, and gets an answer
 * with the figures and receipts behind it. The rule of the whole money system holds here
 * more than anywhere: the numbers are computed, the model only phrases.
 *
 * Every number the model may say is in the context text it is handed. Every figure it may
 * show is one of a fixed catalogue, chosen by kind and computed here from the ledger rows.
 * Every action it may propose is checked against real ids before it reaches the person,
 * and checked again before it runs. If the model asks for a figure that does not exist,
 * cites a payment that is not there, or proposes a fix for a thing that is not theirs,
 * that part is dropped and the rest stands.
 *
 * Silence over softening: when the ledger cannot answer, the answer says so in a sentence.
 *
 * Response shape (the mobile app renders exactly this):
 *   { text, figures: Figure[], actions: Action[], receipts: Receipt[] }
 *   Figure:  months | shares | weekdays | recurring | band | history  (see FIGURE_KINDS)
 *   Action:  not_me { transaction_id } | recategorise { merchant_key, category } | answer { question_id, value }
 *   Receipt: { id, occurred_at, merchant, amount }
 *
 * The same answer can be streamed (see answerStream): the prose arrives a sentence at a
 * time while the model is still writing, and the figures, actions and receipts follow once
 * the text is complete, because they are computed here from the ledger and never streamed.
 */

import { complete, stream as streamComplete, TIER_CHAT } from '../llmGateway.js';
import { balances, describeBetweenPeople, splitFindings, MIN_WAYS, MAX_WAYS } from './bizum.js';
import crypto from 'node:crypto';
import { createLogger } from '../logger.js';
import {
  listTransactions, months, forecast, categorySpend, refreshRecurring, listReadings, listFacts,
  questionsFor, listPlaces, setVerdict, setPlaceCategory, answerQuestion, categoryOfPayment, deleteFact, saveChatTurn, listBankAccounts, userLanguage,
} from './store.js';
import { learnMerchants, learnPatterns, predictNext, describeForTwin } from './brain.js';
import { describeContext, PERSON_ROLES } from './context.js';
import { CATEGORIES } from './places.js';
import { markCounted } from './spending.js';
import { calendarLines } from './calendar.js';
import { safeToSpend, allowanceLine } from './allowance.js';

const log = createLogger('money-chat');

export const FIGURE_KINDS = Object.freeze(['months', 'shares', 'weekdays', 'recurring', 'band', 'history']);
export const ACTION_KINDS = Object.freeze(['not_me', 'recategorise', 'answer', 'split', 'person', 'remember', 'forget']);

/** How many receipts ride under one answer, and how many of anything the context carries. */
export const MAX_RECEIPTS = 8;
const MAX_SHARE_ITEMS = 8;
const MAX_HISTORY_POINTS = 24;
const MAX_CONTEXT_LINES = 40;
const MAX_HISTORY_TURNS = 10;
/** The model's reasoning under each answer, on unless the environment says off. */
export const REASONING_ON = String(process.env.MONEY_CHAT_REASONING || 'on').toLowerCase() !== 'off';
/**
 * How long the reasoning may run before a word of the answer: past this, the stream is
 * stopped and the question is asked again without reasoning, which answers in seconds.
 * DeepSeek's low-effort reasoning ran 60 to 90 seconds on 2026-09-15, and the host kills a
 * request at 60. Read at call time so a test can shorten it.
 */
export const reasoningPatienceMs = () => Number(process.env.MONEY_CHAT_REASONING_PATIENCE_MS) || 22000;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DECIMAL = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ------------------------------------------------------------------------ basics */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
/* An outflow that counts as spending: rows arrive marked by assemble, see spending.js. */
const out = (t) => Number(t.amount) < 0 && t.counts !== false;
const abs = (t) => Math.abs(Number(t.amount) || 0);
const at = (t) => new Date(t.occurred_at).getTime();
/** An amount as the prompt reads it: es-ES digits and the currency spelled, ASCII throughout. */
const amountText = (n) => `${DECIMAL.format(Math.abs(Number(n) || 0))} EUR`;
const dayMonth = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const monthLabel = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : MONTHS[d.getUTCMonth()];
};
const monthKeyOf = (iso) => String(iso).slice(0, 7);
const nameOf = (t) => t.merchant_raw || t.merchant_key || 'unknown';

/**
 * The model writes amounts as "12,50 EUR" so its prompt stays ASCII; the person reads
 * "12,50" with the euro glyph like everywhere else in the app.
 */
export function euroGlyphs(text) {
  return String(text || '').replace(/(\d),(\d{2}) EUR\b/g, '$1,$2 \u20ac').replace(/(\d) EUR\b/g, '$1 \u20ac');
}

/* ------------------------------------------------------------------------ gather */

/**
 * Everything the chat can know, read once per question. Each read is settled on its own so a
 * failing one leaves a gap in the context rather than no context at all.
 */
export async function gather(userId, now = new Date()) {
  const settled = async (p, fallback) => { try { return await p; } catch (e) { log.warn(`chat gather: ${e.message}`); return fallback; } };
  const [transactions, segments, cast, recurring, readings, facts, questions, places] = await Promise.all([
    settled(listTransactions(userId, { limit: 5000 }), []),
    settled(months(userId, now), []),
    settled(forecast(userId, now), null),
    settled(refreshRecurring(userId, now), []),
    settled(listReadings(userId), []),
    settled(listFacts(userId), []),
    settled(questionsFor(userId, now), { opening: [], fromLedger: [], answered: 0 }),
    settled(listPlaces(userId), []),
  ]);
  const [accounts, language] = await Promise.all([settled(Promise.resolve().then(() => listBankAccounts(userId)), []), settled(Promise.resolve().then(() => userLanguage(userId)), null)]);
  const thisMonth = cast?.month || `${now.toISOString().slice(0, 7)}-01`;
  const lastMonth = (() => { const d = new Date(`${thisMonth}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 8) + '01'; })();
  /* Last month's kinds of place go in beside this month's: asked "and last month?" the model
     attributed September's groceries to August, because August had no line of its own. */
  const [categories, lastCategories] = await Promise.all([
    settled(categorySpend(userId, { month: thisMonth }), { month: thisMonth, total: 0, read: 0, groups: [] }),
    settled(categorySpend(userId, { month: lastMonth }), { month: lastMonth, total: 0, read: 0, groups: [] }),
  ]);
  return assemble({ transactions, segments, forecast: cast, recurring, readings, facts, questions, places, categories, lastCategories, accounts, language, now });
}

/**
 * The pure half of gathering: the same rows, learned and indexed. Tests hand rows straight
 * to this and skip the database.
 */
export function assemble({ transactions: rawTransactions = [], segments = [], forecast: cast = null, recurring = [], readings = [], facts = [], questions = null, places = [], categories = null, lastCategories = null, accounts = [], language = null, now = new Date() } = {}) {
  /* The same rule the month page uses decides which transfers are spending, so a share the
     twin quotes and the hero above it are the same euros. */
  const transactions = markCounted(rawTransactions, facts);
  const placeByKey = new Map((places || []).map((p) => [p.merchant_key, p]));
  const categoryOf = (t) => categoryOfPayment(placeByKey.get(t.merchant_key), t.channel);
  const profiles = learnMerchants(transactions, { now, categoryOf });
  const patterns = learnPatterns({ transactions, profiles, categoryOf, now });
  const predictions = predictNext(profiles, { now });
  const byId = new Map(transactions.map((t) => [t.id, t]));
  const open = [...(questions?.opening || []), ...(questions?.fromLedger || [])];
  return {
    now, transactions, byId, segments, forecast: cast, recurring, readings, facts,
    questions: open, places: places || [], placeByKey, categories, lastCategories, accounts: accounts || [], language: language || null, profiles, patterns, predictions,
  };
}

/* ------------------------------------------------------------------------ figures */

/** Which transactions a merchant word points at: the key exactly, or the shown name loosely. */
function merchantRows(ctx, merchant) {
  const needle = String(merchant || '').trim().toLowerCase();
  if (!needle) return [];
  const exact = ctx.transactions.filter((t) => out(t) && String(t.merchant_key || '').toLowerCase() === needle);
  if (exact.length) return exact;
  return ctx.transactions.filter((t) => out(t) && (
    String(t.merchant_raw || '').toLowerCase().includes(needle)
    || String(ctx.placeByKey.get(t.merchant_key)?.name || '').toLowerCase().includes(needle)
    || String(t.merchant_key || '').toLowerCase().includes(needle)
  ));
}

/** The month a request means: 'YYYY-MM' or 'YYYY-MM-01' or a month word; this month otherwise. */
function resolveMonth(ctx, month) {
  const here = ctx.forecast?.month || `${ctx.now.toISOString().slice(0, 7)}-01`;
  if (!month) return here;
  const s = String(month).trim();
  if (/^\d{4}-\d{2}/.test(s)) return `${s.slice(0, 7)}-01`;
  const idx = MONTHS.findIndex((m) => s.toLowerCase().startsWith(m.toLowerCase()));
  if (idx < 0) return here;
  const seg = ctx.segments.find((x) => new Date(x.month).getUTCMonth() === idx);
  return seg ? seg.month : here;
}

/**
 * One figure from one request, or null when the ledger has nothing to draw. Returns the
 * figure and the transactions it stands on, so the receipts are the figure's own.
 */
export function buildFigure(request, ctx) {
  const kind = request?.kind;
  if (!FIGURE_KINDS.includes(kind)) return null;

  if (kind === 'months') {
    const segs = [...ctx.segments].sort((a, b) => new Date(a.month) - new Date(b.month));
    if (segs.length < 2) return null;
    const thisKey = monthKeyOf(ctx.now.toISOString());
    const points = segs.map((s) => ({ label: monthLabel(s.month), value: round2(s.spent), ...(monthKeyOf(s.month) === thisKey ? { current: true } : {}) }));
    /* A segment's biggest payment is a summary (id, merchant, amount). The receipt is the full
       row behind it, found by id; a month whose row is not in hand yields no receipt at all. */
    const rows = segs.map((s) => (s.biggest?.id ? ctx.byId.get(s.biggest.id) : null)).filter(Boolean).reverse();
    return { figure: { kind, title: 'Spent per month', points }, rows };
  }

  if (kind === 'shares') {
    const month = resolveMonth(ctx, request.month);
    const inMonth = ctx.transactions.filter((t) => out(t) && monthKeyOf(t.occurred_at) === monthKeyOf(month));
    if (!inMonth.length) return null;
    const total = inMonth.reduce((s, t) => s + abs(t), 0);
    if (total <= 0) return null;
    const byMerchant = request.by === 'merchant' || request.by === 'merchants';
    const groups = new Map();
    for (const t of inMonth) {
      /* The same resolver the month page uses, so a share the twin quotes is the share the
         page shows. Reading the place's category alone once folded every transfer into
         "not read yet" here while the page listed them as transfers. */
      const label = byMerchant
        ? (ctx.placeByKey.get(t.merchant_key)?.name || nameOf(t))
        : (categoryOfPayment(ctx.placeByKey.get(t.merchant_key), t.channel) || 'not read yet');
      if (!groups.has(label)) groups.set(label, { value: 0, rows: [] });
      const g = groups.get(label);
      g.value += abs(t);
      g.rows.push(t);
    }
    const items = [...groups.entries()]
      .sort((a, b) => b[1].value - a[1].value)
      .slice(0, MAX_SHARE_ITEMS)
      .map(([label, g]) => ({ label, value: round2(g.value), share: Math.round((g.value / total) * 1000) / 1000 }));
    const rows = [...groups.values()].flatMap((g) => g.rows).sort((a, b) => abs(b) - abs(a));
    const title = byMerchant ? `Where ${monthLabel(month)} went, by place` : `Where ${monthLabel(month)} went`;
    return { figure: { kind, title, items }, rows };
  }

  if (kind === 'weekdays') {
    const spend = ctx.transactions.filter(out);
    if (spend.length < 14) return null;
    const totals = [0, 0, 0, 0, 0, 0, 0];
    for (const t of spend) {
      const d = new Date(t.occurred_at);
      if (Number.isNaN(d.getTime())) continue;
      totals[(d.getUTCDay() + 6) % 7] += abs(t);
    }
    const points = WEEKDAYS.map((label, i) => ({ label, value: round2(totals[i]) }));
    return { figure: { kind, title: 'Spent by day of the week', points }, rows: [...spend].sort((a, b) => abs(b) - abs(a)) };
  }

  if (kind === 'recurring') {
    const series = (ctx.recurring || []).filter((s) => s && s.typical_amount);
    if (!series.length) return null;
    const items = series.map((s) => ({
      label: s.merchant_name || s.merchant_key,
      amount: round2(s.typical_amount),
      cadence: s.cadence || 'monthly',
      ...(s.next_expected ? { next: String(s.next_expected).slice(0, 10) } : {}),
    }));
    const rows = series.flatMap((s) => (s.charges || []).map((c) => ctx.byId.get(c.id)).filter(Boolean));
    return { figure: { kind, title: 'What comes back', items }, rows };
  }

  if (kind === 'band') {
    const f = ctx.forecast;
    if (!f || !(f.projected_p90 - f.projected_p10 > 0.5)) return null;
    const likely = round2(Math.max(f.projected_p50, (f.spent || 0) + (f.committed || 0)));
    return {
      figure: { kind, title: `${monthLabel(f.month)}, so far and likely`, month: f.month, spent: round2(f.spent), likely, low: round2(f.projected_p10), high: round2(f.projected_p90) },
      rows: ctx.transactions.filter((t) => out(t) && monthKeyOf(t.occurred_at) === monthKeyOf(f.month)).sort((a, b) => abs(b) - abs(a)),
    };
  }

  if (kind === 'history') {
    const rows = merchantRows(ctx, request.merchant).sort((a, b) => at(a) - at(b));
    if (rows.length < 2) return null;
    const shown = rows.slice(-MAX_HISTORY_POINTS);
    const name = ctx.placeByKey.get(shown[0].merchant_key)?.name || nameOf(shown[0]);
    const points = shown.map((t) => ({ label: dayMonth(t.occurred_at), value: round2(abs(t)) }));
    return { figure: { kind, title: `${name}, every payment`, merchant: name, points }, rows: [...shown].reverse() };
  }

  return null;
}

/* ------------------------------------------------------------------------ actions */

/** An action the model proposed, checked against what is real; null when it is not. */
export function validateAction(action, ctx) {
  if (!action || !ACTION_KINDS.includes(action.kind)) return null;
  const label = typeof action.label === 'string' && action.label.trim() ? action.label.trim() : null;

  if (action.kind === 'not_me') {
    const t = ctx.byId.get(action.transaction_id);
    if (!t) return null;
    return { kind: 'not_me', transaction_id: t.id, label: label || `Not mine: ${nameOf(t)}, ${amountText(t.amount)}` };
  }
  if (action.kind === 'recategorise') {
    const place = ctx.placeByKey.get(action.merchant_key);
    const category = String(action.category || '').toLowerCase().trim();
    if (!place || !CATEGORIES.includes(category)) return null;
    return { kind: 'recategorise', merchant_key: place.merchant_key, category, label: label || `File ${place.name} under ${category}` };
  }
  if (action.kind === 'split') {
    const t = ctx.byId.get(action.transaction_id);
    const ways = Number(action.ways);
    if (!t || Number(t.amount) >= 0 || !Number.isInteger(ways) || ways < MIN_WAYS || ways > MAX_WAYS) return null;
    return { kind: 'split', transaction_id: t.id, ways, label: label || `Split ${nameOf(t)}, ${amountText(t.amount)}, ${ways} ways` };
  }
  if (action.kind === 'answer') {
    const q = ctx.questions.find((x) => x.id === action.question_id);
    const value = action.value == null ? '' : String(action.value).trim();
    if (!q || !value) return null;
    return { kind: 'answer', question_id: q.id, value, label: label || `Record: ${value}` };
  }
  /* Who somebody on the statement is, in the person's words: a role from the list, and
     whatever else they said about them. The key must be a person the ledger has seen. */
  if (action.kind === 'person') {
    const key = String(action.merchant_key || '').toLowerCase().trim();
    const t = ctx.transactions.find((x) => String(x.merchant_key || '').toLowerCase() === key && (x.channel === 'transfer' || x.channel === 'bizum'));
    const role = String(action.role || '').toLowerCase().trim();
    if (!t || !PERSON_ROLES.includes(role)) return null;
    const note = typeof action.note === 'string' && action.note.trim() ? action.note.trim().slice(0, 240) : null;
    return { kind: 'person', merchant_key: t.merchant_key, name: nameOf(t), role, note, label: label || `${nameOf(t)} is ${role}${note ? `, ${note}` : ''}` };
  }
  /* Something they told the ledger that fits no question: kept in their words, read back to the model. */
  if (action.kind === 'remember') {
    const text = typeof action.text === 'string' ? action.text.trim().slice(0, 240) : '';
    if (text.length < 3) return null;
    return { kind: 'remember', text, label: label || `Remember: ${text}` };
  }
  /* A fact they gave and now say is wrong: it goes, and its question is open again. */
  if (action.kind === 'forget') {
    const f = (ctx.facts || []).find((x) => x.id === action.fact_id);
    if (!f) return null;
    return { kind: 'forget', fact_id: f.id, label: label || `Forget: ${f.subject_label || f.value || f.subject || f.kind}` };
  }
  return null;
}

/** The receipts under an answer: the figures' own rows first, then anything cited that is real. */
export function receiptsFor(built, ctx, citedIds = []) {
  const seen = new Set();
  const rows = [];
  /* A receipt without a merchant and a date is not a receipt: only full rows are taken. */
  const take = (t) => {
    if (!t || !t.id || !t.occurred_at || !(t.merchant_raw || t.merchant_key) || seen.has(t.id) || rows.length >= MAX_RECEIPTS) return;
    seen.add(t.id);
    rows.push(t);
  };
  for (const id of citedIds || []) take(ctx.byId.get(id));
  for (const b of built) for (const t of b.rows || []) take(t);
  return rows.map((t) => ({ id: t.id, occurred_at: t.occurred_at, merchant: ctx.placeByKey.get(t.merchant_key)?.name || nameOf(t), amount: round2(abs(t)) }));
}

/* ------------------------------------------------------------------------ context */

/** The whole of what the model may say, as plain lines. Nothing it says may leave this text. */
export function contextText(ctx) {
  const lines = [];
  const today = ctx.now;
  lines.push(`Today is ${dayMonth(today.toISOString())} ${today.getUTCFullYear()}. Amounts are in EUR.`);
  const LANGUAGE_NAMES = { en: 'English', es: 'Spanish', 'pt-BR': 'Brazilian Portuguese' };
  if (ctx.language && LANGUAGE_NAMES[ctx.language]) lines.push(`The person chose ${LANGUAGE_NAMES[ctx.language]} for TwinMe.`);

  /* What the bank says is in the account, when it was read in the last two days: the one
     figure the person means by "how much do I have". A balance with a credit line inside
     is not theirs and is not said. */
  const fresh = (ctx.accounts || []).filter((a) => a && a.balance !== null && a.balance !== undefined && a.balance_at && !String(a.balance_type || '').includes('/credit') && (ctx.now.getTime() - new Date(a.balance_at).getTime()) < 48 * 3600000);
  if (fresh.length) {
    lines.push('In the bank now: ' + fresh.map((a) => `${amountText(a.balance)} ${Number(a.balance) < 0 ? 'overdrawn ' : ''}in ${a.bank_name || 'Santander'}${a.iban_mask ? ` ${String(a.iban_mask).slice(-4)}` : ''} (${String(a.balance_type || '').startsWith('CLBD') ? 'booked' : 'available'}, read ${dayMonth(a.balance_at)})`).join('; ') + '. Payments still pending are not in a booked figure.');
  }

  const f = ctx.forecast;
  if (f) {
    const spread = f.projected_p90 - f.projected_p10 > 0.5;
    lines.push(`This month (${monthLabel(f.month)}): spent ${amountText(f.spent)} so far, ${f.days_left} days left, ${amountText(f.committed)} still committed.`
      + (spread ? ` Likely to end at ${amountText(Math.max(f.projected_p50, f.spent + f.committed))}, between ${amountText(f.projected_p10)} and ${amountText(f.projected_p90)}.` : ''));
    if (f.received) lines.push(`Came in this month: ${amountText(f.received)}.`);
  }

  if (ctx.segments.length) {
    lines.push('Per month, spent / received / payments: ' + [...ctx.segments]
      .sort((a, b) => new Date(a.month) - new Date(b.month))
      .map((s) => `${monthLabel(s.month)} ${amountText(s.spent)} / ${amountText(s.received)} / ${s.lines}`).join('; ') + '.');
  }

  const groups = ctx.categories?.groups || [];
  if (groups.length) {
    lines.push('This month by kind of place: ' + groups.slice(0, 8).map((g) => `${g.category} ${amountText(g.spent)} (${g.share}%)`).join('; ') + '.');
  }
  const lastGroups = ctx.lastCategories?.groups || [];
  if (lastGroups.length) {
    lines.push(`${monthLabel(ctx.lastCategories.month)} by kind of place: ` + lastGroups.slice(0, 8).map((g) => `${g.category} ${amountText(g.spent)} (${g.share}%)`).join('; ') + '.');
  }

  if (ctx.recurring.length) {
    lines.push('Comes back regularly: ' + ctx.recurring.slice(0, 10).map((s) => `${s.merchant_name || s.merchant_key} ${amountText(s.typical_amount)} ${s.cadence}${s.next_expected ? `, next around ${dayMonth(`${s.next_expected}T12:00:00Z`)}` : ''}`).join('; ') + '.');
  }

  const learned = describeForTwin({ profiles: ctx.profiles, patterns: ctx.patterns, predictions: ctx.predictions, now: ctx.now });
  if (learned) lines.push(...learned.split('\n').slice(1));

  /* A reading the person confirmed is worth more than one they have not judged, and one they
     rejected never reaches here at all. */
  for (const r of ctx.readings.slice(0, 4)) if (r?.sentence) lines.push(`Reading${r.verdict === 'true' ? ' (they confirmed this)' : ''}: ${r.sentence}${r.detail ? ` ${r.detail}` : ''}`.replace(/\u20ac/g, 'EUR'));

  const said = describeContext(ctx.facts);
  const theirs = (ctx.facts || []).filter((f) => f.id && f.source === 'asked' && !['event_spend', 'event_spend_meta', 'calendar_feed', 'home_point', 'inbox_address'].includes(f.kind)).slice(0, 30);
  if (theirs.length) lines.push('Facts they gave (fact_id: what): ' + theirs.map((f) => `${f.id}: ${f.kind} ${f.subject_label || f.subject || ''} ${f.value || ''} ${f.amount ? amountText(f.amount) : ''}`.replace(/\s+/g, ' ').trim()).join(' | '));
  if (said) lines.push(`The person said: ${said.replace(/\u20ac/g, 'EUR')}`);
  /* Money between people: who sent what, who paid back, what is still open (bizum.js). */
  const between = describeBetweenPeople(balances(ctx.transactions, ctx.facts, { now: ctx.now }));
  if (between.length) lines.push('Between people, 90 days: ' + between.join(' '));
  for (const f of splitFindings(ctx.facts, ctx.transactions, { now: ctx.now }).slice(0, 3)) lines.push(`Shared payment still open: ${f.sentence.replace(/\u20ac/g, 'EUR')}`);

  lines.push(...calendarLines(ctx.facts, { now: ctx.now }));
  /* What today can carry, worked out from what is already here: no extra query, and the twin
     answers "can I afford tonight?" with the same number the month page shows. */
  const todayLine = allowanceLine(safeToSpend({ cast: ctx.forecast, segments: ctx.segments, facts: ctx.facts, now: ctx.now }));
  if (todayLine) lines.push(todayLine);

  if (ctx.questions.length) {
    lines.push('Open questions (id: question): ' + ctx.questions.slice(0, 8).map((q) => `${q.id}: ${q.ask}`).join(' | '));
  }

  const recent = [...ctx.transactions].sort((a, b) => at(b) - at(a)).slice(0, 40);
  if (recent.length) {
    lines.push('Recent payments (id, date, place, amount, kind):');
    for (const t of recent) {
      const cat = categoryOfPayment(ctx.placeByKey.get(t.merchant_key), t.channel) || 'not read yet';
      lines.push(`${t.id} ${dayMonth(t.occurred_at)} ${ctx.placeByKey.get(t.merchant_key)?.name || nameOf(t)} ${out(t) ? '-' : '+'}${amountText(t.amount)} ${cat}${t.verdict ? ` (${t.verdict})` : ''}`);
    }
  }

  const placed = ctx.places.slice(0, 40);
  if (placed.length) {
    lines.push('Places (merchant_key: name, kind): ' + placed.map((p) => `${p.merchant_key}: ${p.name}, ${p.category || 'not read yet'}`).join('; '));
  }

  /* The prompt is ASCII whatever a sentence was written for: the screen keeps the sign and
     the no-break space, the model reads the letters and a plain space. */
  return lines.slice(0, MAX_CONTEXT_LINES + 60).join('\n').replace(/[\u00a0\u202f]/g, ' ').replace(/\u20ac/g, 'EUR');
}

export const RULES = [
  'You are the person\'s own ledger, speaking to a student in Spain about their money.',
  'Plain words, two to four short sentences. No emojis, no markdown, no bullet lists, no headings.',
  'Every number you write must appear in the context above. Never estimate, round differently, or add up numbers yourself; if the context does not hold the number, say the ledger cannot tell.',
  'Write amounts exactly as the context does, like 12,50 EUR.',
  'Do not say "always" for an amount that varies; say "usually" or "about".',
  'Never add numbers up: if a total would need adding, give the parts and say the ledger has no total for that. Never work out a daily amount or a difference yourself.',
  'On a greeting, a thanks, an "ok" or a message with no question in it, answer in one short line with no numbers and no figure.',
  'When the person tells you something, begin by saying back in a few words what they told you, in their terms ("Spotify is your flatmate\'s, not yours"), then say what the ledger will do with it, then the offer. Never answer a statement with what the ledger currently thinks as if they had asked.',
  'A plan, a trip, a visit, an exam, a change in their life, even with no money in it: propose remember with their words, and say the ledger will read those days with it in mind.',
  'When they say what they want to keep at the end of the month, or a limit for a kind of place, propose answer with the keep or cap question id from the questions list if it is there, else remember.',
  'An answer is a claim: prefer naming the payments behind it.',
  'The earlier turns are the conversation so far. Do not restate the question, do not repeat a number or a sentence you already said unless asked for it again, and do not explain again what the ledger is or where answers come from.',
  'Vary your openings; never begin two answers the same way. On a follow-up ("and last month?", "why?", "and Spotify?") answer only what is new.',
  'When the calendar lines say what a kind of event usually costs, you may say what the days ahead are likely to cost, always as "usually about", never as a promise.',
  'Never ask whether they would like a figure or a chart: when one would help, ask for it by kind and it is drawn under your words. When a figure would show the thing better than words, ask for it by kind. Kinds: months (spent per month), shares (where a month went; add month, and by: "merchant" for places), weekdays (spend by weekday), recurring (what comes back), band (this month so far and likely), history (one merchant over time; add merchant). Ask for at most two, and only when they add something.',
  'Actions are offers the person taps, never things you did: the text must not claim to have changed, marked or recorded anything. Say something like "If that is right, mark it below." and leave the doing to the card.',
  'Propose an action only when the person asks to fix or record something: not_me with transaction_id from the recent payments; recategorise with merchant_key from the places and a category from: ' + CATEGORIES.join(', ') + '; answer with question_id from the open questions and the value they gave; split with transaction_id from the recent payments and ways (2 to 12, the person included) when they say a payment was shared, for a dinner, a shop, a present.',
  'When the person tells you who somebody on the statement is, or what a transfer to them was for, propose person with merchant_key (the key of that person in the recent payments), role from: ' + PERSON_ROLES.join(', ') + ', and note with what they said about it. When they tell you something about their money that fits none of these (a plan, a reason, a rule of theirs), propose remember with text in their words. When they say something the ledger holds is wrong (their words, on What it knows), propose forget with the fact_id from the facts list.',
  'When the person points out a mistake, say what you will read differently once they confirm, and propose the action; do not argue. When they ask for a chart or a graph, ask for the figure kind that shows it.',
  'When they say a payment is not theirs, or is somebody else\'s, propose not_me with the transaction_id of the newest such payment in the recent payments. Propose forget only for a fact in the list of what they said, never for a payment or a charge.',
  'Reply in the language the person chose for TwinMe when the context names one. If they wrote their last message in another language, answer in the one they wrote. Never take a language from a name in the context: a bank called Banco Santander does not make the reply Spanish. Without a chosen language, a single word like "ok" is answered in English unless the earlier turns were in Spanish.',
  'Reply with one JSON object and nothing else: {"text": string, "figures": [{"kind": string, "month"?: string, "by"?: string, "merchant"?: string}], "actions": [{"kind": string, "label": string, ...}], "cites"?: [transaction ids]}',
].join('\n');

/* ------------------------------------------------------------------------ parsing */

/** The model's reply as an object, or null when it is not one. Fences and prose around it are tolerated. */
export function parseReply(raw) {
  if (typeof raw !== 'string') return null;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(raw.slice(start, end + 1));
    if (!obj || typeof obj !== 'object' || typeof obj.text !== 'string') return null;
    return {
      text: obj.text.trim(),
      figures: Array.isArray(obj.figures) ? obj.figures.filter((x) => x && typeof x === 'object') : [],
      actions: Array.isArray(obj.actions) ? obj.actions.filter((x) => x && typeof x === 'object') : [],
      cites: Array.isArray(obj.cites) ? obj.cites.filter((x) => typeof x === 'string') : [],
    };
  } catch {
    return null;
  }
}

/** Prose that came back where JSON was asked for, kept readable: no markdown glyphs. */
function plainProse(raw) {
  /* Prose followed by an object it could not finish: the object's start is where the prose ends. */
  const cut = String(raw || '').split(/\{\s*"text"/)[0];
  return cut.replace(/[*_`#>]/g, '').replace(/\n{2,}/g, ' ').replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------------ short circuits */

/**
 * The two asks that need no model: what comes back, and the months side by side. Both are a
 * figure with a computed sentence, so they cost nothing and cannot be wrong in phrasing.
 */
/**
 * Whether a message is a short ask the ledger can answer without the model: a question or a
 * request in a dozen words at most. A statement is never one. "maria dolores is the woman
 * who gets me the real madrid tickets... see if money comes back from 50 euro transfers"
 * carries "comes back" and got the list of subscriptions for an answer on 2026-09-15; the
 * person was teaching, not asking. Pure.
 */
export function isShortAsk(message) {
  const m = String(message || '').trim();
  const words = m.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 12) return false;
  if (/\b(is|are|was|were|am)\s+(my|the|a|an|our|his|her)\b/i.test(m) && !/\?/.test(m)) return false;
  /* A correction is an instruction, however short: "do not count X", "that is wrong". */
  if (/\b(do not|don'?t|never|wrong|not mine|isn'?t|is not|stop)\b/i.test(m)) return false;
  return /\?$/.test(m) || /^(what|which|how|show|list|tell|do|does|can|any|give|draw|make|compare|plot|chart|graph|explain|why|when|where|who|que|qu\u00e9|cu\u00e1l|cual|cu\u00e1nto|cuanto|dime|muestra|dame|ens\u00e9\u00f1ame|ensename)\b/i.test(m) || words.length <= 6;
}

export function shortCircuit(message, ctx) {
  const m = String(message || '').toLowerCase();
  if (!isShortAsk(message)) return null;
  if (/\b(subscri|suscrip|recurring|comes? back|every month|cada mes)/.test(m) && !/\b(cancel|not mine|isn'?t mine|fix|wrong|change)\b/.test(m)) {
    const built = buildFigure({ kind: 'recurring' }, ctx);
    if (!built) return { text: 'Nothing comes back regularly yet. The ledger needs to see a charge at least twice to call it that.', figures: [], actions: [], receipts: [] };
    const monthly = ctx.recurring.filter((s) => s.cadence === 'monthly');
    const total = monthly.reduce((s, x) => s + Number(x.typical_amount || 0), 0);
    const names = monthly.slice(0, 3).map((s) => s.merchant_name || s.merchant_key);
    const text = monthly.length
      ? `${monthly.length} ${monthly.length === 1 ? 'charge comes' : 'charges come'} back every month, ${amountText(total)} together${names.length ? `: ${names.join(', ')}${monthly.length > 3 ? ` and ${monthly.length - 3} more` : ''}` : ''}.`
      : `${ctx.recurring.length} ${ctx.recurring.length === 1 ? 'charge comes' : 'charges come'} back regularly, none of them monthly.`;
    return { text: euroGlyphs(text), figures: [built.figure], actions: [], receipts: receiptsFor([built], ctx) };
  }
  if (/\b(per month|by month|each month|month by month|months?\b.*(compare|side|trend)|mes a mes)/.test(m)) {
    const built = buildFigure({ kind: 'months' }, ctx);
    if (!built) return null;
    const segs = [...ctx.segments].sort((a, b) => new Date(b.month) - new Date(a.month));
    const [here, before] = segs;
    const text = before
      ? `${monthLabel(here.month)} is at ${amountText(here.spent)} so far. ${monthLabel(before.month)} closed at ${amountText(before.spent)}.`
      : `${monthLabel(here.month)} is at ${amountText(here.spent)} so far.`;
    return { text: euroGlyphs(text), figures: [built.figure], actions: [], receipts: receiptsFor([built], ctx) };
  }
  return null;
}

/* ------------------------------------------------------------------------ answer */

/** The offers through which the ledger learns; a statement without one of these is a lesson lost. */
const LEARNING_KINDS = Object.freeze(['remember', 'person', 'answer', 'not_me', 'recategorise', 'split']);

/** A message that tells the ledger something rather than asking it: not a short ask, no question mark, at least four words. Pure. */
export function isStatement(message) {
  const m = String(message || '').trim();
  return !isShortAsk(m) && !/\?/.test(m) && m.split(/\s+/).filter(Boolean).length >= 4;
}

/** Does a message ask where the money went, or speak in categories? */
export function asksWhereItWent(message) {
  const m = String(message || '').toLowerCase();
  return /\b(where|what)\b.*\b(money|it|spend|spending|month|euros?)\b.*\b(go|went|gone|goes|on)\b/.test(m)
    || /\b(categor|kind of place|kinds of place|by type|breakdown|split|en que|en qu\u00e9|donde)/.test(m)
    || /\bspen[dt]\b.*\bon\b/.test(m);
}

/** The month a message names in words, if any; used when the model attached nothing. */
function monthInMessage(message) {
  const m = String(message || '').toLowerCase();
  if (/\b(last month|previous month|mes pasado)\b/.test(m)) return 'last';
  const idx = MONTHS.findIndex((x) => new RegExp(`\\b${x.toLowerCase()}`).test(m));
  return idx >= 0 ? MONTHS[idx] : null;
}

/**
 * The reply assembled from a parsed model object and the context: figures computed, actions
 * checked. A question about where the money went always carries the shares by category for the
 * month it names, whether or not the model thought to ask for them; the model's own figures win
 * when it did.
 */
export function assembleReply(parsed, ctx, message = '') {
  const requests = (parsed.figures || []).slice(0, 2);
  if (asksWhereItWent(message) && !requests.some((r) => r?.kind === 'shares')) {
    const named = monthInMessage(message);
    let month = null;
    if (named === 'last') {
      const segs = [...ctx.segments].sort((a, b) => new Date(b.month) - new Date(a.month));
      month = segs[1]?.month || null;
    } else if (named) month = named;
    requests.unshift({ kind: 'shares', ...(month ? { month } : {}) });
  }
  const built = requests.slice(0, 2).map((r) => buildFigure(r, ctx)).filter(Boolean);
  const actions = (parsed.actions || []).slice(0, 3).map((a) => validateAction(a, ctx)).filter(Boolean);
  /* A statement always carries a way to keep it. The model writes "if that is right, mark it
     below" and, one time in three, attaches no offer; the person then has nothing to tap and
     the ledger learns nothing. When they told the ledger something and no learning offer
     survived, their own words are offered as a note. */
  if (isStatement(message) && !actions.some((a) => LEARNING_KINDS.includes(a.kind))) {
    const note = validateAction({ kind: 'remember', text: String(message).trim().slice(0, 200), label: 'Remember this' }, ctx);
    if (note) actions.push(note);
  }
  return {
    text: euroGlyphs(parsed.text),
    figures: built.map((b) => b.figure),
    actions,
    receipts: receiptsFor(built, ctx, parsed.cites || []),
  };
}

/* ------------------------------------------------------------------------ repetition */

const sentencesOf = (text) => String(text || '').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
const shapeOf = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The last thing the ledger said, from the history the app keeps. */
export function previousTwinText(history) {
  const turns = Array.isArray(history) ? history : [];
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const h = turns[i];
    if (h && (h.role === 'twin' || h.role === 'assistant') && typeof h.text === 'string' && h.text.trim()) return h.text;
  }
  return '';
}

/**
 * A reply that mostly repeats the previous one is cut down to what is new. Sentences already
 * said are dropped when they make up more than REPEAT_SHARE of the reply; if nothing is left,
 * the first sentence stays so the person is not answered with silence.
 */
export const REPEAT_SHARE = 0.6;
export function withoutRepeats(text, history) {
  const prev = new Set(sentencesOf(previousTwinText(history)).map(shapeOf).filter(Boolean));
  const mine = sentencesOf(text);
  if (!prev.size || mine.length === 0) return text;
  const repeated = mine.filter((s) => prev.has(shapeOf(s)));
  if (repeated.length / mine.length <= REPEAT_SHARE) return text;
  const fresh = mine.filter((s) => !prev.has(shapeOf(s)));
  return (fresh.length ? fresh : [mine[0]]).join(' ');
}

const EMPTY_LEDGER = 'There is nothing in the ledger yet. Connect a bank or add a statement and ask again.';
const NO_ANSWER = 'The ledger cannot answer that from what it has.';

/**
 * Answer one message. History is the last few turns, older first, as the app kept them.
 */
export async function answer(userId, message, history = [], { now = new Date() } = {}) {
  const text = String(message || '').trim();
  if (!text) return { text: NO_ANSWER, figures: [], actions: [], receipts: [] };
  const ctx = await gather(userId, now);
  const keep = async (reply) => {
    await saveChatTurn(userId, { role: 'user', text }).catch(() => null);
    await saveChatTurn(userId, { role: 'twin', text: reply.text, figures: reply.figures || null, actions: reply.actions || null, basis: reply.basis || null, receipts: reply.receipts || null }).catch(() => null);
    return reply;
  };
  if (!ctx.transactions.length) return keep({ text: EMPTY_LEDGER, figures: [], actions: [], receipts: [] });

  const quick = shortCircuit(text, ctx);
  if (quick) return keep(quick);

  const system = `${RULES}\n\nWhat the ledger knows:\n${contextText(ctx)}`;
  const turns = (Array.isArray(history) ? history : []).slice(-MAX_HISTORY_TURNS)
    .filter((h) => h && typeof h.text === 'string' && h.text.trim())
    .map((h) => ({ role: h.role === 'twin' ? 'assistant' : 'user', content: h.text.trim() }));
  const messages = [...turns, { role: 'user', content: text }];

  let raw = '';
  try {
    const result = await complete({ tier: TIER_CHAT, system, messages, maxTokens: 600, temperature: 0.3, userId, serviceName: 'money-chat', skipCache: true });
    raw = result?.content || '';
  } catch (e) {
    log.warn(`chat completion failed: ${e.message}`);
    return { text: NO_ANSWER, figures: [], actions: [], receipts: [] };
  }

  const parsed = parseReply(raw);
  if (!parsed) {
    /* Prose where an object was asked for is still an answer: kept, grounded, with its basis. */
    const prose = plainProse(raw);
    const grounded = prose ? dropUngrounded(euroGlyphs(prose), ctx) : { text: '', dropped: 0 };
    const said = grounded.text || (grounded.dropped ? NO_TOTAL : NO_ANSWER);
    /* Prose still earns the figure the question asks for ("where did it go" draws the shares). */
    const shaped = prose ? assembleReply({ text: said, figures: [], actions: [], cites: [] }, ctx, text) : { text: said, figures: [], actions: [], receipts: [] };
    return keep({ ...shaped, text: said, basis: basisOf(said, ctx) });
  }
  const reply = assembleReply(parsed, ctx, text);
  const grounded = dropUngrounded(withoutRepeats(reply.text, history), ctx);
  const finalText = grounded.text || (grounded.dropped ? NO_TOTAL : reply.text);
  return keep({ ...reply, text: finalText, basis: basisOf(finalText, ctx) });
}

/* ------------------------------------------------------------------ streaming */

/**
 * The model is asked for one JSON object, so its output cannot simply be forwarded as it
 * arrives: the wrapper, the key names and the escapes would all reach the screen. This walks
 * the arriving characters and hands back the `text` field alone, unescaped, as it is
 * revealed. A chunk that stops in the middle of an escape is held until the rest lands.
 *
 * It does not always obey. Asked a question with a few turns behind it, the model often
 * answers in plain prose, and the finished answer then comes from `plainProse` rather than
 * from the object. So the first character decides: an opening brace, or a fence that is
 * about to hold one, means the object is coming and only its `text` is revealed; anything
 * else is prose, revealed as it is written and cleaned the way `plainProse` cleans it, so
 * that what grows on the screen is what the finished answer would have said.
 */
const UNESCAPE = Object.freeze({ '"': '"', '\\': '\\', '/': '/', n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' });

const PROSE_MARKS = /[*_`#>]/;

export function textStreamer() {
  let state = 'start';
  let hunt = '';
  let esc = '';
  let held = '';
  /* Prose arrives with whatever spacing the model felt like; the finished answer has none of
     it, so a run of space is one space and a leading one is nothing. */
  let spaced = true;

  return {
    /** The plain text this chunk revealed, which is usually an empty string. */
    push(chunk) {
      let revealed = '';
      for (const ch of String(chunk == null ? '' : chunk)) {
        if (state === 'closed') break;
        if (state === 'start') {
          if (/\s/.test(ch)) continue;
          state = ch === '{' || ch === '`' ? 'seek' : 'prose';
          if (state === 'seek') continue;
        }
        if (state === 'held') {
          /* A brace in prose is held with what follows it. If "text" turns up within forty
             characters this is the object the model writes after its answer, and nothing more
             reaches the screen; otherwise it was a brace in a sentence and it is let through. */
          held += ch;
          if (held.includes('"text"')) { state = 'closed'; break; }
          if (held.length >= 40) { revealed += held; held = ''; state = 'prose'; spaced = false; }
          continue;
        }
        if (state === 'prose') {
          if (ch === '{') { state = 'held'; held = '{'; continue; }
          if (PROSE_MARKS.test(ch)) continue;
          if (/\s/.test(ch)) { if (!spaced) { revealed += ' '; spaced = true; } continue; }
          revealed += ch;
          spaced = false;
          continue;
        }
        if (state === 'seek') {
          hunt = (hunt + ch).slice(-6);
          if (hunt === '"text"') state = 'open';
          continue;
        }
        if (state === 'open') {
          /* Between the key and its opening quote there is a colon and perhaps a space. */
          if (ch === '"') state = 'inside';
          continue;
        }
        if (esc) {
          esc += ch;
          if (esc[1] === 'u') {
            if (esc.length === 6) {
              const code = Number.parseInt(esc.slice(2), 16);
              revealed += Number.isFinite(code) ? String.fromCharCode(code) : '';
              esc = '';
            }
            continue;
          }
          revealed += UNESCAPE[esc[1]] === undefined ? esc[1] : UNESCAPE[esc[1]];
          esc = '';
          continue;
        }
        if (ch === '\\') { esc = '\\'; continue; }
        if (ch === '"') { state = 'closed'; continue; }
        revealed += ch;
      }
      return revealed;
    },
    get started() { return state === 'inside' || state === 'prose' || state === 'closed'; },
    get done() { return state === 'closed'; },
  };
}

/**
 * The sentences a buffer has finished, and what is left mid-sentence. Prose is streamed a
 * sentence at a time rather than a word at a time for one reason: a sentence the person has
 * already been told is dropped, and a word already on the screen cannot be taken back.
 */
/**
 * How much of a growing answer is safe to show. The last two words are held back, because
 * "422,20 EUR" becomes "422,20 EUR" with a euro sign only once both words have arrived, and
 * a number already on the screen cannot be rewritten. Everything before that is settled.
 */
export function settledEnd(text) {
  const gaps = [...String(text || '').matchAll(/\s+/g)];
  if (gaps.length < 2) return 0;
  const gap = gaps[gaps.length - 2];
  return gap.index + gap[0].length;
}

export function completeSentences(buffer) {
  const ready = [];
  let rest = String(buffer || '');
  const boundary = /([.!?])\s+/;
  let m = boundary.exec(rest);
  while (m) {
    ready.push(rest.slice(0, m.index + 1).trim());
    rest = rest.slice(m.index + m[0].length);
    m = boundary.exec(rest);
  }
  return [ready.filter(Boolean), rest];
}

const STREAM_UNREADABLE = 'That could not be read right now.';

/** What the person actually read, rebuilt from the pieces that were sent. */
const asShown = (pieces) => pieces.join('').replace(/\s+/g, ' ').trim();

/**
 * Answer one message, in pieces, as the model writes it. The events are, in order:
 *   { phase: 'reading' }                                   at once, before any work
 *   { phase: 'text', delta }                               one per sentence, as they land
 *   { phase: 'figures', figures }                          once, after the text is complete
 *   { phase: 'actions', actions, receipts }                 once
 *   { phase: 'done' }                                      last
 *   { phase: 'failed', detail }                            instead of done, on any error
 *
 * Only those fields ever go to the caller. The deterministic half is unchanged: the model
 * still only phrases, and the figures, actions and receipts are computed here from the
 * ledger after the prose is finished, which is why they cannot be streamed.
 *
 * The repetition guard runs per sentence here, where the non-streaming answer runs it over
 * the whole reply: a sentence already said is dropped as it completes, and if that would
 * leave nothing the whole guarded reply is sent instead, so nobody is answered with silence.
 */
export async function answerStream(userId, message, history = [], { now = new Date(), onEvent = () => {} } = {}) {
  const send = (event) => { try { onEvent(event); } catch { /* the transport is not this function's problem */ } };
  send({ phase: 'reading' });

  const asked = String(message || '').trim();
  const whole = (text) => { if (text) send({ phase: 'text', delta: text }); };
  const closeWith = (reply) => {
    send({ phase: 'figures', figures: reply.figures || [] });
    send({ phase: 'actions', actions: reply.actions || [], receipts: reply.receipts || [], basis: reply.basis || [] });
    send({ phase: 'done' });
    /* Every answer that reaches the person is kept, whichever path made it. */
    keep(reply);
    return reply;
  };
  let kept = false;
  const keep = (reply) => {
    if (kept || !reply || !reply.text) return;
    kept = true;
    saveChatTurn(userId, { role: 'user', text: asked })
      .then(() => saveChatTurn(userId, { role: 'twin', text: reply.text, figures: reply.figures || null, actions: reply.actions || null, thinking: reply.thinking || null, basis: reply.basis || null, receipts: reply.receipts || null }))
      .catch(() => null);
  };

  if (!asked) return closeWith({ text: (whole(NO_ANSWER), NO_ANSWER), figures: [], actions: [], receipts: [] });

  let ctx;
  try {
    ctx = await gather(userId, now);
  } catch (error) {
    log.warn(`chat stream could not gather: ${error.message}`);
    send({ phase: 'failed', detail: 'The ledger could not be read just now.' });
    return null;
  }

  if (!ctx.transactions.length) {
    whole(EMPTY_LEDGER);
    return closeWith({ text: EMPTY_LEDGER, figures: [], actions: [], receipts: [] });
  }

  const quick = shortCircuit(asked, ctx);
  if (quick) {
    whole(quick.text);
    return closeWith(quick);
  }

  const system = `${RULES}\n\nWhat the ledger knows:\n${contextText(ctx)}`;
  const turns = (Array.isArray(history) ? history : []).slice(-MAX_HISTORY_TURNS)
    .filter((h) => h && typeof h.text === 'string' && h.text.trim())
    .map((h) => ({ role: h.role === 'twin' ? 'assistant' : 'user', content: h.text.trim() }));
  const messages = [...turns, { role: 'user', content: asked }];

  const reader = textStreamer();
  const said = new Set(sentencesOf(previousTwinText(history)).map(shapeOf).filter(Boolean));
  /* Exactly what went on the wire, in order, so the answer this returns reads as the screen
     reads it. */
  const shown = [];
  /* The sentence being written, and how much of it has already gone out. */
  let pending = '';
  let released = 0;

  /**
   * Could what is being written still turn out to be a sentence the person was already told?
   * Only such a sentence can be dropped, and a word on the screen cannot be taken back, so
   * this is what decides between words as they come and waiting for the full stop. Most
   * answers part company with the previous turn in their first few words, and from then on
   * they flow.
   */
  const couldRepeat = (partial) => {
    const shape = shapeOf(euroGlyphs(partial));
    if (!shape) return said.size > 0;
    for (const s of said) if (s.startsWith(shape)) return true;
    return false;
  };

  /** `joined` continues the sentence already on the screen; anything else starts one. */
  const put = (piece, joined) => {
    if (!piece) return;
    const delta = joined || !shown.length ? piece : ` ${piece}`;
    send({ phase: 'text', delta });
    shown.push(delta);
  };

  /* A sentence whose amount the ledger does not hold never reaches the wire: the rules
     forbid the model to add up or work out, and when it does anyway the sentence goes. */
  const known = amountsInText(contextText(ctx));
  const grounded = (s) => amountsInText(s).every((a) => known.some((k) => Math.abs(k - a) < 0.005));
  let droppedSentences = 0;
  const emit = (revealed, { final = false } = {}) => {
    pending += revealed;
    const [ready, rest] = completeSentences(pending);
    for (const sentence of ready) {
      /* Compared after the currency is written the way the finished answer writes it: the
         previous turn holds euro signs, and "116,76 EUR" would not have matched them. */
      const full = euroGlyphs(sentence);
      if (released > 0) { put(full.slice(released), true); released = 0; continue; }
      if (!grounded(full)) { droppedSentences += 1; continue; }
      if (!said.has(shapeOf(full))) put(full, false);
      released = 0;
    }
    pending = rest;

    if (final) {
      const converted = euroGlyphs(pending);
      const tail = converted.slice(released).replace(/\s+$/, '');
      if (tail.trim()) {
        if (released > 0) put(tail, true);
        else if (!grounded(converted)) droppedSentences += 1;
        else if (!said.has(shapeOf(converted.trim()))) put(tail.trim(), false);
      }
      pending = '';
      released = 0;
      /* Everything it said stood on a number the ledger does not hold: say so, once. */
      if (!shown.length && droppedSentences) { whole(NO_TOTAL); shown.push(NO_TOTAL); }
      return;
    }

    if (couldRepeat(pending)) return;
    /* A sentence still being written is held whole until its amounts can be checked. */
    if (amountsInText(pending).length && !grounded(euroGlyphs(pending))) return;
    const converted = euroGlyphs(pending);
    /* The last two words are held back: an amount written "422,20 EUR" is rewritten with a
       euro sign once both of its words have arrived, and a number already on the screen
       cannot be rewritten. */
    const settled = settledEnd(converted);
    if (settled <= released) return;
    put(converted.slice(released, settled), released > 0);
    released = settled;
  };

  let raw = '';
  let thinking = '';
  let firstWord = false;
  let outOfPatience = false;
  /* One call to the model, with or without its reasoning. With it, a watch runs: if no word
     of the answer has come when the patience is up, the stream is stopped. */
  const run = async (withReasoning) => {
    const control = new AbortController();
    const watch = withReasoning ? setTimeout(() => { if (!firstWord) { outOfPatience = true; control.abort(); } }, reasoningPatienceMs()) : null;
    try {
      return await streamComplete({
        /* The model's own reasoning, low effort, shown as it comes: the train of thought under
           the answer, never mistaken for the answer. It shares the token budget with the
           answer, so the budget grows with it; MONEY_CHAT_REASONING=off turns it off. */
        tier: TIER_CHAT, system, messages, maxTokens: withReasoning ? 1400 : 600, temperature: 0.3, userId,
        serviceName: 'money-chat-stream',
        signal: control.signal,
        ...(withReasoning ? { reasoning: { effort: 'low' } } : {}),
        onReasoning: withReasoning ? (piece) => { thinking += piece; send({ phase: 'thinking', delta: piece }); } : undefined,
        onChunk: (delta) => {
          firstWord = true;
          const revealed = reader.push(delta);
          if (revealed) emit(revealed);
        },
      });
    } finally {
      if (watch) clearTimeout(watch);
    }
  };
  try {
    let result;
    try {
      result = await run(REASONING_ON);
    } catch (error) {
      if (!(REASONING_ON && outOfPatience && !firstWord)) throw error;
      /* The reasoning outlived its patience with nothing said: the same question, asked
         plainly, so the person gets an answer inside the time the host allows. What was
         thought so far stays on the screen under How it got there. */
      log.info('chat reasoning outlived its patience; answering without it', { patienceMs: reasoningPatienceMs() });
      result = await run(false);
    }
    raw = result?.content || '';
  } catch (error) {
    log.warn(`chat stream failed: ${error.message}`);
    /* Nothing reached the person: say so once. Prose already on the screen is kept, and the
       answer closes without figures rather than pretending the sentence never happened. A
       brace or a quote the streamer let out while it waited for the sentence is not prose. */
    if (!shown.length || !/[a-z0-9]/i.test(asShown(shown))) {
      send({ phase: 'failed', detail: STREAM_UNREADABLE });
      return null;
    }
    emit('', { final: true });
    return closeWith({ text: asShown(shown), figures: [], actions: [], receipts: [] });
  }

  emit('', { final: true });

  const parsed = parseReply(raw);
  if (!parsed) {
    const prose = plainProse(raw);
    const g = prose ? dropUngrounded(euroGlyphs(prose), ctx) : { text: '', dropped: 0 };
    const text = g.text || (g.dropped ? NO_TOTAL : NO_ANSWER);
    if (!shown.length) whole(text);
    const said = shown.length ? asShown(shown) : text;
    /* Prose still earns the figure the question asks for ("where did it go" draws the shares). */
    const shaped = prose ? assembleReply({ text: said, figures: [], actions: [], cites: [] }, ctx, asked) : { text: said, figures: [], actions: [], receipts: [] };
    return closeWith({ ...shaped, text: said, basis: basisOf(said, ctx) });
  }

  const reply = assembleReply(parsed, ctx, asked);
  /* A gateway that cannot stream, or a whole object that arrived in one piece before the
     reader saw a boundary, leaves nothing shown: the guarded reply then goes as one event,
     and the app cannot tell the difference except in timing. */
  const g = dropUngrounded(withoutRepeats(reply.text, history), ctx);
  const guarded = g.text || (g.dropped ? NO_TOTAL : reply.text);
  if (!shown.length) whole(guarded);
  const finalText = shown.length ? asShown(shown) : guarded;
  const basis = basisOf(finalText, ctx);
  const closed = closeWith({ ...reply, text: finalText, basis, thinking: thinking || null });
  /* The kept turns are written after the wire closes; on a serverless host the caller awaits
     this function, so the write still lands. */
  await new Promise((r) => setTimeout(r, 0));
  return closed;
}

/* ------------------------------------------------------------------- grounding */

/** Every amount a text holds, as numbers: "12,50" -> 12.5, "1.011,02" -> 1011.02. Pure. */
export function amountsInText(text) {
  const out = [];
  for (const m of String(text || '').matchAll(/(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})\b/g)) out.push(Number(`${m[1].replace(/\./g, '')}.${m[2]}`));
  return out;
}

/**
 * The sentences of a reply whose every amount the context holds. The rules tell the model
 * never to add numbers up or work out a difference; when it does anyway ("that leaves
 * 361,24 EUR", "283,51 EUR on food"), the sentence goes, because a number the ledger did
 * not compute must never reach the screen. Returns the kept text and how many sentences
 * went; empty when nothing survived. Pure.
 */
export function dropUngrounded(text, ctx) {
  const known = amountsInText(contextText(ctx));
  const has = (a) => known.some((k) => Math.abs(k - a) < 0.005);
  const kept = [];
  let dropped = 0;
  for (const s of sentencesOf(String(text || ''))) {
    if (amountsInText(s).every(has)) kept.push(s); else dropped += 1;
  }
  return { text: kept.join(' ').trim(), dropped };
}
const NO_TOTAL = 'The ledger has no total for that; it can only name the parts it holds.';

/* ------------------------------------------------------------------------ basis */

/**
 * The lines of the context an answer stood on: every line that shares a number with the
 * text. Computed, not claimed; shown under "How it got there" with the model's own reasoning.
 */
const AMOUNT_TOKEN = /\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}|\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2}/g;
/** An amount as a comparable key: grouping separators gone, the decimal a comma. */
export function amountKey(token) {
  const t = String(token);
  if (/^\d{1,3}(?:\.\d{3})+,\d{2}$/.test(t)) return t.replace(/\./g, '');
  if (/^\d{1,3}(?:,\d{3})+\.\d{2}$/.test(t)) return t.replace(/,/g, '').replace('.', ',');
  return t.replace('.', ',');
}
export function basisOf(text, ctx) {
  const numbers = new Set((String(text || '').match(AMOUNT_TOKEN) || []).map(amountKey));
  if (!numbers.size) return [];
  return contextText(ctx).split('\n')
    /* The line of fact ids is for the model's offers, never for a person to read. */
    .filter((line) => !line.startsWith('Facts they gave'))
    .filter((line) => (line.match(AMOUNT_TOKEN) || []).some((n) => numbers.has(amountKey(n))))
    .slice(0, 8);
}

/* ------------------------------------------------------------------------ act */

/** Run an action the person confirmed. Checked again here: the card is not the authority, the ledger is. */
export async function act(userId, action, { now = new Date() } = {}) {
  const ctx = await gather(userId, now);
  const checked = validateAction(action, ctx);
  if (!checked) throw Object.assign(new Error('That action does not match anything in the ledger.'), { status: 400 });

  if (checked.kind === 'not_me') {
    await setVerdict(userId, checked.transaction_id, 'not_me');
    const t = ctx.byId.get(checked.transaction_id);
    return { done: true, said: euroGlyphs(`${nameOf(t)}, ${amountText(t.amount)} on ${dayMonth(t.occurred_at)}, is marked as not yours and leaves the month.`) };
  }
  if (checked.kind === 'recategorise') {
    await setPlaceCategory(userId, checked.merchant_key, checked.category);
    const place = ctx.placeByKey.get(checked.merchant_key);
    return { done: true, said: `${place.name} now counts as ${checked.category}, here and from now on.` };
  }
  if (checked.kind === 'split') {
    const t = ctx.byId.get(checked.transaction_id);
    await answerQuestion(userId, { questionId: `split:${t.id}`, kind: 'split', subject: String(t.id), subjectLabel: nameOf(t), value: String(checked.ways) });
    const share = round2(abs(t) / checked.ways);
    return { done: true, said: euroGlyphs(`${nameOf(t)}, ${amountText(t.amount)}, counts as ${amountText(share)} of yours. Bizums back for ${amountText(share)} will count as the others paying, and it will say who still owes.`) };
  }
  if (checked.kind === 'person') {
    /* The question this answers is the one the ledger would have asked: money out or money in. */
    const sent = ctx.transactions.some((t) => String(t.merchant_key || '').toLowerCase() === checked.merchant_key.toLowerCase() && Number(t.amount) < 0);
    await answerQuestion(userId, { questionId: `${sent ? 'person_out' : 'person_in'}:${checked.merchant_key}`, kind: 'person', subject: checked.merchant_key, subjectLabel: checked.name, value: checked.role, note: checked.note });
    const said = checked.role === 'landlord' ? `${checked.name} is your landlord: transfers to them read as rent from now on.`
      : ['family', 'friend', 'flatmate', 'partner'].includes(checked.role) ? `${checked.name} is ${checked.role}: money between you is not spending.`
        : `${checked.name} is ${checked.role}. Noted${checked.note ? `, with what you said` : ''}.`;
    return { done: true, said };
  }
  if (checked.kind === 'remember') {
    /* Thirty notes is a memory; more is a diary the prompt cannot carry. */
    if ((ctx.facts || []).filter((f) => f.kind === 'note').length >= 30) return { done: false, said: 'It holds thirty of your notes already. Forget one on You and it will take this.' };
    const hash = crypto.createHash('sha256').update(checked.text).digest('hex').slice(0, 8);
    const subject = `${checked.text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'note'}-${hash}`;
    await answerQuestion(userId, { questionId: null, kind: 'note', subject, subjectLabel: null, value: checked.text });
    return { done: true, said: 'Kept, in your words. It reads with that from now on.' };
  }
  if (checked.kind === 'forget') {
    const r = await deleteFact(userId, checked.fact_id);
    return { done: true, said: r.deleted ? 'Forgotten. If it matters, it will ask again.' : 'That one is not yours to forget here.' };
  }
  const q = ctx.questions.find((x) => x.id === checked.question_id);
  await answerQuestion(userId, { questionId: q.id, kind: q.kind, subject: q.subject, subjectLabel: q.subjectLabel || q.receipts?.[0]?.merchant_raw, value: checked.value });
  return { done: true, said: 'Noted. The ledger reads with that from now on.' };
}
