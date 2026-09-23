/**
 * Calendar query intent detector — same shape as Whoop/Spotify.
 * Returns { kind } where kind is 'breakdown' | 'snapshot' | null.
 *
 * 'breakdown' = the user wants weekly recap / meeting density /
 *               busiest day / hours total → fetch live + aggregate.
 * 'snapshot'  = generic calendar-adjacent mention → snapshot path
 *               that's already in the prompt every chat turn handles it.
 */

const CALENDAR_NOUN_PATTERNS = [
  /\bcalendar\b/i,
  /\bmeeting(s)?\b/i,
  /\bappointment(s)?\b/i,
  /\bschedule\b/i,
  /\bbusy\b/i,
  /\bfocus time\b/i,
  /\bagenda\b/i,
  /\bcall(s)?\b/i,
];

const BREAKDOWN_PATTERNS = [
  /\b(how|how many|how much) (busy|meetings|meeting hours|hours|calls)\b/i,
  /\b(this|last|past) (week|month)\b/i,
  /\bweekly\b/i,
  /\b(my )?(schedule|calendar) (this|last|past|next|breakdown|summary|recap|review|overview)\b/i,
  /\bbreakdown of (my )?(meetings|schedule|calendar|week)\b/i,
  /\b(meeting|calendar) (density|hours|load|count|breakdown)\b/i,
  /\b(busiest|quietest|packed|free|focus) (day|time)\b/i,
  /\bwhat'?s (on|in) my (calendar|schedule|agenda)\b/i,
  /\bhow many meetings\b/i,
  /\b(meetings?|hours) (per day|today|yesterday)\b/i,
];

function any(patterns, text) {
  return patterns.some((re) => re.test(text));
}

/**
 * @param {string} message
 * @returns {{kind: 'breakdown'|'snapshot'|null}}
 */
export function detectCalendarIntent(message) {
  const text = String(message ?? '').trim();
  if (text.length === 0) return { kind: null };

  // breakdown — requires noun + at least one breakdown phrasing
  if (any(BREAKDOWN_PATTERNS, text) && any(CALENDAR_NOUN_PATTERNS, text)) {
    return { kind: 'breakdown' };
  }
  // Standalone breakdown phrasings that imply calendar (e.g.
  // "schedule this week" matches both lists)
  if (any(BREAKDOWN_PATTERNS, text)) {
    return { kind: 'breakdown' };
  }
  if (any(CALENDAR_NOUN_PATTERNS, text)) {
    return { kind: 'snapshot' };
  }
  return { kind: null };
}
