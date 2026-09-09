/**
 * The rhythm of the conversation.
 * ===============================
 * A ledger that answers the instant a question is asked does not read as attentive, it reads
 * as a form. So before the ledger says anything in the onboarding, a beat: the thinking line
 * shimmers for as long as a person would take to look up and speak, then the line arrives.
 * The person's own words never wait. Every duration lives here, in one table, so the rhythm
 * of the whole transcript can be tuned in one place and collapses to nothing when the phone
 * asks for less motion.
 */

/** Milliseconds. */
export const PACE = Object.freeze({
  /** Before the very first line, when the page has just opened. */
  first: 700,
  /** The floor for any twin line. */
  beat: 600,
  /** Added per character of what is about to be said: longer lines take longer to arrive. */
  perChar: 4,
  /** No beat runs longer than this, however long the line. */
  max: 1200,
  /** Between the person's answer and the sentence said back about it. */
  saidBack: 450,
  /** Between the said-back and the next question. */
  next: 650,
});

/** How long the ledger takes before it says `text`. Zero when motion is reduced. */
export function beatFor(text: string, reduced: boolean): number {
  if (reduced) return 0;
  return Math.min(PACE.max, PACE.beat + text.length * PACE.perChar);
}

/** A pause of `ms`, or none when motion is reduced. */
export function pause(ms: number, reduced: boolean): Promise<void> {
  if (reduced || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** What the thinking line says while a question is on its way, by the question's kind. */
export function beatText(kind?: string): string {
  switch (kind) {
    case 'home_area': return 'Looking at where you shop.';
    case 'study_place': return 'Looking at your weekdays.';
    case 'work_place': return 'Looking at your weekdays.';
    case 'income': return 'Looking at what comes in.';
    case 'shared_cost': return 'Looking at what you split.';
    case 'goal': return 'Thinking about the month ahead.';
    default: return 'Reading.';
  }
}

/** The one or two words above a question that name its chapter. */
export function chapterFor(kind?: string): string {
  switch (kind) {
    case 'home_area': return 'Home';
    case 'study_place': return 'Studies';
    case 'work_place': return 'Work';
    case 'income': return 'Money in';
    case 'shared_cost': return 'Shared';
    case 'goal': return 'A goal';
    case 'person': return 'Someone';
    case 'merchant_kind': return 'A shop';
    default: return 'You';
  }
}
