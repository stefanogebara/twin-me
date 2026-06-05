/**
 * Calendar meeting breakdown — same pattern as Whoop's getWeeklySummary
 * and Spotify's getRecentListening.
 *
 * Fetches /calendar/v3/calendars/primary/events for an N-day window
 * and aggregates into:
 *   - totals: meetings, hours, all-day events
 *   - by_day: per-day count + hours (so the LLM can spot the packed
 *             day vs the empty one)
 *   - top_organizers: who you meet with most in the window
 *   - busiest_day / quietest_day / first_meeting / last_meeting
 *
 * Defaults: days=7. The Calendar API's `timeMin` and `timeMax` are
 * inclusive/exclusive ISO strings — we pass them as N-days-ago to
 * now-plus-end-of-day so "this week" maps cleanly.
 */

const DEFAULT_DAYS = 7;
const MAX_DAYS = 90;

function buildEventsQuery(days) {
  const now = new Date();
  const startDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days),
  );
  const params = new URLSearchParams();
  params.set('timeMin', startDate.toISOString());
  params.set('timeMax', now.toISOString());
  params.set('singleEvents', 'true');
  params.set('orderBy', 'startTime');
  params.set('maxResults', '250');
  return {
    query: `?${params.toString()}`,
    start: startDate.toISOString(),
    end: now.toISOString(),
  };
}

function durationMinutes(event) {
  if (!event.start || !event.end) return 0;
  // All-day events use the `.date` form; timed events use `.dateTime`.
  const startMs = new Date(event.start.dateTime ?? event.start.date).getTime();
  const endMs = new Date(event.end.dateTime ?? event.end.date).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 0;
  return Math.max(0, (endMs - startMs) / (1000 * 60));
}

function dayKey(event) {
  if (!event.start) return 'unknown';
  return (event.start.dateTime ?? event.start.date ?? '').slice(0, 10);
}

function isAllDay(event) {
  return !!event.start?.date && !event.start?.dateTime;
}

/**
 * @param {object} client — { get(path) -> Promise<any> }
 * @param {{ days?: number }} [params]
 */
export async function getMeetingBreakdown(client, params = {}) {
  const days = Math.min(params.days ?? DEFAULT_DAYS, MAX_DAYS);
  const { query, start, end } = buildEventsQuery(days);

  const result = await client
    .get(`/calendars/primary/events${query}`)
    .catch(() => ({ items: [] }));
  const items = Array.isArray(result?.items) ? result.items : [];

  // Exclude declined/cancelled/transparent (available) events — they
  // don't represent real meeting time.
  const real = items.filter((e) => {
    if (e.status === 'cancelled') return false;
    if (e.transparency === 'transparent') return false;
    // Self-as-attendee declined.
    const self = (e.attendees ?? []).find((a) => a.self);
    if (self?.responseStatus === 'declined') return false;
    return true;
  });

  const byDay = new Map();
  const organizerCounts = new Map();
  let totalMinutes = 0;
  let allDayCount = 0;
  let firstMeeting = null;
  let lastMeeting = null;

  for (const e of real) {
    const dk = dayKey(e);
    const mins = isAllDay(e) ? 0 : durationMinutes(e);
    if (isAllDay(e)) allDayCount += 1;
    totalMinutes += mins;

    const entry = byDay.get(dk) || { day: dk, count: 0, minutes: 0 };
    entry.count += 1;
    entry.minutes += mins;
    byDay.set(dk, entry);

    const organizer = e.organizer?.email ?? e.organizer?.displayName ?? 'unknown';
    organizerCounts.set(organizer, (organizerCounts.get(organizer) ?? 0) + 1);

    if (!isAllDay(e)) {
      const startMs = new Date(e.start.dateTime).getTime();
      if (!firstMeeting || startMs < firstMeeting.startMs) {
        firstMeeting = { startMs, summary: e.summary ?? '(no title)', start: e.start.dateTime };
      }
      if (!lastMeeting || startMs > lastMeeting.startMs) {
        lastMeeting = { startMs, summary: e.summary ?? '(no title)', start: e.start.dateTime };
      }
    }
  }

  const days_array = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));

  // Identify busiest/quietest days by meeting count, then by hours
  // as a tiebreaker.
  let busiest = null;
  let quietest = null;
  for (const d of days_array) {
    if (!busiest || d.count > busiest.count || (d.count === busiest.count && d.minutes > busiest.minutes)) {
      busiest = d;
    }
    if (!quietest || d.count < quietest.count) {
      quietest = d;
    }
  }

  const topOrganizers = [...organizerCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([email, count]) => ({ email, count }));

  return {
    period: { start, end, days },
    totals: {
      meetings: real.length - allDayCount,
      all_day_events: allDayCount,
      hours: +(totalMinutes / 60).toFixed(1),
    },
    by_day: days_array.map((d) => ({
      day: d.day,
      count: d.count,
      hours: +(d.minutes / 60).toFixed(1),
    })),
    top_organizers: topOrganizers,
    busiest_day: busiest ? { day: busiest.day, count: busiest.count, hours: +(busiest.minutes / 60).toFixed(1) } : null,
    quietest_day: quietest ? { day: quietest.day, count: quietest.count, hours: +(quietest.minutes / 60).toFixed(1) } : null,
    first_meeting: firstMeeting ? { summary: firstMeeting.summary, start: firstMeeting.start } : null,
    last_meeting: lastMeeting ? { summary: lastMeeting.summary, start: lastMeeting.start } : null,
  };
}
