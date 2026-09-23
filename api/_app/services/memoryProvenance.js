/**
 * Memory Provenance
 * =================
 * Who said it? Shared classifier for "is this memory the user's own testimony,
 * something we observed, something we inferred, or something the twin said?"
 *
 * Extracted from taskBriefService so the write paths can use it too. The
 * distinction is load-bearing (issue #237): the memory stream stores the twin's
 * own replies alongside the user's words, at comparable importance, and once
 * that difference is lost a single hallucination becomes self-supporting
 * evidence. For this user 38 memories asserted a residence that a wrong-person
 * enrichment match invented, and the twin was citing itself.
 *
 * Tiers, strongest to weakest:
 *   user_stated   the person's own words about themselves
 *   observed      behaviour we watched happen (platform data)
 *   derived       synthesized by our pipeline, or supplied by a third party
 *   twin_asserted the twin's own output — inference, never testimony
 */

/** Sources whose content is the user's own testimony about themselves. */
export const USER_STATED_SOURCES = new Set([
  'life_story',
  'onboarding_interview',
  'onboarding_calibration',
  'gdpr_import',
  'whatsapp_chat',
  'telegram',
]);

/**
 * Sources synthesized by our own pipeline, or supplied by a third party —
 * evidence, but never first-person testimony.
 *
 * onboarding_signature is LLM-generated prose, not the user's words: this
 * user's first Soul Signature describes a different person entirely, having
 * inherited a wrong-person enrichment match.
 *
 * onboarding_enrichment is third-party email-lookup data — a guess that may
 * describe someone else. It is the origin of that contamination.
 *
 * query_filing is the twin's own answer, re-extracted and filed back as a
 * fact. It is twin output wearing a fact's clothing.
 */
export const DERIVED_SOURCES = new Set([
  'reflection_engine',
  'query_filing',
  'identity_inference',
  'soul_signature_archetype',
  'onboarding_signature',
  'onboarding_enrichment',
]);

/** Relative strength, for picking the best tier backing a claim. */
export const TIER_RANK = { user_stated: 3, observed: 2, derived: 1, twin_asserted: 0 };

/**
 * Classify a memory's provenance tier. Pure.
 *
 * Assistant-role conversation memories are twin_asserted regardless of source:
 * addConversationMemory writes both sides of every chat turn, and the
 * assistant side is inference, not testimony.
 */
export function trustTier(memory) {
  const meta = memory?.metadata || {};
  const source = String(meta.source || '');
  const role = String(meta.role || '');

  if (memory?.memory_type === 'conversation' && role === 'assistant') return 'twin_asserted';
  if (source === 'twin_chat' && role !== 'user') return 'twin_asserted';

  // Facts minted from the twin's own answers are twin output, not testimony.
  if (source === 'query_filing') return 'twin_asserted';

  if (USER_STATED_SOURCES.has(source)) return 'user_stated';
  if (memory?.memory_type === 'platform_data' || memory?.memory_type === 'observation') return 'observed';
  if (DERIVED_SOURCES.has(source) || memory?.memory_type === 'reflection') return 'derived';

  // Conversation with role=user is the user talking — testimony.
  if (memory?.memory_type === 'conversation' && role === 'user') return 'user_stated';

  // Unknown sources: derived rather than trusted by default.
  return 'derived';
}

/** True when the memory is the twin's own output rather than evidence about the user. */
export function isTwinAsserted(memory) {
  return trustTier(memory) === 'twin_asserted';
}
