/**
 * Presence autonomy calibration
 * =============================
 * Two decisions the presence makes without asking anyone, and that families do
 * not agree on:
 *
 *   escalation — how much of a call reaches the family afterwards. A family that
 *     wants to hear everything and a family that wants to hear only what needs
 *     them today are both right; a digest tuned for the wrong one is either a
 *     worry they cannot act on, or a silence that hides the call that mattered.
 *   initiative — whether the presence asks her about a worry she raised last
 *     time, or waits for her to bring it up. Checking in is care to one family
 *     and medicalising to another.
 *
 * Both live on the presence row (20260921_presence_autonomy.sql). Pure: the
 * brief renderer and the summarizer read their words here, so the family's
 * choice and the model's instruction can never drift apart.
 *
 * Read from Instinct, whose always-injected profile carries an "autonomy
 * calibration" section of exactly this kind (2026-09-21).
 */

export const ESCALATION = ['everything', 'when_it_matters', 'only_urgent'];
export const INITIATIVE = ['ask', 'wait'];

/** What the presence did before the dials existed; also the migration's defaults. */
export const ESCALATION_DEFAULT = 'when_it_matters';
export const INITIATIVE_DEFAULT = 'wait';

/**
 * The two dials for one presence. A missing or unrecognised value is the
 * default: a call is never worth failing over a setting, and a value that
 * reached the row unchecked must never reach a prompt.
 */
export function autonomyOf(presence) {
  const escalation = presence?.autonomy_escalation;
  const initiative = presence?.autonomy_initiative;
  return {
    escalation: ESCALATION.includes(escalation) ? escalation : ESCALATION_DEFAULT,
    initiative: INITIATIVE.includes(initiative) ? initiative : INITIATIVE_DEFAULT,
  };
}

/**
 * What counts as something the family hears about, for the summarizer's
 * needs_family field. Her own words about being unwell clear every bar — the
 * dial moves what else joins them, never whether she is heard.
 */
export function escalationInstruction(escalation) {
  const { escalation: value } = autonomyOf({ autonomy_escalation: escalation });
  if (value === 'everything') {
    return `This family wants to hear everything. needs_family carries, in plain family-facing language:
- any request, question or practical need she raised;
- any health mention, pain, worry or confusion;
- emotional withdrawal: if she went quiet, gave one-word answers, or ended the conversation shortly after a specific topic, say so and name the topic. Report it even when nothing was explicitly asked of them;
- anything else worth knowing about how she was today, including a good day.`;
  }
  if (value === 'only_urgent') {
    return `This family asked to hear only what needs a person today. needs_family carries ONLY:
- pain, a fall, confusion, feeling unwell, or her asking for help;
- a request or practical need that someone has to act on.
Everything else — how the conversation went, a quiet moment, a passing worry she let go of — stays out. An empty list is the right answer for an ordinary call, and the family still reads the summary.`;
  }
  return `needs_family carries what a person would want to act on:
- any request, question or practical need she raised;
- any health mention, pain, worry or confusion;
- emotional withdrawal: if she went quiet, gave one-word answers, or ended the conversation shortly after a specific topic, say so and name the topic. A family wants to know this more than anything else in the call. Report it even when nothing was explicitly asked of them.
Ordinary small talk with nothing to act on stays out; an empty list is fine.`;
}

/**
 * Whether the presence raises a worry it remembers, in the call itself.
 * Neither setting touches the rule about death and loss: a memory of someone
 * who died is never turned into a question, whatever the family chose.
 */
export function initiativeSection(initiative, caredFor) {
  const { initiative: value } = autonomyOf({ autonomy_initiative: initiative });
  const her = caredFor || 'ela';
  if (value === 'ask') {
    return `WHAT ${her.toUpperCase()}'S FAMILY ASKED YOU TO DO WITH A WORRY YOU REMEMBER:
- If she told you last time about a pain, a difficulty or something troubling her, you may ask ONCE, gently and early in the call, how that is now ("como está aquela tosse?").
- Ask once. If she brushes it off or changes the subject, let it go completely and do not return to it.
- Never ask about someone who has died, about loss, or about anything the family marked as never to bring up — whatever else you remember, those are never turned into a question.`;
  }
  return `WHAT ${her.toUpperCase()}'S FAMILY ASKED YOU TO DO WITH A WORRY YOU REMEMBER:
- Do not raise it. Wait for her to bring it up herself, and then follow her.
- You still remember it, and you still tell her family what she says about it. You simply do not open the subject.
- Never ask about someone who has died, or about loss — those are never turned into a question, whatever else you remember.`;
}
