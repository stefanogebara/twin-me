/**
 * Presence readiness — pure scoring + plain-language mirror.
 * No I/O: presence.js fetches the counts and calls deriveReadiness(); tests call it directly.
 *
 * Thresholds are deliberately low (a widow with one child must not be blocked):
 * the mirror does the persuading, the gate only prevents a blind first call.
 */

export const READY_MIN_PEOPLE = 2;
export const READY_MIN_ANCHORS = 2;

/**
 * @param {object} input
 * @param {string} input.caredForName
 * @param {string} input.tone
 * @param {{people:number, anchors:number, boundaries:number, biography:number, notes_queued:number, conversations:number}} input.counts
 * @param {boolean} input.hasIntro  any biography fact exists (voice note or learned)
 */
export function deriveReadiness({ caredForName, tone, counts, hasIntro }) {
  const her = caredForName?.trim() || 'her';
  const toneSet = Boolean(tone?.trim());
  const knows = [];
  const missing = [];

  if (counts.people > 0) knows.push(`${counts.people} ${counts.people === 1 ? 'person' : 'people'} in ${her}'s life, and what she calls them`);
  else missing.push('Nobody in her family map yet — the Presence cannot safely mention anyone');
  if (counts.people === 1) missing.push('Only one person mapped — add at least one more so she is never confused');

  if (counts.anchors >= READY_MIN_ANCHORS) knows.push(`${counts.anchors} stories from her world to open conversations with`);
  else missing.push(counts.anchors === 0 ? 'No stories from her world — the first call will be small talk' : 'Only one story anchor — add one more');

  if (toneSet) knows.push(`How you are together: ${tone}`);
  else missing.push('Your tone with her is not set');

  if (counts.boundaries > 0) knows.push(`${counts.boundaries} family-set ${counts.boundaries === 1 ? 'boundary' : 'boundaries'} beyond the defaults`);
  else missing.push('No boundaries beyond the defaults (visits, money, medicine are always protected)');

  if (hasIntro) knows.push(`Background about her life in your own words${counts.biography > 1 ? ` (${counts.biography} facts)` : ''}`);
  else missing.push('Nothing about her daily life yet — the two-minute voice note fills most of this');

  if (counts.conversations > 0) knows.push(`${counts.conversations} past ${counts.conversations === 1 ? 'conversation' : 'conversations'} she can build on`);

  const score = Math.min(100, Math.round(
    Math.min(counts.people, 3) / 3 * 30 +
    Math.min(counts.anchors, 3) / 3 * 25 +
    (toneSet ? 10 : 0) +
    Math.min(counts.boundaries, 2) / 2 * 10 +
    (hasIntro ? 20 : 0) +
    Math.min(counts.conversations, 1) * 5,
  ));

  const ready = counts.people >= READY_MIN_PEOPLE && counts.anchors >= READY_MIN_ANCHORS && toneSet;
  return { ready, score, knows, missing };
}
