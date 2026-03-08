/**
 * Personality Profile Service
 * ============================
 * Core service for the Soul Signature Voting Layer.
 *
 * Derives structured personality signals from a user's memory stream:
 * - OCEAN Big Five scores via LLM analysis (DeepSeek / TIER_ANALYSIS)
 * - Stylometrics computed purely from conversation text (no LLM)
 * - LLM sampling params derived from OCEAN scores
 * - Personality embedding as weighted average of memory vectors
 *
 * Profiles are cached in user_personality_profiles and rebuilt at most
 * once every 12 hours.  Requires >= 20 memories to build a profile.
 *
 * Usage:
 *   import { getProfile, buildProfile } from './personalityProfileService.js';
 *   const profile = await getProfile(userId);
 */

import { supabaseAdmin } from './database.js';
import { complete, TIER_ANALYSIS } from './llmGateway.js';
import { retrieveMemories } from './memoryStreamService.js';
import { generateEmbedding, vectorToString } from './embeddingService.js';

const SERVICE = 'personality-profile';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// 1. extractOCEAN
// ---------------------------------------------------------------------------

/**
 * Analyze a user's top 50 memories and extract Big Five OCEAN scores (0.0-1.0).
 * Uses TIER_ANALYSIS (DeepSeek) with temperature 0.3 for consistency.
 *
 * @param {string} userId
 * @returns {Promise<{openness, conscientiousness, extraversion, agreeableness, neuroticism}|null>}
 *   Returns null if fewer than 20 memories exist.
 */
export async function extractOCEAN(userId) {
  try {
    const { data: memories, error } = await supabaseAdmin
      .from('user_memories')
      .select('content, memory_type, importance_score')
      .eq('user_id', userId)
      .in('memory_type', ['reflection', 'conversation', 'fact'])
      .order('importance_score', { ascending: false })
      .limit(50);

    if (error) {
      console.warn(`[${SERVICE}] extractOCEAN fetch error:`, error.message);
      return null;
    }

    if (!memories || memories.length < 20) {
      console.log(
        `[${SERVICE}] extractOCEAN: only ${memories?.length ?? 0} memories — need ≥20, skipping`,
      );
      return null;
    }

    const memoryBlock = memories
      .map((m, i) => `${i + 1}. [${m.memory_type}] ${m.content}`)
      .join('\n');

    const systemPrompt =
      'You are a psychologist scoring a person on the Big Five personality traits (OCEAN) ' +
      'based on their memories, thoughts, and conversations. Score each trait from 0.0 (very low) ' +
      'to 1.0 (very high). Output ONLY valid JSON with exactly these 5 keys: openness, ' +
      'conscientiousness, extraversion, agreeableness, neuroticism. ' +
      'No explanation, no markdown, no extra keys.';

    const userPrompt =
      `Here are ${memories.length} memories from this person. ` +
      `Analyze them and return Big Five OCEAN scores as JSON.\n\nMEMORIES:\n${memoryBlock}\n\nReturn JSON only:`;

    const response = await complete({
      tier: TIER_ANALYSIS,
      serviceName: SERVICE,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.3,
      max_tokens: 200,
    });

    const raw = (response?.content || response || '').trim();

    // Strip markdown code fences if present
    const jsonText = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    const parsed = JSON.parse(jsonText);

    const clampScore = (v) => clamp(Number(v) || 0, 0.0, 1.0);

    return {
      openness: clampScore(parsed.openness),
      conscientiousness: clampScore(parsed.conscientiousness),
      extraversion: clampScore(parsed.extraversion),
      agreeableness: clampScore(parsed.agreeableness),
      neuroticism: clampScore(parsed.neuroticism),
    };
  } catch (err) {
    console.warn(`[${SERVICE}] extractOCEAN error:`, err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2. computeStylometrics
// ---------------------------------------------------------------------------

const FORMAL_MARKERS = new Set([
  'however', 'therefore', 'regarding', 'furthermore', 'consequently',
]);

const CASUAL_MARKERS = new Set([
  'lol', 'haha', 'yeah', 'gonna', 'wanna', 'kinda', 'nah', 'tbh', 'imo',
]);

const INTENSIFIERS = new Set(['so', 'really', 'very', 'absolutely']);

/**
 * Compute stylometric fingerprint from a user's recent conversation memories.
 * Pure computation — no LLM calls.
 *
 * @param {string} userId
 * @returns {Promise<{
 *   avg_sentence_length: number,
 *   vocabulary_richness: number,
 *   formality_score: number,
 *   emotional_expressiveness: number,
 *   humor_markers: number,
 *   punctuation_style: { exclamation: number, question: number, ellipsis: number, dash: number }
 * }|null>}
 */
export async function computeStylometrics(userId) {
  try {
    const { data: memories, error } = await supabaseAdmin
      .from('user_memories')
      .select('content')
      .eq('user_id', userId)
      .eq('memory_type', 'conversation')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.warn(`[${SERVICE}] computeStylometrics fetch error:`, error.message);
      return null;
    }

    if (!memories || memories.length === 0) {
      return null;
    }

    const fullText = memories.map((m) => m.content || '').join(' ');
    const words = fullText.split(/\s+/).filter(Boolean);
    const totalWords = words.length;

    if (totalWords === 0) {
      return null;
    }

    // avg_sentence_length
    const sentences = fullText.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
    const totalSentences = Math.max(sentences.length, 1);
    const avgSentenceLength =
      sentences.reduce((sum, s) => sum + s.split(/\s+/).filter(Boolean).length, 0) / totalSentences;

    // vocabulary_richness (type-token ratio)
    const lowerWords = words.map((w) => w.toLowerCase().replace(/[^a-z']/g, ''));
    const uniqueWords = new Set(lowerWords.filter(Boolean));
    const vocabularyRichness = uniqueWords.size / totalWords;

    // formality_score
    let formalCount = 0;
    let casualCount = 0;
    for (const w of lowerWords) {
      if (FORMAL_MARKERS.has(w)) formalCount++;
      if (CASUAL_MARKERS.has(w)) casualCount++;
    }
    const totalMarkers = formalCount + casualCount;
    const formalityScore = totalMarkers > 0 ? formalCount / totalMarkers : 0.5;

    // emotional_expressiveness
    const exclamationCount = (fullText.match(/!/g) || []).length;
    const allCapsWords = words.filter(
      (w) => w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w),
    ).length;
    let intensifierCount = 0;
    for (const w of lowerWords) {
      if (INTENSIFIERS.has(w)) intensifierCount++;
    }
    const emotionalExpressiveness = (exclamationCount + allCapsWords + intensifierCount) / totalWords;

    // humor_markers
    const humorPattern = /\b(lol|haha|lmao|joke|jokes|joking)\b|😂/gi;
    const humorMatches = (fullText.match(humorPattern) || []).length;
    const humorMarkers = humorMatches / totalSentences;

    // punctuation_style
    const punctuationStyle = {
      exclamation: (fullText.match(/!/g) || []).length,
      question: (fullText.match(/\?/g) || []).length,
      ellipsis: (fullText.match(/\.\.\./g) || []).length,
      dash: (fullText.match(/—|–|-{2}/g) || []).length,
    };

    return {
      avg_sentence_length: round3(avgSentenceLength),
      vocabulary_richness: round3(vocabularyRichness),
      formality_score: round3(formalityScore),
      emotional_expressiveness: round3(emotionalExpressiveness),
      humor_markers: round3(humorMarkers),
      punctuation_style: punctuationStyle,
    };
  } catch (err) {
    console.warn(`[${SERVICE}] computeStylometrics error:`, err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 3. deriveSamplingParams
// ---------------------------------------------------------------------------

/**
 * Map OCEAN scores to LLM sampling parameters for the twin's voice.
 *
 * Clamping ranges:
 *   temperature:       0.4 – 0.95
 *   top_p:             0.80 – 0.98
 *   frequency_penalty: 0.0 – 0.30
 *   presence_penalty:  0.0 – 0.30
 *
 * @param {{ openness, conscientiousness, extraversion, agreeableness, neuroticism }} ocean
 * @returns {{ temperature, top_p, frequency_penalty, presence_penalty }}
 */
export function deriveSamplingParams(ocean) {
  const temperature = clamp(
    0.5 + ocean.openness * 0.25 - ocean.conscientiousness * 0.15 + ocean.neuroticism * 0.05,
    0.4,
    0.95,
  );

  const top_p = clamp(
    0.85 + ocean.openness * 0.08 - ocean.conscientiousness * 0.05,
    0.8,
    0.98,
  );

  const frequency_penalty = clamp(
    ocean.extraversion * 0.2 - ocean.agreeableness * 0.1,
    0.0,
    0.3,
  );

  const presence_penalty = clamp(
    ocean.extraversion * 0.2,
    0.0,
    0.3,
  );

  return {
    temperature: round3(temperature),
    top_p: round3(top_p),
    frequency_penalty: round3(frequency_penalty),
    presence_penalty: round3(presence_penalty),
  };
}

// ---------------------------------------------------------------------------
// 4. buildPersonalityEmbedding
// ---------------------------------------------------------------------------

const DECAY_RATE = Math.log(2) / 7; // 7-day half-life ≈ 0.099

/**
 * Compute a personality embedding as the importance+recency weighted average
 * of the user's 100 most recent memory vectors, normalized to unit length.
 *
 * Weight formula: (importance_score / 10) * exp(-0.099 * days_old)
 *
 * @param {string} userId
 * @returns {Promise<number[]|null>} float[1536] unit vector, or null
 */
export async function buildPersonalityEmbedding(userId) {
  try {
    const { data: memories, error } = await supabaseAdmin
      .from('user_memories')
      .select('id, content, embedding, importance_score, created_at')
      .eq('user_id', userId)
      .not('embedding', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.warn(`[${SERVICE}] buildPersonalityEmbedding fetch error:`, error.message);
      return null;
    }

    if (!memories || memories.length === 0) {
      return null;
    }

    const now = Date.now();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    let centroid = null;
    let totalWeight = 0;

    for (const mem of memories) {
      // Parse embedding — pgvector returns "[0.1,0.2,...]" string or native array
      let vec;
      if (Array.isArray(mem.embedding)) {
        vec = mem.embedding;
      } else if (typeof mem.embedding === 'string') {
        const stripped = mem.embedding.replace(/^\[|\]$/g, '');
        vec = stripped.split(',').map(Number);
      } else {
        continue;
      }

      if (!vec.length) continue;

      const daysOld = (now - new Date(mem.created_at).getTime()) / MS_PER_DAY;
      const recencyFactor = Math.exp(-DECAY_RATE * daysOld);
      const importanceNorm = (mem.importance_score ?? 5) / 10;
      const weight = importanceNorm * recencyFactor;

      if (weight <= 0) continue;

      if (!centroid) {
        centroid = new Array(vec.length).fill(0);
      }

      for (let i = 0; i < vec.length; i++) {
        centroid[i] += vec[i] * weight;
      }
      totalWeight += weight;
    }

    if (!centroid || totalWeight === 0) {
      return null;
    }

    // Normalize to unit vector
    const magnitude = Math.sqrt(centroid.reduce((sum, v) => sum + v * v, 0));
    if (magnitude === 0) return null;

    return centroid.map((v) => v / magnitude);
  } catch (err) {
    console.warn(`[${SERVICE}] buildPersonalityEmbedding error:`, err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 5. buildProfile
// ---------------------------------------------------------------------------

/**
 * Orchestrate all personality signals and upsert to user_personality_profiles.
 * Runs extractOCEAN, computeStylometrics, and buildPersonalityEmbedding in parallel.
 * Returns null if OCEAN extraction fails (not enough memories).
 *
 * @param {string} userId
 * @returns {Promise<Object|null>}
 */
export async function buildProfile(userId) {
  try {
    // All three heavy operations run in parallel
    const [ocean, stylometrics, personalityEmbedding] = await Promise.all([
      extractOCEAN(userId),
      computeStylometrics(userId),
      buildPersonalityEmbedding(userId),
    ]);

    if (!ocean) {
      console.log(`[${SERVICE}] buildProfile: OCEAN null for user ${userId} — not enough memories`);
      return null;
    }

    const samplingParams = deriveSamplingParams(ocean);

    // Count total memories for confidence
    const { count: memoryCount } = await supabaseAdmin
      .from('user_memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    const totalMemories = memoryCount ?? 0;
    const confidence = Math.min(1.0, totalMemories / 100);

    const embeddingString = personalityEmbedding ? vectorToString(personalityEmbedding) : null;

    const styl = stylometrics ?? {};
    const profile = {
      user_id: userId,
      // OCEAN Big Five
      openness: ocean.openness,
      conscientiousness: ocean.conscientiousness,
      extraversion: ocean.extraversion,
      agreeableness: ocean.agreeableness,
      neuroticism: ocean.neuroticism,
      // Stylometrics
      avg_sentence_length: styl.avg_sentence_length ?? null,
      vocabulary_richness: styl.vocabulary_richness ?? null,
      formality_score: styl.formality_score ?? null,
      emotional_expressiveness: styl.emotional_expressiveness ?? null,
      humor_markers: styl.humor_markers ?? null,
      punctuation_style: styl.punctuation_style ?? {},
      // Sampling params
      temperature: samplingParams.temperature,
      top_p: samplingParams.top_p,
      frequency_penalty: samplingParams.frequency_penalty,
      presence_penalty: samplingParams.presence_penalty,
      // Embedding + metadata
      personality_embedding: embeddingString,
      memory_count_at_build: totalMemories,
      confidence,
      last_built_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabaseAdmin
      .from('user_personality_profiles')
      .upsert(profile, { onConflict: 'user_id' });

    if (upsertError) {
      console.warn(`[${SERVICE}] buildProfile upsert error:`, upsertError.message);
    }

    return profile;
  } catch (err) {
    console.warn(`[${SERVICE}] buildProfile error:`, err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 6. getProfile
// ---------------------------------------------------------------------------

const PROFILE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Return the cached personality profile if fresh (<12h), otherwise rebuild.
 *
 * @param {string} userId
 * @returns {Promise<Object|null>}
 */
export async function getProfile(userId) {
  try {
    const { data: existing, error } = await supabaseAdmin
      .from('user_personality_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    // PGRST116 = no rows found — expected for new users; all other errors are real
    if (error && error.code !== 'PGRST116') {
      console.warn(`[${SERVICE}] getProfile fetch error:`, error.message);
    }

    if (existing?.last_built_at) {
      const ageMs = Date.now() - new Date(existing.last_built_at).getTime();
      if (ageMs < PROFILE_TTL_MS) {
        return existing;
      }
    }

    return buildProfile(userId);
  } catch (err) {
    console.warn(`[${SERVICE}] getProfile error:`, err.message);
    return null;
  }
}
