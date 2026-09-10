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
import { createLogger } from '../logger.js';
import {
  listTransactions, months, forecast, categorySpend, refreshRecurring, listReadings, listFacts,
  questionsFor, listPlaces, setVerdict, setPlaceCategory, answerQuestion,
} from './store.js';
import { learnMerchants, learnPatterns, predictNext, describeForTwin } from './brain.js';
import { describeContext } from './context.js';
import { CATEGORIES } from './places.js';
import { calendarLines } from './calendar.js';
import { safeToSpend, allowanceLine } from './allowance.js';

const log = createLogger('money-chat');

export const FIGURE_KINDS = Object.freeze(['months', 'shares', 'weekdays', 'recurring', 'band', 'history']);
export const ACTION_KINDS = Object.freeze(['not_me', 'recategorise', 'answer']);

/** How many receipts ride under one answer, and how many of anything the context carries. */
export const MAX_RECEIPTS = 8;
const MAX_SHARE_ITEMS = 8;
const MAX_HISTORY_POINTS = 24;
const MAX_CONTEXT_LINES = 40;
const MAX_HISTORY_TURNS = 10;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DECIMAL = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ------------------------------------------------------------------------ basics */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const out = (t) => Number(t.amount) < 0;
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
  const thisMonth = cast?.month || `${now.toISOString().slice(0, 7)}-01`;
  const categories = await settled(categorySpend(userId, { month: thisMonth }), { month: thisMonth, total: 0, read: 0, groups: [] });
  return assemble({ transactions, segments, forecast: cast, recurring, readings, facts, questions, places, categories, now });
}

/**
 * The pure half of gathering: the same rows, learned and indexed. Tests hand rows straight
 * to this and skip the database.
 */
export function assemble({ transactions = [], segments = [], forecast: cast = null, recurring = [], readings = [], facts = [], questions = null, places = [], categories = null, now = new Date() } = {}) {
  const placeByKey = new Map((places || []).map((p) => [p.merchant_key, p]));
  const categoryOf = (t) => placeByKey.get(t.merchant_key)?.category || null;
  const profiles = learnMerchants(transactions, { now, categoryOf });
  const patterns = learnPatterns({ transactions, profiles, categoryOf, now });
  const predictions = predictNext(profiles, { now });
  const byId = new Map(transactions.map((t) => [t.id, t]));
  const open = [...(questions?.opening || []), ...(questions?.fromLedger || [])];
  return {
    now, transactions, byId, segments, forecast: cast, recurring, readings, facts,
    questions: open, places: places || [], placeByKey, categories, profiles, patterns, predictions,
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
      const label = byMerchant ? (ctx.placeByKey.get(t.merchant_key)?.name || nameOf(t)) : (ctx.placeByKey.get(t.merchant_key)?.category || 'not read yet');
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
  if (action.kind === 'answer') {
    const q = ctx.questions.find((x) => x.id === action.question_id);
    const value = action.value == null ? '' : String(action.value).trim();
    if (!q || !value) return null;
    return { kind: 'answer', question_id: q.id, value, label: label || `Record: ${value}` };
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

  if (ctx.recurring.length) {
    lines.push('Comes back regularly: ' + ctx.recurring.slice(0, 10).map((s) => `${s.merchant_name || s.merchant_key} ${amountText(s.typical_amount)} ${s.cadence}${s.next_expected ? `, next around ${dayMonth(`${s.next_expected}T12:00:00Z`)}` : ''}`).join('; ') + '.');
  }

  const learned = describeForTwin({ profiles: ctx.profiles, patterns: ctx.patterns, predictions: ctx.predictions, now: ctx.now });
  if (learned) lines.push(...learned.split('\n').slice(1));

  /* A reading the person confirmed is worth more than one they have not judged, and one they
     rejected never reaches here at all. */
  for (const r of ctx.readings.slice(0, 4)) if (r?.sentence) lines.push(`Reading${r.verdict === 'true' ? ' (they confirmed this)' : ''}: ${r.sentence}${r.detail ? ` ${r.detail}` : ''}`.replace(/\u20ac/g, 'EUR'));

  const said = describeContext(ctx.facts);
  if (said) lines.push(`The person said: ${said.replace(/\u20ac/g, 'EUR')}`);

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
      const cat = ctx.placeByKey.get(t.merchant_key)?.category || t.channel || 'not read yet';
      lines.push(`${t.id} ${dayMonth(t.occurred_at)} ${ctx.placeByKey.get(t.merchant_key)?.name || nameOf(t)} ${out(t) ? '-' : '+'}${amountText(t.amount)} ${cat}${t.verdict ? ` (${t.verdict})` : ''}`);
    }
  }

  const placed = ctx.places.slice(0, 40);
  if (placed.length) {
    lines.push('Places (merchant_key: name, kind): ' + placed.map((p) => `${p.merchant_key}: ${p.name}, ${p.category || 'not read yet'}`).join('; '));
  }

  return lines.slice(0, MAX_CONTEXT_LINES + 60).join('\n');
}

export const RULES = [
  'You are the person\'s own ledger, speaking to a student in Spain about their money.',
  'Plain words, two to four short sentences. No emojis, no markdown, no bullet lists, no headings.',
  'Every number you write must appear in the context above. Never estimate, round differently, or add up numbers yourself; if the context does not hold the number, say the ledger cannot tell.',
  'Write amounts exactly as the context does, like 12,50 EUR.',
  'Do not say "always" for an amount that varies; say "usually" or "about".',
  'An answer is a claim: prefer naming the payments behind it.',
  'The earlier turns are the conversation so far. Do not restate the question, do not repeat a number or a sentence you already said unless asked for it again, and do not explain again what the ledger is or where answers come from.',
  'Vary your openings; never begin two answers the same way. On a follow-up ("and last month?", "why?", "and Spotify?") answer only what is new.',
  'When the calendar lines say what a kind of event usually costs, you may say what the days ahead are likely to cost, always as "usually about", never as a promise.',
  'When a figure would show the thing better than words, ask for it by kind. Kinds: months (spent per month), shares (where a month went; add month, and by: "merchant" for places), weekdays (spend by weekday), recurring (what comes back), band (this month so far and likely), history (one merchant over time; add merchant). Ask for at most two, and only when they add something.',
  'Actions are offers the person taps, never things you did: the text must not claim to have changed, marked or recorded anything. Say something like "If that is right, mark it below." and leave the doing to the card.',
  'Propose an action only when the person asks to fix or record something: not_me with transaction_id from the recent payments; recategorise with merchant_key from the places and a category from: ' + CATEGORIES.join(', ') + '; answer with question_id from the open questions and the value they gave.',
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
  return String(raw || '').replace(/[*_`#>]/g, '').replace(/\n{2,}/g, ' ').replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------------ short circuits */

/**
 * The two asks that need no model: what comes back, and the months side by side. Both are a
 * figure with a computed sentence, so they cost nothing and cannot be wrong in phrasing.
 */
export function shortCircuit(message, ctx) {
  const m = String(message || '').toLowerCase();
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
  if (!ctx.transactions.length) return { text: EMPTY_LEDGER, figures: [], actions: [], receipts: [] };

  const quick = shortCircuit(text, ctx);
  if (quick) return quick;

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
    const prose = plainProse(raw);
    return { text: prose ? euroGlyphs(prose) : NO_ANSWER, figures: [], actions: [], receipts: [] };
  }
  const reply = assembleReply(parsed, ctx, text);
  return { ...reply, text: withoutRepeats(reply.text, history) };
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
        if (state === 'prose') {
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
    send({ phase: 'actions', actions: reply.actions || [], receipts: reply.receipts || [] });
    send({ phase: 'done' });
    return reply;
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

  const emit = (revealed, { final = false } = {}) => {
    pending += revealed;
    const [ready, rest] = completeSentences(pending);
    for (const sentence of ready) {
      /* Compared after the currency is written the way the finished answer writes it: the
         previous turn holds euro signs, and "116,76 EUR" would not have matched them. */
      const full = euroGlyphs(sentence);
      if (released > 0) put(full.slice(released), true);
      else if (!said.has(shapeOf(full))) put(full, false);
      released = 0;
    }
    pending = rest;

    if (final) {
      const converted = euroGlyphs(pending);
      const tail = converted.slice(released).replace(/\s+$/, '');
      if (tail.trim()) {
        if (released > 0) put(tail, true);
        else if (!said.has(shapeOf(converted.trim()))) put(tail.trim(), false);
      }
      pending = '';
      released = 0;
      return;
    }

    if (couldRepeat(pending)) return;
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
  try {
    const result = await streamComplete({
      tier: TIER_CHAT, system, messages, maxTokens: 600, temperature: 0.3, userId,
      serviceName: 'money-chat-stream',
      onChunk: (delta) => {
        const revealed = reader.push(delta);
        if (revealed) emit(revealed);
      },
    });
    raw = result?.content || '';
  } catch (error) {
    log.warn(`chat stream failed: ${error.message}`);
    /* Nothing reached the person: say so once. Prose already on the screen is kept, and the
       answer closes without figures rather than pretending the sentence never happened. */
    if (!shown.length) {
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
    const text = prose ? euroGlyphs(prose) : NO_ANSWER;
    if (!shown.length) whole(text);
    return closeWith({ text: shown.length ? asShown(shown) : text, figures: [], actions: [], receipts: [] });
  }

  const reply = assembleReply(parsed, ctx, asked);
  /* A gateway that cannot stream, or a whole object that arrived in one piece before the
     reader saw a boundary, leaves nothing shown: the guarded reply then goes as one event,
     and the app cannot tell the difference except in timing. */
  const guarded = withoutRepeats(reply.text, history);
  if (!shown.length) whole(guarded);
  return closeWith({ ...reply, text: shown.length ? asShown(shown) : guarded });
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
    await setPlaceCategory(checked.merchant_key, checked.category);
    const place = ctx.placeByKey.get(checked.merchant_key);
    return { done: true, said: `${place.name} now counts as ${checked.category}, here and from now on.` };
  }
  const q = ctx.questions.find((x) => x.id === checked.question_id);
  await answerQuestion(userId, { questionId: q.id, kind: q.kind, subject: q.subject, subjectLabel: q.subjectLabel || q.receipts?.[0]?.merchant_raw, value: checked.value });
  return { done: true, said: 'Noted. The ledger reads with that from now on.' };
}
