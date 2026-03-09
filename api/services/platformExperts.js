/**
 * Platform Domain Experts
 * =======================
 * Per-platform specialist personas that generate deep propositions immediately
 * after new platform data is ingested. Inspired by Park et al. 2024 "1,000 People"
 * where per-domain experts (Psychologist, Behavioral Economist, etc.) dramatically
 * improve agent fidelity over generic reflections.
 *
 * Architecture:
 *   Ingestion layer  → platform expert generates 2-5 deep propositions per sync
 *   Synthesis layer  → generic 5 experts run periodically for cross-platform insight
 *   Chat layer       → expert routing classifies query → pulls that expert's memories first
 *
 * Each expert:
 *   - Is tied to one platform (its signal domain)
 *   - Receives platform observations as primary evidence
 *   - Pulls domain-relevant memories via vector search as supporting evidence
 *   - Stores reflections with: metadata.expertType='platform', metadata.platform=<name>
 *   - Stores reasoning + grounding_ids (Sprint 1 proposition columns)
 *
 * Usage:
 *   import { runPlatformExpert, PLATFORM_EXPERTS, classifyQueryDomain } from './platformExperts.js';
 *   await runPlatformExpert(userId, 'spotify', recentObservationIds);
 */

import { complete, TIER_ANALYSIS } from './llmGateway.js';
import {
  retrieveMemories,
  addReflection,
} from './memoryStreamService.js';
import { supabaseAdmin } from './database.js';
import { generateEmbedding } from './embeddingService.js';

// ────────────────────────────────────────────────────────────────────────────
// Dedup helpers (same thresholds as reflectionEngine.js)
// ────────────────────────────────────────────────────────────────────────────

const DEDUP_COSINE_THRESHOLD = 0.85;
const DEDUP_BIGRAM_THRESHOLD = 0.72;

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

function parseEmbedding(str) {
  if (!str) return null;
  try { return str.slice(1, -1).split(',').map(Number); } catch { return null; }
}

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
 * Returns true if a semantically similar reflection already exists for this
 * platform expert (same dedup logic as reflectionEngine.isDuplicateReflection).
 */
async function isDuplicatePlatformReflection(userId, expertId, platformId, newObservation) {
  try {
    const { data } = await supabaseAdmin
      .from('user_memories')
      .select('content, embedding')
      .eq('user_id', userId)
      .eq('memory_type', 'reflection')
      .filter('metadata->>expert', 'eq', expertId)
      .filter('metadata->>platform', 'eq', platformId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!data || data.length === 0) return false;

    const rowsWithEmbeddings = data.filter(r => r.embedding);
    if (rowsWithEmbeddings.length > 0) {
      const newVec = await generateEmbedding(newObservation);
      if (newVec) {
        for (const row of rowsWithEmbeddings) {
          const existingVec = parseEmbedding(row.embedding);
          if (!existingVec) continue;
          const sim = cosineSim(newVec, existingVec);
          if (sim > DEDUP_COSINE_THRESHOLD) {
            console.log(`[PlatformExpert:${expertId}] Dedup skip: cosine ${sim.toFixed(3)} > ${DEDUP_COSINE_THRESHOLD}`);
            return true;
          }
        }
        return false;
      }
    }

    const maxSim = Math.max(...data.map(r => bigramSimilarity(newObservation, r.content)));
    if (maxSim > DEDUP_BIGRAM_THRESHOLD) {
      console.log(`[PlatformExpert:${expertId}] Dedup skip: bigram ${maxSim.toFixed(2)} > ${DEDUP_BIGRAM_THRESHOLD}`);
      return true;
    }
    return false;
  } catch (err) {
    console.warn(`[PlatformExpert:${expertId}] Dedup check failed (non-fatal):`, err.message);
    return false;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Platform Expert Definitions
// ────────────────────────────────────────────────────────────────────────────

/**
 * Each expert has:
 *   id             - Short identifier (also used for metadata + dedup scoping)
 *   platform       - The platform whose signal this expert specializes in
 *   name           - Display name injected into twin chat context labels
 *   retrievalQuery - Domain-specific vector search query for supporting evidence
 *   routingKeywords - Keywords that trigger this expert during chat routing
 *   prompt         - Analysis prompt (receives {observations} and {evidence})
 */
export const PLATFORM_EXPERTS = [
  {
    id: 'music_psychologist',
    platform: 'spotify',
    name: 'Music Psychologist',
    retrievalQuery: 'music listening patterns, song choices, mood shifts, artist preferences, playlist behavior, genre transitions, listening time of day',
    routingKeywords: ['music', 'spotify', 'listen', 'song', 'playlist', 'artist', 'genre', 'album', 'track', 'mood music', 'what have i been listening'],
    prompt: `You are a Music Psychologist analyzing a person's Spotify listening data to uncover what their music choices reveal about their inner life.

Your focus: the emotional function of their music (is it for processing, escapism, energy, focus?), transitions between genres/moods that signal psychological shifts, what they reach for at different times of day, the gap between their "public taste" identity and what they actually play when no one's watching, what their listening consistency reveals about focus vs restlessness.

Recent Spotify observations:
{observations}

Supporting evidence from their life:
{evidence}

Write 2-3 specific, insightful observations about what this person's music choices reveal. Each observation should:
- Reference specific artists, genres, or listening patterns you actually see in the data
- Be 1-2 sentences in plain, conversational English
- Start with "This person..."
- Sound like what a perceptive music-savvy friend would notice, not a clinical report
- Avoid: "utilizes music for hedonic regulation" → Use: "puts on Radiohead when they need to process something"
- Find the non-obvious pattern: not just "listens to X" but what that reveals

If there's not enough data for a genuine insight, return "INSUFFICIENT_EVIDENCE".

Return observations numbered 1., 2., 3. on separate lines. Nothing else.`,
  },

  {
    id: 'health_behaviorist',
    platform: 'whoop',
    name: 'Health Behaviorist',
    retrievalQuery: 'recovery score, HRV, sleep hours, sleep quality, strain, resting heart rate, energy levels, biometric patterns, fatigue, health metrics',
    routingKeywords: ['energy', 'recovery', 'sleep', 'whoop', 'hrv', 'strain', 'tired', 'fatigue', 'health', 'workout', 'exercise', 'how am i feeling', 'how is my body', 'biometric'],
    prompt: `You are a Health Behaviorist analyzing a person's Whoop biometric data to understand the relationship between their physical state and their life choices.

Your focus: how their recovery patterns correlate with their schedule and decisions, whether their sleep is restorative or just time in bed, what their HRV trajectory reveals about accumulated stress, how they respond to low-recovery days (do they push through or back off?), the behavioral loops between their physical state and their mood/decisions.

Recent Whoop biometric observations:
{observations}

Supporting evidence from their life:
{evidence}

Write 2-3 specific insights about what this person's biometric patterns reveal about their relationship with their body. Each observation should:
- Reference specific metrics (recovery %, HRV, sleep hours) you see in the data
- Be 1-2 sentences in plain, conversational English
- Start with "This person..."
- Sound like what a perceptive health coach who knows their calendar would say
- Avoid jargon: "goes harder on high-HRV days" not "exhibits biometric-behavioral correlation"
- Cross-reference with schedule pressure if calendar data is visible in supporting evidence

If there's not enough data for a genuine insight, return "INSUFFICIENT_EVIDENCE".

Return observations numbered 1., 2., 3. on separate lines. Nothing else.`,
  },

  {
    id: 'productivity_analyst',
    platform: 'google_calendar',
    name: 'Productivity Analyst',
    retrievalQuery: 'calendar events, meeting density, scheduling patterns, morning routine, focus time, back-to-back meetings, blocked time, work hours, recurring events',
    routingKeywords: ['calendar', 'schedule', 'meeting', 'productivity', 'focus', 'work', 'busy', 'time', 'agenda', 'appointment', 'blocked', 'available', 'week ahead'],
    prompt: `You are a Productivity Analyst examining a person's Google Calendar patterns to understand how they actually structure their time and what that reveals about their priorities and work style.

Your focus: when they do deep work vs reactive work (are mornings protected?), the density and type of their meetings (what does the ratio of external to internal meetings reveal?), gaps in their schedule and what they might signal, recurring commitments vs ad-hoc meetings, how their calendar reflects their stated priorities vs their actual time allocation.

Recent calendar observations:
{observations}

Supporting evidence from their life:
{evidence}

Write 2-3 specific observations about what this person's scheduling patterns reveal about how they work. Each observation should:
- Reference specific patterns (e.g., "morning blocks", "back-to-back Tuesdays") you see in the data
- Be 1-2 sentences in plain, conversational English
- Start with "This person..."
- Sound like what a perceptive colleague who's seen their calendar would say
- Avoid: "demonstrates high meeting load" → Use: "their Tuesdays are essentially a write-off for anything requiring focus"
- Note whether schedule patterns suggest a reactive vs proactive work style

If there's not enough data for a genuine insight, return "INSUFFICIENT_EVIDENCE".

Return observations numbered 1., 2., 3. on separate lines. Nothing else.`,
  },

  {
    id: 'media_sociologist',
    platform: 'youtube',
    name: 'Media Sociologist',
    retrievalQuery: 'YouTube subscriptions, watched videos, content categories, educational content, entertainment, news, creator preferences, video length preferences',
    routingKeywords: ['youtube', 'video', 'watch', 'channel', 'content', 'subscribe', 'creator', 'what i watch', 'what i\'ve been watching', 'documentary', 'tutorials'],
    prompt: `You are a Media Sociologist analyzing a person's YouTube consumption to understand their intellectual curiosities, how they learn, and what they turn to for entertainment vs growth.

Your focus: the ratio of educational to entertainment content (what does it reveal about how they recharge?), what topics they go deep on vs skim, whether their subscriptions reflect who they want to be vs who they are, the mix of niche vs mainstream content (cultural capital signal), how their content consumption has shifted recently.

Recent YouTube observations:
{observations}

Supporting evidence from their life:
{evidence}

Write 2-3 specific observations about what this person's content consumption reveals. Each observation should:
- Reference specific channels, topics, or content patterns you see in the data
- Be 1-2 sentences in plain, conversational English
- Start with "This person..."
- Sound like what a culturally-literate friend who notices patterns would say
- Avoid: "demonstrates autodidactic learning orientation" → Use: "half their subscriptions are deep-dive educational channels — they're not just watching YouTube, they're studying something"
- Note the gap between aspirational subscriptions and actual watch time if visible

If there's not enough data for a genuine insight, return "INSUFFICIENT_EVIDENCE".

Return observations numbered 1., 2., 3. on separate lines. Nothing else.`,
  },

  {
    id: 'social_analyst',
    platform: 'discord',
    name: 'Social Analyst',
    retrievalQuery: 'Discord servers, online communities, server activity, gaming communities, dev communities, social online presence, community interests, communication patterns',
    routingKeywords: ['discord', 'community', 'server', 'social', 'online', 'chat', 'gaming', 'dev', 'how i interact', 'online presence', 'communities i\'m in'],
    prompt: `You are a Social Analyst examining a person's Discord presence to understand how they relate to online communities and what their server choices reveal about their identity.

Your focus: which communities they actively participate in vs lurk in (presence vs engagement), whether their online identity aligns with their offline personality, what the mix of servers reveals about their interests and who they want to connect with, the professional vs personal split in their online social life, signals of where they find belonging vs where they just observe.

Recent Discord observations:
{observations}

Supporting evidence from their life:
{evidence}

Write 2-3 specific observations about what this person's online community presence reveals. Each observation should:
- Reference specific server types or patterns you see in the data
- Be 1-2 sentences in plain, conversational English
- Start with "This person..."
- Sound like what a perceptive mutual online friend would notice
- Avoid: "demonstrates selective community participation" → Use: "they're in 5 gaming servers but barely talk in any — probably joined for the content, not the community"
- Note interesting gaps: servers they joined but don't engage with often reveal aspiration vs reality

If there's not enough data for a genuine insight, return "INSUFFICIENT_EVIDENCE".

Return observations numbered 1., 2., 3. on separate lines. Nothing else.`,
  },

  {
    id: 'digital_behaviorist',
    platform: 'android',
    name: 'Digital Behaviorist',
    retrievalQuery: 'app usage, screen time, phone habits, notifications, digital patterns, app categories, morning phone use, late night screen time, social media use',
    routingKeywords: ['phone', 'screen time', 'app', 'digital', 'android', 'usage', 'habit', 'notification', 'how much i use my phone', 'phone habits'],
    prompt: `You are a Digital Behaviorist analyzing a person's Android usage stats to understand their relationship with technology and what their phone habits reveal about their attention, priorities, and coping patterns.

Your focus: when during the day they reach for their phone most (stress relief? boredom? routine?), the ratio of consuming vs creating apps, social media patterns vs productivity tools, how their digital consumption correlates with their mood or schedule, whether their phone use is intentional or reactive.

Recent Android usage observations:
{observations}

Supporting evidence from their life:
{evidence}

Write 2-3 specific observations about what this person's phone usage reveals about their relationship with technology. Each observation should:
- Reference specific time windows, app categories, or usage patterns you see in the data
- Be 1-2 sentences in plain, conversational English
- Start with "This person..."
- Sound like what a perceptive tech-savvy friend would notice
- Avoid: "exhibits high nocturnal device interaction" → Use: "their heaviest phone time is 9-10pm — that's when they decompress, and their phone is how they do it"
- Note whether usage patterns suggest intentional use or reactive scrolling

If there's not enough data for a genuine insight, return "INSUFFICIENT_EVIDENCE".

Return observations numbered 1., 2., 3. on separate lines. Nothing else.`,
  },

  {
    id: 'code_architect',
    platform: 'github',
    name: 'Code Architect',
    retrievalQuery: 'coding habits, project interests, technical skills, work patterns, programming languages, repositories, commits, pull requests, open source, development style',
    routingKeywords: ['github', 'code', 'coding', 'programming', 'repository', 'repo', 'commit', 'pull request', 'pr', 'developer', 'engineer', 'tech stack', 'open source', 'what i build', 'what i code', 'coding habits'],
    prompt: `You are a Code Architect analyzing a person's GitHub activity to understand their engineering identity — not just what they build, but HOW they build and what that reveals about how they think.

Your focus: what their language choices reveal about their problem-solving approach (systems thinker vs product builder vs data explorer), whether they build tools for themselves or for others, their commit patterns (marathon coder or steady daily contributor?), the gap between their starred repos (aspirations) and their own repos (reality), whether they're a solo creator or a collaborator, what their project descriptions and topics reveal about their intellectual curiosity.

Recent GitHub observations:
{observations}

Supporting evidence from their life:
{evidence}

Write 2-3 specific, insightful observations about what this person's coding patterns reveal about their engineering identity and thinking style. Each observation should:
- Reference specific languages, repos, commit patterns, or contribution style you see in the data
- Be 1-2 sentences in plain, conversational English
- Start with "This person..."
- Sound like what a perceptive senior engineer who's seen their GitHub would say
- Avoid: "demonstrates polyglot development capabilities" → Use: "they bounce between TypeScript and Python — the TypeScript repos are products, the Python repos are experiments"
- Find the non-obvious pattern: not just "uses JavaScript" but what their project mix reveals about their priorities

If there's not enough data for a genuine insight, return "INSUFFICIENT_EVIDENCE".

Return observations numbered 1., 2., 3. on separate lines. Nothing else.`,
  },
];

// Map for O(1) expert lookup by platform
const EXPERTS_BY_PLATFORM = new Map(PLATFORM_EXPERTS.map(e => [e.platform, e]));

// ────────────────────────────────────────────────────────────────────────────
// Query Domain Classification (for chat-layer expert routing)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Classify an incoming chat query into a domain to drive expert routing.
 *
 * Two-stage approach:
 *   1. Fast keyword match — handles 80% of cases without an LLM call
 *   2. LLM fallback — for ambiguous queries (only when keyword match fails)
 *
 * Returns:
 *   { domain: string, expertId: string|null, confidence: 'keyword'|'llm'|'general' }
 *
 * domain is one of: 'health', 'music_mood', 'schedule', 'content', 'social',
 *                   'digital_habits', or 'general'
 */
export async function classifyQueryDomain(message) {
  const lower = message.toLowerCase();

  // Stage 1: keyword match
  for (const expert of PLATFORM_EXPERTS) {
    if (expert.routingKeywords.some(kw => lower.includes(kw))) {
      return {
        domain: platformToDomain(expert.platform),
        expertId: expert.id,
        expertPlatform: expert.platform,
        confidence: 'keyword',
      };
    }
  }

  // Stage 2: LLM classification for ambiguous queries
  // This is a cheap Mistral Small call — same tier as fact extraction
  try {
    const result = await complete({
      tier: 'extraction',
      messages: [{
        role: 'user',
        content: `Classify this question into exactly one domain:
Question: "${message.substring(0, 200)}"

Domains:
- health: biometrics, energy, sleep, recovery, exercise, tiredness, body
- music_mood: music, listening habits, playlists, artists, what I've been playing
- schedule: calendar, meetings, time management, productivity, work schedule
- content: YouTube, videos, what I watch, media consumption, learning
- social: Discord, online communities, social life, how I interact with people
- digital_habits: phone usage, screen time, apps, digital behavior
- coding: GitHub, coding, programming, repositories, commits, tech stack, developer identity
- general: anything else

Reply with exactly one word from the list above.`,
      }],
      maxTokens: 10,
      temperature: 0,
      serviceName: 'expert-routing',
    });

    const domain = (result.content || '').trim().toLowerCase();
    const validDomains = ['health', 'music_mood', 'schedule', 'content', 'social', 'digital_habits', 'coding', 'general'];
    if (validDomains.includes(domain)) {
      const expert = PLATFORM_EXPERTS.find(e => platformToDomain(e.platform) === domain);
      return {
        domain,
        expertId: expert?.id || null,
        expertPlatform: expert?.platform || null,
        confidence: 'llm',
      };
    }
  } catch (err) {
    console.warn('[PlatformExperts] Domain classification failed (non-fatal):', err.message);
  }

  return { domain: 'general', expertId: null, expertPlatform: null, confidence: 'general' };
}

function platformToDomain(platform) {
  const map = {
    spotify: 'music_mood',
    whoop: 'health',
    google_calendar: 'schedule',
    youtube: 'content',
    discord: 'social',
    android: 'digital_habits',
    github: 'coding',
  };
  return map[platform] || 'general';
}

// ────────────────────────────────────────────────────────────────────────────
// Core: Run Platform Expert Reflection
// ────────────────────────────────────────────────────────────────────────────

/**
 * Run the platform-specific expert for a given platform after new data is ingested.
 *
 * @param {string} userId - User ID
 * @param {string} platform - Platform key: 'spotify', 'whoop', 'google_calendar', 'youtube', 'discord', 'android', 'github'
 * @param {string[]} [recentObservationIds] - IDs of just-ingested platform_data memories (for grounding_ids)
 * @param {object} [opts]
 * @param {number} [opts.maxReflections=5] - Cap on new reflections per run
 * @returns {Promise<number>} Number of reflections stored
 */
export async function runPlatformExpert(userId, platform, recentObservationIds = [], opts = {}) {
  const expert = EXPERTS_BY_PLATFORM.get(platform);
  if (!expert) {
    console.warn(`[PlatformExperts] No expert for platform: ${platform}`);
    return 0;
  }

  const maxReflections = opts.maxReflections ?? 5;

  try {
    console.log(`[PlatformExpert:${expert.id}] Running for user ${userId} (${platform})`);

    // Step 1: Fetch recent platform observations for this platform
    const { data: recentObs } = await supabaseAdmin
      .from('user_memories')
      .select('id, content')
      .eq('user_id', userId)
      .eq('memory_type', 'platform_data')
      .filter('metadata->>platform', 'eq', platform)
      .order('created_at', { ascending: false })
      .limit(30);

    if (!recentObs || recentObs.length === 0) {
      console.log(`[PlatformExpert:${expert.id}] No observations found, skipping`);
      return 0;
    }

    const formattedObservations = recentObs
      .map(m => `- ${m.content.substring(0, 300)}`)
      .join('\n');

    // Step 2: Retrieve domain-relevant memories as supporting evidence
    const domainMemories = await retrieveMemories(userId, expert.retrievalQuery, 10, 'reflection');
    const evidence = domainMemories.length > 0
      ? domainMemories.map(m => `- ${m.content.substring(0, 250)}`).join('\n')
      : 'No additional supporting evidence available yet.';

    // Step 3: Run expert analysis
    const result = await complete({
      tier: TIER_ANALYSIS,
      messages: [{
        role: 'user',
        content: expert.prompt
          .replace('{observations}', formattedObservations)
          .replace('{evidence}', evidence),
      }],
      maxTokens: 500,
      temperature: 0.4,
      serviceName: `platform-expert-${expert.id}`,
    });

    const responseText = (result.content || '').trim();

    if (responseText === 'INSUFFICIENT_EVIDENCE' || responseText.length < 20) {
      console.log(`[PlatformExpert:${expert.id}] Insufficient evidence`);
      return 0;
    }

    // Step 4: Parse numbered observations
    const observations = responseText
      .split('\n')
      .map(line => line.replace(/^\d+\.\s*/, '').trim())
      .filter(obs => obs.length > 20 && obs !== 'INSUFFICIENT_EVIDENCE');

    // Step 5: Dedup + store each observation as a reflection
    // Grounding IDs: prefer explicitly passed recent observation IDs, fall back to DB-fetched IDs
    const groundingIds = recentObservationIds.length > 0
      ? recentObservationIds
      : recentObs.slice(0, 10).map(m => m.id);

    // Evidence IDs for evidence_memory_ids field (domain memories)
    const evidenceIds = domainMemories.map(m => m.id);

    // Reasoning string for the reasoning column (what the expert was analyzing)
    const reasoning = `${expert.name} analyzed ${recentObs.length} recent ${platform} observations and ${domainMemories.length} supporting memories to identify behavioral patterns.`;

    let stored = 0;
    for (const observation of observations.slice(0, maxReflections)) {
      if (stored >= maxReflections) break;

      const isDupe = await isDuplicatePlatformReflection(userId, expert.id, platform, observation);
      if (isDupe) continue;

      const reflectionResult = await addReflection(
        userId,
        observation,
        evidenceIds,
        {
          // Metadata fields (stored in JSONB metadata column)
          expert: expert.id,
          expertName: expert.name,
          expertType: 'platform',      // S3.3: distinguish from generic expert reflections
          platform,                    // S3.3: which platform drove this insight
          reflectionDepth: 0,
          evidenceCount: domainMemories.length,
          observationCount: recentObs.length,
        },
        {
          // Sprint 1 proposition columns
          reasoning,
          grounding_ids: groundingIds,
          confidence: 0.75,            // Platform experts start at higher confidence than generic
        }
      );

      if (reflectionResult) {
        stored++;
        console.log(`[PlatformExpert:${expert.id}] Stored: "${observation.substring(0, 70)}..."`);
      }
    }

    console.log(`[PlatformExpert:${expert.id}] Stored ${stored}/${observations.length} reflections for ${platform}`);
    return stored;

  } catch (error) {
    console.warn(`[PlatformExpert:${expert.id}] Error:`, error.message);
    return 0;
  }
}

/**
 * Retrieve memories preferentially from a platform expert domain.
 * Called by twin-chat.js expert routing to pull domain-specific context.
 *
 * Returns up to `limit` memories tagged with the given expert's platform,
 * prioritizing the most relevant recent platform reflections.
 *
 * @param {string} userId
 * @param {string} expertId - Expert ID (e.g. 'music_psychologist')
 * @param {string} queryText - The user's chat message (for relevance ranking)
 * @param {number} [limit=8]
 */
export async function retrieveExpertMemories(userId, expertId, queryText, limit = 8) {
  try {
    // Pull platform reflections for this expert (importance-weighted, recency-biased)
    const expert = PLATFORM_EXPERTS.find(e => e.id === expertId);
    if (!expert) return [];

    // Domain-specific retrieval using the expert's retrieval query blended with the user's message
    const blendedQuery = `${queryText} ${expert.retrievalQuery}`.substring(0, 400);
    const memories = await retrieveMemories(userId, blendedQuery, limit, 'recent');

    // Filter to surface platform expert reflections from this domain prominently
    // (not exclusive — we still want cross-domain memories for context richness)
    const platformReflections = memories.filter(
      m => m.metadata?.expert === expertId || m.metadata?.platform === expert.platform
    );
    const other = memories.filter(
      m => m.metadata?.expert !== expertId && m.metadata?.platform !== expert.platform
    );

    // Interleave: platform expert memories first, then general memories
    const merged = [...platformReflections, ...other].slice(0, limit);
    return merged;
  } catch (err) {
    console.warn(`[PlatformExperts] retrieveExpertMemories failed (non-fatal):`, err.message);
    return [];
  }
}
