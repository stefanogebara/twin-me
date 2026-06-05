/**
 * Calendar learning hooks. Two writes:
 *   1. Weekly meeting reflection — dedup by week_start (Monday UTC),
 *      so repeat "how's my week" turns share one memory.
 *   2. Overload anomaly insight — fires when a single day in the
 *      window has >=6 meetings OR >=8 hours of meetings. That's a
 *      "today was brutal" signal worth surfacing as a nudge.
 */

import {
  insertDedupedInsight,
  persistDedupedReflection,
  currentWeekStartUTC,
} from '../platformAnalytics/sharedHooks.js';

const SOURCE = 'calendar_weekly';
const OVERLOAD_MEETINGS = 6;
const OVERLOAD_HOURS = 8;

/**
 * @param {string} userId
 * @param {object} breakdown  Output of analytics/getMeetingBreakdown.js
 * @param {string} summary  Output of formatMeetingBreakdown.
 */
export async function persistCalendarLearning(userId, breakdown, summary) {
  if (!userId || !breakdown || !summary) return;
  const weekStart = currentWeekStartUTC();

  // 1. Weekly reflection — partitioned by the week the chat turn
  //    landed in. Period asked might be 7/14/30 days, but we anchor
  //    the memory to "this week" so retrieval lines up with how the
  //    twin thinks about time.
  await persistDedupedReflection({
    userId,
    content: `My Calendar week ${weekStart}: ${summary}`,
    metadata: {
      source: SOURCE,
      calendar_week_start: weekStart,
      calendar_meetings: breakdown.totals?.meetings,
      calendar_hours: breakdown.totals?.hours,
      calendar_busiest_day: breakdown.busiest_day?.day,
    },
    dedupMetadataKey: 'calendar_week_start',
    dedupMetadataValue: weekStart,
  });

  // 2. Overload anomaly — fire on the SINGLE busiest day in the
  //    window if it crosses either threshold. Dedup by day so we
  //    don't repeatedly nudge about the same brutal Wednesday.
  const busiest = breakdown.busiest_day;
  if (busiest && (busiest.count >= OVERLOAD_MEETINGS || (busiest.hours ?? 0) >= OVERLOAD_HOURS)) {
    await insertDedupedInsight({
      userId,
      insight: `Your ${busiest.day} was packed — ${busiest.count} meetings, ${busiest.hours}h on calls. That's well over your usual day. Worth a check on whether the load was necessary.`,
      dedupKey: `calendar_overload:${busiest.day}`,
      urgency: 'medium',
      category: 'schedule',
    });
  }
}
