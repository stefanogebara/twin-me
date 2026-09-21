/**
 * The return window on a receipt (idea 1 of 2026-09-19, built 2026-09-21).
 *
 * A receipt's own text often says how long the shop takes something back: "return within
 * 30 days", "devoluciones hasta el 15 de octubre", "trocas em ate 30 dias". The inbox knows
 * the purchase date, so the window is a date, and a quiet line near its end saves money
 * without asking anyone to think. Read by rules, never by a model; nothing is guessed.
 */
import { supabaseAdmin } from '../database.js';
import { dayIn, startOfDayIn } from './zone.js';

const DAY_MS = 86400000;
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const MONTHS = [
  ['january', 'enero', 'janeiro'], ['february', 'febrero', 'fevereiro'], ['march', 'marzo', 'marco'], ['april', 'abril', 'abril'], ['may', 'mayo', 'maio'], ['june', 'junio', 'junho'],
  ['july', 'julio', 'julho'], ['august', 'agosto', 'agosto'], ['september', 'septiembre', 'setembro'], ['october', 'octubre', 'outubro'], ['november', 'noviembre', 'novembro'], ['december', 'diciembre', 'dezembro'],
];
const MONTH_RE = '(january|february|march|april|may|june|july|august|september|october|november|december|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|janeiro|fevereiro|marco|maio|junho|julho|setembro|outubro|novembro|dezembro|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|ene|abr|ago|dic|fev|set|out|dez)';
const RETURN_WORDS = '(?:return|returns|returned|refund|devoluci[o]n|devoluciones|devolver|devolverlo|devolucao|devolucoes|devolver|troca|trocas|cambio|cambios|exchange)';
const monthOf = (word) => MONTHS.findIndex((names) => names.some((n) => n.startsWith(word.slice(0, 3))));
const shift = (key, n) => dayIn(new Date(startOfDayIn(key).getTime() + n * DAY_MS + 12 * 3600000));
export const MAX_RETURN_DAYS = 120;

/**
 * The window a receipt states: { until: 'YYYY-MM-DD', days, quote } or null. A count of
 * days runs from the purchase day; a date stands on its own, this year or the next.
 */
export function returnWindow(text, purchasedAt = new Date()) {
  const t = norm(text).replace(/\s+/g, ' ');
  if (!t) return null;
  const bought = dayIn(purchasedAt);
  if (!bought) return null;
  const year = Number(bought.slice(0, 4));
  /* "return within 30 days", "30 days to return", "plazo de devolucion: 14 dias", "devoluciones en 30 dias", "trocas em ate 30 dias" */
  const days = t.match(new RegExp(`${RETURN_WORDS}[^.\\n]{0,60}?\\b(\\d{1,3})\\s*(?:days?|dias|d[i]as)\\b`)) || t.match(new RegExp(`\\b(\\d{1,3})\\s*(?:days?|dias)\\b[^.\\n]{0,40}?${RETURN_WORDS}`));
  if (days) {
    const n = Number(days[1]);
    if (n >= 1 && n <= MAX_RETURN_DAYS) return { until: shift(bought, n), days: n, quote: days[0].trim().slice(0, 120) };
  }
  /* "until October 15", "hasta el 15 de octubre", "ate 15 de outubro", "hasta el 15/10/2026", "by 15 Oct" */
  const dated = t.match(new RegExp(`${RETURN_WORDS}[^.\\n]{0,80}?\\b(?:until|by|before|hasta el|hasta|antes del|ate o dia|ate|antes de)\\s+(?:the\\s+|el\\s+|o\\s+|dia\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:de\\s+|of\\s+|/|-)?\\s*(${MONTH_RE.slice(1, -1)}|\\d{1,2})(?:[/-](\\d{4}))?\\b`))
    || t.match(new RegExp(`${RETURN_WORDS}[^.\\n]{0,80}?\\b(?:until|by|before)\\s+${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
  if (dated) {
    let d; let mo; let y = null;
    if (/^\d+$/.test(dated[1])) { d = Number(dated[1]); mo = /^\d+$/.test(dated[2]) ? Number(dated[2]) - 1 : monthOf(dated[2]); y = dated[3] ? Number(dated[3]) : null; }
    else { mo = monthOf(dated[1]); d = Number(dated[2]); }
    if (d >= 1 && d <= 31 && mo >= 0 && mo <= 11) {
      let key = `${y || year}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (!y && key < bought) key = `${year + 1}${key.slice(4)}`;
      const span = Math.round((startOfDayIn(key).getTime() - startOfDayIn(bought).getTime()) / DAY_MS);
      if (span >= 0 && span <= MAX_RETURN_DAYS) return { until: key, days: span, quote: dated[0].trim().slice(0, 120) };
    }
  }
  return null;
}

/**
 * The windows closing soon, from sightings that carry one: [{ merchant, amount, until,
 * days_left, transaction_id }], soonest first. A window already shut is not a line.
 */
export function returnsClosing(sightings = [], now = new Date(), { within = 7 } = {}) {
  const today = dayIn(now);
  const out = [];
  for (const s of sightings || []) {
    const until = s?.raw_json?.return_until;
    if (!until || typeof until !== 'string' || until < today) continue;
    const daysLeft = Math.round((startOfDayIn(until).getTime() - startOfDayIn(today).getTime()) / DAY_MS);
    if (daysLeft > within) continue;
    out.push({ merchant: s.merchant_raw || 'a purchase', amount: Math.abs(Number(s.amount) || 0), until, days_left: daysLeft, transaction_id: s.transaction_id || null });
  }
  return out.sort((a, b) => a.until.localeCompare(b.until) || b.amount - a.amount);
}

/** The person's receipts of the last four months that carry a window, and which close within a week. */
export async function listReturnsClosing(userId, now = new Date(), opts = {}) {
  if (!userId) throw new Error('userId required');
  const since = new Date(now.getTime() - MAX_RETURN_DAYS * DAY_MS).toISOString();
  const { data, error } = await supabaseAdmin.from('money_sightings')
    .select('merchant_raw, amount, raw_json, transaction_id, occurred_at')
    .eq('user_id', userId).eq('source', 'email').gte('occurred_at', since).limit(2000);
  if (error) throw new Error(`Cannot read the receipts: ${error.message}`);
  return returnsClosing((data || []).filter((s) => s.raw_json?.return_until), now, opts);
}
