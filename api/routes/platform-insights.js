/**
 * Platform Insights API Routes
 *
 * Provides conversational twin reflections for each connected platform.
 * These are NOT stats dashboards - they're introspective observations
 * from your digital twin about what it has noticed.
 *
 * Endpoints:
 * GET  /api/insights/:platform              - Get reflection + patterns + history
 * POST /api/insights/:platform/refresh      - Force regenerate reflection
 * POST /api/insights/proactive/:id/engage   - Mark a proactive insight as engaged
 * GET  /api/insights/proactive/engagement-stats - Engagement stats (last 30 days)
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import platformReflectionService from '../services/platformReflectionService.js';
import { supabaseAdmin } from '../services/database.js';
import { seedPatternFromInsight } from '../services/twinPatternService.js';
import { get as redisGet, set as redisSet } from '../services/redisClient.js';
import { createLogger } from '../services/logger.js';
import { generateProactiveInsights } from '../services/proactiveInsights.js';
import { generateInboxBrief } from '../services/inboxIntelligenceService.js';
import { sendEmail } from '../services/googleWorkspaceActions.js';
import { findUnansweredThreads } from '../services/relationshipsService.js';

const log = createLogger('PlatformInsights');

const router = express.Router();

// Redis cache key for insights summary
const SUMMARY_CACHE_KEY = (userId) => `insights_summary:${userId}`;
const SUMMARY_CACHE_TTL = 14400; // 4 hours in seconds

// Wrap a promise with a hard timeout — returns a timeout error if it exceeds the deadline
const INSIGHTS_TIMEOUT_MS = 20_000;
function withTimeout(promise, ms = INSIGHTS_TIMEOUT_MS) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Insights request timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

// Warm-path timeout: a cache hit still re-fetches platform visual data, so allow
// some headroom but far less than a cold LLM generation (which is handled in the
// background instead of blocking the request).
const WARM_TIMEOUT_MS = 12_000;

// Cold-path peek: how long to wait on a fresh generation before giving up and
// returning `generating: true`. Long enough to return fast results inline (a
// no-data short-circuit, or a quick generation) so connected-but-empty platforms
// still show their empty state immediately; short enough that a slow LLM call
// doesn't block the request (it finishes in the background and warms the cache).
const COLD_PEEK_MS = 4_000;

// In-memory lock: while a cold generation runs for a (user, platform), repeated
// requests (the frontend polls while "generating") must NOT each spawn another
// LLM call. Single-instance scope — mirrors the inbox/relationships refresh locks.
const insightsGenerating = new Map(); // `${userId}:${platform}` -> startedAt ms
const GENERATION_LOCK_MS = 90_000;
function isInsightGenerating(key) {
  const startedAt = insightsGenerating.get(key);
  return !!(startedAt && Date.now() - startedAt < GENERATION_LOCK_MS);
}

// Valid platforms
const VALID_PLATFORMS = ['spotify', 'calendar', 'youtube', 'web', 'discord', 'linkedin'];

// Map URL platform names to database platform names
// Calendar is stored as 'google_calendar' in platform_connections
const PLATFORM_DB_NAMES = {
  'calendar': 'google_calendar',
  'gmail': 'google_gmail',
};

/**
 * GET /api/insights
 * Root handler — API discovery
 */
router.get('/', authenticateUser, async (req, res) => {
  res.json({ success: true, message: 'Insights API. Available endpoints vary by platform.' });
});

/**
 * GET /api/insights/all
 * Get reflections for all connected platforms at once
 * Useful for dashboard preview
 * NOTE: Must be registered BEFORE GET /:platform to avoid being shadowed.
 */
router.get('/all/summary', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  log.info('GET /all/summary', { userId });

  try {
    // 1. Check Redis cache first — instant response
    const cached = await redisGet(SUMMARY_CACHE_KEY(userId));
    if (cached) {
      log.info('Cache HIT for summary', { userId });
      return res.json({
        success: true,
        summary: cached,
        cached: true
      });
    }

    // 2. Cache miss — return "generating" immediately, don't block
    log.info('Cache MISS for summary - generating in background', { userId });
    res.json({
      success: true,
      summary: {
        spotify: { connected: false },
        calendar: { connected: false },
        youtube: { connected: false },
        web: { connected: false }
      },
      generating: true
    });

    // 3. Fire background generation (non-blocking — response already sent)
    generateAndCacheSummary(userId).catch(err =>
      log.error('Background summary generation failed', { userId, error: err })
    );
  } catch (error) {
    log.error('Summary error', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get insights summary',
      message: error.message
    });
  }
});

/**
 * Generate insights summary for all platforms and cache in Redis.
 * Called from the route handler (background) and from cron jobs (pre-warm).
 */
export async function generateAndCacheSummary(userId) {
  const platforms = ['spotify', 'calendar', 'youtube', 'web'];

  const results = await Promise.allSettled(
    platforms.map(p => withTimeout(platformReflectionService.getReflections(userId, p)))
  );

  const makeSummary = (result) =>
    result.status === 'fulfilled' && result.value.success
      ? { connected: true, preview: result.value.reflection?.text?.substring(0, 100) + '...' }
      : { connected: false };

  const summary = Object.fromEntries(
    platforms.map((p, i) => [p, makeSummary(results[i])])
  );

  // Cache result — longer TTL when we have data, shorter for empty to prevent miss storms
  const hasData = Object.values(summary).some(s => s.connected);
  const ttl = hasData ? SUMMARY_CACHE_TTL : 300; // 4h for real data, 5min for empty
  await redisSet(SUMMARY_CACHE_KEY(userId), summary, ttl);
  log.info('Cached summary', { userId, ttl, hasData });

  return summary;
}

/**
 * GET /api/insights/proactive/engagement-stats
 * Returns engagement breakdown by category and urgency for the last 30 days.
 * NOTE: Must be registered BEFORE GET /:platform to avoid being shadowed.
 */
router.get('/proactive/engagement-stats', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('proactive_insights')
    .select('category, urgency, engaged, delivered')
    .eq('user_id', userId)
    .gte('created_at', since);

  if (error) {
    log.error('engagement-stats error', { error });
    return res.status(500).json({ success: false, error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error' });
  }

  const stats = { total: data?.length || 0, engaged: 0, byCategory: {}, byUrgency: {} };
  for (const row of (data || [])) {
    if (row.engaged) stats.engaged++;

    if (!stats.byCategory[row.category]) {
      stats.byCategory[row.category] = { total: 0, engaged: 0 };
    }
    stats.byCategory[row.category].total++;
    if (row.engaged) stats.byCategory[row.category].engaged++;

    if (!stats.byUrgency[row.urgency]) {
      stats.byUrgency[row.urgency] = { total: 0, engaged: 0 };
    }
    stats.byUrgency[row.urgency].total++;
    if (row.engaged) stats.byUrgency[row.urgency].engaged++;
  }

  res.json({ success: true, data: stats });
});

/**
 * GET /api/insights/proactive
 * Returns proactive insights for the authenticated user.
 * NOTE: Must be registered BEFORE GET /:platform to avoid being shadowed.
 */
router.get('/proactive', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const includeDelivered = req.query.include_delivered === 'true';
    // Optional narrow filters used by domain-specific pages (e.g. /money/insights
    // wants only investment_correlation subcategory rows). Stored on
    // proactive_insights.metadata.subcategory by the dedicated generators
    // (see investmentCorrelationInsights.js).
    const subcategory = typeof req.query.subcategory === 'string' ? req.query.subcategory.trim() : '';
    const department = typeof req.query.department === 'string' ? req.query.department.trim() : '';

    const query = supabaseAdmin
      .from('proactive_insights')
      .select('id, insight, urgency, category, department, created_at, delivered, engaged, nudge_action, sources, metadata')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!includeDelivered) {
      query.eq('delivered', false);
    }
    if (subcategory) {
      query.filter('metadata->>subcategory', 'eq', subcategory);
    }
    if (department) {
      query.eq('department', department);
    }

    // Filter out insights the user has already acted on (accepted/dismissed)
    // so they don't reappear in the feed after feedback.
    query.is('nudge_followed', null);

    const { data, error } = await query;

    if (error) {
      log.error('GET /proactive error', { error });
      return res.status(500).json({ success: false, error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error' });
    }

    // Sort by urgency (high > medium > low), then by recency
    const urgencyOrder = { high: 0, medium: 1, low: 2 };
    const sorted = (data || []).sort((a, b) => {
      const urgDiff = (urgencyOrder[a.urgency] || 2) - (urgencyOrder[b.urgency] || 2);
      if (urgDiff !== 0) return urgDiff;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    res.json({ success: true, insights: sorted });
  } catch (error) {
    log.error('GET /proactive error', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch proactive insights' });
  }
});

/**
 * POST /api/insights/proactive/generate
 * On-demand proactive insight generation.
 *
 * Called by the onboarding flow immediately after a user connects their first
 * platform. The OAuth callback used to chain this inline, but the LLM call
 * takes ~40s which would blow the 60s Vercel maxDuration when combined with
 * extraction + ingestion. Moving it to a user-initiated request gives the
 * browser a spinner to show and avoids the timeout.
 *
 * Idempotent with a 10-minute window: if fresh insights already exist,
 * returns immediately without re-triggering the LLM. Prevents double-clicks,
 * accidental page refreshes, or retry-on-slow-network from duplicating cost.
 *
 * Must be registered BEFORE GET /:platform to avoid being shadowed.
 */
router.post('/proactive/generate', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  try {
    // Idempotency: skip regeneration if any insight was created in last 10 min.
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: existing, error: checkErr } = await supabaseAdmin
      .from('proactive_insights')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', tenMinutesAgo)
      .limit(1);

    if (checkErr) {
      log.warn('Idempotency check failed, proceeding with generation', { error: checkErr.message });
    }

    if (existing && existing.length > 0) {
      log.info('Fresh insights exist, skipping regeneration', { userId });
      return res.json({ success: true, cached: true });
    }

    // ~40s LLM call. Client should show a spinner.
    await generateProactiveInsights(userId);
    log.info('On-demand insight generation complete', { userId });

    res.json({ success: true, cached: false });
  } catch (error) {
    log.error('POST /proactive/generate error', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to generate insights' });
  }
});

/**
 * GET /api/insights/inbox
 * Returns the most recent email_triage insight (last 48h) with structured email metadata.
 * Unlike /proactive, this includes already-delivered insights so the in-app view
 * works even after WhatsApp delivery has marked the insight as delivered.
 */
router.get('/inbox', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from('proactive_insights')
      .select('id, insight, urgency, category, created_at, delivered, metadata')
      .eq('user_id', userId)
      .eq('category', 'email_triage')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      return res.status(500).json({ success: false, error: 'Failed to fetch inbox brief' });
    }

    return res.json({ success: true, brief: data || null });
  } catch (err) {
    log.error('GET /inbox error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch inbox brief' });
  }
});

// Per-user lock for on-demand refresh — prevents double-clicks burning LLM
// budget. 60s window is long enough to cover the slowest brief (~25s).
const inboxRefreshLocks = new Map();
const INBOX_REFRESH_LOCK_MS = 60_000;

function tryAcquireRefreshLock(userId) {
  const now = Date.now();
  const last = inboxRefreshLocks.get(userId);
  if (last && now - last < INBOX_REFRESH_LOCK_MS) {
    return { acquired: false, retryInMs: INBOX_REFRESH_LOCK_MS - (now - last) };
  }
  inboxRefreshLocks.set(userId, now);
  return { acquired: true };
}

/**
 * POST /api/insights/inbox/refresh
 * On-demand brief regeneration. Bypasses the cron's 20h cooldown but applies
 * a 60s per-user lock. Persists the brief as a proactive insight (only when
 * status is 'ok' with real emails) and returns the latest brief envelope.
 */
router.post('/inbox/refresh', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  const lock = tryAcquireRefreshLock(userId);
  if (!lock.acquired) {
    return res.status(429).json({
      success: false,
      error: 'rate_limited',
      retryInMs: lock.retryInMs,
    });
  }

  try {
    const brief = await generateInboxBrief(userId);
    log.info('Refresh brief generated', { userId, status: brief?.status, count: brief?.count });

    // Persist only when we actually have emails to surface — empty-state briefs
    // (no_unread, all_noise, etc.) shouldn't pollute the proactive_insights feed
    // or get re-delivered to messaging channels.
    if (brief?.status === 'ok' && brief.count > 0) {
      const metadata = {
        emails: brief.emails.map(e => ({
          id: e.id,
          from: e.from,
          subject: e.subject,
          summary: e.summary,
          draft: e.draft,
          score: e.score,
          category: e.category,
        })),
        count: brief.count,
        on_demand: true,
      };

      // The DB trigger `trg_insight_cooldown` silently blocks repeat email_triage
      // inserts within 20h. For the user-facing refresh button to actually
      // refresh, upsert into today's existing row when present.
      const cutoff = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
      const { data: existing } = await supabaseAdmin
        .from('proactive_insights')
        .select('id, metadata')
        .eq('user_id', userId)
        .eq('category', 'email_triage')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let persisted = null;

      if (existing?.id) {
        // Preserve user-applied dismissed/sent flags across refresh; new draft
        // suggestions overwrite any stale ones.
        const merged = {
          ...metadata,
          dismissed: existing.metadata?.dismissed || [],
          sent: existing.metadata?.sent || [],
        };
        const { data: updated, error: updateErr } = await supabaseAdmin
          .from('proactive_insights')
          .update({ insight: brief.message, metadata: merged })
          .eq('id', existing.id)
          .eq('user_id', userId)
          .select('id, insight, urgency, category, created_at, delivered, metadata')
          .single();
        if (updateErr || !updated) {
          log.error('Refresh update failed', { userId, error: updateErr?.message });
          return res.status(500).json({ success: false, error: 'Failed to persist brief' });
        }
        persisted = updated;
      } else {
        const { data: inserted, error: insertErr } = await supabaseAdmin
          .from('proactive_insights')
          .insert({
            user_id: userId,
            insight: brief.message,
            urgency: 'medium',
            category: 'email_triage',
            delivered: true,
            delivered_at: new Date().toISOString(),
            metadata,
          })
          .select('id, insight, urgency, category, created_at, delivered, metadata')
          .single();
        if (insertErr || !inserted) {
          log.error('Refresh insert failed', { userId, error: insertErr?.message });
          return res.status(500).json({ success: false, error: 'Failed to persist brief' });
        }
        persisted = inserted;
      }

      return res.json({ success: true, brief: persisted, status: 'ok' });
    }

    // Empty-state: return a synthetic brief so the card has something to render.
    return res.json({
      success: true,
      brief: null,
      status: brief?.status || 'unknown',
      message: brief?.message || 'No inbox brief available.',
    });
  } catch (err) {
    log.error('POST /inbox/refresh error', { userId, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to refresh inbox brief' });
  }
});

/**
 * Helper: read latest email_triage insight for a user (last 48h).
 */
async function getLatestInboxInsight(userId) {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from('proactive_insights')
    .select('id, metadata')
    .eq('user_id', userId)
    .eq('category', 'email_triage')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

/**
 * POST /api/insights/inbox/email/:gmailMessageId/dismiss
 * Mark a single email as dismissed inside the latest brief's metadata.
 * Frontend filters dismissed IDs out before rendering.
 */
router.post('/inbox/email/:gmailMessageId/dismiss', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { gmailMessageId } = req.params;
  if (!gmailMessageId) return res.status(400).json({ success: false, error: 'Missing gmailMessageId' });

  try {
    const insight = await getLatestInboxInsight(userId);
    if (!insight) {
      return res.status(404).json({ success: false, error: 'No active inbox brief' });
    }

    const metadata = insight.metadata || {};
    const dismissed = Array.isArray(metadata.dismissed) ? metadata.dismissed : [];
    if (!dismissed.includes(gmailMessageId)) dismissed.push(gmailMessageId);

    const { error } = await supabaseAdmin
      .from('proactive_insights')
      .update({ metadata: { ...metadata, dismissed } })
      .eq('id', insight.id)
      .eq('user_id', userId);

    if (error) {
      log.error('Dismiss update failed', { userId, error: error.message });
      return res.status(500).json({ success: false, error: 'Failed to dismiss' });
    }
    return res.json({ success: true, dismissed });
  } catch (err) {
    log.error('POST /inbox/email/:id/dismiss error', { userId, gmailMessageId, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to dismiss' });
  }
});

/**
 * POST /api/insights/inbox/email/:gmailMessageId/send
 * Body: { body: string, to?: string, subject?: string }
 * Sends a reply via existing Gmail API client. Records the gmail message ID in
 * the brief's metadata.sent[] so the card can hide that row after success.
 */
router.post('/inbox/email/:gmailMessageId/send', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { gmailMessageId } = req.params;
  const { body, to: toOverride, subject: subjectOverride } = req.body || {};

  if (!gmailMessageId) return res.status(400).json({ success: false, error: 'Missing gmailMessageId' });
  if (!body || typeof body !== 'string' || !body.trim()) {
    return res.status(400).json({ success: false, error: 'Body is required' });
  }
  if (body.length > 5000) {
    return res.status(400).json({ success: false, error: 'Body too long (max 5000)' });
  }

  try {
    const insight = await getLatestInboxInsight(userId);
    if (!insight) {
      return res.status(404).json({ success: false, error: 'No active inbox brief' });
    }
    const emails = insight.metadata?.emails || [];
    const targetEmail = emails.find(e => e.id === gmailMessageId);
    if (!targetEmail) {
      return res.status(404).json({ success: false, error: 'Email not found in current brief' });
    }

    // Extract recipient email address from "Name <email>" format
    const fromMatch = targetEmail.from?.match(/<([^>]+)>/);
    const recipient = toOverride || (fromMatch ? fromMatch[1] : targetEmail.from);

    const result = await sendEmail(userId, {
      to: recipient,
      subject: subjectOverride, // sendEmail will derive Re: subject when omitted
      body: body.trim(),
      replyToMessageId: gmailMessageId,
    });

    if (!result.success) {
      return res.status(502).json({ success: false, error: result.error || 'Send failed' });
    }

    // Record the send so the row hides on next render
    const metadata = insight.metadata || {};
    const sent = Array.isArray(metadata.sent) ? metadata.sent : [];
    if (!sent.includes(gmailMessageId)) sent.push(gmailMessageId);
    await supabaseAdmin
      .from('proactive_insights')
      .update({ metadata: { ...metadata, sent } })
      .eq('id', insight.id)
      .eq('user_id', userId);

    return res.json({ success: true, messageId: result.messageId, sent });
  } catch (err) {
    log.error('POST /inbox/email/:id/send error', { userId, gmailMessageId, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to send reply' });
  }
});

// ============================================================================
// Relationships agent endpoints — mirrors the inbox card pattern.
// ============================================================================

const relationshipsRefreshLocks = new Map();
const RELATIONSHIPS_REFRESH_LOCK_MS = 60_000;

function tryAcquireRelLock(userId) {
  const now = Date.now();
  const last = relationshipsRefreshLocks.get(userId);
  if (last && now - last < RELATIONSHIPS_REFRESH_LOCK_MS) {
    return { acquired: false, retryInMs: RELATIONSHIPS_REFRESH_LOCK_MS - (now - last) };
  }
  relationshipsRefreshLocks.set(userId, now);
  return { acquired: true };
}

async function getLatestRelationshipsInsight(userId) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from('proactive_insights')
    .select('id, insight, urgency, category, created_at, metadata')
    .eq('user_id', userId)
    .eq('category', 'relationship_followup')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

/**
 * GET /api/insights/relationships
 * Returns the latest relationship_followup insight (last 24h).
 */
router.get('/relationships', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  try {
    const data = await getLatestRelationshipsInsight(userId);
    return res.json({ success: true, brief: data || null });
  } catch (err) {
    log.error('GET /relationships error', { userId, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch relationships' });
  }
});

/**
 * POST /api/insights/relationships/refresh
 * On-demand scan. 60s per-user lock. Upserts into today's row to dodge the
 * trg_insight_cooldown DB trigger (relationship_followup has 23h cooldown).
 */
router.post('/relationships/refresh', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  const lock = tryAcquireRelLock(userId);
  if (!lock.acquired) {
    return res.status(429).json({ success: false, error: 'rate_limited', retryInMs: lock.retryInMs });
  }

  try {
    const result = await findUnansweredThreads(userId);
    log.info('Relationships refresh', { userId, status: result.status, count: result.relationships?.length });

    if (result.status !== 'ok' || !result.relationships.length) {
      return res.json({
        success: true,
        brief: null,
        status: result.status || 'unknown',
      });
    }

    const lines = result.relationships.map((r, i) =>
      `${i + 1}. ${r.name} — ${r.thread_count} message${r.thread_count > 1 ? 's' : ''} unanswered for ${r.days_unanswered}d`
    );
    const insightText = [
      `${result.relationships.length} ${result.relationships.length === 1 ? 'person is' : 'people are'} waiting on you:`,
      '',
      ...lines,
    ].join('\n');

    const cutoff = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await supabaseAdmin
      .from('proactive_insights')
      .select('id, metadata')
      .eq('user_id', userId)
      .eq('category', 'relationship_followup')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let persisted;
    if (existing?.id) {
      // Preserve user-applied dismissed flags across refresh.
      const merged = {
        relationships: result.relationships,
        count: result.relationships.length,
        dismissed: existing.metadata?.dismissed || [],
        on_demand: true,
      };
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('proactive_insights')
        .update({ insight: insightText, metadata: merged, urgency: 'medium' })
        .eq('id', existing.id)
        .eq('user_id', userId)
        .select('id, insight, urgency, category, created_at, metadata')
        .single();
      if (updateErr || !updated) {
        log.error('Refresh update failed', { userId, error: updateErr?.message });
        return res.status(500).json({ success: false, error: 'Failed to persist' });
      }
      persisted = updated;
    } else {
      const top = result.relationships[0];
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('proactive_insights')
        .insert({
          user_id: userId,
          insight: insightText,
          urgency: 'medium',
          category: 'relationship_followup',
          delivered: true,
          delivered_at: new Date().toISOString(),
          nudge_action: top ? `Reply to ${top.name} — they've waited ${top.days_unanswered} days.` : null,
          metadata: {
            relationships: result.relationships,
            count: result.relationships.length,
            on_demand: true,
          },
        })
        .select('id, insight, urgency, category, created_at, metadata')
        .single();
      if (insertErr || !inserted) {
        log.error('Refresh insert failed', { userId, error: insertErr?.message });
        return res.status(500).json({ success: false, error: 'Failed to persist' });
      }
      persisted = inserted;
    }

    return res.json({ success: true, brief: persisted, status: 'ok' });
  } catch (err) {
    log.error('POST /relationships/refresh error', { userId, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to refresh' });
  }
});

/**
 * POST /api/insights/relationships/dismiss
 * Body: { email: string }
 * Adds the email to metadata.dismissed[] on the latest relationships brief.
 * Frontend filters dismissed entries client-side.
 */
router.post('/relationships/dismiss', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : null;
  if (!email) return res.status(400).json({ success: false, error: 'email is required' });

  try {
    const insight = await getLatestRelationshipsInsight(userId);
    if (!insight) return res.status(404).json({ success: false, error: 'No active relationships brief' });

    const metadata = insight.metadata || {};
    const dismissed = Array.isArray(metadata.dismissed) ? metadata.dismissed : [];
    if (!dismissed.includes(email)) dismissed.push(email);

    const { error } = await supabaseAdmin
      .from('proactive_insights')
      .update({ metadata: { ...metadata, dismissed } })
      .eq('id', insight.id)
      .eq('user_id', userId);

    if (error) {
      log.error('Dismiss update failed', { userId, error: error.message });
      return res.status(500).json({ success: false, error: 'Failed to dismiss' });
    }
    return res.json({ success: true, dismissed });
  } catch (err) {
    log.error('POST /relationships/dismiss error', { userId, email, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to dismiss' });
  }
});

/**
 * GET /api/insights/:platform
 * Get conversational reflections for a specific platform
 */
router.get('/:platform', authenticateUser, async (req, res) => {
  const { platform } = req.params;
  const userId = req.user.id;

  log.info('GET platform insights', { platform, userId });

  // Validate platform
  if (!VALID_PLATFORMS.includes(platform)) {
    return res.status(400).json({
      success: false,
      error: `Invalid platform: ${platform}. Valid platforms: ${VALID_PLATFORMS.join(', ')}`
    });
  }

  try {
    // Pre-check: verify platform is actually connected before doing any work.
    // Map URL platform name to DB name (e.g. 'calendar' -> 'google_calendar')
    const dbPlatformName = PLATFORM_DB_NAMES[platform] || platform;

    const { data: connection, error: connErr } = await supabaseAdmin
      .from('platform_connections')
      .select('id')
      .eq('user_id', userId)
      .eq('platform', dbPlatformName)
      .single();
    if (connErr && connErr.code !== 'PGRST116') log.error('Connection fetch error', { error: connErr });

    if (!connection) {
      return res.json({
        success: true,
        platform,
        reflection: `You haven't connected ${platform} yet. Connect it to get personalized insights!`,
        notConnected: true
      });
    }

    // Cache-first. Cold generation (context + platform data + LLM) can exceed the
    // request timeout; blocking on it returned a fallback the UI mistook for
    // "not connected" (2026-06-06 audit).
    //
    // Warm cache -> return real data (with headroom for the visual-data fetch).
    if (await platformReflectionService.hasFreshReflection(userId, platform)) {
      const result = await withTimeout(platformReflectionService.getReflections(userId, platform), WARM_TIMEOUT_MS);
      return res.json(result?.success ? result : { success: true, platform, generating: true });
    }

    // Cold cache. Start ONE generation (the lock guards against frontend
    // poll-storms spawning duplicate LLM calls), then race it against a short
    // peek deadline:
    //   - settles fast with data   -> return it (no LLM was needed, or it was quick)
    //   - settles fast without data -> connected-but-empty: show empty state NOW
    //   - still pending past peek   -> `generating: true`; the background job
    //                                  finishes and warms the cache for the next poll
    const lockKey = `${userId}:${platform}`;
    if (isInsightGenerating(lockKey)) {
      return res.json({ success: true, platform, generating: true });
    }

    insightsGenerating.set(lockKey, Date.now());
    const genPromise = platformReflectionService.getReflections(userId, platform);
    genPromise
      .catch(err => log.error('Background reflection generation failed', { platform, userId, error: err?.message }))
      .finally(() => insightsGenerating.delete(lockKey));

    const raced = await Promise.race([
      genPromise.then(r => ({ kind: 'settled', result: r }), () => ({ kind: 'failed' })),
      new Promise(resolve => setTimeout(() => resolve({ kind: 'pending' }), COLD_PEEK_MS)),
    ]);

    if (raced.kind === 'settled' && raced.result?.success) {
      return res.json(raced.result);
    }
    if (raced.kind === 'settled' && !raced.result?.success) {
      // Connected but no usable data yet — surface the empty state immediately
      // instead of a spinner that never resolves.
      return res.json({
        success: true,
        platform,
        reflection: raced.result?.error || `No ${platform} data to reflect on yet.`,
        fallback: true,
      });
    }

    // Slow LLM generation still running — tell the client we're generating; the
    // background job warms the cache so the next poll returns real data.
    return res.json({ success: true, platform, generating: true });
  } catch (error) {
    log.error('Platform insights error', { platform, error });
    // Any unexpected error/timeout -> show "still generating", never a misleading
    // not-connected/empty state. Background generation (if started) continues.
    res.json({ success: true, platform, generating: true });
  }
});

/**
 * POST /api/insights/:platform/refresh
 * Force regenerate a reflection (ignore cache)
 */
router.post('/:platform/refresh', authenticateUser, async (req, res) => {
  const { platform } = req.params;
  const userId = req.user.id;

  log.info('POST platform refresh', { platform, userId });

  // Validate platform
  if (!VALID_PLATFORMS.includes(platform)) {
    return res.status(400).json({
      success: false,
      error: `Invalid platform: ${platform}. Valid platforms: ${VALID_PLATFORMS.join(', ')}`
    });
  }

  // Regenerate in the background (LLM ~15-25s) instead of blocking the request
  // and 504-ing. The lock (shared with the cold-start GET path) prevents
  // double-clicks / concurrent cold loads from burning duplicate LLM budget.
  // The client refetches GET /:platform, which returns `generating: true` and
  // polls until the fresh reflection lands.
  const lockKey = `${userId}:${platform}`;
  if (isInsightGenerating(lockKey)) {
    return res.json({ success: true, regenerating: true, alreadyRunning: true });
  }

  insightsGenerating.set(lockKey, Date.now());
  platformReflectionService.refreshReflection(userId, platform)
    .catch(err => log.error('Background reflection refresh failed', { platform, userId, error: err?.message }))
    .finally(() => insightsGenerating.delete(lockKey));

  res.json({ success: true, regenerating: true });
});

/**
 * POST /api/insights/proactive/:id/engage
 * Mark a proactive insight as engaged (user tapped/expanded it).
 * Only the owning user can mark their own insight.
 */
router.post('/proactive/:id/engage', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  const { error } = await supabaseAdmin
    .from('proactive_insights')
    .update({ engaged: true, engaged_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId); // security: user can only engage their own insights

  if (error) {
    log.error('Engage error', { id, error });
    return res.status(500).json({ success: false, error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error' });
  }

  res.json({ success: true });

  // Non-blocking: seed an EWC++ topic_affinity pattern from the engaged insight
  // so the twin learns which topics the user finds interesting over time
  supabaseAdmin
    .from('proactive_insights')
    .select('content, category')
    .eq('id', id)
    .single()
    .then(({ data }) => {
      if (!data?.content) return;
      const patternName = data.category || 'engaged_insight';
      seedPatternFromInsight(userId, patternName, data.content)
        .catch(err => log.warn('Pattern seed failed', { error: err }));
    })
    .catch(() => {});
});

/**
 * POST /api/insights/:id/nudge-feedback
 * Records user feedback on a proactive insight/nudge.
 * Body: { followed: boolean, note?: string }
 *
 * Sets nudge_followed, nudge_outcome, and nudge_checked_at so the twin learns
 * from user reactions and so the card stays archived on subsequent reloads.
 * User can only update their own insights (enforced by .eq('user_id', userId)).
 */
router.post('/:id/nudge-feedback', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { followed, note } = req.body || {};

  if (typeof followed !== 'boolean') {
    return res.status(400).json({ success: false, error: 'followed must be boolean' });
  }

  const outcome = typeof note === 'string' && note.trim()
    ? `user_feedback: ${note.trim().slice(0, 480)}`
    : followed
      ? 'user_feedback: followed'
      : 'user_feedback: not_for_me';

  const { data, error } = await supabaseAdmin
    .from('proactive_insights')
    .update({
      nudge_followed: followed,
      nudge_outcome: outcome,
      nudge_checked_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId) // security: prevent cross-user writes
    .select('id')
    .maybeSingle();

  if (error) {
    log.error('Nudge feedback error', { id, error: error.message });
    return res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }

  if (!data) {
    return res.status(404).json({ success: false, error: 'Insight not found' });
  }

  res.json({ success: true, followed });
});

export default router;
