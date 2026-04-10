/**
 * Soul Signature Service
 * ======================
 * Generates a 5-layer personality portrait from behavioral data.
 * Layers: Values, Rhythms, Taste, Connections, Growth Edges
 *
 * Uses LLM analysis of recent memories to produce natural-language
 * observations that feel like a perceptive friend describing you.
 *
 * Cached in DB with 12-hour TTL. Rebuilds when stale.
 *
 * Usage:
 *   import { generateSoulSignature } from './soulSignatureService.js';
 *   const portrait = await generateSoulSignature(userId);
 */

import { retrieveMemories, retrieveDiverseMemories } from './memoryStreamService.js';
import { complete, TIER_ANALYSIS } from './llmGateway.js';
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('SoulSignature5L');

// ====================================================================
// Constants
// ====================================================================

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const STALE_SERVE_MAX_MS = 48 * 60 * 60 * 1000; // 48 hours — serve stale while regenerating
const SERVICE_NAME = 'soul-signature-5layer';

// Minimum memories required to generate a meaningful signature
const MIN_MEMORIES_FOR_GENERATION = 10;

// ====================================================================
// LLM Prompts
// ====================================================================

const VALUES_PROMPT = `Based on these behavioral observations about a person, identify their top 3-5 core values from this list: Self-Direction, Stimulation, Hedonism, Achievement, Power, Security, Conformity, Tradition, Benevolence, Universalism, Curiosity, Creativity, Freedom, Connection, Growth.

For each value, provide:
1. The value name
2. A 1-2 sentence observation that sounds like a perceptive friend noticing this about them
3. Specific behavioral evidence from the data
4. A strength score from 0.0 to 1.0

Rules:
- Only identify values strongly supported by evidence
- Write in second person ("you consistently...")
- Be specific, not generic. Cite actual data points.
- Sound like a wise friend, not a psychologist

Respond in valid JSON format:
{ "values": [{ "name": "...", "evidence": "...", "strength": 0.0 }] }

Observations:
{memories}`;

const TASTE_PROMPT = `Based on these music, content, and cultural observations about a person, write a "taste signature" — a 2-3 sentence description of their aesthetic sensibility. Not a genre list, but a description of HOW they consume culture.

Also identify 3-5 top signals (specific artists, genres, content types, or patterns) and rate their taste diversity from 0.0 to 1.0 (0 = very narrow, 1 = extremely eclectic).

Rules:
- Write as if you're a perceptive friend describing their taste to someone else
- Be specific — mention actual artists, genres, or patterns
- Focus on what makes their taste unique, not what's mainstream about it
- Sound natural, not analytical

Respond in valid JSON format:
{ "statement": "...", "topSignals": ["...", "..."], "diversity": 0.0 }

Observations:
{memories}`;

const CONNECTIONS_PROMPT = `Based on these social, calendar, and communication observations about a person, describe their relationship patterns in 2-3 sentences.

Classify their style as one of: deep_connector, social_butterfly, selective_engager, lone_wolf, community_builder.

Also identify 2-4 specific patterns from the data.

Focus on:
- How they structure social time (dense vs sparse, one-on-one vs groups)
- Their social energy patterns (extroverted recovery, introvert recharge)
- What kind of communities they gravitate toward
- How they show care/connection

Rules:
- Write in second person
- Be specific, cite patterns from the data
- Sound like a friend who's noticed these patterns over months

Respond in valid JSON format:
{ "style": "...", "summary": "...", "patterns": ["...", "..."] }

Observations:
{memories}`;

const GROWTH_EDGES_PROMPT = `Compare these two sets of behavioral observations about a person:

RECENT (last 30 days):
{recent_memories}

BASELINE (30-90 days ago):
{baseline_memories}

Identify 1-3 meaningful shifts or changes. For each:
1. What domain shifted (music, schedule, social, work, health)
2. A 1-sentence description of the change
3. Whether this seems like growth, exploration, or stress response

If nothing meaningful changed, return an empty shifts array and set isStable to true with the summary "Your patterns have been remarkably consistent lately — you're in a steady state."

Rules:
- Only flag genuinely meaningful changes, not noise
- Be specific about what changed
- Sound like a friend noticing something, not a report

Respond in valid JSON format:
{ "shifts": [{ "domain": "...", "description": "...", "type": "growth|exploration|stress" }], "isStable": false, "summary": "..." }`;

// ====================================================================
// Layer Generators
// ====================================================================

/**
 * Layer 1: Values Signature
 * Identifies top core values from behavioral evidence using LLM.
 */
async function generateLayerValues(memories, userId) {
  const relevantMemories = memories.filter(m =>
    m.memory_type === 'platform_data' ||
    m.memory_type === 'fact' ||
    m.memory_type === 'reflection' ||
    m.memory_type === 'observation'
  );

  if (relevantMemories.length < 3) {
    return { values: [], _partial: true, _reason: 'insufficient_data' };
  }

  const memoryText = relevantMemories
    .slice(0, 80)
    .map(m => `- ${m.content}`)
    .join('\n');

  try {
    const result = await complete({
      tier: TIER_ANALYSIS,
      system: 'You are an expert personality analyst. Respond only in valid JSON.',
      messages: [{ role: 'user', content: VALUES_PROMPT.replace('{memories}', memoryText) }],
      maxTokens: 800,
      temperature: 0.4,
      userId,
      serviceName: `${SERVICE_NAME}:values`,
    });

    const parsed = parseJsonResponse(result.content);
    return parsed?.values ? { values: parsed.values } : { values: [], _partial: true, _reason: 'parse_error' };
  } catch (err) {
    log.warn('Values layer generation failed', { error: err });
    return { values: [], _partial: true, _reason: err.message };
  }
}

/**
 * Layer 2: Rhythms
 * Computes chronotype and peak hours algorithmically from timestamps.
 * No LLM needed.
 */
function generateLayerRhythms(memories) {
  const hourCounts = new Array(24).fill(0);
  let totalWithTimestamp = 0;

  for (const m of memories) {
    const ts = m.metadata?.timestamp || m.created_at;
    if (!ts) continue;

    const date = new Date(ts);
    if (isNaN(date.getTime())) continue;

    const hour = date.getUTCHours();
    hourCounts[hour]++;
    totalWithTimestamp++;
  }

  if (totalWithTimestamp < 5) {
    return {
      chronotype: 'unknown',
      peakHours: 'not enough data',
      summary: 'Not enough activity data to determine your rhythms yet.',
      patterns: [],
      _partial: true,
      _reason: 'insufficient_timestamps',
    };
  }

  // Find peak 4-hour window
  let maxSum = 0;
  let peakStart = 0;
  for (let start = 0; start < 24; start++) {
    let sum = 0;
    for (let offset = 0; offset < 4; offset++) {
      sum += hourCounts[(start + offset) % 24];
    }
    if (sum > maxSum) {
      maxSum = sum;
      peakStart = start;
    }
  }
  const peakEnd = (peakStart + 4) % 24;

  // Determine chronotype based on peak hours
  const chronotype = classifyChronotype(peakStart);
  const peakLabel = formatHourRange(peakStart, peakEnd);

  // Activity distribution patterns
  const patterns = [];
  const morningActivity = sumRange(hourCounts, 5, 12);
  const afternoonActivity = sumRange(hourCounts, 12, 17);
  const eveningActivity = sumRange(hourCounts, 17, 22);
  const nightActivity = sumRange(hourCounts, 22, 5);

  const total = morningActivity + afternoonActivity + eveningActivity + nightActivity || 1;

  if (morningActivity / total > 0.35) patterns.push('Strong morning activity pattern');
  if (eveningActivity / total > 0.35) patterns.push('Peak engagement in the evening');
  if (nightActivity / total > 0.25) patterns.push('Significant late-night activity');

  // Recovery pattern detection (gaps in activity)
  const quietHours = hourCounts.filter(c => c === 0).length;
  if (quietHours >= 6) patterns.push(`Clear rest period (${quietHours} quiet hours)`);

  const summary = buildRhythmSummary(chronotype, peakLabel, patterns);

  return { chronotype, peakHours: peakLabel, summary, patterns };
}

/**
 * Layer 3: Taste Signature
 * Uses LLM to generate a sensibility statement from cultural consumption data.
 */
async function generateLayerTaste(memories, userId) {
  const tasteMemories = memories.filter(m => {
    const content = (m.content || '').toLowerCase();
    const source = m.metadata?.source || m.metadata?.platform || '';
    return source === 'spotify' ||
      source === 'youtube' ||
      source === 'twitch' ||
      source === 'netflix' ||
      content.includes('music') ||
      content.includes('listen') ||
      content.includes('watch') ||
      content.includes('artist') ||
      content.includes('genre') ||
      content.includes('podcast') ||
      content.includes('show') ||
      content.includes('movie') ||
      content.includes('game');
  });

  if (tasteMemories.length < 3) {
    return {
      statement: 'Not enough cultural data to describe your taste yet.',
      topSignals: [],
      diversity: 0,
      _partial: true,
      _reason: 'insufficient_taste_data',
    };
  }

  const memoryText = tasteMemories
    .slice(0, 60)
    .map(m => `- ${m.content}`)
    .join('\n');

  try {
    const result = await complete({
      tier: TIER_ANALYSIS,
      system: 'You are a cultural taste analyst. Respond only in valid JSON.',
      messages: [{ role: 'user', content: TASTE_PROMPT.replace('{memories}', memoryText) }],
      maxTokens: 600,
      temperature: 0.5,
      userId,
      serviceName: `${SERVICE_NAME}:taste`,
    });

    const parsed = parseJsonResponse(result.content);
    if (parsed?.statement) {
      return {
        statement: parsed.statement,
        topSignals: parsed.topSignals || [],
        diversity: typeof parsed.diversity === 'number' ? parsed.diversity : 0.5,
      };
    }
    return { statement: '', topSignals: [], diversity: 0, _partial: true, _reason: 'parse_error' };
  } catch (err) {
    log.warn('Taste layer generation failed', { error: err });
    return { statement: '', topSignals: [], diversity: 0, _partial: true, _reason: err.message };
  }
}

/**
 * Layer 4: Connection Patterns
 * Uses LLM to describe relationship structure from social data.
 */
async function generateLayerConnections(memories, userId) {
  const socialMemories = memories.filter(m => {
    const content = (m.content || '').toLowerCase();
    const source = m.metadata?.source || m.metadata?.platform || '';
    return source === 'calendar' ||
      source === 'google_calendar' ||
      source === 'discord' ||
      source === 'whatsapp' ||
      m.memory_type === 'conversation' ||
      content.includes('meet') ||
      content.includes('call') ||
      content.includes('friend') ||
      content.includes('social') ||
      content.includes('group') ||
      content.includes('community') ||
      content.includes('event') ||
      content.includes('chat');
  });

  if (socialMemories.length < 3) {
    return {
      style: 'unknown',
      summary: 'Not enough social data to describe your connection patterns yet.',
      patterns: [],
      _partial: true,
      _reason: 'insufficient_social_data',
    };
  }

  const memoryText = socialMemories
    .slice(0, 60)
    .map(m => `- ${m.content}`)
    .join('\n');

  try {
    const result = await complete({
      tier: TIER_ANALYSIS,
      system: 'You are a social dynamics analyst. Respond only in valid JSON.',
      messages: [{ role: 'user', content: CONNECTIONS_PROMPT.replace('{memories}', memoryText) }],
      maxTokens: 600,
      temperature: 0.4,
      userId,
      serviceName: `${SERVICE_NAME}:connections`,
    });

    const parsed = parseJsonResponse(result.content);
    if (parsed?.summary) {
      return {
        style: parsed.style || 'unknown',
        summary: parsed.summary,
        patterns: parsed.patterns || [],
      };
    }
    return { style: 'unknown', summary: '', patterns: [], _partial: true, _reason: 'parse_error' };
  } catch (err) {
    log.warn('Connections layer generation failed', { error: err });
    return { style: 'unknown', summary: '', patterns: [], _partial: true, _reason: err.message };
  }
}

/**
 * Layer 5: Growth Edges
 * Compares recent vs baseline memories to identify meaningful shifts.
 */
async function generateLayerGrowthEdges(userId) {
  if (!supabaseAdmin) {
    return { shifts: [], isStable: true, summary: 'Database unavailable.', _partial: true };
  }

  const SELECT_COLS = 'id, content, memory_type, importance_score, metadata, created_at';
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  try {
    const [recentResult, baselineResult] = await Promise.all([
      // Recent: last 30 days
      supabaseAdmin
        .from('user_memories')
        .select(SELECT_COLS)
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('importance_score', { ascending: false })
        .limit(50),

      // Baseline: 30-90 days ago
      supabaseAdmin
        .from('user_memories')
        .select(SELECT_COLS)
        .eq('user_id', userId)
        .gte('created_at', ninetyDaysAgo.toISOString())
        .lt('created_at', thirtyDaysAgo.toISOString())
        .order('importance_score', { ascending: false })
        .limit(50),
    ]);

    const recentMemories = recentResult.data || [];
    const baselineMemories = baselineResult.data || [];

    if (recentMemories.length < 3 || baselineMemories.length < 3) {
      return {
        shifts: [],
        isStable: true,
        summary: 'Not enough historical data to detect growth patterns yet.',
        _partial: true,
        _reason: 'insufficient_temporal_data',
      };
    }

    const recentText = recentMemories.map(m => `- ${m.content}`).join('\n');
    const baselineText = baselineMemories.map(m => `- ${m.content}`).join('\n');

    const result = await complete({
      tier: TIER_ANALYSIS,
      system: 'You are a personal growth analyst. Respond only in valid JSON.',
      messages: [{
        role: 'user',
        content: GROWTH_EDGES_PROMPT
          .replace('{recent_memories}', recentText)
          .replace('{baseline_memories}', baselineText),
      }],
      maxTokens: 600,
      temperature: 0.4,
      userId,
      serviceName: `${SERVICE_NAME}:growth`,
    });

    const parsed = parseJsonResponse(result.content);
    if (parsed) {
      return {
        shifts: parsed.shifts || [],
        isStable: parsed.isStable ?? (parsed.shifts?.length === 0),
        summary: parsed.summary || '',
      };
    }
    return { shifts: [], isStable: true, summary: '', _partial: true, _reason: 'parse_error' };
  } catch (err) {
    log.warn('Growth edges layer generation failed', { error: err });
    return { shifts: [], isStable: true, summary: '', _partial: true, _reason: err.message };
  }
}

// ====================================================================
// Unified LLM Generation (single call for all 4 LLM layers)
// ====================================================================

const UNIFIED_PROMPT = `You are analyzing behavioral data about a person to create a personality portrait. Based on the observations below, generate ALL of the following in a single JSON response.

OBSERVATIONS:
{memories}

Generate this JSON (all fields required):
{
  "values": {
    "values": [
      { "name": "<value name from: Self-Direction, Curiosity, Achievement, Growth, Connection, Creativity, Freedom, Benevolence, Stimulation, Security>", "evidence": "<1-2 sentences, second person, specific>", "strength": <0.0-1.0> }
    ]
  },
  "taste": {
    "statement": "<2-3 sentence description of their aesthetic sensibility — how they consume culture, not a genre list>",
    "topSignals": ["<specific artist, genre, or pattern>", "..."],
    "diversity": <0.0-1.0>
  },
  "connections": {
    "style": "<one of: deep_connector, social_butterfly, selective_engager, lone_wolf, community_builder>",
    "summary": "<2-3 sentences about their relationship patterns>",
    "patterns": ["<specific pattern>", "..."]
  },
  "growthEdges": {
    "shifts": [
      { "domain": "<music|schedule|social|work|health>", "description": "<1 sentence>", "type": "<growth|exploration|stress>" }
    ],
    "isStable": <true if no meaningful shifts>,
    "summary": "<1 sentence overall>"
  }
}

Rules:
- Write in second person ("you consistently...", "your taste runs toward...")
- Be SPECIFIC — cite actual data points, artists, patterns from the observations
- Sound like a perceptive friend who's been watching for months, NOT a psychologist
- For values: only include 3-5 with strong behavioral evidence
- For taste: describe sensibility, not just list genres
- For connections: focus on structure (small circle vs broad, 1:1 vs groups, recovery patterns)
- For growth: only flag genuinely meaningful changes. If stable, say so.
- Keep each section very concise. 1-2 sentences per field. Total response under 800 tokens.`;

/**
 * Generate all 4 LLM-dependent layers in a single call.
 * ~10x faster than 4 parallel calls, fits within Vercel 60s timeout.
 */
async function generateAllLlmLayers(memories, userId) {
  // Stratified sample: guarantee platform/taste/social data reaches the LLM.
  // Sorting top-25 by importance lets reflections (score 7-9) crowd out platform_data,
  // leaving taste and connections layers with no input to work from.
  const byType = {};
  for (const m of memories) {
    const t = m.memory_type || 'other';
    if (!byType[t]) byType[t] = [];
    byType[t].push(m);
  }
  const topN = (arr = [], n) =>
    [...arr].sort((a, b) => (b.importance_score || 0) - (a.importance_score || 0)).slice(0, n);

  const sample = [
    ...topN(byType.platform_data, 10),  // cultural/taste/social signals
    ...topN(byType.reflection, 8),       // synthesised personality insights
    ...topN(byType.fact, 5),             // stated facts about the user
    ...topN(byType.conversation, 4),     // communication style
    ...topN(byType.observation, 3),      // raw observations
  ];

  const memoryText = sample
    .map(m => `[${m.memory_type}] ${m.content.substring(0, 150)}`)
    .join('\n');

  try {
    const result = await complete({
      tier: TIER_ANALYSIS,
      system: 'You are an expert personality analyst. Respond ONLY in valid JSON. No markdown code fences. No explanation text.',
      messages: [{ role: 'user', content: UNIFIED_PROMPT.replace('{memories}', memoryText) }],
      maxTokens: 1500,
      temperature: 0.5,
      userId,
      serviceName: `${SERVICE_NAME}:unified`,
    });

    const parsed = parseJsonResponse(result.content);
    if (!parsed) {
      log.warn('Unified LLM response failed to parse', { userId, content: result.content?.substring(0, 200) });
      return {};
    }

    log.info('Unified LLM layers generated', {
      userId,
      valuesCount: parsed.values?.values?.length || 0,
      tasteLen: parsed.taste?.statement?.length || 0,
      connectionStyle: parsed.connections?.style,
      growthShifts: parsed.growthEdges?.shifts?.length || 0,
    });

    return parsed;
  } catch (err) {
    log.error('Unified LLM generation failed', { userId, error: err.message });
    return {};
  }
}

// ====================================================================
// Main Generator
// ====================================================================

// In-memory lock to prevent concurrent generation for the same user
const pendingGenerations = new Map();

/**
 * Generate the 5-layer Soul Signature for a user.
 * Checks cache first (12h TTL). If stale, regenerates.
 *
 * @param {string} userId - User UUID
 * @returns {Object} { layers, generatedAt, cached } or partial result on failures
 */
export async function generateSoulSignature(userId) {
  if (!userId) {
    throw new Error('userId is required');
  }

  if (!supabaseAdmin) {
    throw new Error('Database not available');
  }

  // Check cache
  const cached = await getCachedSignature(userId);
  if (cached) {
    // If stale, serve immediately but trigger background regen (fire-and-forget)
    if (cached._stale) {
      log.info('Serving stale cache, triggering background regen', { userId });
      // Fire-and-forget: don't await — user gets instant response
      doGenerate(userId).catch(err => log.warn('Background regen failed', { error: err.message }));
    }
    return { layers: cached.layers, generatedAt: cached.generatedAt, cached: true };
  }

  // Join an in-progress generation if one exists (prevents thundering herd)
  if (pendingGenerations.has(userId)) {
    log.info('Joining in-progress generation', { userId });
    return pendingGenerations.get(userId);
  }

  const generationPromise = doGenerate(userId);
  pendingGenerations.set(userId, generationPromise);

  try {
    const result = await generationPromise;
    return result;
  } finally {
    pendingGenerations.delete(userId);
  }
}

/**
 * Internal generation logic — fetches memories, runs all layers, caches result.
 */
async function doGenerate(userId) {
  log.info('Generating 5-layer soul signature', { userId });
  const startTime = Date.now();

  // Fetch diverse memories (200+, all types)
  const allMemories = await fetchAllMemories(userId);

  if (allMemories.length < MIN_MEMORIES_FOR_GENERATION) {
    log.info('Insufficient memories for soul signature', { count: allMemories.length, min: MIN_MEMORIES_FOR_GENERATION });
    return {
      layers: null,
      generatedAt: new Date().toISOString(),
      cached: false,
      insufficient: true,
      memoryCount: allMemories.length,
    };
  }

  // Rhythms is algorithmic (instant, no LLM)
  const rhythmsLayer = generateLayerRhythms(allMemories);

  // Single unified LLM call for Values + Taste + Connections + Growth Edges
  // This is faster and cheaper than 4 separate calls, and fits within Vercel's 60s timeout
  const llmLayers = await generateAllLlmLayers(allMemories, userId);

  const layers = {
    values: llmLayers.values || { values: [], _partial: true },
    rhythms: rhythmsLayer,
    taste: llmLayers.taste || { statement: '', topSignals: [], diversity: 0 },
    connections: llmLayers.connections || { style: 'unknown', summary: '', patterns: [] },
    growthEdges: llmLayers.growthEdges || { shifts: [], isStable: true, summary: '' },
  };

  const generatedAt = new Date().toISOString();
  const latencyMs = Date.now() - startTime;

  log.info('Soul signature generated', {
    userId,
    latencyMs,
    valuesCount: layers.values?.values?.length || 0,
    chronotype: layers.rhythms?.chronotype,
    tasteLen: layers.taste?.statement?.length || 0,
    connectionStyle: layers.connections?.style,
    growthShifts: layers.growthEdges?.shifts?.length || 0,
    anyPartial: hasPartialLayers(layers),
  });

  // Cache result
  await cacheSignature(userId, layers, generatedAt);

  return { layers, generatedAt, cached: false };
}

// ====================================================================
// Memory Fetching
// ====================================================================

/**
 * Fetch a broad, diverse set of memories for signature generation.
 * Uses both vector search and direct queries for maximum coverage.
 */
async function fetchAllMemories(userId) {
  const SELECT_COLS = 'id, content, memory_type, importance_score, metadata, created_at, last_accessed_at';

  try {
    // Parallel fetch: semantic search + direct queries by type
    const [
      semanticResults,
      factResults,
      platformResults,
      conversationResults,
      observationResults,
    ] = await Promise.all([
      // Semantic search with a broad query
      retrieveMemories(userId, 'personality values habits interests lifestyle patterns', 50, 'identity', { skipHyDE: true })
        .catch(err => {
          log.warn('Semantic memory fetch failed', { error: err });
          return [];
        }),

      // Facts by importance
      supabaseAdmin
        .from('user_memories')
        .select(SELECT_COLS)
        .eq('user_id', userId)
        .eq('memory_type', 'fact')
        .order('importance_score', { ascending: false })
        .limit(50)
        .then(r => r.data || []),

      // Platform data by recency
      supabaseAdmin
        .from('user_memories')
        .select(SELECT_COLS)
        .eq('user_id', userId)
        .eq('memory_type', 'platform_data')
        .order('created_at', { ascending: false })
        .limit(50)
        .then(r => r.data || []),

      // Conversations by importance
      supabaseAdmin
        .from('user_memories')
        .select(SELECT_COLS)
        .eq('user_id', userId)
        .eq('memory_type', 'conversation')
        .order('importance_score', { ascending: false })
        .limit(30)
        .then(r => r.data || []),

      // Observations by recency
      supabaseAdmin
        .from('user_memories')
        .select(SELECT_COLS)
        .eq('user_id', userId)
        .eq('memory_type', 'observation')
        .order('created_at', { ascending: false })
        .limit(30)
        .then(r => r.data || []),
    ]);

    // Merge and deduplicate by id
    const seen = new Set();
    const merged = [];
    for (const m of [...semanticResults, ...factResults, ...platformResults, ...conversationResults, ...observationResults]) {
      if (m.id && !seen.has(m.id)) {
        seen.add(m.id);
        merged.push(m);
      }
    }

    log.info('Fetched memories for signature', {
      userId,
      total: merged.length,
      semantic: semanticResults.length,
      facts: factResults.length,
      platform: platformResults.length,
      conversations: conversationResults.length,
      observations: observationResults.length,
    });

    return merged;
  } catch (err) {
    log.error('Failed to fetch memories for signature', { error: err, userId });
    return [];
  }
}

// ====================================================================
// Cache Layer (soul_signature_layers table)
// ====================================================================

/**
 * Get cached signature if fresh enough (< 12h).
 * Serves stale data up to 48h while regeneration can happen in background.
 */
async function getCachedSignature(userId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('soul_signature_layers')
      .select('layers, generated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      // Table might not exist yet — log and return null
      if (error.code === '42P01') {
        log.warn('soul_signature_layers table does not exist yet');
        return null;
      }
      log.warn('Cache read error', { error });
      return null;
    }

    if (!data?.layers || !data?.generated_at) return null;

    const age = Date.now() - new Date(data.generated_at).getTime();

    if (age < CACHE_TTL_MS) {
      log.info('Cache HIT (fresh)', { userId, ageMinutes: Math.round(age / 60000) });
      return { layers: data.layers, generatedAt: data.generated_at };
    }

    if (age < STALE_SERVE_MAX_MS) {
      log.info('Cache HIT (stale, serving stale + background regen)', { userId, ageHours: Math.round(age / 3600000) });
      // Return stale data immediately — caller sees instant response
      // Mark as stale so the caller can trigger background regeneration
      return { layers: data.layers, generatedAt: data.generated_at, _stale: true };
    }

    log.info('Cache EXPIRED (beyond stale window)', { userId });
    return null;
  } catch (err) {
    log.warn('Cache lookup failed', { error: err });
    return null;
  }
}

/**
 * Cache the generated signature via upsert.
 */
async function cacheSignature(userId, layers, generatedAt) {
  try {
    const { error } = await supabaseAdmin
      .from('soul_signature_layers')
      .upsert({
        user_id: userId,
        layers,
        generated_at: generatedAt,
      }, { onConflict: 'user_id' });

    if (error) {
      // Table doesn't exist yet — warn but don't crash
      if (error.code === '42P01') {
        log.warn('soul_signature_layers table does not exist — run migration to enable caching');
        return;
      }
      log.warn('Cache write error', { error });
    } else {
      log.info('Signature cached', { userId });
    }
  } catch (err) {
    log.warn('Cache write failed', { error: err });
  }
}

// ====================================================================
// Helpers
// ====================================================================

/**
 * Parse JSON from LLM response, handling markdown fences and partial JSON.
 */
function parseJsonResponse(text) {
  if (!text) return null;

  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract JSON from within the text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        log.warn('Failed to parse JSON from LLM response', { text: text.substring(0, 200) });
        return null;
      }
    }
    log.warn('No JSON found in LLM response', { text: text.substring(0, 200) });
    return null;
  }
}

/**
 * Classify chronotype from peak activity start hour.
 */
function classifyChronotype(peakStart) {
  if (peakStart >= 5 && peakStart < 9) return 'early_bird';
  if (peakStart >= 9 && peakStart < 14) return 'mid_day';
  if (peakStart >= 14 && peakStart < 18) return 'afternoon';
  if (peakStart >= 18 && peakStart < 22) return 'evening';
  return 'night_owl';
}

/**
 * Format hour range as human-readable string (e.g., "10pm-2am").
 */
function formatHourRange(start, end) {
  const fmt = (h) => {
    const period = h >= 12 ? 'pm' : 'am';
    const hour12 = h % 12 || 12;
    return `${hour12}${period}`;
  };
  return `${fmt(start)}-${fmt(end)}`;
}

/**
 * Sum hourCounts for a range of hours (handles wraparound).
 */
function sumRange(hourCounts, from, to) {
  let sum = 0;
  if (from < to) {
    for (let i = from; i < to; i++) sum += hourCounts[i];
  } else {
    // Wraparound (e.g., 22 to 5)
    for (let i = from; i < 24; i++) sum += hourCounts[i];
    for (let i = 0; i < to; i++) sum += hourCounts[i];
  }
  return sum;
}

/**
 * Build a natural-language summary for the Rhythms layer.
 */
function buildRhythmSummary(chronotype, peakLabel, patterns) {
  const typeDescriptions = {
    early_bird: 'You are an early riser — your most active hours start before the world wakes up.',
    mid_day: 'Your best work happens during the traditional workday hours.',
    afternoon: 'You hit your stride in the afternoon, when most people start winding down.',
    evening: 'Your energy peaks in the evening — you come alive when the sun goes down.',
    night_owl: 'You are a night owl — your peak creative window is well past midnight.',
  };

  const base = typeDescriptions[chronotype] || `Your peak activity window is ${peakLabel}.`;
  const extras = patterns.length > 0 ? ` ${patterns[0]}.` : '';
  return base + extras;
}

/**
 * Check if any layer has a _partial flag indicating incomplete data.
 */
function hasPartialLayers(layers) {
  return Object.values(layers).some(layer => layer?._partial === true);
}

export default { generateSoulSignature };
