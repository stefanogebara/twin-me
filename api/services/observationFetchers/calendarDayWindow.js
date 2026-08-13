/**
 * Calendar day-window helpers — pure, no network, no DB.
 *
 * Why this exists (fidelity-eval 2026-08-12, BATTERY v3 / SPREAD ARM):
 * the calendar fetcher asked Google for `timeMin: now .. end of the SERVER's
 * day`. Two things followed, both of which corrupted the memory stream:
 *
 *   - A run late in the day saw only the events still to come, so a day with
 *     three meetings was recorded as "completely open day for time
 *     management". Days that were busy read as empty.
 *   - "The day" was the UTC day. For a UTC-3 user the boundary sits at 21:00
 *     local, so evening events were filed under tomorrow and every rendered
 *     time was three hours late.
 *
 * Everything here keys off the calendar's own IANA timezone (calendarList
 * returns it), falling back to UTC when it is missing or unrecognised.
 */

const FALLBACK_TZ = 'UTC';

/** Cheap validity probe — Intl throws RangeError on an unknown zone. */
function safeZone(timeZone) {
  if (!timeZone) return FALLBACK_TZ;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return FALLBACK_TZ;
  }
}

function parts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const out = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  return out;
}

/**
 * Wall-clock offset of `timeZone` at `date`, in ms (positive east of UTC).
 */
function offsetMs(date, timeZone) {
  const p = parts(date, timeZone);
  const asIfUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asIfUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Calendar date (YYYY-MM-DD) that `date` falls on in `timeZone`.
 * @param {Date} date
 * @param {string} [timeZone] IANA zone; UTC when absent/invalid
 * @returns {string}
 */
export function dayKeyInTimeZone(date, timeZone) {
  const p = parts(date, safeZone(timeZone));
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * The UTC instants bounding the LOCAL day that contains `date`.
 *
 * This is the fix for the false-empty-day defect: timeMin is local midnight,
 * which is always at or before the run, so the summary describes the whole
 * day rather than whatever is left of it.
 *
 * @param {Date} date
 * @param {string} [timeZone]
 * @returns {{ timeMin: Date, timeMax: Date, dayKey: string, timeZone: string }}
 */
export function localDayWindow(date, timeZone) {
  const zone = safeZone(timeZone);
  const dayKey = dayKeyInTimeZone(date, zone);
  const [y, m, d] = dayKey.split('-').map(Number);
  const midnightAsIfUtc = Date.UTC(y, m - 1, d, 0, 0, 0, 0);

  // Two passes: the first offset is sampled at `date`, which can sit on the
  // far side of a DST transition from local midnight. Re-sampling at the
  // candidate instant settles it.
  let start = new Date(midnightAsIfUtc - offsetMs(date, zone));
  start = new Date(midnightAsIfUtc - offsetMs(start, zone));

  const nextAsIfUtc = Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0);
  let next = new Date(nextAsIfUtc - offsetMs(start, zone));
  next = new Date(nextAsIfUtc - offsetMs(next, zone));

  return { timeMin: start, timeMax: new Date(next.getTime() - 1), dayKey, timeZone: zone };
}

/**
 * "2:30 PM" in the calendar's timezone. The bare toLocaleTimeString() this
 * replaces used the server clock, so every stored time was UTC.
 * @param {string|Date} iso
 * @param {string} [timeZone]
 * @returns {string}
 */
export function formatEventTime(iso, timeZone) {
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: safeZone(timeZone),
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * "Tue 2026-08-04" — the human half helps the LLM reason about weekday
 * rhythm, the ISO half makes distinct days countable and greppable.
 * @param {string} dayKey YYYY-MM-DD
 * @returns {string}
 */
export function formatDayLabel(dayKey) {
  const [y, m, d] = String(dayKey).split('-').map(Number);
  if (!y || !m || !d) return String(dayKey);
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
  }).format(new Date(Date.UTC(y, m - 1, d)));
  return `${weekday} ${dayKey}`;
}

/**
 * Hour-of-day (0-23) at `date` in `timeZone`. The afternoon/evening checks in
 * the fetcher used Date#getHours(), which is the SERVER's hour — on Vercel
 * that made "is it past noon for this user?" a question about UTC.
 * @param {Date} date
 * @param {string} [timeZone]
 * @returns {number}
 */
export function hourInTimeZone(date, timeZone) {
  return Number(parts(date, safeZone(timeZone)).hour);
}
