/**
 * Expert Reflection Engine
 * ========================
 * Inspired by "Generative Agent Simulations of 1,000 People" (Park et al., 2024)
 * and the original Generative Agents (Park et al., UIST 2023).
 *
 * Instead of the original generic 3-question approach, this engine uses 5 domain-
 * specific expert personas that each analyze memories from their own perspective.
 * This mirrors Paper 2's use of expert reflections (Psychologist, Behavioral
 * Economist, Political Scientist, Demographer) which generated 5-20 observations
 * per persona per person, dramatically improving agent fidelity.
 *
 * Expert Personas (adapted for digital twin context):
 *   1. Personality Psychologist - Emotional patterns, coping, attachment style
 *   2. Lifestyle Analyst - Daily rhythms, energy, health-behavior connections
 *   3. Cultural Identity Expert - Aesthetic preferences, media taste, expression
 *   4. Social Dynamics Analyst - Communication style, relationship patterns
 *   5. Motivation Analyst - Work patterns, ambitions, decision-making style
 *
 * Process:
 *   1. Gather N recent memories (all types)
 *   2. For each expert (in parallel):
 *      a. Retrieve domain-relevant memories via vector search
 *      b. Expert analyzes combined evidence and generates 2-3 observations
 *      c. Store each observation as memory_type='reflection' with expert metadata
 *   3. Reflections become retrievable in future queries (recursive improvement)
 *
 * Trigger conditions:
 *   - After twin chat when accumulated importance > 15
 *   - After platform data sync completes
 *   - Can be called manually for seeding initial reflections
 *
 * Usage:
 *   import { generateReflections, shouldTriggerReflection } from './reflectionEngine.js';
 *   if (await shouldTriggerReflection(userId)) {
 *     generateReflections(userId).catch(console.error); // Run in background
 *   }
 */

import { complete, TIER_ANALYSIS } from './llmGateway.js';
import { get as redisGet, set as redisSet, del as redisDel } from './redisClient.js';
import {
  getRecentMemories,
  retrieveMemories,
  addReflection,
  getRecentImportanceSum,
  decaySourceMemories,
} from './memoryStreamService.js';
import { inferIdentityContext } from './identityContextService.js';
import { supabaseAdmin } from './database.js';
import { generateEmbedding } from './embeddingService.js';
import { autoLinkMemory } from './memoryLinksService.js';
import { REFLECTION_CONFIG } from '../../twin-research/twin-config.js';

// ====================================================================
// Deduplication — Cosine similarity on stored embeddings
// ====================================================================

const DEDUP_COSINE_THRESHOLD = 0.85;
const DEDUP_BIGRAM_THRESHOLD = 0.72;

/** Dot-product cosine similarity between two equal-length float arrays. */
function cosineSim(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Parse a pgvector string "[0.1,0.2,...]" into a float array. */
function parseEmbedding(str) {
  if (!str) return null;
  try {
    return str.slice(1, -1).split(',').map(Number);
  } catch {
    return null;
  }
}

/**
 * Bigram Jaccard similarity — fallback when embeddings are unavailable.
 * Words under 4 chars are ignored (stop-word filter).
 */
function bigramSimilarity(a, b) {
  const getBigrams = text => {
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const bigrams = new Set();
    for (let i = 0; i < words.length - 1; i++) {
      bigrams.add(`${words[i]}_${words[i + 1]}`);
    }
    return bigrams;
  };
  const setA = getBigrams(a);
  const setB = getBigrams(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const bg of setA) { if (setB.has(bg)) intersection++; }
  return intersection / (setA.size + setB.size - intersection);
}

/**
 * Returns true if a semantically similar reflection already exists for this expert.
 *
 * Primary: cosine similarity on stored embeddings (threshold 0.85).
 * The new observation's embedding is generated here and cached — addMemory() will
 * re-request it and hit the in-memory cache, so no duplicate API call.
 *
 * Fallback: bigram Jaccard (threshold 0.72) when no embeddings are stored yet.
 */
async function isDuplicateReflection(userId, expertId, newObservation) {
  try {
    const { data } = await supabaseAdmin
      .from('user_memories')
      .select('content, embedding')
      .eq('user_id', userId)
      .eq('memory_type', 'reflection')
      .filter('metadata->>expert', 'eq', expertId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!data || data.length === 0) return false;

    // Cheap check first: bigram Jaccard on all rows (no API call needed)
    // Catches obvious duplicates without paying for an embedding
    const bigramMax = Math.max(...data.map(r => bigramSimilarity(newObservation, r.content)));
    if (bigramMax > DEDUP_BIGRAM_THRESHOLD) {
      console.log(`[Reflection] Dedup skip (${expertId}): bigram ${bigramMax.toFixed(2)} > ${DEDUP_BIGRAM_THRESHOLD}`);
      return true;
    }

    // Cosine path: only pay for embedding when bigram didn't catch it
    const rowsWithEmbeddings = data.filter(r => r.embedding);
    if (rowsWithEmbeddings.length > 0) {
      const newVec = await generateEmbedding(newObservation);
      if (newVec) {
        for (const row of rowsWithEmbeddings) {
          const existingVec = parseEmbedding(row.embedding);
          if (!existingVec) continue;
          const sim = cosineSim(newVec, existingVec);
          if (sim > DEDUP_COSINE_THRESHOLD) {
            console.log(`[Reflection] Dedup skip (${expertId}): cosine ${sim.toFixed(3)} > ${DEDUP_COSINE_THRESHOLD}`);
            return true;
          }
        }
      }
    }

    return false;
  } catch (err) {
    console.warn('[Reflection] Dedup check failed (non-fatal):', err.message);
    return false; // On error, allow write
  }
}

// Reflection threshold + depth from twin-research/twin-config.js (tunable by research agent)
export const IMPORTANCE_THRESHOLD = REFLECTION_CONFIG.importance_threshold;
const MAX_REFLECTION_DEPTH = REFLECTION_CONFIG.max_depth;

// Cooldown: don't reflect more than once per hour per user
// Uses Redis as primary store (serverless-safe) with in-memory Map as fallback
const reflectionCooldowns = new Map(); // fallback only — reset on cold starts
const REFLECTION_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const REFLECTION_COOLDOWN_REDIS_TTL = 3600; // 1 hour in seconds

async function _isReflectionOnCooldown(userId) {
  // Try Redis first (cross-instance, survives cold starts)
  try {
    const redisCooldown = await redisGet(`reflectionCooldown:${userId}`);
    if (redisCooldown) return true;
  } catch { /* Redis unavailable — fall through to in-memory */ }
  // Fallback: in-memory Map (resets on cold start, but better than nothing)
  const lastReflection = reflectionCooldowns.get(userId);
  return !!(lastReflection && (Date.now() - lastReflection) < REFLECTION_COOLDOWN_MS);
}

async function _setReflectionCooldown(userId) {
  try {
    await redisSet(`reflectionCooldown:${userId}`, '1', REFLECTION_COOLDOWN_REDIS_TTL);
  } catch { /* Redis unavailable — use in-memory fallback */ }
  reflectionCooldowns.set(userId, Date.now());
  setTimeout(() => reflectionCooldowns.delete(userId), REFLECTION_COOLDOWN_MS);
}

async function _clearReflectionCooldown(userId) {
  try {
    await redisDel(`reflectionCooldown:${userId}`);
  } catch { /* Redis unavailable */ }
  reflectionCooldowns.delete(userId);
}

// ====================================================================
// Expert Persona Definitions
// ====================================================================

/**
 * Each expert has:
 * - id: Short identifier for metadata/logging
 * - name: Display name
 * - retrievalQuery: Domain-specific query to find relevant memories via vector search
 * - prompt: The expert's analysis prompt (receives {observations} and {evidence})
 */
const EXPERT_PERSONAS = [
  {
    id: 'personality_psychologist',
    name: 'Personality Psychologist',
    retrievalQuery: "emotional reactions, stress responses, mood patterns, feelings about relationships and self, how they react under pressure",
    prompt: `You are analyzing behavioral data about a person to spot real patterns in how they tick emotionally.

Your focus: how their mood shifts across different situations, what they reach for when stressed, how their feelings show up in their choices (music, schedule, habits), how they handle difficult emotions.

Recent observations:
{observations}

More evidence from their life:
{evidence}

Write 2-3 specific observations about their emotional patterns. Address them directly in second person ("You...", "Your..."). Each one should:
- Point to specific evidence (name what you actually see in the data)
- Be 1-2 sentences, plain conversational English
- Start with "You..." or "Your..." — directly addressing the person
- Sound like something a perceptive friend would notice, NOT a clinical report
- Use everyday language: "You pull back when overwhelmed" not "avoidant coping", "You get restless when things are too structured" not "low tolerance for constraint", "You use music to shift your mood" not "employs hedonic regulation"

If there's not enough data for a genuine insight, return "INSUFFICIENT_EVIDENCE".

Return observations numbered 1., 2., 3. on separate lines. Nothing else.`
  },
  {
    id: 'lifestyle_analyst',
    name: 'Lifestyle Analyst',
    retrievalQuery: "daily routine, sleep patterns, exercise habits, energy levels, health metrics, time management, work-life balance",
    prompt: `You are analyzing a person's daily patterns to understand how they actually live — their rhythms, rituals, and habits.

Your focus: daily routines and what disrupts them, how physical state (sleep, recovery) connects to their other choices, how they balance structure vs spontaneity, what their schedule reveals about their priorities.

Recent observations:
{observations}

More evidence from their life:
{evidence}

Write 2-3 specific observations about their lifestyle patterns. Address them directly in second person ("You...", "Your..."). Each one should:
- Point to specific evidence (name what you actually see in the data)
- Be 1-2 sentences, plain conversational English
- Start with "You..." or "Your..." — directly addressing the person
- Sound like something a perceptive friend would notice, NOT a wellness consultant's report
- Use everyday language: "You tend to go harder on days you slept well" not "demonstrates biometric-behavioral correlation", "You block off mornings for focused work" not "exhibits high conscientiousness temporal allocation"
- Find the cross-platform connections: how their sleep affects their playlist, how packed their calendar is vs how they're feeling

If there's not enough data for a genuine insight, return "INSUFFICIENT_EVIDENCE".

Return observations numbered 1., 2., 3. on separate lines. Nothing else.`
  },
  {
    id: 'cultural_identity',
    name: 'Cultural Identity Expert',
    retrievalQuery: "music taste, content preferences, aesthetic choices, media consumption, creative interests, hobbies, what they watch and listen to",
    prompt: `You are analyzing a person's media and aesthetic choices to understand what they're into and what it says about them.

Your focus: what their music taste reveals about their mood and personality, how their content choices shift over time, what their listening/watching habits say about their values and what they're drawn to, the difference between their "public taste" and what they actually reach for.

Recent observations:
{observations}

More evidence from their life:
{evidence}

Write 2-3 specific observations about their tastes and cultural identity. Address them directly in second person ("You...", "Your..."). Each one should:
- Point to specific evidence (name the actual artists, genres, content you see)
- Be 1-2 sentences, plain conversational English
- Start with "You..." or "Your..." — directly addressing the person
- Sound like something a music-savvy friend would notice, NOT a cultural studies paper
- Use everyday language: "You put on Radiohead when you need to process something" not "utilizes emotionally complex media for affective regulation", "Your taste skews toward stuff most people haven't heard of" not "demonstrates cultural capital maximization"
- Avoid over-generalizing from one data point

If there's not enough data for a genuine insight, return "INSUFFICIENT_EVIDENCE".

Return observations numbered 1., 2., 3. on separate lines. Nothing else.`
  },
  {
    id: 'social_dynamics',
    name: 'Social Dynamics Analyst',
    retrievalQuery: "communication style, social interactions, meeting patterns, relationship dynamics, how they talk to others, social energy, alone time vs social time",
    prompt: `You are analyzing a person's social patterns to understand how they relate to people and manage their social energy.

Your focus: how they structure their social life, when they seek connection vs pull back, what their communication patterns say about them, how social load affects their other behaviors, how they show up in different social contexts.

Recent observations:
{observations}

More evidence from their life:
{evidence}

Write 2-3 specific observations about their social patterns. Address them directly in second person ("You...", "Your..."). Each one should:
- Point to specific evidence (name what you actually see in the data)
- Be 1-2 sentences, plain conversational English
- Start with "You..." or "Your..." — directly addressing the person
- Sound like what a close mutual friend might notice, NOT a social psychologist's assessment
- Use everyday language: "You need serious alone time after a packed social day" not "exhibits introversion-based energy recovery patterns", "You tend to keep conversations surface-level until you trust someone" not "demonstrates selective self-disclosure behavior"

If there's not enough data for a genuine insight, return "INSUFFICIENT_EVIDENCE".

Return observations numbered 1., 2., 3. on separate lines. Nothing else.`
  },
  {
    id: 'motivation_analyst',
    name: 'Motivation Analyst',
    retrievalQuery: "work patterns, goals, ambitions, decision making, what drives them, productivity patterns, focus sessions, goal commitment, what they prioritize",
    prompt: `You are analyzing a person's patterns around work, goals, and what drives their decisions.

Your focus: what they do with free time (reveals real priorities), how they handle competing demands, when they're most energized and focused, what their browsing and content consumption hint at in terms of ambitions, how committed they are to things once they start them.

Recent observations:
{observations}

More evidence from their life:
{evidence}

Write 2-3 specific observations about their motivation and drive patterns. Address them directly in second person ("You...", "Your..."). Each one should:
- Point to specific evidence (name what you actually see in the data)
- Be 1-2 sentences, plain conversational English
- Start with "You..." or "Your..." — directly addressing the person
- Sound like something a perceptive colleague would notice, NOT a management consultant's report
- Use everyday language: "You do your best thinking late at night" not "exhibits peak cognitive performance during nocturnal periods", "You get way more done when you have a hard deadline" not "demonstrates extrinsic motivation dependency"
- If goal data exists: note whether they actually follow through, what makes them drop off

If there's not enough data for a genuine insight, return "INSUFFICIENT_EVIDENCE".

Return observations numbered 1., 2., 3. on separate lines. Nothing else.`
  },
];

// ====================================================================
// Personality Trend
// ====================================================================

/**
 * Fetch recent personality score snapshots and detect meaningful trait shifts.
 * Returns a string like "openness increased by 8% over 3 reflection cycles" or null.
 *
 * Note: personality_score_snapshots stores individual trait columns, not a big_five JSONB.
 */
async function getPersonalityTrend(userId) {
  try {
    const { data } = await supabaseAdmin
      .from('personality_score_snapshots')
      .select('openness, conscientiousness, extraversion, agreeableness, neuroticism, memory_count, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(3);

    if (!data || data.length < 2) return null;

    const latest = data[0];
    const older = data[data.length - 1];
    const changes = [];

    for (const trait of ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism']) {
      if (latest[trait] != null && older[trait] != null) {
        const delta = latest[trait] - older[trait];
        if (Math.abs(delta) > 5) {
          changes.push(`${trait} ${delta > 0 ? 'increased' : 'decreased'} by ${Math.abs(delta).toFixed(0)}% over ${data.length} reflection cycles`);
        }
      }
    }

    return changes.length > 0 ? `Recent personality shifts: ${changes.join('; ')}` : null;
  } catch (err) {
    console.warn('[Reflection] getPersonalityTrend failed (non-fatal):', err.message);
    return null;
  }
}

// ====================================================================
// Core Expert Reflection Pipeline
// ====================================================================

/**
 * Run a single expert persona against a user's memories.
 * Returns an array of generated reflections (0-3).
 */
async function runExpertAnalysis(userId, expert, formattedObservations, depth, identityContext = null) {
  try {
    // Retrieve domain-relevant memories via vector search (reflection weights: relevance dominant, no recency bias)
    const domainMemories = await retrieveMemories(userId, expert.retrievalQuery, 10, 'reflection');

    const evidence = domainMemories.length > 0
      ? domainMemories
          .map(m => `- ${m.content.substring(0, 250)}`)
          .join('\n')
      : 'No additional domain-specific evidence available.';

    // S4.2: Prepend identity context preamble so the expert frames insights appropriately
    const identityPreamble = identityContext?.promptFragment
      ? `${identityContext.promptFragment}\n\n`
      : '';

    // Run expert analysis
    const result = await complete({
      tier: TIER_ANALYSIS,
      messages: [{
        role: 'user',
        content: identityPreamble + expert.prompt
          .replace('{observations}', formattedObservations)
          .replace('{evidence}', evidence),
      }],
      maxTokens: 400,
      temperature: 0.4,
      serviceName: `reflection-${expert.id}`,
    });

    const responseText = (result.content || '').trim();

    // Check for insufficient evidence (case-insensitive, handles trailing punctuation/variants)
    if (responseText.toUpperCase().startsWith('INSUFFICIENT_EVIDENCE') || responseText.length < 20) {
      console.log(`[Reflection] ${expert.name}: insufficient evidence`);
      return [];
    }

    // Parse numbered observations
    const observations = responseText
      .split('\n')
      .map(line => line.replace(/^\d+\.\s*/, '').trim())
      .filter(obs => obs.length > 20 && !obs.toUpperCase().startsWith('INSUFFICIENT_EVIDENCE'));

    // Store each observation as a reflection
    const stored = [];
    const evidenceIds = domainMemories.map(m => m.id);

    // S3.5: Reasoning string for the proposition reasoning column
    const reasoning = `${expert.name} analyzed ${domainMemories.length} domain-specific memories to identify ${expert.retrievalQuery.split(',')[0].trim()} patterns.`;

    // GUM Task 3: Confidence inheritance — reflection inherits avg confidence of source memories (floor 0.50)
    const inheritedConfidence = domainMemories.length > 0
      ? Math.max(0.50, domainMemories.reduce((sum, m) => sum + (m.confidence ?? 0.7), 0) / domainMemories.length)
      : 0.70;

    for (const observation of observations.slice(0, 3)) {
      // Dedup check — skip if a very similar reflection already exists for this expert
      const isDupe = await isDuplicateReflection(userId, expert.id, observation);
      if (isDupe) continue;

      const reflectionResult = await addReflection(userId, observation, evidenceIds, {
        expert: expert.id,
        expertName: expert.name,
        expertType: 'generic',   // distinguish from platform experts (metadata.expertType='platform')
        reflectionDepth: depth,
        evidenceCount: domainMemories.length,
      }, {
        // S3.5: Store reasoning + grounding_ids on all generic expert reflections
        reasoning,
        grounding_ids: evidenceIds,
        confidence: inheritedConfidence,
      });

      if (reflectionResult) {
        stored.push(observation);
        console.log(`[Reflection] ${expert.name}: "${observation.substring(0, 70)}..."`);

        // A-MEM: Auto-link this reflection to semantically related memories.
        // generateEmbedding is cached — this is a cache hit from the dedup check above.
        // Fire-and-forget: link failures must never affect the reflection pipeline.
        generateEmbedding(observation).then(embedding => {
          if (embedding) {
            autoLinkMemory(reflectionResult.id, userId, embedding).catch(err =>
              console.warn('[MemoryLinks] autoLinkMemory fire-and-forget error:', err.message)
            );
          }
        }).catch(() => {});
      }
    }

    // Attach evidence IDs to the returned array so generateReflections can collect
    // them for S5.2 post-reflection source decay
    stored._evidenceIds = evidenceIds;
    return stored;
  } catch (error) {
    console.warn(`[Reflection] ${expert.name} error:`, error.message);
    return [];
  }
}

/**
 * Generate reflections for a user using the expert persona system.
 * Runs all 5 experts in parallel for efficiency.
 * Returns the number of reflections generated.
 */
async function generateReflections(userId, depth = 0) {
  if (depth >= MAX_REFLECTION_DEPTH) {
    console.log(`[Reflection] Max depth (${MAX_REFLECTION_DEPTH}) reached for user ${userId}`);
    return 0;
  }

  // Check cooldown (only on initial call, not recursive ones)
  if (depth === 0) {
    if (await _isReflectionOnCooldown(userId)) {
      console.log(`[Reflection] Skipping - cooldown active for user ${userId}`);
      return 0;
    }
  }

  try {
    console.log(`[Reflection] Starting expert reflection generation (depth ${depth}) for user ${userId}`);

    // Step 1: Gather recent memories
    const recentMemories = await getRecentMemories(userId, 100);
    if (recentMemories.length < 3) {
      console.log(`[Reflection] Not enough memories (${recentMemories.length}) to reflect`);
      return 0;
    }

    // Format observations for the experts (shared context)
    const formattedObservations = recentMemories
      .slice(0, 30) // Cap at 30 for prompt size
      .map((m, i) => {
        const timeAgo = getTimeAgoShort(m.created_at);
        const type = m.memory_type === 'reflection' ? '[insight]' : `[${m.memory_type}]`;
        return `${i + 1}. ${type} (${timeAgo}) ${m.content.substring(0, 200)}`;
      })
      .join('\n');

    // Step 2: Fetch identity context (cached 24h — near-zero cost on repeat calls)
    let identityContext = null;
    try {
      identityContext = await inferIdentityContext(userId);
      if (identityContext.promptFragment) {
        console.log(`[Reflection] Identity context: ${identityContext.lifeStage}, career=${identityContext.careerSalience}`);
      }
    } catch (idErr) {
      console.warn('[Reflection] Identity context fetch failed (non-fatal):', idErr.message);
    }

    // Step 3: Fetch personality trend (non-blocking, injected as context for experts)
    let personalityTrend = null;
    try {
      personalityTrend = await getPersonalityTrend(userId);
      if (personalityTrend) {
        console.log(`[Reflection] Personality trend: ${personalityTrend}`);
      }
    } catch (trendErr) {
      console.warn('[Reflection] Personality trend fetch failed (non-fatal):', trendErr.message);
    }

    // Append personality trend to the shared observations block so all experts see it
    const observationsWithTrend = personalityTrend
      ? `${formattedObservations}\n\n[PERSONALITY TREND]: ${personalityTrend}`
      : formattedObservations;

    // Step 4: Run all experts in parallel (with identity context injected)
    console.log(`[Reflection] Running ${EXPERT_PERSONAS.length} expert analyses in parallel...`);

    const expertSettled = await Promise.allSettled(
      EXPERT_PERSONAS.map(expert =>
        runExpertAnalysis(userId, expert, observationsWithTrend, depth, identityContext)
      )
    );

    // Count total reflections generated + collect all evidence IDs for source decay
    let reflectionsGenerated = 0;
    const allEvidenceIds = new Set();

    for (let i = 0; i < EXPERT_PERSONAS.length; i++) {
      if (expertSettled[i].status === 'rejected') {
        console.warn(`[Reflection] Expert ${EXPERT_PERSONAS[i].id} failed:`, expertSettled[i].reason?.message);
        continue;
      }
      const result = expertSettled[i].value;
      if (!Array.isArray(result)) {
        console.warn(`[Reflection] Expert ${EXPERT_PERSONAS[i].id} returned invalid result`);
        continue;
      }
      const count = result.length;
      if (count > 0) {
        console.log(`[Reflection] ${EXPERT_PERSONAS[i].name}: ${count} reflections`);
        // Collect evidence IDs (result items may be { observation, evidenceIds } or just strings)
        // runExpertAnalysis returns stored observation strings; evidenceIds tracked below via a Map
        if (result._evidenceIds) {
          for (const id of result._evidenceIds) allEvidenceIds.add(id);
        }
      }
      reflectionsGenerated += count;
    }

    // S5.2: Post-reflection source decay — run non-blocking after reflections are stored.
    // Decays importance of source memories by 40% so they don't compete with the
    // reflections that abstracted them. Protected: importance ≥ 8 or retrieval_count ≥ 3.
    if (reflectionsGenerated > 0 && allEvidenceIds.size > 0) {
      decaySourceMemories(userId, [...allEvidenceIds]).catch(err =>
        console.warn('[Reflection] Source decay failed (non-fatal):', err.message)
      );
    }

    // Recursive reflection: if new reflections pushed importance back over threshold
    if (reflectionsGenerated > 0 && depth + 1 < MAX_REFLECTION_DEPTH) {
      const newSum = await getRecentImportanceSum(userId, 2);
      if (newSum >= IMPORTANCE_THRESHOLD) {
        console.log(`[Reflection] Importance ${newSum} >= ${IMPORTANCE_THRESHOLD} after depth ${depth}, recursing...`);
        reflectionsGenerated += await generateReflections(userId, depth + 1);
      }
    }

    // Set cooldown (only on initial call) — stored in Redis for serverless safety
    if (depth === 0) {
      await _setReflectionCooldown(userId);

      // Snapshot personality scores after each reflection cycle
      if (reflectionsGenerated > 0) {
        snapshotPersonalityScores(userId).catch(err =>
          console.warn('[Reflection] Snapshot error (non-fatal):', err.message)
        );
      }
    }

    console.log(`[Reflection] Completed depth ${depth}: ${reflectionsGenerated} reflections from ${EXPERT_PERSONAS.length} experts for user ${userId}`);
    return reflectionsGenerated;
  } catch (error) {
    console.error('[Reflection] generateReflections error:', error.message);
    return 0;
  }
}

/**
 * Check if reflection should be triggered based on accumulated importance.
 */
async function shouldTriggerReflection(userId) {
  // Check cooldown first (cheap)
  if (await _isReflectionOnCooldown(userId)) {
    return false;
  }

  // Check accumulated importance
  const importanceSum = await getRecentImportanceSum(userId, 2);
  return importanceSum >= IMPORTANCE_THRESHOLD;
}

/**
 * Seed initial reflections for a user from their existing memory base.
 * Useful for bootstrapping the reflection layer for existing users.
 */
async function seedReflections(userId) {
  console.log(`[Reflection] Seeding initial reflections for user ${userId}`);
  // Clear cooldown to allow immediate reflection
  await _clearReflectionCooldown(userId);
  return generateReflections(userId);
}

// ====================================================================
// Personality Snapshot
// ====================================================================

/**
 * Copy current personality_scores into personality_score_snapshots.
 * Called automatically after each reflection cycle.
 * One snapshot per 24h per user (enforced by DB data, not code).
 */
async function snapshotPersonalityScores(userId) {
  try {
    // Guard: one snapshot per 24h per user
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const { data: existingToday } = await supabaseAdmin
      .from('personality_score_snapshots')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', startOfToday.toISOString())
      .limit(1)
      .single();
    if (existingToday) {
      console.log(`[Reflection] Skipping personality snapshot — already snapshotted today for user ${userId}`);
      return;
    }

    const { data: ps, error: psErr } = await supabaseAdmin
      .from('personality_scores')
      .select('openness, conscientiousness, extraversion, agreeableness, neuroticism')
      .eq('user_id', userId)
      .single();
    if (psErr || !ps) return;

    // Get latest archetype_name
    const { data: sig } = await supabaseAdmin
      .from('soul_signatures')
      .select('archetype_name')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Get current memory count
    const { count: memCount } = await supabaseAdmin
      .from('user_memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    await supabaseAdmin.from('personality_score_snapshots').insert({
      user_id: userId,
      openness: ps.openness,
      conscientiousness: ps.conscientiousness,
      extraversion: ps.extraversion,
      agreeableness: ps.agreeableness,
      neuroticism: ps.neuroticism,
      archetype_name: sig?.archetype_name || null,
      memory_count: memCount || 0,
    });

    console.log(`[Reflection] Personality snapshot recorded for user ${userId}`);
  } catch (err) {
    console.warn('[Reflection] snapshotPersonalityScores error:', err.message);
  }
}

// ====================================================================
// Helpers
// ====================================================================

function getTimeAgoShort(timestamp) {
  if (!timestamp) return 'recently';
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export {
  generateReflections,
  shouldTriggerReflection,
  seedReflections,
  EXPERT_PERSONAS,
};
