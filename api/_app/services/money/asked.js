/**
 * The stretch of time a question names, in the past (2026-09-20).
 *
 * "How much did I spend on Saturday", "on the 15th", "between the 8th and the 14th", "since
 * the 1st", "last Friday night", "this weekend versus last weekend": each had no line to
 * quote, so the chat gave one day of a range, dressed Friday's whole day up as its night,
 * or answered a comparison with one payment. This reads the day words a person writes about
 * the past, in English, Spanish and Portuguese, and windows.js totals the stretch. The fixed
 * windows (today, yesterday, last night, the weeks) stay in windows.js. Pure.
 */
import { dayIn, startOfDayIn, partsIn } from './zone.js';
import { stretchLine, shiftDay, dayTotals } from './windows.js';

const HOUR = 3600000;
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = [
  ['sunday', 'domingo', 'domingo'], ['monday', 'lunes', 'segunda'], ['tuesday', 'martes', 'terca'], ['wednesday', 'miercoles', 'quarta'],
  ['thursday', 'jueves', 'quinta'], ['friday', 'viernes', 'sexta'], ['saturday', 'sabado', 'sabado'],
];
const MONTHS = [
  ['january', 'enero', 'janeiro'], ['february', 'febrero', 'fevereiro'], ['march', 'marzo', 'marco'], ['april', 'abril', 'abril'], ['may', 'mayo', 'maio'], ['june', 'junio', 'junho'],
  ['july', 'julio', 'julho'], ['august', 'agosto', 'agosto'], ['september', 'septiembre', 'setembro'], ['october', 'octubre', 'outubro'], ['november', 'noviembre', 'novembro'], ['december', 'diciembre', 'dezembro'],
];
const WEEKDAY_RE = '(sunday|monday|tuesday|wednesday|thursday|friday|saturday|domingo|lunes|martes|miercoles|jueves|viernes|sabado|segunda|terca|quarta|quinta|sexta)(?:-feira)?';
const MONTH_RE = '(january|february|march|april|may|june|july|august|september|october|november|december|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|janeiro|fevereiro|marco|maio|junho|julho|setembro|outubro|novembro|dezembro)';
const ORD = '(?:st|nd|rd|th|o|\u00ba)?';
const EUROS = /^\s*(euros?|eur|\u20ac)/;
const weekdayOf = (word) => WEEKDAYS.findIndex((names) => names.some((n) => n.startsWith(word.slice(0, 3))));
const monthOf = (word) => MONTHS.findIndex((names) => names.some((n) => n.startsWith(word.slice(0, 3))));

const startOf = (key) => startOfDayIn(key).getTime();
const keyOf = (year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const dayLabel = (key) => { const p = partsIn(new Date(startOf(key) + 12 * HOUR)); return `${p.day} ${MONTH[p.month - 1]}`; };
const weekdayLabel = (key) => { const p = partsIn(new Date(startOf(key) + 12 * HOUR)); return `${WEEKDAY[p.weekday]} ${p.day} ${MONTH[p.month - 1]}`; };

/**
 * The stretches named, at most two: [{ key: 'asked', label, from, to }]. Empty when the
 * question names none, or only one of the fixed windows.
 */
export function askedWindows(text, now = new Date()) {
  const t = norm(text);
  const nowMs = new Date(now).getTime();
  const open = nowMs + 60000;
  const today = dayIn(now);
  const parts = partsIn(now);
  const weekday = parts?.weekday ?? 0;
  const monday = shiftDay(today, -((weekday + 6) % 7));
  const out = [];
  const push = (label, from, to) => { if (from < open && out.length < 2) out.push({ key: 'asked', label, from: from, to: Math.min(to, open) }); };
  const capped = (to) => (to > open ? ', so far' : '');

  /* a past date in the person's own month: this month when it has come, else the month before */
  const pastDate = (day, monthWord) => {
    if (monthWord) {
      const mo = monthOf(monthWord); if (mo < 0) return null;
      let key = keyOf(parts.year, mo + 1, day);
      if (key > today) key = keyOf(parts.year - 1, mo + 1, day);
      return key;
    }
    let key = keyOf(parts.year, parts.month, day);
    if (key > today) key = parts.month === 1 ? keyOf(parts.year - 1, 12, day) : keyOf(parts.year, parts.month - 1, day);
    return key;
  };
  const weekendOf = (satKey, name) => {
    const from = startOf(satKey);
    const to = startOf(shiftDay(satKey, 2)) + 6 * HOUR;
    const sun = shiftDay(satKey, 1);
    const ps = partsIn(new Date(from + 12 * HOUR)); const pu = partsIn(new Date(startOf(sun) + 12 * HOUR));
    const days = ps.month === pu.month ? `${ps.day} and ${pu.day} ${MONTH[ps.month - 1]}` : `${dayLabel(satKey)} and ${dayLabel(sun)}`;
    push(`${name} (${days}${capped(to)})`, from, to);
  };

  /* weekends: on Saturday, Sunday or Monday "this weekend" is the one just here; midweek it has not happened */
  const thisWeekend = /\b(this weekend|este fin de semana|este fim de semana|neste fim de semana|esse fim de semana)\b/.test(t);
  const lastWeekend = /\b(last weekend|el fin de semana pasado|fin de semana pasado|o fim de semana passado|fim de semana passado|no fim de semana passado)\b/.test(t);
  /* "the weekend before", "two weekends ago": the model re-dated Saturday's line for it (2026-09-20) */
  const weekendBefore = /\b(the weekend before|two weekends ago|el fin de semana anterior|hace dos fines de semana|el fin de semana antes|o fim de semana anterior|o fim de semana retrasado|ha dois fins de semana|dois fins de semana atras)\b/.test(t);
  if (thisWeekend || lastWeekend || weekendBefore) {
    const sat = weekday === 1 ? shiftDay(monday, -2) : shiftDay(monday, 5);
    const here = weekday === 0 || weekday === 6 || weekday === 1;
    const last = here ? shiftDay(sat, -7) : shiftDay(monday, -2);
    if (thisWeekend && here) weekendOf(sat, 'This weekend');
    if (lastWeekend && !weekendBefore) weekendOf(last, 'Last weekend');
    if (weekendBefore) weekendOf(shiftDay(last, -7), 'The weekend before last');
    return out;
  }

  /* between two dates: "between the 8th and the 14th", "del 8 al 14", "de 8 a 14 de setembro" */
  const range = t.match(new RegExp(`\\b(?:between|entre|del|from|de|do)\\s+(?:the\\s+|el\\s+|o\\s+|dia\\s+)?(\\d{1,2})${ORD}\\s*(?:and|to|al|a|e|y|-|hasta|ate|until|ao)\\s+(?:the\\s+|el\\s+|o\\s+|dia\\s+)?(\\d{1,2})${ORD}(?:\\s*(?:de\\s+|of\\s+)?${MONTH_RE})?\\b`));
  if (range && !EUROS.test(t.slice(range.index + range[0].length))) {
    const d1 = Number(range[1]); const d2 = Number(range[2]);
    if (d1 >= 1 && d2 <= 31 && d1 <= d2) {
      const endKey = pastDate(d2, range[3]);
      const startKey = endKey && keyOf(Number(endKey.slice(0, 4)), Number(endKey.slice(5, 7)), d1);
      if (startKey) push(`${d1} to ${dayLabel(endKey)}`, startOf(startKey), startOf(shiftDay(endKey, 1)));
      return out;
    }
  }

  /* since a date or a weekday: "since the 1st", "desde el 1", "desde o dia 1", "desde el lunes" */
  const sinceDate = t.match(new RegExp(`\\b(?:since|desde)\\s+(?:the\\s+|el\\s+|o\\s+|dia\\s+|o dia\\s+|el dia\\s+)?(\\d{1,2})${ORD}(?:\\s*(?:de\\s+|of\\s+)?${MONTH_RE})?\\b`));
  if (sinceDate && !EUROS.test(t.slice(sinceDate.index + sinceDate[0].length))) {
    const key = pastDate(Number(sinceDate[1]), sinceDate[2]);
    if (key) push(`Since ${dayLabel(key)}`, startOf(key), open);
    return out;
  }
  const sinceDay = t.match(new RegExp(`\\b(?:since|desde)\\s+(?:last\\s+|el\\s+|o\\s+|a\\s+|la\\s+)?${WEEKDAY_RE}\\b`));
  if (sinceDay) {
    const wd = weekdayOf(sinceDay[1]);
    if (wd >= 0) { const key = shiftDay(today, -((weekday - wd + 7) % 7 || 7)); push(`Since ${weekdayLabel(key)}`, startOf(key), open); }
    return out;
  }

  /* a weekday, the most recent one; "last" from the same weekday means a week ago; with a night, 18:00 to 06:00 */
  const day = t.match(new RegExp(`\\b(?:(last|ultimo|ultima|pasado|passado)\\s+)?(?:on\\s+|this\\s+|el\\s+|la\\s+|o\\s+|a\\s+|na\\s+|no\\s+|el pasado\\s+|o ultimo\\s+|a ultima\\s+)?${WEEKDAY_RE}(?:\\s+(pasado|passado|passada|pasada))?\\b`));
  if (day) {
    const wd = weekdayOf(day[2]);
    if (wd >= 0) {
      const last = Boolean(day[1] || day[3]);
      let back = (weekday - wd + 7) % 7;
      if (last && back === 0) back = 7;
      const key = shiftDay(today, -back);
      /* the parts of a day: a night runs 18:00 to 06:00 the next day, a morning 06:00 to 12:00, an afternoon 12:00 to 18:00 */
      const night = /\b(night|noche|noite|evening|tarde-noite)\b/.test(t);
      const morning = !night && /\b(morning|manana|manha|de manha|por la manana)\b/.test(t);
      const afternoon = !night && !morning && /\b(afternoon|tarde)\b/.test(t);
      const part = night ? ' night (18:00 to 06:00)' : morning ? ' morning (06:00 to 12:00)' : afternoon ? ' afternoon (12:00 to 18:00)' : '';
      const from = startOf(key) + (night ? 18 : morning ? 6 : afternoon ? 12 : 0) * HOUR;
      const to = night ? startOf(shiftDay(key, 1)) + 6 * HOUR : morning ? startOf(key) + 12 * HOUR : afternoon ? startOf(key) + 18 * HOUR : startOf(shiftDay(key, 1));
      push(`${weekdayLabel(key)}${part || capped(to)}`, from, to);
    }
    return out;
  }

  /* one date: "on the 15th", "el 15", "dia 15", "15 de setembro"; a bare number is an amount */
  for (const m of t.matchAll(new RegExp(`\\b(?:on the|the|el dia|el|no dia|o dia|dia|on)\\s+(\\d{1,2})${ORD}(?:\\s*(?:de\\s+|of\\s+)?${MONTH_RE})?\\b|\\b(\\d{1,2})${ORD}\\s+(?:de\\s+|of\\s+)?${MONTH_RE}\\b`, 'g'))) {
    const d = Number(m[1] || m[3]); const monthWord = m[2] || m[4];
    if (!(d >= 1 && d <= 31) || EUROS.test(t.slice(m.index + m[0].length))) continue;
    const key = pastDate(d, monthWord);
    if (key) push(dayLabel(key), startOf(key), startOf(shiftDay(key, 1)));
    break;
  }
  return out;
}

/**
 * The asked stretch as bars, one per day, for the week figure: { label, days } when the
 * question names two days or more (a range, a weekend, since a date), else null.
 */
export function askedDays(transactions = [], text, now = new Date()) {
  const [w] = askedWindows(text, now);
  if (!w || w.to - w.from < 36 * HOUR) return null; // a day or a night is a line, not bars
  const days = dayTotals(transactions, w.from, w.to);
  if (days.length < 2 || days.length > 31) return null;
  return { label: w.label, days };
}

/** The asked stretches as lines the model may quote: "Asked stretch, Saturday 19 September: spent ...". */
export function askedLines(transactions = [], text, now = new Date(), opts = {}) {
  return [...askedWindows(text, now).map((w) => stretchLine(`Asked stretch, ${w.label}`, transactions, w.from, w.to, opts)), ...askedAhead(text, now)];
}

/**
 * A stretch asked about that has not come: "this weekend" on a Wednesday. Without a line the
 * model re-dated the weekend before as this one (2026-09-23); with it, the answer says so.
 */
const THIS_WEEKEND = /\b(this weekend|este fin de semana|este fim de semana|neste fim de semana|esse fim de semana)\b/;
export function askedAhead(text, now = new Date()) {
  const t = norm(text);
  if (!THIS_WEEKEND.test(t)) return [];
  const parts = partsIn(now);
  const weekday = parts?.weekday ?? 0;
  if (weekday === 0 || weekday === 6 || weekday === 1) return [];
  const monday = shiftDay(dayIn(now), -((weekday + 6) % 7));
  return [`Asked stretch, This weekend: has not come yet; it starts Saturday ${dayLabel(shiftDay(monday, 5))}.`];
}
