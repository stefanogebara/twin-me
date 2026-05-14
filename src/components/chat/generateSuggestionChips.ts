/**
 * generateSuggestionChips
 * ========================
 * Pure function that ranks suggestion chips for the chat empty state based
 * on today's strongest signals. The audit-2026-05-13 L1 finding flagged
 * that the existing chips were static and generic ("How's my sleep been?",
 * "What does my music say?", "What patterns do you see?") — the data to
 * personalize them was already present in the page.
 *
 * Ranking (highest priority first):
 *   1. Pending high-urgency proactive insights — surface the insight's
 *      category as a "Why did X happen?" question.
 *   2. Meeting-heavy day (>=5 calendar events) — offer a calendar review.
 *   3. Unread important emails (>=3 in recent fetch) — offer an email triage.
 *   4. Fallback to the time-of-day chips already used (morning / afternoon /
 *      evening / night) so chip count stays consistent.
 *
 * Returns up to `max` chips deduplicated by text. Pure function — no
 * network calls, no React hooks, no side effects. Safe to unit test
 * and safe to recompute on every render.
 */

export interface ProactiveInsightLike {
  insight?: string;
  category?: string;
  urgency?: 'high' | 'medium' | 'low' | string;
}

export interface CalendarEventLike {
  start?: string | { dateTime?: string; date?: string };
  // anything else — we only count events
}

export interface RecentEmailLike {
  from?: string;
  subject?: string;
  // anything else — we only count
}

export interface SuggestionInputs {
  hour: number; // 0-23 local
  pendingInsights?: ProactiveInsightLike[];
  calendarEvents?: CalendarEventLike[];
  recentEmails?: RecentEmailLike[];
  /** Treat the day as meeting-heavy at or above this event count. */
  meetingHeavyThreshold?: number;
  /** Maximum chips to return (defaults to 3 since only 3 render). */
  max?: number;
}

// NO EMOJIS per CLAUDE.md — chip copy is plain text only.
const TIME_BASED_CHIPS: Record<'morning' | 'afternoon' | 'evening' | 'night', string[]> = {
  morning: [
    'Check my emails',
    "What's on my calendar?",
    'Morning briefing',
    'What patterns do you see?',
  ],
  afternoon: [
    'What does my music say about me?',
    "How's my recovery?",
    'Check my emails',
    'Draft an email for me',
  ],
  evening: [
    "How's my sleep been?",
    'What does my music say about me?',
    'What patterns do you see?',
    "What's tomorrow look like?",
  ],
  night: [
    "How's my sleep been?",
    'What patterns do you see?',
    'What does my music say about me?',
    'Tell me something surprising about myself',
  ],
};

function getTimeSlot(hour: number): keyof typeof TIME_BASED_CHIPS {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 24) return 'evening';
  return 'night';
}

/**
 * Map an insight category to a natural-language question the twin will
 * answer well. Defaults to a generic "Tell me about today's <category>"
 * so unknown categories still produce sensible copy.
 */
function chipForInsight(insight: ProactiveInsightLike): string | null {
  const cat = (insight.category || '').toLowerCase();
  if (!cat) return null;
  switch (cat) {
    case 'recovery':
    case 'health':
    case 'sleep':
      return 'Why am I feeling low energy?';
    case 'focus':
    case 'productivity':
    case 'work':
      return 'How am I spending my focus lately?';
    case 'mood':
    case 'emotion':
    case 'emotional':
      return 'What does my mood pattern say?';
    case 'social':
    case 'relationships':
      return 'How have my interactions felt this week?';
    case 'finance':
    case 'money':
    case 'spending':
      return 'Walk me through my spending lately';
    case 'music':
    case 'culture':
    case 'media':
      return 'What does my music taste say about me right now?';
    case 'goals':
    case 'goal':
      return "How am I tracking against my goals?";
    case 'nudge':
      // The insight text itself reads like a CTA — turn into a "Why X?" probe
      return 'Help me act on what you noticed today';
    default:
      // Last-resort: ask the twin to explain what it noticed in this domain.
      return `Tell me about the ${cat} pattern you noticed`;
  }
}

export function generateSuggestionChips(inputs: SuggestionInputs): string[] {
  const {
    hour,
    pendingInsights = [],
    calendarEvents = [],
    recentEmails = [],
    meetingHeavyThreshold = 5,
    max = 3,
  } = inputs;

  const priority: string[] = [];

  // 1. High-urgency proactive insights win the top slot. Walk in order
  //    so the first high-urgency insight gets the first chip.
  const highUrgency = pendingInsights.filter((i) => i?.urgency === 'high');
  for (const i of highUrgency) {
    const chip = chipForInsight(i);
    if (chip) priority.push(chip);
    if (priority.length >= max) break;
  }

  // 2. Meeting-heavy day -> offer a calendar review.
  if (priority.length < max && calendarEvents.length >= meetingHeavyThreshold) {
    priority.push('How am I spending today?');
  }

  // 3. Unread important emails -> offer triage. Threshold matches the
  //    "important emails" probe in the audit (>=3 was the success bar).
  if (priority.length < max && recentEmails.length >= 3) {
    priority.push('Any important emails I should reply to?');
  }

  // 4. Medium-urgency insights as tie-breakers (one slot max).
  if (priority.length < max) {
    const mediumUrgency = pendingInsights.find((i) => i?.urgency === 'medium');
    if (mediumUrgency) {
      const chip = chipForInsight(mediumUrgency);
      if (chip) priority.push(chip);
    }
  }

  // 5. Time-based fallbacks fill any remaining slots so we always show
  //    the same number of chips regardless of signal density.
  const fallback = TIME_BASED_CHIPS[getTimeSlot(hour)];
  for (const chip of fallback) {
    if (priority.length >= max) break;
    priority.push(chip);
  }

  // Dedupe while preserving order, then trim to max.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of priority) {
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}
