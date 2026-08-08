/**
 * Task Brief Compiler
 * ===================
 * Compiles what the twin knows about the user into a structured handoff
 * document for an EXECUTION agent (a browser-use agent such as Hark Handoff,
 * Browser Use, or the twin's own future actuators). The brief answers the
 * question those agents cannot: not "how do I complete this task" but "how
 * would THIS person want it completed".
 *
 * Shape of the output:
 *   - preferences / constraints relevant to the task, each carrying
 *     per-claim evidence confidence (R2 heuristic) and provenance
 *   - autonomy tiers derived from confidence + provenance: what the executor
 *     may act on freely, what it must confirm, what it must never violate
 *   - confirm_before_payment is ALWAYS true — no confidence level overrides it
 *
 * Provenance is the load-bearing idea (issue #237): the twin has stored its
 * own hallucinated replies as memories and later cited them as evidence
 * ("you live in Lugano"). Harmless in chat; an executor ships the flowers to
 * the wrong country. So evidence is tiered:
 *
 *   user_stated   life story, onboarding, GDPR imports, user-role turns —
 *                 the person's own words about themselves
 *   observed      platform_data / observation — behaviour we watched happen
 *   derived       reflections, query_filing, identity inference — synthesized
 *                 by our own pipeline; useful but one step removed
 *   twin_asserted assistant-role conversation memories — the twin's own
 *                 output. EXCLUDED from brief evidence entirely.
 *
 * Only user_stated evidence can put a claim in the act_on tier.
 */

import { retrieveDiverseMemories } from './memoryStreamService.js';
import { complete, TIER_ANALYSIS } from './llmGateway.js';
import { computeEvidenceConfidence } from './evidenceConfidenceService.js';
import { createLogger } from './logger.js';

const log = createLogger('TaskBrief');

/** Sources whose content is the user's own testimony about themselves. */
const USER_STATED_SOURCES = new Set([
  'life_story',
  'onboarding_interview',
  'onboarding_calibration',
  'gdpr_import',
  'whatsapp_chat',
  'telegram',
]);

/**
 * Sources synthesized by our own pipeline, or supplied by a third party —
 * evidence, but never first-person testimony, so never eligible for act_on.
 *
 * onboarding_signature was previously in USER_STATED_SOURCES. That was wrong
 * and #237 shows why: the Soul Signature is LLM-generated prose, not the
 * user's words, and this user's first one ("Geneva's international policy
 * halls, Zurich's academic rigor, Lugano...") describes a different person
 * entirely — it inherited a wrong-person enrichment match. Treating a
 * generated archetype as testimony would let that contamination reach the
 * act_on autonomy tier, which is precisely what the tiering exists to prevent.
 *
 * onboarding_enrichment is third-party email-lookup data: a guess that may
 * describe someone else. It is the origin of the Lugano contamination.
 */
const DERIVED_SOURCES = new Set([
  'reflection_engine',
  'query_filing',
  'identity_inference',
  'soul_signature_archetype',
  'onboarding_signature',
  'onboarding_enrichment',
]);

/**
 * Classify a memory's provenance tier. Pure; exported for tests.
 *
 * Assistant-role conversation memories are twin_asserted regardless of
 * source: `addConversationMemory` writes both sides of every chat turn, and
 * the assistant side is inference, not testimony (#237).
 */
export function trustTier(memory) {
  const meta = memory?.metadata || {};
  const source = String(meta.source || '');
  const role = String(meta.role || '');

  if (memory?.memory_type === 'conversation' && role === 'assistant') return 'twin_asserted';
  if (source === 'twin_chat' && role !== 'user') return 'twin_asserted';

  if (USER_STATED_SOURCES.has(source)) return 'user_stated';
  if (memory?.memory_type === 'platform_data' || memory?.memory_type === 'observation') return 'observed';
  if (DERIVED_SOURCES.has(source) || memory?.memory_type === 'reflection') return 'derived';

  // Conversation with role=user is the user talking — testimony.
  if (memory?.memory_type === 'conversation' && role === 'user') return 'user_stated';

  // Unknown fact sources: treat as derived rather than trusted by default.
  return 'derived';
}

/**
 * Derive executor autonomy tiers from scored claims. Pure; exported for tests.
 *
 * Rules:
 *   - hard constraints -> never_violate, regardless of confidence
 *   - high confidence AND user_stated backing -> act_on
 *   - medium confidence, or high without user_stated backing -> prefer_but_flexible
 *   - everything else (low, or derived-only) -> confirm_first
 *   - confirm_before_payment is unconditional
 */
export function deriveAutonomy(preferences, constraints) {
  const act_on = [];
  const prefer_but_flexible = [];
  const confirm_first = [];
  const never_violate = [];

  for (const c of constraints) {
    if (c.kind === 'hard') never_violate.push(c.claim);
    else prefer_but_flexible.push(c.claim);
  }

  for (const p of preferences) {
    const level = p.confidence?.level || 'low';
    if (level === 'high' && p.provenance === 'user_stated') act_on.push(p.claim);
    else if (level === 'high' || level === 'medium') prefer_but_flexible.push(p.claim);
    else confirm_first.push(p.claim);
  }

  return { act_on, prefer_but_flexible, confirm_first, never_violate, confirm_before_payment: true };
}

/**
 * Parse the extraction model's JSON, tolerating markdown code fences.
 * Throws on malformed output — a wrong brief is worse than no brief.
 * Exported for tests.
 */
export function parseBriefJson(raw) {
  if (!raw || typeof raw !== 'string') throw new Error('Empty extraction response');
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    // Models sometimes wrap the JSON in prose despite instructions. Take the
    // outermost brace span before giving up — but still refuse anything that
    // does not parse cleanly after that.
    const first = stripped.indexOf('{');
    const last = stripped.lastIndexOf('}');
    if (first === -1 || last <= first) throw new Error('Extraction response was not valid JSON');
    try {
      parsed = JSON.parse(stripped.slice(first, last + 1));
    } catch {
      throw new Error('Extraction response was not valid JSON');
    }
  }
  if (!Array.isArray(parsed.preferences) || !Array.isArray(parsed.constraints)) {
    throw new Error('Extraction response missing preferences/constraints arrays');
  }
  return parsed;
}

function buildExtractionPrompt(task) {
  return `You compile task briefs that let an execution agent act on a person's behalf, the way the person would act themselves.

TASK THE EXECUTOR WILL PERFORM: "${task}"

Below is numbered evidence about the person, each line tagged with a provenance tier (user_stated > observed > derived). Extract ONLY what is relevant to performing THIS task as this person would want it performed.

Rules:
- Every claim MUST cite the evidence line numbers that support it. No evidence, no claim — never invent or pad.
- A "constraint" is something that must not be violated (allergies, dislikes stated as absolutes, ethical/religious limits, budget ceilings). kind: "hard" for absolutes, "soft" for strong preferences.
- A "preference" is how they'd like it done when there is a choice.
- budget_guidance: only if evidence supports it, else null.
- tone: how any text written on their behalf (messages, notes, reviews) should sound, only if evidence supports it, else null.

Respond with ONLY this JSON, no prose:
{
  "preferences": [{ "claim": "...", "evidence": [1, 4] }],
  "constraints": [{ "claim": "...", "kind": "hard"|"soft", "evidence": [2] }],
  "budget_guidance": "..." | null,
  "tone": "..." | null
}`;
}

/**
 * Compile a task brief for an execution agent.
 *
 * @param {string} userId
 * @param {string} task natural-language description of what the executor will do
 * @returns {object} the brief (see module header)
 */
export async function compileTaskBrief(userId, task) {
  // 1. Retrieve task-relevant memories. Identity weights: briefs are about
  //    who the person is, not what happened most recently.
  //
  //    The query is the task PLUS a fixed preference-oriented expansion.
  //    Verified live without it: "book a dinner reservation for Friday"
  //    retrieved task-literal matches (calendar chatter, GitHub stats,
  //    Spotify plays) and none of the preference-bearing life-story material
  //    (no-alcohol, family-first, evening cutoff) — so extraction honestly
  //    returned zero claims. A task description is not a preference query;
  //    the expansion points the vector search at who the person is.
  const retrievalQuery =
    `${task}\n` +
    `Personal context for doing this the way they would: their preferences and tastes, ` +
    `dislikes and things they avoid, dietary rules, values, routines and schedule constraints, ` +
    `budget habits, and how they like things done.`;
  const memories = await retrieveDiverseMemories(
    userId,
    retrievalQuery,
    { reflections: 8, facts: 8, platformData: 4, conversations: 8 },
    'identity'
  );

  // 2. Partition by provenance; drop twin-asserted evidence entirely (#237).
  const tiered = memories.map(m => ({ memory: m, tier: trustTier(m) }));
  const usable = tiered.filter(t => t.tier !== 'twin_asserted');
  const excludedCount = tiered.length - usable.length;

  if (usable.length === 0) {
    log.warn('Task brief has no usable evidence', { userId, retrieved: memories.length });
    return {
      task,
      compiled_at: new Date().toISOString(),
      persona: { tone: null },
      preferences: [],
      constraints: [],
      budget_guidance: null,
      autonomy: deriveAutonomy([], []),
      evidence: {
        retrieved: memories.length,
        used: 0,
        excluded_twin_asserted: excludedCount,
        overall: computeEvidenceConfidence([]),
      },
    };
  }

  // 3. LLM extraction over numbered, tier-tagged evidence.
  const evidenceLines = usable.map((t, i) =>
    `${i + 1}. [${t.tier}] ${String(t.memory.content).replace(/\s+/g, ' ').slice(0, 400)}`
  );
  const result = await complete({
    tier: TIER_ANALYSIS,
    system: buildExtractionPrompt(task),
    messages: [{ role: 'user', content: evidenceLines.join('\n') }],
    maxTokens: 900,
    temperature: 0.2,
    userId,
    serviceName: 'task-brief',
  });
  const extracted = parseBriefJson(result?.content);

  // 4. Score each claim on the evidence it cites; provenance is the best
  //    tier among cited lines (user_stated beats observed beats derived).
  const TIER_RANK = { user_stated: 3, observed: 2, derived: 1 };
  const scoreClaim = (claim) => {
    const ids = (Array.isArray(claim.evidence) ? claim.evidence : [])
      .map(n => usable[n - 1])
      .filter(Boolean);
    const provenance = ids.reduce(
      (best, t) => (TIER_RANK[t.tier] > TIER_RANK[best] ? t.tier : best),
      'derived'
    );
    return {
      claim: String(claim.claim || '').trim(),
      confidence: (({ score, level }) => ({ score, level }))(
        computeEvidenceConfidence(ids.map(t => t.memory))
      ),
      provenance,
      evidence_count: ids.length,
    };
  };

  const preferences = extracted.preferences
    .map(scoreClaim)
    .filter(p => p.claim && p.evidence_count > 0);
  const constraints = extracted.constraints
    .map(c => ({ ...scoreClaim(c), kind: c.kind === 'hard' ? 'hard' : 'soft' }))
    .filter(c => c.claim && c.evidence_count > 0);

  const brief = {
    task,
    compiled_at: new Date().toISOString(),
    persona: { tone: extracted.tone || null },
    preferences,
    constraints,
    budget_guidance: extracted.budget_guidance || null,
    autonomy: deriveAutonomy(preferences, constraints),
    evidence: {
      retrieved: memories.length,
      used: usable.length,
      excluded_twin_asserted: excludedCount,
      overall: computeEvidenceConfidence(usable.map(t => t.memory)),
    },
  };

  log.info('Task brief compiled', {
    userId,
    preferences: preferences.length,
    constraints: constraints.length,
    excluded: excludedCount,
    overall: brief.evidence.overall.level,
  });
  return brief;
}
