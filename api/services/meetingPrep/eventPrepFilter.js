/**
 * Event Prep Filter
 * ==================
 * Pure decision logic for which calendar events deserve a meeting briefing.
 * No I/O — exported separately from meetingPrepService so the skip rules
 * are unit-testable without the LLM/calendar plumbing.
 *
 * replan-2026-06-10 Track B: meeting prep was generating briefings for
 * attendee-less personal events (tennis got "talking points", a gym session
 * got corporate-analyst advice) and for calendar blocks the agent itself
 * created ("Deep Work: ..." — a circular content loop). The rules here:
 *   - NEVER prep an agent-created event (tagged via extendedProperties).
 *   - Solo events (no non-self attendees) only get prep when the title or
 *     description signals external stakes (pitch, interview, contract...).
 */

// Generic calendar-block titles that aren't real appointments — focus time,
// lunch holds, "busy" exports from other calendars, etc. Briefing these is
// noise. Matched case-insensitively against the whole title.
export const GENERIC_BLOCK_PATTERNS = [
  /^busy$/i,
  /^blocked?$/i,
  /^focus(\s*time)?$/i,
  /^lunch$/i,
  /^break$/i,
  /^hold$/i,
  /^ooo$/i,
  /^out of office$/i,
  /^dnd$/i,
  /^do not disturb$/i,
  /^free$/i,
  /^tentative$/i,
  /^private$/i,
];

export function isGenericBlock(summary) {
  if (!summary) return true; // untitled events aren't worth briefing
  const trimmed = summary.trim();
  return GENERIC_BLOCK_PATTERNS.some((p) => p.test(trimmed));
}

// Title/description signals that a solo event still has external stakes
// worth walking in prepared for. EN + PT because the user's calendar mixes
// both. Stems (/\bnegocia/) cover inflections without unicode \b issues.
export const EXTERNAL_STAKES_PATTERNS = [
  /\bpitch\b/i,
  /\binterview/i,
  /\bentrevista/i,
  /\bcontract/i,
  /\bcontrato/i,
  /\bnegotiat/i,
  /\bnegocia/i,
  /\binvestor/i,
  /\binvestidor/i,
  /\bdue diligence\b/i,
  /\bterm sheet\b/i,
  /\bproposal\b/i,
  /\bproposta\b/i,
  /\bfundrais/i,
  /\bboard meeting\b/i,
  /\bdemo day\b/i,
];

export function hasExternalStakes(event) {
  const text = `${event?.summary || ''} ${event?.description || ''}`;
  return EXTERNAL_STAKES_PATTERNS.some((p) => p.test(text));
}

/**
 * Agent-created events carry extendedProperties.private.twinme_origin set
 * by createEvent in googleWorkspaceActions.js (the single write path for
 * all twin/department calendar creation). Events created before the tag
 * existed are indistinguishable from user-created ones — acceptable: the
 * tag closes the loop going forward.
 */
export function isAgentCreatedEvent(event) {
  return event?.extendedProperties?.private?.twinme_origin === 'agent';
}

function nonSelfAttendees(event, userEmail) {
  return (event?.attendees || []).filter(
    (a) => !a.self && !a.resource && (!userEmail || a.email !== userEmail),
  );
}

/**
 * The one gate for "does this event get a briefing?".
 * Returns { prep: boolean, reason: string } so cron logs can say WHY an
 * event was skipped instead of silently dropping it.
 */
export function shouldPrepEvent(event, userEmail = '') {
  // Timed events only — all-day events (start.date instead of dateTime)
  // are usually birthdays, OOO, multi-day trips — not appointments to prep.
  if (!event?.start?.dateTime) return { prep: false, reason: 'all_day_or_untimed' };

  if (isGenericBlock(event.summary)) return { prep: false, reason: 'generic_block' };

  // NEVER brief the agent's own calendar blocks (replan-2026-06-10:
  // scheduling dept created "Deep Work: ..." then prep briefed it).
  if (isAgentCreatedEvent(event)) return { prep: false, reason: 'agent_created' };

  // Skip events the user explicitly declined.
  const selfAttendee = (event.attendees || []).find(
    (a) => a.self || (userEmail && a.email === userEmail),
  );
  if (selfAttendee?.responseStatus === 'declined') return { prep: false, reason: 'declined' };

  if (nonSelfAttendees(event, userEmail).length > 0) {
    return { prep: true, reason: 'has_other_attendees' };
  }

  // Solo event: prep only when the title/description signals external
  // stakes. Tennis, therapy, gym — no briefing.
  if (hasExternalStakes(event)) return { prep: true, reason: 'solo_external_stakes' };
  return { prep: false, reason: 'personal_solo_event' };
}
