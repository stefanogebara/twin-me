/**
 * Twin Summary Service
 * ====================
 * Dynamically generates an evolving personality summary for the user's twin,
 * inspired by the "Agent Summary Description" from Generative Agents (Park et al., UIST 2023)
 * and enhanced with expert reflection domains from Paper 2 (Park et al., 2024).
 *
 * Architecture:
 *   - Five parallel retrieval queries probe the memory stream, aligned with the
 *     expert reflection domains (personality, lifestyle, cultural identity,
 *     social dynamics, motivation).
 *   - Each set of memories is summarized by LLM (TIER_ANALYSIS / DeepSeek)
 *   - The five summaries are combined into a single natural paragraph
 *   - Cached in `twin_summaries` table; regenerated if older than 4 hours
 *
 * Usage:
 *   import { getTwinSummary } from './twinSummaryService.js';
 *   const summary = await getTwinSummary(userId);
 */

import { retrieveMemories } from './memoryStreamService.js';
import { complete, TIER_ANALYSIS } from './llmGateway.js';
import { supabaseAdmin } from './database.js';

const SUMMARY_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours

// In-memory lock: prevents concurrent regeneration for the same user.
// Maps userId -> pending Promise<generateTwinSummary result>.
// Concurrent callers join the in-progress generation instead of launching a new one.
const pendingGenerations = new Map();

/**
 * Summarize a set of retrieved memories into a concise description for a given aspect.
 *
 * @param {Array} memories - Retrieved memories from the memory stream
 * @param {string} aspect - What aspect to summarize (e.g., "core characteristics")
 * @param {string} userName - The user's name for context
 * @returns {string} A concise summary sentence
 */
async function summarizeMemories(memories, aspect, userName) {
  if (!memories || memories.length === 0) {
    return '';
  }

  const memoryText = memories
    .map(m => m.content)
    .join('\n- ');

  try {
    const result = await complete({
      tier: TIER_ANALYSIS,
      system: `You summarize memories about a person into a concise, natural-sounding description. Write in second person, addressing the person directly as "you" / "your". Be specific and use details from the memories. Output 1-2 sentences only, no bullet points. Only state things supported by the evidence.`,
      messages: [{
        role: 'user',
        content: `Based on these memories about ${userName}, write a concise summary of their ${aspect} (use "you/your" to address them directly):\n\n- ${memoryText}`
      }],
      maxTokens: 200,
      temperature: 0.5,
      serviceName: 'twinSummary-summarize'
    });

    return (result.content || '').trim();
  } catch (error) {
    console.warn(`[TwinSummary] Failed to summarize ${aspect}:`, error.message);
    return '';
  }
}

/**
 * Generate a fresh twin summary by querying the memory stream with five
 * parallel retrieval queries aligned to the expert reflection domains.
 *
 * @param {string} userId - User UUID
 * @param {string} userName - User's display name (defaults to 'This person')
 * @returns {object} { summary, personality, lifestyle, culturalIdentity, socialDynamics, motivation }
 */
async function generateTwinSummary(userId, userName = 'This person') {
  console.log(`[TwinSummary] Generating fresh summary for user ${userId}`);

  // Five parallel retrieval queries aligned to expert reflection domains
  // Using 'identity' weights: relevance dominant, low recency bias — who this person IS, not just what happened recently
  const [personalityMemories, lifestyleMemories, culturalMemories, socialMemories, motivationMemories] = await Promise.all([
    retrieveMemories(userId, `${userName}'s emotional patterns, personality traits, emotional regulation strategies, and psychological tendencies`, 25, 'identity'),
    retrieveMemories(userId, `${userName}'s daily routines, energy patterns, sleep habits, health metrics, and lifestyle rhythms`, 25, 'identity'),
    retrieveMemories(userId, `${userName}'s music taste, content preferences, aesthetic choices, cultural identity, and creative interests`, 25, 'identity'),
    retrieveMemories(userId, `${userName}'s communication style, social interactions, relationship patterns, and social energy`, 25, 'identity'),
    retrieveMemories(userId, `${userName}'s work patterns, goals, ambitions, motivation, productivity, and decision-making style`, 25, 'identity'),
  ]);

  // Summarize each domain in parallel
  const [personality, lifestyle, culturalIdentity, socialDynamicsRaw, motivation] = await Promise.all([
    summarizeMemories(personalityMemories, 'emotional patterns and personality', userName),
    summarizeMemories(lifestyleMemories, 'daily rhythms and lifestyle patterns', userName),
    summarizeMemories(culturalMemories, 'cultural identity and aesthetic preferences', userName),
    summarizeMemories(socialMemories, 'social dynamics and communication style', userName),
    summarizeMemories(motivationMemories, 'motivations and work patterns', userName),
  ]);

  // Social dynamics fallback: if primary retrieval returned no usable summary,
  // query memories tagged with the social_dynamics or social_analyst expert directly.
  let socialDynamics = socialDynamicsRaw;
  if (!socialDynamics || socialDynamics.length < 40) {
    try {
      // Supabase JS supports .or() with JSONB path filters via PostgREST syntax
      const { data: expertSocialRaw } = await supabaseAdmin
        .from('user_memories')
        .select('content')
        .eq('user_id', userId)
        .eq('memory_type', 'reflection')
        .or('metadata->>expert.eq.social_dynamics,metadata->>expert.eq.social_analyst')
        .order('created_at', { ascending: false })
        .limit(3);

      if (expertSocialRaw && expertSocialRaw.length > 0) {
        const fallbackMemories = expertSocialRaw.map(r => ({ content: r.content }));
        socialDynamics = await summarizeMemories(fallbackMemories, 'social dynamics and communication style', userName);
        console.log(`[TwinSummary] socialDynamics fallback from expert memories (${expertSocialRaw.length} found)`);
      }
    } catch (sdErr) {
      console.warn('[TwinSummary] socialDynamics expert fallback failed (non-fatal):', sdErr.message);
    }
  }

  // Fallback for empty/thin domains: pull from soul_signature_profile
  let filledCulturalIdentity = culturalIdentity;
  let filledLifestyle = lifestyle;
  if ((!culturalIdentity || culturalIdentity.length < 40) || (!lifestyle || lifestyle.length < 40)) {
    try {
      const { data: profile } = await supabaseAdmin
        .from('soul_signature_profile')
        .select('uniqueness_markers, archetype, music_signature')
        .eq('user_id', userId)
        .single();
      if (profile) {
        if (!culturalIdentity || culturalIdentity.length < 40) {
          const marker = Array.isArray(profile.uniqueness_markers) ? profile.uniqueness_markers[0] : null;
          if (marker) filledCulturalIdentity = marker;
        }
        if (!lifestyle || lifestyle.length < 40) {
          const archetype = profile.archetype || '';
          const genres = profile.music_signature?.top_genres?.join(', ') || '';
          const fallback = [archetype, genres].filter(Boolean).join(' — ');
          if (fallback.length >= 10) filledLifestyle = fallback;
        }
      }
    } catch (err) {
      console.warn('[TwinSummary] soul_signature_profile fallback failed:', err.message);
    }
  }

  // Combine into a single natural paragraph
  const parts = [personality, filledLifestyle, filledCulturalIdentity, socialDynamics, motivation].filter(Boolean);

  // Synthesis: eliminate repetition across domains via LLM
  let finalSummary = '';
  if (parts.length >= 2) {
    try {
      const synthesisResult = await complete({
        tier: TIER_ANALYSIS,
        system: 'Synthesize personality domain descriptions into a non-repetitive 2-3 sentence summary. Each sentence must add new information. No filler phrases.',
        messages: [{ role: 'user', content: `Synthesize:\n\n${parts.join('\n\n')}` }],
        maxTokens: 250,
        temperature: 0.4,
        serviceName: 'twinSummary-synthesize',
      });
      finalSummary = (synthesisResult.content || '').trim() || parts.join(' ');
    } catch (err) {
      console.warn('[TwinSummary] Synthesis failed, falling back to concatenation:', err.message);
      finalSummary = parts.join(' ');
    }
  } else {
    finalSummary = parts.length > 0 ? parts.join(' ') : '';
  }
  const summary = finalSummary;

  if (!summary) {
    console.log('[TwinSummary] No memories available to generate summary');
    return null;
  }

  const domains = { personality, lifestyle: filledLifestyle, culturalIdentity: filledCulturalIdentity, socialDynamics, motivation };

  // Persist to database (upsert)
  const { error: upsertErr } = await supabaseAdmin
    .from('twin_summaries')
    .upsert({
      user_id: userId,
      summary,
      core_traits: personality || null,
      current_focus: filledLifestyle || null,
      recent_feelings: filledCulturalIdentity || null,
      domains,
      generated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (upsertErr) {
    console.warn('[TwinSummary] Failed to persist summary:', upsertErr.message);
  } else {
    console.log(`[TwinSummary] Summary persisted (${summary.length} chars, ${parts.length} domains)`);
  }

  return { summary, personality, lifestyle: filledLifestyle, culturalIdentity: filledCulturalIdentity, socialDynamics, motivation };
}

/**
 * Get the twin summary for a user. Returns cached version if fresh enough
 * (< 4 hours old), otherwise generates a new one.
 *
 * @param {string} userId - User UUID
 * @param {string} userName - User's display name
 * @returns {string|null} The summary paragraph, or null if no data available
 */
async function getTwinSummary(userId, userName = 'This person') {
  if (!supabaseAdmin) return null;

  try {
    // Check for cached summary
    const { data: cached, error } = await supabaseAdmin
      .from('twin_summaries')
      .select('summary, generated_at')
      .eq('user_id', userId)
      .single();

    if (!error && cached && cached.summary) {
      const age = cached.generated_at ? Date.now() - new Date(cached.generated_at).getTime() : Infinity;
      if (age < SUMMARY_MAX_AGE_MS) {
        console.log(`[TwinSummary] Using cached summary (age: ${Math.round(age / 60000)}m)`);
        return cached.summary;
      }
      console.log(`[TwinSummary] Cached summary stale (age: ${Math.round(age / 3600000)}h), regenerating`);
    }

    // Join existing generation if another request is already running for this user
    if (pendingGenerations.has(userId)) {
      console.log(`[TwinSummary] Joining in-progress generation for ${userId}`);
      const result = await pendingGenerations.get(userId);
      return result?.summary || null;
    }

    // Start generation and register promise so concurrent callers can join it
    const generationPromise = generateTwinSummary(userId, userName)
      .finally(() => pendingGenerations.delete(userId));
    pendingGenerations.set(userId, generationPromise);
    const result = await generationPromise;
    return result?.summary || null;
  } catch (err) {
    pendingGenerations.delete(userId);
    console.warn('[TwinSummary] getTwinSummary error:', err.message);
    return null;
  }
}

/**
 * Get the twin summary with domain breakdowns.
 * Returns cached version if fresh (< 4h), otherwise generates new.
 *
 * @param {string} userId - User UUID
 * @param {string} userName - User's display name
 * @returns {{ summary: string, domains: object, generatedAt: string } | null}
 */
async function getTwinSummaryWithDomains(userId, userName = 'This person') {
  if (!supabaseAdmin) return null;

  try {
    const { data: cached, error } = await supabaseAdmin
      .from('twin_summaries')
      .select('summary, domains, generated_at')
      .eq('user_id', userId)
      .single();

    if (!error && cached && cached.summary) {
      const age = cached.generated_at ? Date.now() - new Date(cached.generated_at).getTime() : Infinity;
      const hasDomains = cached.domains && Object.keys(cached.domains).length > 0;
      if (age < SUMMARY_MAX_AGE_MS && hasDomains) {
        return {
          summary: cached.summary,
          domains: cached.domains,
          generatedAt: cached.generated_at,
        };
      }
    }

    // Join existing generation if another request is already running for this user
    if (pendingGenerations.has(userId)) {
      console.log(`[TwinSummary] Joining in-progress generation for ${userId}`);
      const result = await pendingGenerations.get(userId);
      if (!result) return null;
      return {
        summary: result.summary,
        domains: {
          personality: result.personality,
          lifestyle: result.lifestyle,
          culturalIdentity: result.culturalIdentity,
          socialDynamics: result.socialDynamics,
          motivation: result.motivation,
        },
        generatedAt: new Date().toISOString(),
      };
    }

    // Start generation and register promise so concurrent callers can join it
    const generationPromise = generateTwinSummary(userId, userName)
      .finally(() => pendingGenerations.delete(userId));
    pendingGenerations.set(userId, generationPromise);
    const result = await generationPromise;
    if (!result) return null;

    return {
      summary: result.summary,
      domains: {
        personality: result.personality,
        lifestyle: result.lifestyle,
        culturalIdentity: result.culturalIdentity,
        socialDynamics: result.socialDynamics,
        motivation: result.motivation,
      },
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    pendingGenerations.delete(userId);
    console.warn('[TwinSummary] getTwinSummaryWithDomains error:', err.message);
    return null;
  }
}

export { generateTwinSummary, getTwinSummary, getTwinSummaryWithDomains };
