/**
 * The calendar as a covariate: what else was true of the days a number describes.
 * =================================================================================
 * A habit that goes quiet while the person is away is not a habit gone; a week of eating
 * out that is an exam week is a different week. The ledger cannot know either. The
 * calendar can, and the read of it kept in money_facts (calendar.js) is the only source:
 * no request leaves this module.
 *
 * Two things are read from the events. Away windows: all-day events spanning two or more
 * days, or any event whose title says a trip. A silence clock stops inside one. The word
 * for the week: an event overlapping the last seven days whose title says exams or a trip,
 * so a delta can say which kind of week it was. Both are computed, neither is guessed.
 *
 * Pure.
 */
import { dayIn } from './zone.js';

const DAY = 86400000;
const ms = (iso) => new Date(iso).getTime();
const dayOf = (t) => dayIn(t);
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Titles that say the person is somewhere else. 'Holiday' alone is not here: Google's
    holiday calendars write "Spain: La Merce (Regional Holiday)" on days nobody travels. */
export const AWAY_WORDS = /\b(viaje|trip|travel|vacaciones|vacation|vuelo|flight|fin de semana fuera|weekend away|pueblo|casa de|erasmus|conference|congreso)\b/;
/** A public-holiday calendar's entries: a day off, never a window and never a week's word. */
export const HOLIDAY_CALENDAR = /\b(regional holiday|public holiday|bank holiday|national holiday|observance|dia festivo|festivo)\b/;
/** Titles that say the week is an exam week. */
export const EXAM_WORDS = /\b(examen|examenes|exam|exams|parcial|parciales|finals|final exam|final test|mock test|prueba|midterm|midterms|evaluacion)\b/;
/** Titles that say something is due: what Canvas and Blackboard calendars are made of. */
export const DEADLINE_WORDS = /\b(due|deadline|entrega|assignment|assigment|homework|quiz|practica|project|proyecto|submission|essay|ensayo|hand in|deliverable|presentation|report|pitch)\b/;
/** An all-day event this long or longer is a window, whatever it is called. */
export const AWAY_MIN_DAYS = 2;

/**
 * The windows the person was, or will be, away: [{ from, to, title }] as ISO days, `to`
 * exclusive, merged when they touch.
 */
export function awayWindows(events = []) {
  const raw = [];
  for (const e of events || []) {
    if (!e || !e.start) continue;
    const start = ms(e.start); const end = Math.max(ms(e.end || e.start), start);
    const span = (end - start) / DAY;
    if (HOLIDAY_CALENDAR.test(norm(e.title))) continue;
    const away = AWAY_WORDS.test(norm(e.title));
    if (e.all_day && span >= AWAY_MIN_DAYS) raw.push({ from: dayOf(start), to: dayOf(end), title: e.title });
    else if (away && span >= 1) raw.push({ from: dayOf(start), to: dayOf(end + (e.all_day ? 0 : DAY)), title: e.title });
    else if (away && !e.all_day) raw.push({ from: dayOf(start), to: dayOf(start + DAY), title: e.title });
  }
  raw.sort((a, b) => (a.from < b.from ? -1 : 1));
  const out = [];
  for (const w of raw) {
    const last = out[out.length - 1];
    if (last && w.from <= last.to) { if (w.to > last.to) last.to = w.to; }
    else out.push({ ...w });
  }
  return out;
}

/** How many whole days between two moments fall inside an away window. */
export function awayDaysBetween(windows = [], fromMs, toMs) {
  if (!(toMs > fromMs)) return 0;
  let days = 0;
  for (const w of windows || []) {
    const a = Math.max(fromMs, ms(`${w.from}T00:00:00Z`));
    const b = Math.min(toMs, ms(`${w.to}T00:00:00Z`));
    if (b > a) days += (b - a) / DAY;
  }
  return Math.round(days * 10) / 10;
}

/** The window covering a moment, or null. */
export function awayAt(windows = [], atMs) {
  return (windows || []).find((w) => atMs >= ms(`${w.from}T00:00:00Z`) && atMs < ms(`${w.to}T00:00:00Z`)) || null;
}

/**
 * The calendar's word for the last seven days: 'an exam week', 'a week away', 'a deadline
 * week' (two or more things due), or null. Read from any event overlapping the window
 * whose title says so.
 */
export function weekWord(events = [], now = new Date()) {
  const to = now.getTime(); const from = to - 7 * DAY;
  let exam = false; let away = false; let due = 0;
  for (const e of events || []) {
    if (!e || !e.start) continue;
    const s = ms(e.start); const en = Math.max(ms(e.end || e.start), s + (e.all_day ? DAY : 0));
    if (en < from || s > to) continue;
    const t = norm(e.title);
    if (HOLIDAY_CALENDAR.test(t)) continue;
    if (EXAM_WORDS.test(t)) exam = true;
    else if (DEADLINE_WORDS.test(t)) due += 1;
    if (AWAY_WORDS.test(t) || (e.all_day && (en - s) / DAY >= AWAY_MIN_DAYS)) away = true;
  }
  if (exam) return 'an exam week';
  if (away) return 'a week away';
  if (due >= 2) return 'a deadline week';
  return null;
}
