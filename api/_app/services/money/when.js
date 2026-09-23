/**
 * The days a sentence names, in the person's own calendar (2026-09-20).
 *
 * "I am going to Bilbao next Friday to Sunday" was kept as a note with no days, so the
 * ledger read nothing from it (calendar_ahead stayed 0). This reads the date words a
 * person actually writes, in English, Spanish and Portuguese: tomorrow, this weekend, next
 * weekend, next Friday, Friday to Sunday, the 25th, 3 to 6 October, 3 al 6 de octubre. Days
 * are YYYY-MM-DD in Europe/Madrid, never more than fourteen, never in the past. Pure.
 */
import { dayIn, partsIn } from './zone.js';

const DAY_MS = 86400000;
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const WEEKDAYS = [
  ['sunday', 'domingo', 'domingo'], ['monday', 'lunes', 'segunda'], ['tuesday', 'martes', 'terca'], ['wednesday', 'miercoles', 'quarta'],
  ['thursday', 'jueves', 'quinta'], ['friday', 'viernes', 'sexta'], ['saturday', 'sabado', 'sabado'],
];
const MONTHS = [
  ['january', 'enero', 'janeiro'], ['february', 'febrero', 'fevereiro'], ['march', 'marzo', 'marco'], ['april', 'abril', 'abril'], ['may', 'mayo', 'maio'], ['june', 'junio', 'junho'],
  ['july', 'julio', 'julho'], ['august', 'agosto', 'agosto'], ['september', 'septiembre', 'setembro'], ['october', 'octubre', 'outubro'], ['november', 'noviembre', 'novembro'], ['december', 'diciembre', 'dezembro'],
];
const weekdayOf = (word) => WEEKDAYS.findIndex((names) => names.some((n) => word.startsWith(n.slice(0, 3)) && (n.startsWith(word.slice(0, 3)))));
const monthOf = (word) => MONTHS.findIndex((names) => names.some((n) => n.startsWith(word.slice(0, 3)) && word.startsWith(n.slice(0, 3))));
const WEEKDAY_RE = '(sunday|monday|tuesday|wednesday|thursday|friday|saturday|domingo|lunes|martes|miercoles|jueves|viernes|sabado|segunda|terca|quarta|quinta|sexta)(?:-feira)?';
const MONTH_RE = '(january|february|march|april|may|june|july|august|september|october|november|december|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|janeiro|fevereiro|marco|maio|junho|julho|setembro|outubro|novembro|dezembro)';

export const MAX_DAYS = 14;

function dayKey(base, offset) { return dayIn(new Date(base + offset * DAY_MS + 12 * 3600000)); }

/** The days named, as sorted distinct YYYY-MM-DD keys; [] when the sentence names none. */
export function daysIn(text, now = new Date()) {
  const t = norm(text);
  const parts = partsIn(now);
  const todayKey = dayIn(now);
  const base = new Date(`${todayKey}T00:00:00Z`).getTime(); // a day counter; only the key matters
  const weekday = parts?.weekday ?? 0;
  const days = new Set();
  const add = (offset) => { if (offset >= 0 && offset <= 60) days.add(dayKey(base, offset)); };
  const span = (a, b) => { for (let o = a; o <= b && o - a < MAX_DAYS; o += 1) add(o); };
  const nextOf = (wd, after = 0) => { let o = (wd - weekday + 7) % 7; if (o <= after) o += 7; return o; };
  const satOffset = (6 - weekday + 7) % 7;

  if (/\b(tomorrow|manana|amanha)\b/.test(t)) add(1);
  if (/\b(today|hoy|hoje)\b/.test(t)) add(0);
  if (/\b(this weekend|este fin de semana|este fim de semana|neste fim de semana|esse fim de semana)\b/.test(t)) span(satOffset, satOffset + 1);
  if (/\b(next weekend|el fin de semana que viene|el proximo fin de semana|fim de semana que vem|proximo fim de semana|no proximo fim de semana)\b/.test(t)) {
    const o = weekday >= 5 || weekday === 0 ? satOffset + 7 : satOffset; // late in the week, "next" means the one after
    span(o, o + 1);
  }
  /* "friday to sunday", "de viernes a domingo", "de sexta a domingo", with or without "next" */
  for (const m of t.matchAll(new RegExp(`(?:next |proximo |proxima |el |la |o |a |de |from |on )?${WEEKDAY_RE}\\s*(?:to|a|al|hasta|ate|-|until)\\s*(?:el |o |a |la )?${WEEKDAY_RE}`, 'g'))) {
    const a = weekdayOf(m[1]); const b = weekdayOf(m[2]);
    if (a < 0 || b < 0) continue;
    const start = nextOf(a, 0); let len = (b - a + 7) % 7; if (len === 0) len = 0;
    span(start, start + len);
  }
  /* a single weekday: "next friday", "on friday", "el viernes", "na sexta" */
  if (!days.size) for (const m of t.matchAll(new RegExp(`\\b(?:next|on|this|el|la|o|a|na|no|proximo|proxima|proximo)\\s+${WEEKDAY_RE}\\b`, 'g'))) { const wd = weekdayOf(m[1]); if (wd >= 0) add(nextOf(wd, 0)); }
  /* "3 to 6 october", "del 3 al 6 de octubre", "de 3 a 6 de outubro", "october 3-6" */
  for (const m of t.matchAll(new RegExp(`\\b(\\d{1,2})\\s*(?:to|a|al|-|hasta|ate)\\s*(\\d{1,2})\\s*(?:de |of )?${MONTH_RE}\\b`, 'g'))) {
    const mo = monthOf(m[3]); if (mo < 0) continue;
    const year = parts?.year ?? new Date(now).getUTCFullYear();
    const d1 = Number(m[1]); const d2 = Number(m[2]); if (d2 < d1) continue;
    for (let d = d1; d <= d2 && d - d1 < MAX_DAYS; d += 1) { const key = `${year}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; if (key >= todayKey) days.add(key); }
  }
  /* "on the 25th", "el 25", "dia 25", "25 de octubre", "october 25" */
  for (const m of t.matchAll(new RegExp(`\\b(?:on the |the |el |dia |on )?(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*(?:de |of )?${MONTH_RE})?\\b`, 'g'))) {
    const d = Number(m[1]); if (!(d >= 1 && d <= 31)) continue;
    const hasMonth = Boolean(m[2]);
    if (!hasMonth && !/\b(on the|the|el|dia)\s+\d{1,2}(st|nd|rd|th)?\b/.test(m[0])) continue; // a bare number is an amount, not a day
    const year = parts?.year ?? new Date(now).getUTCFullYear();
    let mo = hasMonth ? monthOf(m[2]) : (parts?.month ?? new Date(now).getUTCMonth() + 1) - 1;
    if (mo < 0) continue;
    let key = `${year}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (key < todayKey && !hasMonth) { mo += 1; key = `${mo >= 12 ? year + 1 : year}-${String((mo % 12) + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
    if (key >= todayKey) days.add(key);
  }
  return [...days].sort().slice(0, MAX_DAYS);
}

/** Whether the sentence says the person will be somewhere else, in three languages. */
export function isTrip(text) {
  const t = norm(text);
  return /\b(going to|go to|travel|trip|flying|fly to|viaje|viajo|viajar|voy a|vamos a|viagem|vou (para|pra|a)|vamos (para|pra)|fin de semana fuera|weekend away|fim de semana fora|vacaciones|vacation|ferias)\b/.test(t) && !/\b(gym|gimnasio|academia|class|clase|aula|shop|supermarket|cinema)\b/.test(t);
}

/**
 * A trip's days and a title the calendar's away rule recognises, or null: only a sentence
 * that reads as a trip and names days becomes away days.
 */
export function tripDays(text, now = new Date()) {
  if (!isTrip(text)) return null;
  const days = daysIn(text, now);
  if (!days.length) return null;
  return { days, title: `Trip: ${String(text).trim().slice(0, 120)}` };
}
