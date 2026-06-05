/**
 * One-line formatters for Calendar analytics. Same directive
 * framing as Whoop / Spotify.
 */

function fmtNum(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '?';
  return Number(n).toFixed(digits);
}

/**
 * @param {object} breakdown  Output of analytics/getMeetingBreakdown.js
 * @returns {string|null}
 */
export function formatMeetingBreakdown(breakdown) {
  if (!breakdown || !breakdown.totals) return null;
  const { period, totals, by_day, top_organizers, busiest_day, quietest_day, first_meeting, last_meeting } = breakdown;
  const days = period?.days ?? '?';
  if (totals.meetings === 0 && totals.all_day_events === 0) {
    return `Calendar over the last ${days} days: 0 meetings, 0 all-day events.`;
  }

  const dayLines = (by_day ?? [])
    .map((d) => `${d.day} ${d.count}m/${fmtNum(d.hours)}h`)
    .join(', ');
  const orgLine = (top_organizers ?? [])
    .map((o) => `${o.email} ×${o.count}`)
    .join(', ');

  const parts = [
    `Calendar over the last ${days} days: ${totals.meetings} meetings totalling ${fmtNum(totals.hours)}h, plus ${totals.all_day_events} all-day events.`,
    busiest_day &&
      `Busiest day: ${busiest_day.day} (${busiest_day.count} meetings, ${fmtNum(busiest_day.hours)}h).`,
    quietest_day &&
      `Quietest day: ${quietest_day.day} (${quietest_day.count} meetings).`,
    dayLines && `By day: ${dayLines}.`,
    orgLine && `Top organizers: ${orgLine}.`,
    first_meeting && `First meeting: "${first_meeting.summary}" at ${first_meeting.start?.slice(0, 16)?.replace('T', ' ')}.`,
    last_meeting && `Last meeting: "${last_meeting.summary}" at ${last_meeting.start?.slice(0, 16)?.replace('T', ' ')}.`,
  ].filter(Boolean);

  return parts.join(' ');
}
