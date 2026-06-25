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
import { editInsights } from './insightEditor.js';
import { vectorToString } from './embeddingService.js';
import { getFeatureFlags } from './featureFlagsService.js';
import { complete, TIER_ANALYSIS } from './llmGateway.js';
import { sendPushToUser } from './pushNotificationService.js';
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';
import { stripEmoji } from '../utils/stripEmoji.js';
import { computeCategorySuppression, buildSuppressionPromptSection } from './insightSuppression.js';

const log = createLogger('ProactiveInsights');

// Import the research-tuned prompt template and parameters
import { INSIGHT_PROMPT_TEMPLATE, INSIGHT_TEMPERATURE, INSIGHT_MAX_TOKENS, MEMORIES_TO_SCAN, REFLECTIONS_TO_INCLUDE, DEDUP_THRESHOLD } from '../../twin-research/insight-config.js';

// replan-2026-06-10 Track A: the "first insight MUST be a nudge" production
// wrapper is gone — 20/20 stored nudges were never engaged, only 19% followed.
// Nudges may still emerge naturally; they are no longer mandated per batch.
const INSIGHT_GENERATION_PROMPT = INSIGHT_PROMPT_TEMPLATE;

/**
 * Strip digit runs (including thousand separators and decimals) before any
 * lexical dedup comparison. replan-2026-06-10: a daily-incrementing count
 * ("40,381 unread" -> "40,448 unread") defeated both the prefix match and
 * the keyword Jaccard every day, so the same backlog stat shipped 6+ times
 * in 3 days. Digits carry no theme identity; the words do.
 */
function _stripDigitsForDedup(text) {
  return String(text || '')
    .replace(/\d[\d,.]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Theme-level dedup (replan-2026-06-10): keyword-set themes with a hard
 * cooldown, so a reworded re-delivery of the same nag ("email backlog")
 * is rejected even when no lexical layer fires. A theme needs >= 2 keyword
 * hits — one lone mention of "email" must not lock the theme for a week.
 */
const THEME_COOLDOWN_DAYS = 7;
const INSIGHT_THEMES = {
  'email-backlog': ['email', 'emails', 'inbox', 'unread', 'gmail', 'backlog', 'archive', 'sender', 'senders'],
  'github-backlog': ['github', 'prs', 'pull', 'branch', 'branches', 'review', 'merge'],
  'recovery-strain': ['whoop', 'recovery', 'strain', 'hrv'],
};

function _extractInsightTheme(text) {
  const words = new Set(_extractKeywords(_stripDigitsForDedup(text)));
  for (const [theme, keywords] of Object.entries(INSIGHT_THEMES)) {
    const hits = keywords.filter(k => words.has(k));
    if (hits.length >= 2) return theme;
  }
  return null;
}

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
 * Uses four-layer dedup (digits stripped before layers 1-2 — replan-2026-06-10):
 *   1. Exact 60-char prefix match (catches identical starts)
 *   2. Keyword Jaccard similarity > 0.35 (catches paraphrased duplicates)
 *   3. Per-theme cooldown (max 1 per theme per THEME_COOLDOWN_DAYS)
 *   4. Per-category cooldown (max 1 per category per CATEGORY_COOLDOWN_HOURS)
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

/**
 * audit-2026-05-16: hallucination guard.
 *
 * Audit found multiple stored insights with stat-numbers (recovery %, email
 * counts, percentages) that did not appear in the supplied observations.
 * Examples:
 *   - "46% recovery" with zero Whoop observations in the window
 *   - "10 emails from github.com" when the observation literally said "(13)"
 *   - "3502 of 42605" when the observation said "3506 of 42654"
 *
 * Root cause: the prompt's HARD REQUIREMENTS forced the model to cite "3+
 * specific numbers across 2+ platforms" with no abstention path. When the
 * supplied evidence didn't cover that surface, the model invented numbers
 * from its training distribution.
 *
 * This helper returns the array of stat-numbers in `insight` that are NOT
 * grounded in `evidence` (the raw observations+reflections block that was
 * passed to the LLM). Action-context numbers (clock times, durations) are
 * stripped first so we don't false-flag "block 30 min" or "by 11am".
 *
 * Caller policy: in the insert loop, reject any insight where this returns
 * a non-empty array. Better to surface zero insights than to mislead the
 * user with a fabricated recovery score or email count.
 */
function _findUngroundedNumbers(insight, evidence) {
  const text = String(insight || '');
  const ev = String(evidence || '').toLowerCase();
  // Strip action-context numbers (clock times, durations, "by N", "after N",
  // "for N") so they aren't treated as stats requiring grounding.
  const stripped = text
    .replace(/\b\d+\s*(?:a\.?m\.?|p\.?m\.?)\b/gi, ' ')
    .replace(/\b\d+\s*-?\s*(?:min|minute|hour|hr|h|sec|second)s?\b/gi, ' ')
    .replace(/\b(?:by|after|before|for|in|until|till|around)\s+\d+/gi, ' ');
  // Candidate stat-numbers: percentages and multi-digit integers.
  // Single-digit ints (1-9) are skipped — too noisy ("top 3 emails",
  // "next 5 days") and rarely fabricated convincingly on their own.
  const tokens = stripped.match(/\b\d+%|\b\d{2,}\b/g) || [];
  // Ground candidates against the evidence's OWN whole-number tokens (exact match),
  // not substring containment: ev.includes('46') was true for '462 emails' or a
  // timestamp, so a fabricated '46% recovery' passed the very guard meant to catch
  // it (audit). evNums holds each standalone digit-run in the evidence.
  const evNums = new Set((ev.match(/\d+/g) || []));
  const ungrounded = [];
  for (const t of tokens) {
    const bare = t.replace('%', '').toLowerCase();
    if (evNums.has(bare)) continue;
    ungrounded.push(t);
  }
  return ungrounded;
}

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

    // Layer 1: Exact 60-char prefix match (fast path).
    // Digits are stripped first so an incrementing count can't defeat it.
    const _prefixOf = (t) => _stripDigitsForDedup(t).substring(0, 60).toLowerCase().replace(/[^a-z\s]/g, '');
    const snippet = _prefixOf(insightText);
    const prefixMatch = data.some(r => _prefixOf(r.insight || '') === snippet);
    if (prefixMatch) return true;

    // Layer 2: Keyword similarity (catches paraphrased duplicates)
    // Uses Jaccard > 0.30 OR shared proper-noun-like words (capitalized in original) > 1
    // Digit-stripped so number tokens don't dilute the Jaccard union.
    const newKeywords = _extractKeywords(_stripDigitsForDedup(insightText));
    const newProperNouns = _extractProperNouns(insightText);
    if (newKeywords.length >= 3) {
      const isSimilar = data.some(r => {
        const existingKeywords = _extractKeywords(_stripDigitsForDedup(r.insight || ''));
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

    // Layer 3: Per-theme cooldown (replan-2026-06-10). The 7-day fetch window
    // above covers all rows (delivered or not), so a reworded re-delivery of
    // a recently-shipped theme is rejected regardless of wording or numbers.
    const newTheme = _extractInsightTheme(insightText);
    if (newTheme) {
      const themeSince = Date.now() - THEME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
      const themeMatch = data.some(r =>
        new Date(r.created_at).getTime() >= themeSince &&
        _extractInsightTheme(r.insight || '') === newTheme
      );
      if (themeMatch) return true;
    }

    // Layer 4: Per-category cooldown
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

    // 0. Cheap pre-LLM throttle. The per-category cooldowns below only gate the
    //    INSERT, not the (billed) LLM call — and generateProactiveInsights is pushed
    //    to backgroundJobs on every */30 ingestion run, so without this the
    //    TIER_ANALYSIS call + 300-memory build fired up to ~48x/day even when nothing
    //    new could store (audit: the $375-bill class). One indexed query gates the
    //    whole pipeline; the per-category logic still applies on the rare run that proceeds.
    const INSIGHT_GEN_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4h (the default category cooldown)
    try {
      const { data: lastInsight } = await supabaseAdmin
        .from('proactive_insights')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastInsight?.created_at
        && (Date.now() - new Date(lastInsight.created_at).getTime()) < INSIGHT_GEN_COOLDOWN_MS) {
        log.info('Insight generation skipped — within global cooldown', { userId });
        return 0;
      }
    } catch (err) {
      // Non-fatal: if the probe fails, fall through to generation rather than block it.
      log.warn('Insight cooldown probe failed — proceeding', { error: err?.message });
    }

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

    // 3b. Engagement-aware category suppression (replan-2026-06-10 Track A):
    // read the per-category engaged/shown stats this table already collects
    // (same query shape as GET /insights/proactive/engagement-stats) so
    // generation finally adapts to what the user actually taps. Hard-suppressed
    // categories are also filtered at insert time below.
    let suppression = { suppressed: [], avoid: [] };
    try {
      const statsSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: statRows, error: statsError } = await supabaseAdmin
        .from('proactive_insights')
        .select('category, urgency, engaged, delivered')
        .eq('user_id', userId)
        .gte('created_at', statsSince);
      if (statsError) throw new Error(statsError.message);
      suppression = computeCategorySuppression(statRows || []);
      if (suppression.suppressed.length || suppression.avoid.length) {
        log.info('Category suppression active', {
          userId,
          suppressed: suppression.suppressed,
          avoid: suppression.avoid,
        });
      }
    } catch (err) {
      // Non-fatal: generation without suppression beats no generation at all.
      log.warn('Category suppression stats unavailable — generating without them', { error: err?.message });
    }

    // 4. Generate insights via LLM
    const result = await complete({
      tier: TIER_ANALYSIS,
      messages: [{
        role: 'user',
        content: INSIGHT_GENERATION_PROMPT
          .replace('{observations}', observations)
          .replace('{reflections}', reflectionText)
          + buildSuppressionPromptSection(suppression),
      }],
      maxTokens: INSIGHT_MAX_TOKENS || 250,
      temperature: INSIGHT_TEMPERATURE || 0.65,
      userId,
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

    // replan-2026-06-10 cycle 4: in-silico engagement ranking removed — the
    // engine scored against ICA axes hardcoded to [], so the "ranking" was a
    // static centroid prior. Insights keep the LLM's own ordering.

    // audit-2026-05-16: build the grounding corpus from the same observations
    // and reflections we just handed the LLM. The grounding gate below rejects
    // any insight that cites stat-numbers (percentages, multi-digit counts)
    // not present in this text. Strips emoji defensively so emoji-adjacent
    // numerics still match.
    const groundingCorpus = `${observations}\n${reflectionText}`;

    // 5. Store insights. With the salience+voice Editor (replan-2026-06-13)
    // enabled, candidates are collected through the same grounding/suppression
    // gates, then handed to editInsights() which returns AT MOST ONE, rewritten
    // in voice (or nothing). Without the flag, the legacy "store up to 3" path
    // runs unchanged.
    let stored = 0;
    let skippedUngrounded = 0;
    const editorEnabled = (await getFeatureFlags(userId).catch(() => ({}))).insight_editor === true;
    const candidatesForEditor = [];
    for (const item of insights.slice(0, 3)) {
      if (!item.insight || item.insight.length < 10) continue;

      const validCategories = ['trend', 'anomaly', 'celebration', 'concern', 'goal_progress', 'goal_suggestion', 'nudge'];
      const validDepartments = ['communications', 'scheduling', 'health', 'content', 'finance', 'research', 'social'];
      const itemCategory = validCategories.includes(item.category) ? item.category : null;

      // replan-2026-06-10 Track A: hard suppression — the user was shown 8+
      // insights of this category in 30 days and engaged with none. The prompt
      // already discourages these; this is the enforcement belt.
      if (itemCategory && suppression.suppressed.includes(itemCategory)) {
        log.info('Insight skipped — category suppressed by zero engagement', { userId, category: itemCategory });
        continue;
      }

      // audit-2026-05-16 HALLUCINATION GUARD: reject insights whose insight
      // body OR nudge_action cites stat-numbers not present in the source
      // observations. The prompt now tells the model to return [] when
      // evidence is insufficient — this is the belt to the prompt's
      // suspenders. Drops insights silently rather than storing fabrications.
      const fullText = [item.insight, item.nudge_action].filter(Boolean).join(' ');
      const ungrounded = _findUngroundedNumbers(fullText, groundingCorpus);
      if (ungrounded.length > 0) {
        log.warn('Insight rejected — un-grounded stat-numbers', {
          userId,
          ungrounded,
          preview: (item.insight || '').slice(0, 120),
        });
        skippedUngrounded++;
        continue;
      }

      if (await isInsightDuplicate(userId, item.insight, itemCategory)) continue;
      // audit-2026-05-15 H7: strip emojis at generation time. The audit
      // found a "🤑" leaking through to the chat sidebar from a stored
      // insight. Even though the generation prompt instructs no emojis,
      // models occasionally include them in JSON output — defense in depth.
      // audit-2026-06-10: models occasionally prefix the insight body with its
      // own category tag ("[celebration] You've created 8 branches...") which
      // rendered raw on the dashboard. The category belongs in item.category,
      // never in the text — strip any short leading bracketed tag.
      const insightText = stripEmoji(item.insight).replace(/^\s*\[[a-z_ -]{2,24}\]\s*/i, '');

      // Editor path: collect the grounded candidate and let editInsights() do
      // semantic dedup + the single voice rewrite after the loop. Skip the
      // legacy per-item store below.
      if (editorEnabled) {
        candidatesForEditor.push({
          insight: insightText.substring(0, 500),
          urgency: ['low', 'medium', 'high'].includes(item.urgency) ? item.urgency : 'low',
          category: validCategories.includes(item.category) ? item.category : null,
        });
        continue;
      }

      const insertData = {
        user_id: userId,
        insight: insightText.substring(0, 500),
        urgency: ['low', 'medium', 'high'].includes(item.urgency) ? item.urgency : 'low',
        category: validCategories.includes(item.category) ? item.category : null,
        department: validDepartments.includes(item.department) ? item.department : null,
      };
      // Populate nudge_action when category is 'nudge'
      if (item.category === 'nudge' && item.nudge_action) {
        insertData.nudge_action = stripEmoji(item.nudge_action).substring(0, 300);
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

    // Editor path: one salience+voice pass over all candidates -> 0 or 1 insight.
    if (editorEnabled && candidatesForEditor.length > 0) {
      const chosen = await editInsights(userId, candidatesForEditor);
      if (chosen) {
        const insertData = {
          user_id: userId,
          insight: chosen.insight,
          urgency: chosen.urgency,
          category: chosen.category,
          // surfaced_at anchors the semantic-dedup window — this is the one
          // thing we chose to say, so it counts as "said" from now.
          surfaced_at: new Date().toISOString(),
        };
        if (chosen.embedding) insertData.embedding = vectorToString(chosen.embedding);
        const sources = _extractSourcesFromText(chosen.insight);
        if (sources.length > 0) insertData.sources = sources;
        const { error } = await supabaseAdmin.from('proactive_insights').insert(insertData);
        if (!error) {
          stored++;
          if (chosen.urgency === 'high') {
            sendPushToUser(userId, {
              title: 'Your twin noticed something',
              body: chosen.insight.substring(0, 120),
              data: { type: 'proactive_insight', category: chosen.category ?? 'trend' },
            }).catch((err) => log.warn('Push failed', { error: err }));
          }
        } else {
          log.warn('Failed to store edited insight', { error });
        }
      }
    }

    log.info('Generated insights', { stored, skippedUngrounded, userId, editor: editorEnabled });

    // Weekly cross-platform correlation insights. Gate on the last correlation RUN
    // (a persisted kv timestamp), NOT on whether a 'trend' insight is stored — the
    // grounding/dedup/suppression gates routinely drop the trend row, so the old guard
    // re-fired this second TIER_ANALYSIS call on most runs (audit #119).
    try {
      const lastCorrelation = await getLastCorrelationRunAt(userId);
      if (!lastCorrelation || (Date.now() - lastCorrelation) >= CORRELATION_COOLDOWN_MS) {
        // Record the attempt up-front so an empty/failed result still cools down 7 days.
        await setLastCorrelationRunAt(userId);
        const correlationResult = await generateCorrelationInsights(userId);
        const corrInsights = correlationResult?.insights || [];
        const corrEvidence = correlationResult?.evidence || '';
        if (corrInsights.length) {
          for (const item of corrInsights) {
            if (!item.insight || item.insight.length < 10) continue;
            // audit-2026-05-16: same grounding gate as the main path. The
            // correlation prompt is more grounded by construction (only
            // platform_data passed in) but the model can still over-claim
            // numbers — reject any fabricated stat.
            const corrUngrounded = _findUngroundedNumbers(item.insight, corrEvidence);
            if (corrUngrounded.length > 0) {
              log.warn('Correlation insight rejected — un-grounded stat-numbers', {
                userId,
                ungrounded: corrUngrounded,
                preview: (item.insight || '').slice(0, 120),
              });
              continue;
            }
            if (await isInsightDuplicate(userId, item.insight, 'trend')) continue;
            const corrSources = _extractSourcesFromText(item.insight);
            await supabaseAdmin.from('proactive_insights').insert({
              user_id: userId,
              // audit-2026-05-15 H7: emoji strip on the secondary correlation
              // insight path too — same defense-in-depth as the main path above.
              insight: stripEmoji(item.insight).substring(0, 500),
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

    // Stress leaderboard (biometric x social) — behind the stress_leaderboard
    // flag. Produces its own voiced insight via the Editor; the Editor's
    // semantic dedup keeps the same finding from re-surfacing. (TODO before
    // widening past canary: add a ~7-day cadence guard to bound the Whoop +
    // calendar fetches.)
    try {
      const flags = await getFeatureFlags(userId).catch(() => ({}));
      if (flags.stress_leaderboard === true) {
        const { generateStressLeaderboardInsight } = await import('./biometricSocialCorrelation.js');
        const sl = await generateStressLeaderboardInsight(userId, { logOnly: false });
        if (sl) stored++;
      }
    } catch (slErr) {
      log.warn('Stress leaderboard error', { error: slErr?.message });
    }

    // Workspace rhythm (maker time vs meeting time) — behind the work_rhythm
    // flag. Whoop-free: runs on Google Drive + Calendar, so it works for any
    // Google user, not just the few with wearables. Same Editor-voiced path.
    try {
      const flags = await getFeatureFlags(userId).catch(() => ({}));
      if (flags.work_rhythm === true) {
        const { generateWorkspaceRhythmInsight } = await import('./workspaceRhythm.js');
        const wr = await generateWorkspaceRhythmInsight(userId, { logOnly: false });
        if (wr) stored++;
      }
    } catch (wrErr) {
      log.warn('Workspace rhythm error', { error: wrErr?.message });
    }

    // Email tempo (Gmail x Calendar) — behind the email_tempo flag. The most
    // universal Whoop-free insight: does a packed calendar push your email into
    // the evening? Reads only message timestamps. Same Editor-voiced path.
    try {
      const flags = await getFeatureFlags(userId).catch(() => ({}));
      if (flags.email_tempo === true) {
        const { generateEmailTempoInsight } = await import('./emailTempo.js');
        const et = await generateEmailTempoInsight(userId, { logOnly: false });
        if (et) stored++;
      }
    } catch (etErr) {
      log.warn('Email tempo error', { error: etErr?.message });
    }

    // Chronotype (Gmail x Calendar) — behind the chronotype flag. Are your
    // meetings scheduled against your natural active hours? Reads only message
    // timestamps + event start hours. Same Editor-voiced path.
    try {
      const flags = await getFeatureFlags(userId).catch(() => ({}));
      if (flags.chronotype === true) {
        const { generateChronotypeInsight } = await import('./chronotype.js');
        const ch = await generateChronotypeInsight(userId, { logOnly: false });
        if (ch) stored++;
      }
    } catch (chErr) {
      log.warn('Chronotype error', { error: chErr?.message });
    }

    // Reply latency (Gmail threads x Calendar) — behind the reply_latency flag.
    // Do packed meeting days slow your email replies? Heaviest insight (reads
    // thread structure, capped); reads only timestamps + the SENT label.
    try {
      const flags = await getFeatureFlags(userId).catch(() => ({}));
      if (flags.reply_latency === true) {
        const { generateReplyLatencyInsight } = await import('./replyLatency.js');
        const rl = await generateReplyLatencyInsight(userId, { logOnly: false });
        if (rl) stored++;
      }
    } catch (rlErr) {
      log.warn('Reply latency error', { error: rlErr?.message });
    }

    // Attention gravity (browser extension) — behind the attention_gravity flag.
    // First-party, API-free: where your attention pools (by dwell) vs where you
    // click most. Reads our own user_platform_data, names domains only.
    try {
      const flags = await getFeatureFlags(userId).catch(() => ({}));
      if (flags.attention_gravity === true) {
        const { generateAttentionGravityInsight } = await import('./attentionGravity.js');
        const ag = await generateAttentionGravityInsight(userId, { logOnly: false });
        if (ag) stored++;
      }
    } catch (agErr) {
      log.warn('Attention gravity error', { error: agErr?.message });
    }

    // Curiosity signature (browser extension content) — behind the
    // curiosity_signature flag. What your effort/curiosity keeps circling,
    // synthesized from your searches + page topics + titles. First-party.
    try {
      const flags = await getFeatureFlags(userId).catch(() => ({}));
      if (flags.curiosity_signature === true) {
        const { generateCuriositySignatureInsight } = await import('./curiositySignature.js');
        const cs = await generateCuriositySignatureInsight(userId, { logOnly: false });
        if (cs) stored++;
      }
    } catch (csErr) {
      log.warn('Curiosity signature error', { error: csErr?.message });
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
 *
 * Excluded categories: 'briefing'/'briefing_email'/'system' (delivery
 * artifacts, not conversational observations) and 'meeting_prep' — meeting
 * briefings are reference data, not "huh, interesting" observations. They
 * reach the twin through the get_meeting_prep tool, which returns the full
 * structured briefing on demand and renders a visible action card. Leaking
 * the headline into "THINGS I NOTICED" let the twin fake a shallow answer
 * from the headline instead of calling the tool.
 */
async function getUndeliveredInsights(userId, limit = 3) {
  try {
    const { data, error } = await supabaseAdmin
      .from('proactive_insights')
      .select('id, insight, urgency, category, department, created_at')
      .eq('user_id', userId)
      .eq('delivered', false)
      .not('category', 'in', '("briefing_email","briefing","system","meeting_prep")')
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
/** Return the first balanced top-level `[...]` substring (string-aware), or null. */
function _firstBalancedArray(text) {
  const start = text.indexOf('[');
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (depth === 0) return text.substring(start, i + 1); }
  }
  return null;
}

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

  // Strategy 2b: first BALANCED top-level array. Models sometimes emit the
  // array then a second fenced copy ("[]\n```json\n[]```") — strategy 3's
  // last-`]` then spans both arrays and fails to parse, silently dropping
  // real insights. Scan from the first `[` to its matching close (string-aware)
  // and parse just that.
  const firstArr = _firstBalancedArray(text);
  if (firstArr) {
    try {
      const parsed = JSON.parse(firstArr);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      try {
        const parsed = JSON.parse(firstArr.replace(/,\s*([}\]])/g, '$1'));
        if (Array.isArray(parsed)) return parsed;
      } catch { /* continue */ }
    }
  }

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
// Correlation runs at most weekly. Gate on a persisted kv timestamp (mirrors the
// goal-suggestion cooldown in goalTrackingService), NOT on whether a 'trend' insight
// happens to be stored — the grounding/dedup/suppression gates routinely drop it,
// which re-fired this second TIER_ANALYSIS call on most ingestion runs (audit #119).
const CORRELATION_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

async function getLastCorrelationRunAt(userId) {
  const { data } = await supabaseAdmin
    .from('user_platform_data')
    .select('extracted_at')
    .eq('user_id', userId)
    .eq('platform', 'twinme')
    .eq('data_type', 'correlation_run')
    .order('extracted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.extracted_at ? new Date(data.extracted_at).getTime() : 0;
}

async function setLastCorrelationRunAt(userId) {
  const { error } = await supabaseAdmin
    .from('user_platform_data')
    .insert({
      user_id: userId,
      platform: 'twinme',
      data_type: 'correlation_run',
      raw_data: { source: 'generateCorrelationInsights' },
      extracted_at: new Date().toISOString(),
      processed: true,
    });
  if (error) log.warn('setLastCorrelationRunAt insert failed', { userId, error: error.message });
}

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
    if (!Array.isArray(parsed)) return null;
    // audit-2026-05-16: return the source text alongside the insights so
    // the caller can apply the hallucination guard against the same
    // evidence the LLM saw.
    return { insights: parsed, evidence: sourceText };
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

    // Fetch recent platform_data memories (last 48h) to scan for evidence. Keep
    // created_at so each nudge is scored ONLY against activity created AFTER it was
    // delivered — activity predating the nudge cannot mean the user "followed" it
    // (audit: a 12h-old nudge was matched against ~36h of pre-delivery activity).
    const { data: recentData } = await supabaseAdmin
      .from('user_memories')
      .select('content, created_at')
      .eq('user_id', userId)
      .eq('memory_type', 'platform_data')
      .gte('created_at', fortyEightHoursAgo)
      .order('created_at', { ascending: false })
      .limit(50);

    const recentRows = recentData || [];

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

      // Scope evidence to activity created AFTER this nudge was delivered.
      const sinceDelivered = nudge.delivered_at ? new Date(nudge.delivered_at).getTime() : 0;
      const recentText = recentRows
        .filter(m => !sinceDelivered || new Date(m.created_at).getTime() >= sinceDelivered)
        .map(m => m.content.toLowerCase())
        .join(' ');

      // Count keyword overlap between nudge action and post-delivery platform data
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

export {
  generateProactiveInsights,
  getUndeliveredInsights,
  markInsightsDelivered,
  evaluateNudgeOutcomes,
  getNudgeHistory,
  getNudgeEffectivenessScore,
  isInsightDuplicate,
  _findUngroundedNumbers,
  _stripDigitsForDedup,
  _extractInsightTheme,
  _parseInsightsJSON,
};
