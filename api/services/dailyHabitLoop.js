/**
 * Daily WhatsApp Habit Loop
 * =========================
 * Composes ONE morning WhatsApp message: the brief + the single top pending
 * action, ending in the yes/skip protocol line the inbound reply rail expects.
 *
 * This module owns two things and nothing else: the feature gate, and the pure
 * message format. The heavy lifting is already built and reused as-is:
 *   - selecting + ARMING the top action  -> offerNextProposal() (threadApprovals.js)
 *   - resolving the "yes"/"skip" reply    -> resolveProtocolReply() -> executeApprovedAction
 * So this stays a small, testable seam. Phases 2-4 (interactive buttons, backend
 * analytics, cron unification) hook in here — see
 * .claude/plans/2026-07-10-daily-whatsapp-habit-loop/README.md.
 */

/**
 * Env gate. Default OFF: the morning brief only carries an action offer when
 * DAILY_ACTION_OFFER_ENABLED is exactly "true". Matches the PURCHASE_BOT_ENABLED
 * pattern — a per-deploy flip, no migration — so merging this is inert until it's
 * explicitly turned on for a live trial. Any other value (incl. "1"/"yes"/"TRUE")
 * is OFF, to avoid an accidental rollout from a loose truthy env value.
 *
 * @returns {boolean}
 */
export function isDailyActionOfferEnabled() {
  return process.env.DAILY_ACTION_OFFER_ENABLED === 'true';
}

/**
 * Fold the top action's offer into the morning briefing as one message. Pure.
 *
 * `offerText` is whatever offerNextProposal() returned: a "Reply yes and I'll do
 * it, or skip" line when a proposal was armed, or null/'' when there's nothing to
 * offer (none pending, or one is already awaiting a reply).
 *
 * The offer always lands LAST so the yes/skip protocol line is at the very end,
 * where classifyProtocolReply/resolveProtocolReply expect the user's reply to
 * attach. With no offer, the briefing stands alone — never a dangling separator.
 *
 * @param {string|null|undefined} briefingText
 * @param {string|null|undefined} offerText
 * @returns {string}
 */
export function combineBriefingWithOffer(briefingText, offerText) {
  const brief = (briefingText || '').trim();
  const offer = (offerText || '').trim();
  if (!offer) return brief;
  if (!brief) return offer;
  return `${brief}\n\n${offer}`;
}
