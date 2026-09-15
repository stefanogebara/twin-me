/**
 * Who is due for a call. Pure: no I/O, no LLM.
 *
 * The hourly cron passes each callable presence, the calls placed for it since
 * the earliest local "today", and the moment. The decision is made in the
 * presence's own timezone: her hour, one of her days, no call yet today; or a
 * second attempt the hour after a no-answer or busy. Two attempts a day at
 * most. An inbound call she made herself does not count as the day's call.
 */

export const MAX_ATTEMPTS_PER_DAY = 2;
const RETRYABLE = new Set(['no_answer', 'busy']);

/** The local hour, weekday (0 = Sunday) and day key (YYYY-MM-DD) of `now` in `timeZone`. */
export function localClock(now, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'short',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  // Some engines print midnight as "24".
  const hour = Number(get('hour')) % 24;
  return { hour, weekday: weekdays[get('weekday')], dayKey: `${get('year')}-${get('month')}-${get('day')}` };
}

/**
 * @param {{ call_hour: number, call_days: number[], call_timezone: string }} presence
 * @param {Array<{ status: string, attempt: number, scheduled_for: string, direction?: string }>} calls
 *   the presence's calls since the start of its local day (others are ignored by day key)
 * @param {Date} now
 * @returns {{ due: boolean, attempt?: number, reason?: string }}
 */
export function isDue(presence, calls, now) {
  const tz = presence.call_timezone || 'America/Sao_Paulo';
  const clock = localClock(now, tz);
  const days = Array.isArray(presence.call_days) ? presence.call_days : [];
  if (!days.includes(clock.weekday)) return { due: false, reason: 'not_her_day' };

  const today = calls.filter((c) => (c.direction || 'outbound') === 'outbound'
    && localClock(new Date(c.scheduled_for), tz).dayKey === clock.dayKey);
  if (today.some((c) => c.status === 'dialing' || c.status === 'answered' || c.status === 'completed')) {
    return { due: false, reason: 'called_today' };
  }
  if (today.some((c) => c.status === 'failed')) return { due: false, reason: 'failed_today' };
  if (today.length >= MAX_ATTEMPTS_PER_DAY) return { due: false, reason: 'attempts_exhausted' };

  const attempts = today.filter((c) => RETRYABLE.has(c.status)).length;
  if (attempts === 0) {
    return clock.hour === presence.call_hour ? { due: true, attempt: 1 } : { due: false, reason: 'not_her_hour' };
  }
  // A retry goes out the hour after the last attempt, not at her hour again.
  const lastHour = Math.max(...today.map((c) => localClock(new Date(c.scheduled_for), tz).hour));
  return clock.hour === lastHour + 1 ? { due: true, attempt: attempts + 1 } : { due: false, reason: 'retry_later' };
}
