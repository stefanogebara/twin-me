/**
 * Dashboard Context API — Unified endpoint for Dashboard V2
 *
 * Returns greeting, hero insight, twin stats, heatmap, next events, and platforms
 * in a single request. Cached in Redis (120s TTL).
 */

import express from 'express';
import { google } from 'googleapis';
import { supabaseAdmin } from '../services/database.js';
import { authenticateUser } from '../middleware/auth.js';
import { get as cacheGet, set as cacheSet, CACHE_TTL, CACHE_KEYS } from '../services/redisClient.js';
import { getTwinReadinessScore } from '../services/memoryStreamService.js';
import { getValidAccessToken as getCentralizedToken } from '../services/tokenRefreshService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('DashboardContext');

const router = express.Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function firstName(fullName, email) {
  if (fullName) return fullName.split(' ')[0];
  // Fallback: extract name from email (e.g. "stefano@gmail.com" → "Stefano")
  if (email) {
    const local = email.split('@')[0].replace(/[._\-+]/g, ' ').split(' ')[0];
    if (local && local.length > 1) {
      return local.charAt(0).toUpperCase() + local.slice(1).toLowerCase();
    }
  }
  return null;
}

/**
 * Compute streak: count consecutive days backward from today in daily_checkins
 */
async function computeStreak(userId) {
  const { data, error } = await supabaseAdmin
    .from('daily_checkins')
    .select('date')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(90);

  if (error || !data || data.length === 0) return 0;

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < data.length; i++) {
    const expected = new Date(today);
    expected.setDate(expected.getDate() - i);
    const expectedStr = expected.toISOString().slice(0, 10);

    if (data[i].date === expectedStr) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Fetch up to 3 upcoming calendar events with a 3s timeout.
 * Returns null if calendar is not connected or fetch fails.
 */
async function fetchNextEvents(userId) {
  // Check if calendar is connected
  const { data: conn } = await supabaseAdmin
    .from('platform_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('platform', 'google_calendar')
    .eq('status', 'connected')
    .limit(1)
    .maybeSingle();

  if (!conn) return null;

  const tokenResult = await getCentralizedToken(userId, 'google_calendar');
  if (!tokenResult.success) return null;

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: tokenResult.accessToken });
  const calendar = google.calendar({ version: 'v3', auth });

  const now = new Date();
  const endOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: endOfTomorrow.toISOString(),
    maxResults: 3,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const items = response.data.items || [];
  return items.map((ev) => ({
    title: ev.summary || '(No title)',
    start: ev.start?.dateTime || ev.start?.date || null,
    end: ev.end?.dateTime || ev.end?.date || null,
  }));
}

// ── Main endpoint ────────────────────────────────────────────────────────────

/**
 * GET /api/dashboard/context
 * Unified dashboard payload — all sub-queries run in parallel.
 * Each sub-query is wrapped in try/catch so partial failures never crash the response.
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const cacheKey = CACHE_KEYS.dashboardContext(userId);

    // ── Cache check ────────────────────────────────────────────────────────
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return res.json({ success: true, ...cached });
    }

    // ── Parallel sub-queries ───────────────────────────────────────────────
    const [
      greetingResult,
      heroInsightResult,
      twinStatsResult,
      heatmapResult,
      nextEventsResult,
      platformsResult,
    ] = await Promise.all([
      // 1. Greeting — prefer DB first_name over JWT/email extraction
      safeRun(async () => {
        const { data: userRow } = await supabaseAdmin
          .from('users')
          .select('first_name')
          .eq('id', userId)
          .single();
        const name = userRow?.first_name || firstName(req.user.name, req.user.email);
        return { name, timeOfDay: getTimeOfDay() };
      }),

      // 2. Hero insight
      safeRun(async () => {
        const { data } = await supabaseAdmin
          .from('proactive_insights')
          .select('id, insight, category')
          .eq('user_id', userId)
          .eq('delivered', false)
          .order('urgency', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!data) return null;
        return { body: data.insight, source: data.category, insightId: data.id };
      }),

      // 3. Twin stats
      safeRun(async () => {
        const [readiness, totalResult, weekResult, streak] = await Promise.all([
          getTwinReadinessScore(userId),
          supabaseAdmin
            .from('user_memories')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId),
          supabaseAdmin
            .from('user_memories')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
          computeStreak(userId),
        ]);

        return {
          readiness,
          totalMemories: totalResult.count || 0,
          memoriesThisWeek: weekResult.count || 0,
          streak,
        };
      }),

      // 4. Heatmap
      safeRun(async () => {
        const { data, error } = await supabaseAdmin.rpc('get_daily_memory_counts', {
          p_user_id: userId,
        });
        if (error) {
          log.error('Heatmap RPC error:', error.message);
          return [];
        }
        return data || [];
      }),

      // 5. Next events (3s timeout)
      safeRun(() =>
        Promise.race([
          fetchNextEvents(userId),
          new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
        ])
      ),

      // 6. Platforms
      safeRun(async () => {
        const [pcResult, nangoResult] = await Promise.all([
          supabaseAdmin
            .from('platform_connections')
            .select('platform, status, last_sync_at')
            .eq('user_id', userId),
          supabaseAdmin
            .from('nango_connection_mappings')
            .select('provider, created_at')
            .eq('user_id', userId),
        ]);

        const platforms = [];

        if (pcResult.data) {
          for (const p of pcResult.data) {
            platforms.push({
              name: p.platform,
              lastSync: p.last_sync_at || null,
              status: p.status,
            });
          }
        }

        if (nangoResult.data) {
          const existing = new Set(platforms.map((p) => p.name));
          for (const n of nangoResult.data) {
            if (!existing.has(n.provider)) {
              platforms.push({
                name: n.provider,
                lastSync: n.created_at || null,
                status: 'connected',
              });
            }
          }
        }

        return platforms;
      }),
    ]);

    // Count total undelivered insights for greeting subtitle
    let insightCount = 0;
    try {
      const { count } = await supabaseAdmin
        .from('proactive_insights')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('delivered', false);
      insightCount = count || 0;
    } catch { /* noop */ }

    const enrichedGreeting = {
      ...greetingResult,
      insightCount,
      streak: twinStatsResult?.streak ?? 0,
    };

    const payload = {
      greeting: enrichedGreeting,
      heroInsight: heroInsightResult,
      twinStats: twinStatsResult,
      heatmap: heatmapResult,
      nextEvents: nextEventsResult,
      platforms: platformsResult,
    };

    // ── Cache (fire-and-forget) ────────────────────────────────────────────
    cacheSet(cacheKey, payload, CACHE_TTL.DASHBOARD_CONTEXT).catch(() => {});

    return res.json({ success: true, ...payload });
  } catch (error) {
    log.error('Fatal error:', error);
    return res.status(500).json({ success: false, error: 'Failed to load dashboard context' });
  }
});

/**
 * Run an async function, returning null on failure instead of throwing.
 */
async function safeRun(fn) {
  try {
    return await fn();
  } catch (err) {
    log.error('Sub-query failed:', err.message);
    return null;
  }
}

/**
 * GET /api/dashboard/context/timeline
 * Today's twin activity: proactive insights + agent actions merged chronologically.
 */
router.get('/timeline', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Cache check
    const cacheKey = `timeline:${userId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    const [{ data: insights }, { data: actions }] = await Promise.all([
      supabaseAdmin
        .from('proactive_insights')
        .select('id, insight, category, urgency, delivered, created_at')
        .eq('user_id', userId)
        .gte('created_at', todayISO)
        .order('created_at', { ascending: false })
        .limit(20),
      supabaseAdmin
        .from('agent_actions')
        .select('id, skill_name, action_type, action_content, user_response, created_at')
        .eq('user_id', userId)
        .gte('created_at', todayISO)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    const timeline = [
      ...(insights || []).map(i => ({
        id: i.id,
        type: 'insight',
        title: i.category?.replace(/_/g, ' ') || 'Insight',
        body: (i.insight || '').slice(0, 200),
        category: i.category,
        timestamp: i.created_at,
        metadata: { urgency: i.urgency, delivered: i.delivered },
      })),
      ...(actions || []).map(a => ({
        id: a.id,
        type: 'action',
        title: a.skill_name?.replace(/_/g, ' ') || a.action_type || 'Action',
        body: (a.action_content || '').slice(0, 200),
        category: a.skill_name || a.action_type,
        timestamp: a.created_at,
        metadata: { response: a.user_response },
      })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const result = { timeline };
    cacheSet(cacheKey, JSON.stringify(result), 60).catch(() => {});

    return res.json(result);
  } catch (err) {
    log.error('Timeline fetch failed', { error: err.message });
    return res.status(500).json({ error: 'Timeline unavailable' });
  }
});

export default router;
