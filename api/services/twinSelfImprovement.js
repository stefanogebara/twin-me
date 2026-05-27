/**
 * Twin Self-Improvement Service (pi-reflect pattern)
 * ====================================================
 * When the user corrects the twin during chat ("no, that's wrong" /
 * "actually..." / "you got X wrong"), this service:
 *
 *   1. DETECTS the correction (regex first → LLM classifier on borderline).
 *   2. EXTRACTS one to three short directives from the (correcting user
 *      message + the twin's preceding message) pair via the cheapest LLM.
 *   3. MERGES into twin_directives — if a cosine-similar directive already
 *      exists, increment reinforcement_count; otherwise INSERT a new row.
 *   4. RECORDS the outcome to twin_corrections for the dashboard metric.
 *
 * `getActiveDirectives()` is the HOT PATH — called on every chat turn to
 * inject the user's learned preferences into the system prompt. Keep it
 * cheap: one indexed query, no LLM calls.
 *
 * `runCycle()` is the nightly entry point — daily 04:00 UTC cron walks
 * the last 24h of messages, capped at MAX_LLM_CALLS_PER_CYCLE per user
 * to keep cost predictable (~$0.001 / cycle / active user).
 *
 * Why askjo.ai's pi-reflect inspired this:
 *   askjo.ai's nightly transcript analyzer surgically edits its own
 *   AGENTS.md / MEMORY.md / SOUL.md files. We do the same thing — only
 *   into a structured table instead of markdown — so the twin gets
 *   visibly better at being the user over weeks.
 *
 * Design choices vs. alternatives:
 *   - Regex-first detection (free) → LLM classifier only on candidates.
 *     Avoids running LLM on every single user message.
 *   - Cosine similarity dedup (threshold 0.85) — reinforcement_count
 *     grows, content stays the same. Prevents directive sprawl.
 *   - `user_edited=true` rows are NEVER auto-rewritten. Manual edits
 *     are sacred (preserves user authorship).
 *   - TIER_EXTRACTION (cheapest model) for both classifier and extraction.
 *     Outputs are short and structured; quality is fine.
 */

import { supabaseAdmin } from './database.js';
import { complete, TIER_EXTRACTION } from './llmGateway.js';
import { generateEmbedding, vectorToString } from './embeddingService.js';
import { createLogger } from './logger.js';

const log = createLogger('TwinSelfImprovement');

// ====================================================================
// Tuning constants
// ====================================================================

/**
 * Hard cap on LLM extraction calls per user per cycle.
 * 5 calls × ~200 in-tokens × $0.25/M = $0.00025/user/cycle for detection,
 * plus ≤5 extraction calls (~$0.005). Total well under $0.01/user/day.
 */
const MAX_LLM_CALLS_PER_CYCLE = 5;

/**
 * Cosine similarity threshold for "this directive is already learned."
 * Above this: reinforce existing row. Below: insert a new one.
 * 0.85 is conservative — it catches paraphrases without merging genuinely
 * distinct directives (e.g. "prefer PT-BR" vs "prefer Spanish").
 */
const DEDUP_COSINE_THRESHOLD = 0.85;

/**
 * Top-N active directives to inject into the system prompt.
 * Sorted by reinforcement_count DESC, then last_reinforced_at DESC.
 * 20 is enough to capture the strongest learned signals without
 * blowing the prompt cache budget (each directive ≤ 150 chars).
 */
const PROMPT_INJECTION_LIMIT = 20;

/**
 * LLM classifier confidence floor. Anything below is dropped without
 * generating a directive (logged as 'ignored_low_confidence').
 */
const CLASSIFIER_CONFIDENCE_FLOOR = 0.6;

/**
 * Regex signals that flag a user message as a likely correction.
 * Tuned to be permissive — false positives just get rejected by the
 * downstream LLM classifier or extractor.
 */
const CORRECTION_REGEXES = [
  { pattern: /\bno,?\s+(that'?s\s+)?(wrong|not\s+right|incorrect|inaccurate)\b/i, label: 'no_thats_wrong' },
  { pattern: /^actually[,.]?\s/i, label: 'actually_opener' },
  { pattern: /\byou'?re\s+wrong\b/i, label: 'youre_wrong' },
  { pattern: /\bi\s+never\s+(said|did|do|told|mentioned)\b/i, label: 'i_never' },
  { pattern: /\byou\s+got\s+(that|this|.{1,30})\s+wrong\b/i, label: 'you_got_x_wrong' },
  { pattern: /\bthat'?s\s+not\s+(true|right|correct|me|what\s+i)/i, label: 'thats_not_X' },
  { pattern: /^no\b.{1,80}\bnot\b/i, label: 'no_X_not_Y' },
  { pattern: /\b(stop|don'?t)\s+(saying|calling|assuming|telling)\b/i, label: 'stop_doing' },
  { pattern: /\b(it'?s|i'?m)\s+(actually|really)\s+/i, label: 'its_actually' },
];

// ====================================================================
// Detection
// ====================================================================

/**
 * Cheap first-pass: returns a `{signal}` object if any correction regex
 * fires, otherwise null. No LLM. Safe to call on every user message.
 *
 * @param {string} userMessage
 * @returns {{signal:string} | null}
 */
export function detectCorrectionFast(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') return null;
  const trimmed = userMessage.trim();
  if (trimmed.length < 3 || trimmed.length > 2000) return null;

  for (const { pattern, label } of CORRECTION_REGEXES) {
    if (pattern.test(trimmed)) {
      return { signal: `regex:${label}` };
    }
  }
  return null;
}

const CLASSIFIER_PROMPT = `You judge whether a user message is correcting an AI twin's previous message about the user.

Examples that ARE corrections:
- "no, I never said I liked jazz" (denies a previous claim)
- "actually I work in São Paulo not Rio" (corrects a fact)
- "stop calling me Steve, it's Stefano" (corrects identity)
- "be more direct, less hedging" (corrects tone)

Examples that are NOT corrections:
- "no thanks" (refusal, not correction)
- "actually that's interesting" (acknowledgment)
- "I'm not sure what to do" (uncertainty, not correction of twin)

Reply with strict JSON:
{"is_correction": true|false, "confidence": 0.0-1.0, "reason": "<one short phrase>"}

Twin previously said: """{prevTwin}"""
User just said: """{userMsg}"""

JSON:`;

/**
 * Confirms whether a regex-flagged message is actually a correction
 * (vs. a false positive like "no thanks"). Uses TIER_EXTRACTION
 * (cheapest model). Returns null on parse/LLM failure.
 *
 * @param {string} userMessage
 * @param {string} prevTwinMessage
 * @returns {Promise<{isCorrection:boolean, confidence:number, reason:string} | null>}
 */
async function classifyCorrection(userMessage, prevTwinMessage) {
  if (!userMessage) return null;

  try {
    const prompt = CLASSIFIER_PROMPT
      .replace('{userMsg}', userMessage.substring(0, 600))
      .replace('{prevTwin}', (prevTwinMessage || '(no previous twin message)').substring(0, 600));

    const result = await complete({
      tier: TIER_EXTRACTION,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 80,
      temperature: 0,
      serviceName: 'twinSelfImprovement-classify',
    });

    const text = (result.content || '').trim();
    // Forgive code-fenced JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warn('Classifier returned non-JSON', { preview: text.slice(0, 100) });
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      isCorrection: Boolean(parsed.is_correction),
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 200) : '',
    };
  } catch (err) {
    log.warn('Classifier failed', { error: err?.message });
    return null;
  }
}

// ====================================================================
// Extraction
// ====================================================================

const EXTRACTION_PROMPT = `You read a correction the user made to their AI twin and extract durable directives the twin should remember forever.

Categories:
- "preference": durable preference ("prefers email summaries in PT-BR")
- "fact": stable biographical fact ("works in São Paulo")
- "tone": how the twin should talk ("be more direct, less hedging")
- "topic-avoid": something to not bring up ("don't mention his ex-cofounder")
- "topic-prefer": something to bring up more ("reference his Spotify when relevant")

Rules:
- Write each directive in the THIRD PERSON about the user (use "the user" or their pronoun, never "you" or "I").
- Be SHORT — under 150 characters. One clear instruction.
- Output 0-3 directives. Output 0 if the correction is ambiguous or trivial.
- Each directive must be ACTIONABLE — a future prompt-injection rule, not a vague observation.
- DO NOT include emojis. DO NOT use markdown formatting.

Reply with strict JSON:
{"directives": [{"content": "...", "category": "preference|fact|tone|topic-avoid|topic-prefer"}]}

Twin previously said: """{prevTwin}"""
User correction: """{userMsg}"""

JSON:`;

const VALID_CATEGORIES = new Set(['preference', 'fact', 'tone', 'topic-avoid', 'topic-prefer']);

/**
 * Pull 0-3 durable directives out of (correcting message + preceding
 * twin message). Returns [] on LLM/parse failure. TIER_EXTRACTION.
 *
 * @param {string} userMessage
 * @param {string} prevTwinMessage
 * @returns {Promise<Array<{content:string, category:string}>>}
 */
async function generateDirectiveCandidates(userMessage, prevTwinMessage) {
  if (!userMessage) return [];

  try {
    const prompt = EXTRACTION_PROMPT
      .replace('{userMsg}', userMessage.substring(0, 800))
      .replace('{prevTwin}', (prevTwinMessage || '(no previous twin message)').substring(0, 800));

    const result = await complete({
      tier: TIER_EXTRACTION,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 300,
      temperature: 0,
      serviceName: 'twinSelfImprovement-extract',
    });

    const text = (result.content || '').trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warn('Extractor returned non-JSON', { preview: text.slice(0, 100) });
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const raw = Array.isArray(parsed.directives) ? parsed.directives : [];

    return raw
      .filter(d => d && typeof d.content === 'string' && typeof d.category === 'string')
      .map(d => ({
        content: d.content.trim().slice(0, 2000),
        category: d.category.trim().toLowerCase(),
      }))
      .filter(d => d.content.length >= 3 && VALID_CATEGORIES.has(d.category))
      .slice(0, 3);
  } catch (err) {
    log.warn('Extractor failed', { error: err?.message });
    return [];
  }
}

// ====================================================================
// Dedup + merge
// ====================================================================

/**
 * Cosine similarity between two equal-length numeric arrays.
 * Returns 0 on malformed inputs.
 */
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * pgvector returns its values as a string "[0.1,0.2,...]" through the
 * REST API. Parse it back to a Number[]. Returns null on bad input.
 */
function parsePgVector(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Find the most similar existing active directive for this user, scoped
 * to the same category to avoid cross-category dedup (a "fact" never
 * merges with a "tone" directive even if textually similar).
 *
 * Returns { directive, similarity } if any exists; null if no rows.
 */
async function findMostSimilarDirective(userId, candidateEmbedding, category) {
  const { data, error } = await supabaseAdmin
    .from('twin_directives')
    .select('id, content, category, embedding, reinforcement_count, user_edited, status')
    .eq('user_id', userId)
    .eq('category', category)
    .eq('status', 'active');

  if (error) {
    log.warn('findMostSimilarDirective query failed', { error: error.message });
    return null;
  }
  if (!data || data.length === 0) return null;

  let best = null;
  let bestSim = -1;
  for (const row of data) {
    const vec = parsePgVector(row.embedding);
    if (!vec) continue;
    const sim = cosineSimilarity(candidateEmbedding, vec);
    if (sim > bestSim) {
      bestSim = sim;
      best = row;
    }
  }

  return best ? { directive: best, similarity: bestSim } : null;
}

/**
 * Either INSERT a new directive or reinforce the existing similar one.
 *
 * Returns the outcome metadata that the audit log row needs:
 *   { directiveId, outcome }
 *
 * outcome ∈ {'directive_created','directive_reinforced','ignored_dedup_threshold'}
 *
 * @param {object} args
 * @param {string} args.userId
 * @param {{content:string, category:string}} args.candidate
 * @param {string|null} args.sourceMessageId
 * @param {string|null} args.sourceConversationId
 */
async function mergeOrInsertDirective({ userId, candidate, sourceMessageId, sourceConversationId }) {
  const embedding = await generateEmbedding(candidate.content);
  if (!embedding) {
    log.warn('Embedding unavailable — inserting without dedup');
  }

  // Try to find a similar existing directive (same category)
  let similar = null;
  if (embedding) {
    similar = await findMostSimilarDirective(userId, embedding, candidate.category);
  }

  if (similar && similar.similarity >= DEDUP_COSINE_THRESHOLD) {
    // Reinforcement path — bump count + timestamp. Even user_edited rows
    // get reinforced (the COUNT is fine; the CONTENT stays untouched).
    const { error } = await supabaseAdmin
      .from('twin_directives')
      .update({
        reinforcement_count: similar.directive.reinforcement_count + 1,
        last_reinforced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', similar.directive.id);

    if (error) {
      log.warn('Reinforcement update failed', { error: error.message });
      return { directiveId: similar.directive.id, outcome: 'ignored_dedup_threshold' };
    }

    log.info('Reinforced existing directive', {
      directiveId: similar.directive.id,
      similarity: similar.similarity.toFixed(3),
      newCount: similar.directive.reinforcement_count + 1,
    });
    return { directiveId: similar.directive.id, outcome: 'directive_reinforced' };
  }

  // Insert path — new directive
  const insertRow = {
    user_id: userId,
    content: candidate.content,
    category: candidate.category,
    source_message_id: sourceMessageId || null,
    source_conversation_id: sourceConversationId || null,
    embedding: embedding ? vectorToString(embedding) : null,
    metadata: {},
  };

  const { data, error } = await supabaseAdmin
    .from('twin_directives')
    .insert(insertRow)
    .select('id')
    .single();

  if (error) {
    log.error('Directive insert failed', { error: error.message, category: candidate.category });
    return { directiveId: null, outcome: 'ignored_dedup_threshold' };
  }

  log.info('Created new directive', {
    directiveId: data.id,
    category: candidate.category,
    preview: candidate.content.slice(0, 80),
  });
  return { directiveId: data.id, outcome: 'directive_created' };
}

// ====================================================================
// Audit log
// ====================================================================

async function recordCorrectionAudit({
  userId,
  messageId,
  precedingTwinMessageId,
  conversationId,
  detectedSignal,
  resultingDirectiveId,
  outcome,
}) {
  const { error } = await supabaseAdmin
    .from('twin_corrections')
    .insert({
      user_id: userId,
      message_id: messageId || null,
      preceding_twin_message_id: precedingTwinMessageId || null,
      conversation_id: conversationId || null,
      detected_signal: detectedSignal.slice(0, 500),
      resulting_directive_id: resultingDirectiveId || null,
      outcome,
    });

  if (error) {
    log.warn('Audit insert failed', { error: error.message, outcome });
  }
}

// ====================================================================
// Hot path: prompt injection
// ====================================================================

/**
 * Fetch the top-N active directives for prompt injection. Ordered by
 * reinforcement_count DESC, then last_reinforced_at DESC. This is the
 * HOT PATH — called on every chat turn — so it's a single indexed read.
 *
 * @param {string} userId
 * @param {number} [limit=PROMPT_INJECTION_LIMIT]
 * @returns {Promise<Array<{id:string, content:string, category:string, reinforcement_count:number}>>}
 */
export async function getActiveDirectives(userId, limit = PROMPT_INJECTION_LIMIT) {
  if (!userId || !supabaseAdmin) return [];

  const { data, error } = await supabaseAdmin
    .from('twin_directives')
    .select('id, content, category, reinforcement_count, last_reinforced_at, user_edited')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('reinforcement_count', { ascending: false })
    .order('last_reinforced_at', { ascending: false })
    .limit(limit);

  if (error) {
    log.warn('getActiveDirectives failed', { error: error.message });
    return [];
  }
  return data || [];
}

// ====================================================================
// Dashboard metric
// ====================================================================

/**
 * Correction-rate metric for the /you/twin-soul dashboard.
 *
 * Returns:
 *   {
 *     totalCorrections: number,           // detected corrections in window
 *     directivesCreated: number,
 *     directivesReinforced: number,
 *     correctionsByDay: Array<{date, count}>,  // 7-day or 30-day series
 *   }
 *
 * "Rate" is intentionally NOT a percentage — it's a raw trend the user
 * can see decreasing over time as the twin gets better.
 *
 * @param {string} userId
 * @param {number} [days=30]
 */
export async function getCorrectionRate(userId, days = 30) {
  if (!userId || !supabaseAdmin) {
    return { totalCorrections: 0, directivesCreated: 0, directivesReinforced: 0, correctionsByDay: [] };
  }

  const sinceTs = new Date(Date.now() - days * 86400_000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('twin_corrections')
    .select('outcome, created_at')
    .eq('user_id', userId)
    .gte('created_at', sinceTs)
    .order('created_at', { ascending: true });

  if (error) {
    log.warn('getCorrectionRate query failed', { error: error.message });
    return { totalCorrections: 0, directivesCreated: 0, directivesReinforced: 0, correctionsByDay: [] };
  }

  const rows = data || [];
  const byDay = new Map();
  let created = 0;
  let reinforced = 0;
  for (const row of rows) {
    const day = row.created_at.slice(0, 10); // YYYY-MM-DD
    byDay.set(day, (byDay.get(day) || 0) + 1);
    if (row.outcome === 'directive_created') created++;
    else if (row.outcome === 'directive_reinforced') reinforced++;
  }

  return {
    totalCorrections: rows.length,
    directivesCreated: created,
    directivesReinforced: reinforced,
    correctionsByDay: Array.from(byDay.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// ====================================================================
// Cycle: process unprocessed messages in the last 24h
// ====================================================================

/**
 * Fetch the recent USER messages we haven't already evaluated. We filter
 * out anything already present in twin_corrections (by message_id) to
 * avoid re-processing. Bounded to the last 24h to keep cycle work small.
 *
 * For each user message, we also return the immediately preceding twin
 * message (the thing being corrected) for context.
 */
async function fetchRecentUserMessagesNeedingReview(userId, sinceTs) {
  // Pull recent conversations for this user (the message table doesn't
  // store user_id directly — it's joined via conversation_id).
  const { data: convos, error: convErr } = await supabaseAdmin
    .from('twin_conversations')
    .select('id')
    .eq('user_id', userId)
    .gte('updated_at', sinceTs);

  if (convErr) {
    log.warn('Conversation fetch failed', { error: convErr.message });
    return [];
  }
  if (!convos || convos.length === 0) return [];

  const convoIds = convos.map(c => c.id);

  // Already-evaluated message IDs in this window
  const { data: alreadySeen } = await supabaseAdmin
    .from('twin_corrections')
    .select('message_id')
    .eq('user_id', userId)
    .gte('created_at', sinceTs);

  const seen = new Set((alreadySeen || []).map(r => r.message_id).filter(Boolean));

  // Pull recent user messages in those conversations, oldest first so the
  // "preceding twin message" lookup makes sense.
  const { data: msgs, error: msgErr } = await supabaseAdmin
    .from('twin_messages')
    .select('id, conversation_id, role, content, created_at')
    .in('conversation_id', convoIds)
    .gte('created_at', sinceTs)
    .order('created_at', { ascending: true });

  if (msgErr) {
    log.warn('Message fetch failed', { error: msgErr.message });
    return [];
  }
  if (!msgs || msgs.length === 0) return [];

  // Walk the message stream to pair each user message with the immediately
  // preceding assistant message (in the same conversation).
  const lastAssistantByConvo = new Map();
  const pairs = [];

  for (const m of msgs) {
    if (m.role === 'assistant') {
      lastAssistantByConvo.set(m.conversation_id, m);
      continue;
    }
    if (m.role !== 'user') continue;
    if (seen.has(m.id)) continue;
    if (!m.content || m.content.trim().length < 3) continue;

    pairs.push({
      message: m,
      precedingTwin: lastAssistantByConvo.get(m.conversation_id) || null,
    });
  }

  return pairs;
}

/**
 * Run the daily self-improvement cycle for ONE user.
 *
 * Pipeline:
 *   1. Pull last 24h of user messages not yet in twin_corrections.
 *   2. Fast regex filter (free) → list of candidates.
 *   3. For up to MAX_LLM_CALLS_PER_CYCLE candidates:
 *        a. LLM classifier confirms it's a real correction.
 *        b. If confirmed, LLM extracts directives.
 *        c. For each directive: dedup → reinforce or insert.
 *        d. Audit row recorded either way.
 *
 * Returns counts for the cron logger.
 *
 * @param {string} userId
 * @param {object} [opts]
 * @param {Date} [opts.since]
 * @param {number} [opts.budgetLlmCalls]
 */
export async function runCycle(userId, opts = {}) {
  if (!userId || !supabaseAdmin) {
    return { evaluated: 0, classified: 0, directivesCreated: 0, directivesReinforced: 0, budgetExhausted: false };
  }

  const since = opts.since || new Date(Date.now() - 24 * 3600_000);
  const budget = typeof opts.budgetLlmCalls === 'number'
    ? opts.budgetLlmCalls
    : MAX_LLM_CALLS_PER_CYCLE;

  let llmCallsRemaining = budget;
  const stats = {
    evaluated: 0,
    classified: 0,
    directivesCreated: 0,
    directivesReinforced: 0,
    budgetExhausted: false,
  };

  const pairs = await fetchRecentUserMessagesNeedingReview(userId, since.toISOString());
  log.info('Cycle start', { userId, candidateCount: pairs.length, budget });

  for (const { message: userMsg, precedingTwin } of pairs) {
    // Regex-first filter (free)
    const fast = detectCorrectionFast(userMsg.content);
    if (!fast) continue;

    stats.evaluated++;

    if (llmCallsRemaining <= 0) {
      stats.budgetExhausted = true;
      log.info('Cycle budget exhausted', { userId, stillToEval: pairs.length - stats.evaluated });
      break;
    }

    // LLM classifier (1 call)
    llmCallsRemaining--;
    const verdict = await classifyCorrection(userMsg.content, precedingTwin?.content || '');

    if (!verdict || !verdict.isCorrection || verdict.confidence < CLASSIFIER_CONFIDENCE_FLOOR) {
      await recordCorrectionAudit({
        userId,
        messageId: userMsg.id,
        precedingTwinMessageId: precedingTwin?.id || null,
        conversationId: userMsg.conversation_id,
        detectedSignal: `${fast.signal} | classifier:${verdict ? `c=${verdict.confidence.toFixed(2)},r=${verdict.reason}` : 'failed'}`,
        resultingDirectiveId: null,
        outcome: 'ignored_low_confidence',
      });
      continue;
    }

    stats.classified++;

    if (llmCallsRemaining <= 0) {
      stats.budgetExhausted = true;
      log.info('Cycle budget exhausted before extraction', { userId });
      break;
    }

    // LLM extractor (1 call)
    llmCallsRemaining--;
    const candidates = await generateDirectiveCandidates(
      userMsg.content,
      precedingTwin?.content || '',
    );

    if (candidates.length === 0) {
      await recordCorrectionAudit({
        userId,
        messageId: userMsg.id,
        precedingTwinMessageId: precedingTwin?.id || null,
        conversationId: userMsg.conversation_id,
        detectedSignal: `${fast.signal} | classifier:c=${verdict.confidence.toFixed(2)} | extractor:empty`,
        resultingDirectiveId: null,
        outcome: 'ignored_low_confidence',
      });
      continue;
    }

    // Each candidate goes through dedup → merge or insert.
    // Each generates ONE embedding (1 cheap embedding call ≠ counted in LLM budget).
    for (const candidate of candidates) {
      const merge = await mergeOrInsertDirective({
        userId,
        candidate,
        sourceMessageId: userMsg.id,
        sourceConversationId: userMsg.conversation_id,
      });

      await recordCorrectionAudit({
        userId,
        messageId: userMsg.id,
        precedingTwinMessageId: precedingTwin?.id || null,
        conversationId: userMsg.conversation_id,
        detectedSignal: `${fast.signal} | classifier:c=${verdict.confidence.toFixed(2)}`,
        resultingDirectiveId: merge.directiveId,
        outcome: merge.outcome,
      });

      if (merge.outcome === 'directive_created') stats.directivesCreated++;
      else if (merge.outcome === 'directive_reinforced') stats.directivesReinforced++;
    }
  }

  log.info('Cycle done', { userId, ...stats, llmCallsRemaining });
  return stats;
}

// ====================================================================
// Exports
// ====================================================================

export {
  // Internal helpers exported for tests + future inline correction-time
  // detection (e.g. if we ever decide to extract directives synchronously
  // during chat instead of waiting for the nightly cron).
  classifyCorrection,
  generateDirectiveCandidates,
  mergeOrInsertDirective,
  // Tuning constants surfaced for the cron runner so it can tune budget
  // per user (e.g. premium users get a higher cap).
  MAX_LLM_CALLS_PER_CYCLE,
  DEDUP_COSINE_THRESHOLD,
  PROMPT_INJECTION_LIMIT,
};
