/**
 * Proactive Insight Generation Service
 * =====================================
 * TwinMe's equivalent of the Generative Agents "Planning" system.
 * Instead of planning daily schedules, the twin generates proactive insights
 * it can share when the user next chats.
 *
 * Examples:
 *   - "I noticed your recovery has been trending down for 3 days straight"
 *   - "You've been listening to a lot of ambient music lately - usually that means you're in deep focus mode"
 *   - "Your calendar is packed this week but your recovery is only 45% - might want to find some downtime"
 *
 * Architecture:
 *   1. After observation ingestion, generateProactiveInsights() is called
 *   2. It pulls recent memories + reflections from the memory stream
 *   3. An LLM generates 1-3 conversational insights
 *   4. Insights are stored in `proactive_insights` table
 *   5. When twin-chat builds context, undelivered insights are injected
 *   6. After the twin responds, insights are marked as delivered
 */

import { getRecentMemories, retrieveMemories } from './memoryStreamService.js';
import { complete, TIER_ANALYSIS } from './llmGateway.js';
import { sendPushToUser } from './pushNotificationService.js';
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';
import { scoreForInsightSelection } from './inSilicoEngine.js';

const log = createLogger('ProactiveInsights');

// Import the research-tuned prompt template and parameters
import { INSIGHT_PROMPT_TEMPLATE, INSIGHT_TEMPERATURE, INSIGHT_MAX_TOKENS, MEMORIES_TO_SCAN, REFLECTIONS_TO_INCLUDE, DEDUP_THRESHOLD } from '../../twin-research/insight-config.js';

// Wrap the research template with nudge enforcement (production requirement)
const INSIGHT_GENERATION_PROMPT = `${INSIGHT_PROMPT_TEMPLATE}

ADDITIONAL PRODUCTION REQUIREMENT:
The FIRST insight in the array MUST have category "nudge" with a nudge_action field.
A "nudge" is a specific micro-action suggestion (e.g., "block 30 min of focus time tomorrow at 9am").
If generating 3 insights: 1 nudge + 2 others (trend/anomaly/celebration/concern).`;

/**
 * Extract significant keywords from insight text for topic-based dedup.
 * Strips common filler words and returns the distinctive content words.
 */
function _extractKeywords(text) {
  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
    'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
    'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most',
    'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too',
    'very', 'just', 'because', 'if', 'when', 'while', 'that', 'this',
    'these', 'those', 'it', 'its', 'you', 'your', 'youre', 'youve',
    'i', 'me', 'my', 'we', 'our', 'they', 'their', 'he', 'she', 'him',
    'her', 'who', 'what', 'which', 'where', 'how', 'why', 'like', 'got',
    'get', 'gets', 'getting', 'been', 'about', 'also', 'back', 'still',
    'even', 'well', 'much', 'then', 'here', 'there', 'really', 'pretty',
    'something', 'thing', 'things', 'going', 'know', 'feel', 'feels',
    'feeling', 'kind', 'sort', 'try', 'let', 'lets', 'maybe', 'hey',
    'hey', 'perfect', 'right', 'keep', 'make', 'want', 'turn', 'start',
  ]);
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Extract proper-noun-like words from text (capitalized words that aren't
 * at the start of a sentence). Used for topic-level dedup: if both insights
 * mention "Keinemusik" or "Radiohead", they're likely about the same thing.
 */
function _extractProperNouns(text) {
  // Split on sentence boundaries, then extract capitalized words that aren't sentence-initial
  const words = text.replace(/[""*_]/g, '').split(/\s+/);
  const properNouns = [];
  for (let i = 1; i < words.length; i++) {
    const w = words[i].replace(/[^a-zA-Z]/g, '');
    // Capitalized, 4+ chars, not after sentence-ending punctuation
    if (w.length >= 4 && /^[A-Z]/.test(w) && !/[.!?]$/.test(words[i - 1])) {
      properNouns.push(w.toLowerCase());
    }
  }
  return [...new Set(properNouns)];
}

/**
 * Compute Jaccard similarity between two keyword sets.
 * Returns value between 0 (no overlap) and 1 (identical).
 */
function _keywordSimilarity(keywords1, keywords2) {
  if (keywords1.length === 0 || keywords2.length === 0) return 0;
  const set1 = new Set(keywords1);
  const set2 = new Set(keywords2);
  let intersection = 0;
  for (const w of set1) {
    if (set2.has(w)) intersection++;
  }
  const union = new Set([...set1, ...set2]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Check if a similar insight was already generated recently.
 * Uses three-layer dedup:
 *   1. Exact 60-char prefix match (catches identical starts)
 *   2. Keyword Jaccard similarity > 0.35 (catches paraphrased duplicates)
 *   3. Per-category cooldown (max 1 per category per CATEGORY_COOLDOWN_HOURS)
 */
const CATEGORY_COOLDOWN_HOURS = {
  music_mood_match: 6,
  nudge: 4,
  trend: 12,
  anomaly: 6,
  celebration: 12,
  concern: 6,
  goal_progress: 6,
  goal_suggestion: 12,
  briefing: 20,
  evening_recap: 20,
  email_triage: 6,
  wiki_lint: 24, // Wiki lint findings: max 1 per 24h
  meeting_prep: 4, // Meeting briefings: max 1 per event per 4h
};
const DEFAULT_CATEGORY_COOLDOWN = 4;

async function isInsightDuplicate(userId, insightText, category = null) {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    // Check ALL insights from last 7 days — not just undelivered.
    // Previously only checked delivered=false, so delivered insights got regenerated.
    const { data } = await supabaseAdmin
      .from('proactive_insights')
      .select('insight, category, created_at')
      .eq('user_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200);
    if (!data?.length) return false;

    // Layer 1: Exact 60-char prefix match (fast path)
    const snippet = insightText.substring(0, 60).toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const prefixMatch = data.some(r => {
      const existing = (r.insight || '').substring(0, 60).toLowerCase().replace(/[^a-z0-9\s]/g, '');
      return existing === snippet;
    });
    if (prefixMatch) return true;

    // Layer 2: Keyword similarity (catches paraphrased duplicates)
    // Uses Jaccard > 0.30 OR shared proper-noun-like words (capitalized in original) > 1
    const newKeywords = _extractKeywords(insightText);
    const newProperNouns = _extractProperNouns(insightText);
    if (newKeywords.length >= 3) {
      const isSimilar = data.some(r => {
        const existingKeywords = _extractKeywords(r.insight || '');
        const jaccardSim = _keywordSimilarity(newKeywords, existingKeywords);
        if (jaccardSim > 0.30) return true;

        // Proper noun overlap: if 2+ distinctive proper nouns match, it's the same topic
        // (e.g., "Keinemusik" + "Party Is Over" appearing in both)
        if (newProperNouns.length > 0) {
          const existingProperNouns = _extractProperNouns(r.insight || '');
          const sharedProper = newProperNouns.filter(n => existingProperNouns.includes(n));
          if (sharedProper.length >= 2) return true;
          // Even 1 shared distinctive proper noun (4+ chars) with any keyword overlap is suspicious
          if (sharedProper.length >= 1 && jaccardSim > 0.15) return true;
        }

        return false;
      });
      if (isSimilar) return true;
    }

    // Layer 3: Per-category cooldown
    if (category) {
      const cooldownHours = CATEGORY_COOLDOWN_HOURS[category] || DEFAULT_CATEGORY_COOLDOWN;
      const cooldownSince = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString();
      const categoryMatch = data.some(r =>
        r.category === category && r.created_at >= cooldownSince
      );
      if (categoryMatch) return true;
    }

    return false;
  } catch (err) {
    log.warn('isInsightDuplicate error', { error: err });
    return false; // fail open
  }
}

/**
 * Generate proactive insights for a user from recent memories and reflections.
 * Called after observation ingestion completes.
 */
async function generateProactiveInsights(userId) {
  try {
    // 0. Cleanup: delivered insights older than 30 days + junk system/notification categories
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    supabaseAdmin
      .from('proactive_insights')
      .delete()
      .eq('user_id', userId)
      .eq('delivered', true)
      .lt('created_at', thirtyDaysAgo)
      .then(({ error }) => { if (error) log.warn('Cleanup error', { error }); });

    // Purge undelivered junk categories that should never appear in chat
    supabaseAdmin
      .from('proactive_insights')
      .delete()
      .eq('user_id', userId)
      .in('category', ['briefing_email', 'briefing', 'system', 'email_notification_sent'])
      .then(({ error }) => { if (error) log.warn('Junk category cleanup error', { error }); });

    // 1. Fetch 200 memories to find enough platform signals (reflections dominate recent stream ~90%)
    const recentMemories = await getRecentMemories(userId, MEMORIES_TO_SCAN || 300);
    if (recentMemories.length < 3) {
      log.info('Not enough memories for insights', { count: recentMemories.length });
      return 0;
    }

    // 2. Get reflections for context (recent weights: recency dominant for trend detection)
    const reflections = await retrieveMemories(userId, "patterns and trends in recent behavior", REFLECTIONS_TO_INCLUDE || 15, 'recent');

    // 3. Format for LLM — explicitly separate signals from reflections
    // GUM Task 4: Filter out low-confidence memories (< 0.30) before LLM call
    const GUM_MIN_INSIGHT_CONFIDENCE = 0.30;

    const signalMemories = recentMemories
      .filter(m => (m.memory_type === 'platform_data' || m.memory_type === 'observation' || m.memory_type === 'fact')
        && (m.confidence ?? 0.7) >= GUM_MIN_INSIGHT_CONFIDENCE);

    const observations = signalMemories
      .slice(0, 30)
      .map(m => {
        const uncertain = (m.confidence ?? 0.7) < 0.50 ? ' [uncertain]' : '';
        return `- ${m.content.substring(0, 200)}${uncertain}`;
      })
      .join('\n');

    const reflectionText = reflections
      .filter(m => m.memory_type === 'reflection' && (m.confidence ?? 0.7) >= GUM_MIN_INSIGHT_CONFIDENCE)
      .slice(0, 5)
      .map(m => {
        const uncertain = (m.confidence ?? 0.7) < 0.50 ? ' [uncertain]' : '';
        return `- ${m.content.substring(0, 200)}${uncertain}`;
      })
      .join('\n') || 'No reflections yet.';

    // 4. Generate insights via LLM
    const result = await complete({
      tier: TIER_ANALYSIS,
      messages: [{
        role: 'user',
        content: INSIGHT_GENERATION_PROMPT
          .replace('{observations}', observations)
          .replace('{reflections}', reflectionText),
      }],
      maxTokens: INSIGHT_MAX_TOKENS || 250,
      temperature: INSIGHT_TEMPERATURE || 0.65,
      serviceName: 'proactiveInsights-generate',
    });

    const text = (result.content || '').trim();

    // Parse JSON response — robust extraction for various LLM output formats
    let insights;
    try {
      insights = _parseInsightsJSON(text);
    } catch (parseError) {
      log.warn('Failed to parse LLM response', { rawPreview: text.substring(0, 200) });
      return 0;
    }

    if (!Array.isArray(insights) || insights.length === 0) {
      return 0;
    }

    // 4b. Post-parse nudge enforcement: if no nudge category, promote the most actionable insight
    const hasNudge = insights.some(i => i.category === 'nudge');
    if (!hasNudge && insights.length > 0) {
      // Find the most actionable-sounding insight (has nudge_action, or contains action verbs)
      const actionableIdx = insights.findIndex(i => i.nudge_action);
      if (actionableIdx >= 0) {
        insights[actionableIdx] = { ...insights[actionableIdx], category: 'nudge' };
      } else {
        // Promote the first insight to nudge — extract a simple action from the insight text
        const first = insights[0];
        insights[0] = {
          ...first,
          category: 'nudge',
          nudge_action: first.nudge_action || _extractActionFromInsight(first.insight),
        };
      }
      log.info('No nudge from LLM, promoted one insight to nudge category');
    }

    // 4b. In-silico scoring: rank candidates by predicted engagement (TRIBE v2 Phase B)
    // Non-fatal — if ICA axes don't exist yet or scoring fails, continue with LLM order
    try {
      const scored = await scoreForInsightSelection(userId, insights.map(i => i.insight));
      if (scored.length > 0 && scored[0]?.engagement_score != null) {
        const nudge = insights.find(i => i.category === 'nudge');
        const nonNudges = insights
          .filter(i => i.category !== 'nudge')
          .sort((a, b) => {
            const scoreA = scored.find(s => s.text === a.insight)?.engagement_score ?? 0;
            const scoreB = scored.find(s => s.text === b.insight)?.engagement_score ?? 0;
            return scoreB - scoreA;
          });
        insights = nudge ? [nudge, ...nonNudges] : nonNudges;
        log.info('In-silico ranked insights', { userId, topScore: scored[0]?.engagement_score?.toFixed(3) });
      }
    } catch (scoringErr) {
      // Non-fatal: if in-silico scoring fails, continue with LLM-ordered insights
      log.warn('In-silico scoring skipped', { error: scoringErr.message });
    }

    // 5. Store insights (max 3), with dedup against recent undelivered
    let stored = 0;
    for (const item of insights.slice(0, 3)) {
      if (!item.insight || item.insight.length < 10) continue;

      const validCategories = ['trend', 'anomaly', 'celebration', 'concern', 'goal_progress', 'goal_suggestion', 'nudge'];
      const validDepartments = ['communications', 'scheduling', 'health', 'content', 'finance', 'research', 'social'];
      const itemCategory = validCategories.includes(item.category) ? item.category : null;
      if (await isInsightDuplicate(userId, item.insight, itemCategory)) continue;
      const insertData = {
        user_id: userId,
        insight: item.insight.substring(0, 500),
        urgency: ['low', 'medium', 'high'].includes(item.urgency) ? item.urgency : 'low',
        category: validCategories.includes(item.category) ? item.category : null,
        department: validDepartments.includes(item.department) ? item.department : null,
      };
      // Populate nudge_action when category is 'nudge'
      if (item.category === 'nudge' && item.nudge_action) {
        insertData.nudge_action = item.nudge_action.substring(0, 300);
      }
      // Provenance: detect which platforms this insight references so the UI
      // can surface source chips. Combines LLM-mentioned platforms + any
      // sources the caller provided (future: pass signalMemories platforms).
      const textForSources = [item.insight, item.nudge_action].filter(Boolean).join(' ');
      const sources = _extractSourcesFromText(textForSources);
      if (sources.length > 0) {
        insertData.sources = sources;
      }
      const { error } = await supabaseAdmin
        .from('proactive_insights')
        .insert(insertData);

      if (!error) {
        stored++;
        // Push high-urgency insights immediately — don't wait for next chat open
        if (item.urgency === 'high') {
          sendPushToUser(userId, {
            title: 'Your twin noticed something',
            body: item.insight.substring(0, 120),
            data: { type: 'proactive_insight', category: item.category ?? 'trend' },
          }).catch((err) =>
            log.warn('Push failed', { error: err })
          );
        }
      } else {
        log.warn('Failed to store insight', { error });
      }
    }

    log.info('Generated insights', { stored, userId });

    // Weekly cross-platform correlation insights
    // Only run if no 'trend' category insight exists in the last 7 days
    try {
      const { count: trendCount } = await supabaseAdmin
        .from('proactive_insights')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('category', 'trend')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      if (!trendCount || trendCount === 0) {
        const correlations = await generateCorrelationInsights(userId);
        if (correlations?.length) {
          for (const item of correlations) {
            if (!item.insight || item.insight.length < 10) continue;
            if (await isInsightDuplicate(userId, item.insight, 'trend')) continue;
            const corrSources = _extractSourcesFromText(item.insight);
            await supabaseAdmin.from('proactive_insights').insert({
              user_id: userId,
              insight: item.insight.substring(0, 500),
              urgency: 'low',
              category: 'trend',
              ...(corrSources.length > 0 ? { sources: corrSources } : {}),
            });
            log.info('Stored correlation insight', { userId });
          }
        }
      }
    } catch (corrErr) {
      // Non-fatal — don't let correlation errors fail the whole function
      log.warn('Correlation insights error', { error: corrErr });
    }

    return stored;
  } catch (error) {
    log.error('Error generating insights', { error });
    return 0;
  }
}

/**
 * Get undelivered proactive insights for a user.
 * Called by twin-chat when building context.
 *
 * Note: Supabase doesn't natively sort enums by custom order, so we fetch
 * recent undelivered insights and sort in JS to put 'high' urgency first.
 */
async function getUndeliveredInsights(userId, limit = 3) {
  try {
    const { data, error } = await supabaseAdmin
      .from('proactive_insights')
      .select('id, insight, urgency, category, department, created_at')
      .eq('user_id', userId)
      .eq('delivered', false)
      .not('category', 'in', '("briefing_email","briefing","system")')
      .order('created_at', { ascending: false })
      .limit(limit * 2); // Fetch extra so we can re-sort by urgency

    if (error || !data) return [];

    // Sort by urgency (high > medium > low), then by recency
    const urgencyOrder = { high: 0, medium: 1, low: 2 };
    const sorted = data.sort((a, b) => {
      const urgDiff = (urgencyOrder[a.urgency] || 2) - (urgencyOrder[b.urgency] || 2);
      if (urgDiff !== 0) return urgDiff;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    return sorted.slice(0, limit);
  } catch (err) {
    log.warn('getUndeliveredInsights error', { error: err });
    return [];
  }
}

/**
 * Mark insights as delivered after they've been included in a twin chat response.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function markInsightsDelivered(insightIds) {
  if (!Array.isArray(insightIds) || insightIds.length === 0) return;

  // Validate all IDs are UUIDs before updating to prevent unexpected writes
  const validIds = insightIds.filter(id => typeof id === 'string' && UUID_RE.test(id));
  if (validIds.length === 0) return;
  if (validIds.length !== insightIds.length) {
    log.warn('markInsightsDelivered: invalid IDs filtered out', { filteredCount: insightIds.length - validIds.length });
  }
  const safeIds = validIds;

  const { error: deliveredErr } = await supabaseAdmin
    .from('proactive_insights')
    .update({ delivered: true, delivered_at: new Date().toISOString() })
    .in('id', safeIds);

  if (deliveredErr) {
    log.warn('Failed to mark delivered', { error: deliveredErr });
  }
}

/**
 * Robustly extract a JSON array of insights from LLM output.
 * Handles: markdown code blocks, text before/after JSON, nested objects,
 * trailing commas, and single-object (non-array) responses.
 *
 * @param {string} text - Raw LLM output
 * @returns {Array} Parsed insights array
 * @throws {Error} If no valid JSON array can be extracted
 */
function _parseInsightsJSON(text) {
  // Strategy 1: Direct parse (cleanest case)
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object' && parsed.insight) return [parsed];
  } catch { /* continue */ }

  // Strategy 2: Strip markdown code block wrappers
  const stripped = text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
  try {
    const parsed = JSON.parse(stripped);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object' && parsed.insight) return [parsed];
  } catch { /* continue */ }

  // Strategy 3: Find first [ ... ] bracket pair in the text
  const bracketStart = text.indexOf('[');
  const bracketEnd = text.lastIndexOf(']');
  if (bracketStart !== -1 && bracketEnd > bracketStart) {
    const jsonCandidate = text.substring(bracketStart, bracketEnd + 1);
    try {
      const parsed = JSON.parse(jsonCandidate);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Strategy 3b: Try fixing trailing commas (common LLM mistake)
      const fixed = jsonCandidate.replace(/,\s*([}\]])/g, '$1');
      try {
        const parsed = JSON.parse(fixed);
        if (Array.isArray(parsed)) return parsed;
      } catch { /* continue */ }
    }
  }

  // Strategy 4: Find first { ... } (single object response)
  const braceStart = text.indexOf('{');
  const braceEnd = text.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    const objCandidate = text.substring(braceStart, braceEnd + 1);
    try {
      const parsed = JSON.parse(objCandidate);
      if (parsed && typeof parsed === 'object' && parsed.insight) return [parsed];
    } catch { /* continue */ }
  }

  throw new Error('No valid JSON insights found in LLM response');
}

/**
 * Generate cross-platform behavioral correlation insights.
 * Looks for non-obvious patterns that span multiple data sources
 * (e.g. "packed calendar days → Spotify shifts to lo-fi → Whoop recovery drops").
 * Called weekly from generateProactiveInsights to avoid over-generating.
 *
 * @param {string} userId
 * @returns {Promise<Array<{insight: string, urgency: string, category: string}> | null>}
 */
async function generateCorrelationInsights(userId) {
  try {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const { data: platformMemories } = await supabaseAdmin
      .from('user_memories')
      .select('content, metadata, created_at')
      .eq('user_id', userId)
      .eq('memory_type', 'platform_data')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(60);

    if (!platformMemories || platformMemories.length < 5) return null;

    // Group memories by their originating platform source
    const bySource = {};
    for (const m of platformMemories) {
      const src = m.metadata?.source || 'unknown';
      if (!bySource[src]) bySource[src] = [];
      bySource[src].push(m.content);
    }

    const sources = Object.keys(bySource);
    if (sources.length < 2) return null;

    const sourceText = sources
      .map((s) => `[${s.toUpperCase()}]\n${bySource[s].slice(0, 5).join('\n')}`)
      .join('\n\n');

    const result = await complete({
      tier: TIER_ANALYSIS,
      system: `You analyze cross-platform behavioral correlations for a personal AI twin.
Look for genuine patterns that span multiple data sources.
Surface specific, non-obvious connections. Be concrete with observed data.
Example: "When your calendar shows 3+ back-to-back meetings, your Spotify shifts to ambient/lo-fi within the same day."
Output ONLY a JSON array of 1-2 correlation insights: [{"insight": "...", "urgency": "low", "category": "trend"}]
No other text.`,
      messages: [{ role: 'user', content: `Find cross-platform patterns in this behavioral data:\n\n${sourceText}` }],
      maxTokens: 300,
      temperature: 0.4,
      serviceName: 'correlationInsights-generate',
    });

    const text = (result.content || '').trim();
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']') + 1;
    if (start === -1 || end <= start) return null;

    const parsed = JSON.parse(text.slice(start, end));
    return Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    log.warn('generateCorrelationInsights error', { error: err });
    return null;
  }
}

// ── Embodied Feedback Loop: Nudge Evaluation ────────────────────────────────

/**
 * Evaluate delivered nudges by scanning recent platform_data memories for evidence.
 * Finds nudges delivered 12-48h ago with null nudge_followed, checks if recent
 * platform data contains keywords from the nudge_action.
 *
 * Called fire-and-forget from observationIngestion after platform data ingest.
 *
 * @param {string} userId
 * @returns {Promise<number>} Number of nudges evaluated
 */
async function evaluateNudgeOutcomes(userId) {
  try {
    const now = Date.now();
    const twelveHoursAgo = new Date(now - 12 * 60 * 60 * 1000).toISOString();
    const fortyEightHoursAgo = new Date(now - 48 * 60 * 60 * 1000).toISOString();

    // Find delivered nudges in the 12-48h window that haven't been evaluated
    const { data: pendingNudges, error: fetchErr } = await supabaseAdmin
      .from('proactive_insights')
      .select('id, nudge_action, delivered_at, insight')
      .eq('user_id', userId)
      .eq('category', 'nudge')
      .eq('delivered', true)
      .is('nudge_followed', null)
      .gte('delivered_at', fortyEightHoursAgo)
      .lte('delivered_at', twelveHoursAgo)
      .limit(10);

    if (fetchErr || !pendingNudges?.length) return 0;

    // Fetch recent platform_data memories (last 48h) to scan for evidence
    const { data: recentData } = await supabaseAdmin
      .from('user_memories')
      .select('content')
      .eq('user_id', userId)
      .eq('memory_type', 'platform_data')
      .gte('created_at', fortyEightHoursAgo)
      .order('created_at', { ascending: false })
      .limit(50);

    const recentText = (recentData || []).map(m => m.content.toLowerCase()).join(' ');

    let evaluated = 0;
    for (const nudge of pendingNudges) {
      if (!nudge.nudge_action) {
        // No action to evaluate — mark as checked but unknown
        await supabaseAdmin
          .from('proactive_insights')
          .update({ nudge_checked_at: new Date().toISOString() })
          .eq('id', nudge.id);
        evaluated++;
        continue;
      }

      // Extract keywords from the nudge action for evidence matching
      const actionWords = nudge.nudge_action.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 3) // skip short words
        .filter(w => !['take', 'try', 'your', 'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'been', 'will', 'could', 'should', 'would', 'might'].includes(w));

      // Count keyword overlap between nudge action and recent platform data
      const matchCount = actionWords.filter(w => recentText.includes(w)).length;
      const matchRatio = actionWords.length > 0 ? matchCount / actionWords.length : 0;

      // If >= 40% of action keywords appear in recent data, consider it followed
      const followed = matchRatio >= 0.4;
      const outcome = followed
        ? `Evidence found: ${matchCount}/${actionWords.length} keywords matched in recent activity`
        : `No clear evidence: ${matchCount}/${actionWords.length} keywords matched`;

      await supabaseAdmin
        .from('proactive_insights')
        .update({
          nudge_followed: followed,
          nudge_outcome: outcome.substring(0, 500),
          nudge_checked_at: new Date().toISOString(),
        })
        .eq('id', nudge.id);

      evaluated++;
    }

    if (evaluated > 0) {
      log.info('Evaluated nudge outcomes', { evaluated, userId });
    }
    return evaluated;
  } catch (err) {
    log.warn('evaluateNudgeOutcomes error', { error: err });
    return 0;
  }
}

/**
 * Get recent evaluated nudge history for chat context injection.
 * Returns nudges with their outcomes so the twin can reference past suggestions.
 *
 * @param {string} userId
 * @param {number} [limit=5]
 * @returns {Promise<Array<{insight: string, nudge_action: string, nudge_followed: boolean, nudge_outcome: string, delivered_at: string}>>}
 */
async function getNudgeHistory(userId, limit = 5) {
  try {
    const { data, error } = await supabaseAdmin
      .from('proactive_insights')
      .select('insight, nudge_action, nudge_followed, nudge_outcome, delivered_at')
      .eq('user_id', userId)
      .eq('category', 'nudge')
      .eq('delivered', true)
      .not('nudge_checked_at', 'is', null)
      .order('delivered_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data;
  } catch (err) {
    log.warn('getNudgeHistory error', { error: err });
    return [];
  }
}

/**
 * Calculate nudge effectiveness score: ratio of followed nudges to total evaluated.
 * Returns a score between 0 and 1, or null if insufficient data.
 *
 * @param {string} userId
 * @returns {Promise<{score: number|null, followed: number, total: number}>}
 */
async function getNudgeEffectivenessScore(userId) {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('proactive_insights')
      .select('nudge_followed')
      .eq('user_id', userId)
      .eq('category', 'nudge')
      .not('nudge_checked_at', 'is', null)
      .gte('delivered_at', thirtyDaysAgo);

    if (error || !data?.length) return { score: null, followed: 0, total: 0 };

    const total = data.length;
    const followed = data.filter(d => d.nudge_followed === true).length;
    const score = total >= 3 ? Math.round((followed / total) * 100) / 100 : null; // Need 3+ for meaningful ratio

    return { score, followed, total };
  } catch (err) {
    log.warn('getNudgeEffectivenessScore error', { error: err });
    return { score: null, followed: 0, total: 0 };
  }
}

/**
 * Best-effort extraction of an actionable suggestion from an insight string.
 * Used as fallback when the LLM fails to provide a nudge_action field.
 *
 * @param {string} insight
 * @returns {string} A simple action suggestion derived from the insight
 */
const KNOWN_PLATFORMS = [
  'Spotify', 'YouTube', 'Gmail', 'GitHub', 'Whoop', 'Calendar', 'Discord',
  'Reddit', 'LinkedIn', 'Twitch', 'WhatsApp', 'Netflix', 'TikTok',
  'Letterboxd', 'Goodreads', 'Notion', 'Pinterest',
];

/**
 * Extract platform names mentioned in the insight text (case-insensitive,
 * word-boundary match). Returns canonical capitalization, deduped.
 */
function _extractSourcesFromText(text) {
  if (!text) return [];
  const found = new Set();
  for (const p of KNOWN_PLATFORMS) {
    const re = new RegExp(`\\b${p}\\b`, 'i');
    if (re.test(text)) found.add(p);
  }
  return [...found];
}

function _extractActionFromInsight(insight) {
  if (!insight) return 'take a short break today';
  const lower = insight.toLowerCase();
  if (lower.includes('sleep') || lower.includes('tired') || lower.includes('rest')) {
    return 'try getting to bed 30 minutes earlier tonight';
  }
  if (lower.includes('busy') || lower.includes('meeting') || lower.includes('packed')) {
    return 'block 30 min of free time on your calendar tomorrow';
  }
  if (lower.includes('music') || lower.includes('playlist') || lower.includes('listen')) {
    return 'put on your favorite playlist during your next break';
  }
  if (lower.includes('exercise') || lower.includes('move') || lower.includes('walk')) {
    return 'take a 10-minute walk after your next meal';
  }
  if (lower.includes('stress') || lower.includes('overwhelm') || lower.includes('anxious')) {
    return 'take 5 deep breaths right now — seriously, it helps';
  }
  return 'take a short break and do something you enjoy today';
}

export {
  generateProactiveInsights,
  getUndeliveredInsights,
  markInsightsDelivered,
  evaluateNudgeOutcomes,
  getNudgeHistory,
  getNudgeEffectivenessScore,
  isInsightDuplicate,
};
