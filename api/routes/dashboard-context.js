/**
 * Dashboard Context API — Unified endpoint for Dashboard V2
 *
 * Returns greeting, hero insight, twin stats, heatmap, next events, and platforms
 * in a single request. Cached in Redis (120s TTL).
 *
 * Performance optimizations (2026-03-25):
 * - insightCount moved into main Promise.all (was sequential)
 * - getTwinReadinessScore cached with 15min TTL (eliminates 5 COUNT queries)
 * - computeStreak cached with 1hr TTL (changes at most once/day)
 * - Redundant totalMemories COUNT eliminated (reuses readiness.total)
 * - fetchNextEvents skips connection-check query (token fetch already validates)
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

// ── Cache TTLs for sub-queries ───────────────────────────────────────────────
const READINESS_TTL = 900;  // 15 min — memory stats change slowly
const STREAK_TTL = 3600;    // 1 hr — changes at most once per day

// ── Helpers ──────────────────────────────────────────────────────────────────

// audit-2026-05-14: was `new Date().getHours()` — the Vercel lambda runs in
// UTC, so a user in Europe/Paris at 12:47 local (10:47 UTC) got "morning"
// while the /morning-briefing endpoint (which DOES honor the user's tz)
// said "Good Afternoon" on the same dashboard. Compute the hour in the
// user's stored timezone; fall back to UTC only when tz is missing/invalid.
function getTimeOfDay(timezone) {
  let hour;
  try {
    if (timezone) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        hour12: false,
      }).formatToParts(new Date());
      const hourPart = parts.find(p => p.type === 'hour');
      hour = hourPart ? parseInt(hourPart.value, 10) : new Date().getHours();
      // Intl can emit "24" for midnight in hour12:false — normalize.
      if (hour === 24) hour = 0;
    } else {
      hour = new Date().getHours();
    }
  } catch {
    hour = new Date().getHours();
  }
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
 * Compute streak: count consecutive days backward from today in daily_checkins.
 * Cached with 1hr TTL — streaks change at most once per day.
 */
async function computeStreak(userId) {
  const streakCacheKey = `streak:${userId}`;
  const cached = await cacheGet(streakCacheKey);
  if (cached != null) return typeof cached === 'number' ? cached : parseInt(cached, 10) || 0;

  const { data, error } = await supabaseAdmin
    .from('daily_checkins')
    .select('date')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(30); // reduced from 90 — 30-day streak is plenty for display

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

  cacheSet(streakCacheKey, streak, STREAK_TTL).catch(() => {});
  return streak;
}

/**
 * Fetch up to 3 upcoming calendar events with a 3s timeout.
 * Returns null if calendar is not connected or fetch fails.
 * Skips the separate connection-check query — getValidAccessToken already
 * validates the connection and returns {success: false} if not connected.
 */
async function fetchNextEvents(userId) {
  // Go straight to token fetch — it checks connection existence internally
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
    // audit-2026-05-25 (H1): daily_checkins upsert used to fire on EVERY
    // dashboard load (including cache hits). One write per page reload across
    // all users. Guarded by a Redis dedup key so we upsert at most once per
    // user per local date. The dedup key TTL exceeds 24h so we never miss a
    // day; collisions only happen across timezone boundaries which is fine
    // because the upsert is idempotent.
    const todayDateStr = new Date().toISOString().split('T')[0];
    const dailyCheckinDedupKey = `daily_checkin_done:${userId}:${todayDateStr}`;
    const ensureDailyCheckin = async () => {
      try {
        const already = await cacheGet(dailyCheckinDedupKey);
        if (already) return;
        await supabaseAdmin
          .from('daily_checkins')
          .upsert({ user_id: userId, date: todayDateStr, mood: 'neutral' }, { onConflict: 'user_id,date' });
        cacheSet(dailyCheckinDedupKey, 1, 26 * 60 * 60).catch(() => {});
      } catch (err) {
        log.warn('Daily checkin upsert failed', { message: err?.message });
      }
    };

    const cached = await cacheGet(cacheKey);
    if (cached) {
      ensureDailyCheckin();
      return res.json({ success: true, ...cached });
    }

    ensureDailyCheckin();

    // ── Parallel sub-queries ───────────────────────────────────────────────
    // All 7 branches run concurrently. insightCount was previously sequential
    // after Promise.all — now runs in parallel saving ~200-400ms.
    const [
      greetingResult,
      heroInsightResult,
      twinStatsResult,
      heatmapResult,
      nextEventsResult,
      platformsResult,
      insightCountResult,
    ] = await Promise.all([
      // 1. Greeting — prefer DB first_name over JWT/email extraction
      safeRun(async () => {
        const { data: userRow } = await supabaseAdmin
          .from('users')
          .select('first_name, timezone')
          .eq('id', userId)
          .single();
        const name = userRow?.first_name || firstName(req.user.name, req.user.email);
        return { name, timeOfDay: getTimeOfDay(userRow?.timezone) };
      }),

      // 2. Hero insight
      // audit-2026-05-25 (C1): urgency is a TEXT column so `order('urgency', desc)`
      // sorts alphabetically — "medium" > "low" > "high". Truly urgent insights
      // were buried. Fetch a small page and pick the highest urgency in JS.
      safeRun(async () => {
        const { data } = await supabaseAdmin
          .from('proactive_insights')
          .select('id, insight, category, sources, urgency, created_at')
          .eq('user_id', userId)
          .eq('delivered', false)
          .not('category', 'in', '("email_notification_sent","briefing_email")')
          .order('created_at', { ascending: false })
          .limit(20);

        if (!data || data.length === 0) return null;
        const URGENCY_RANK = { high: 3, medium: 2, low: 1 };
        const top = data
          .slice()
          .sort((a, b) => {
            const ar = URGENCY_RANK[a.urgency] ?? 0;
            const br = URGENCY_RANK[b.urgency] ?? 0;
            if (ar !== br) return br - ar;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          })[0];
        return { body: top.insight, source: top.category, insightId: top.id, sources: top.sources || [] };
      }),

      // 3. Twin stats — readiness cached 15min, streak cached 1hr
      // Reuses readiness.total instead of a separate COUNT query (was redundant).
      // memoriesThisWeek is the only remaining COUNT on user_memories here.
      safeRun(async () => {
        // Check readiness cache first (15min TTL)
        const readinessCacheKey = `readiness:${userId}`;
        let readiness = await cacheGet(readinessCacheKey);

        const now = Date.now();
        const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
        const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

        const [readinessOrNull, weekResult, prevWeekResult, streak] = await Promise.all([
          readiness ? null : getTwinReadinessScore(userId),
          supabaseAdmin
            .from('user_memories')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('created_at', oneWeekAgo),
          supabaseAdmin
            .from('user_memories')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('created_at', twoWeeksAgo)
            .lt('created_at', oneWeekAgo),
          computeStreak(userId),
        ]);

        if (!readiness && readinessOrNull) {
          readiness = readinessOrNull;
          cacheSet(readinessCacheKey, readiness, READINESS_TTL).catch(() => {});
        }

        const thisWeek = weekResult.count || 0;
        const lastWeek = prevWeekResult.count || 0;
        const trend = lastWeek === 0 ? 0 : Math.round(((thisWeek - lastWeek) / lastWeek) * 100);

        return {
          readiness: { ...(readiness || { score: 0, label: 'Just getting started' }), trend },
          totalMemories: readiness?.total || 0,
          memoriesThisWeek: thisWeek,
          streak,
        };
      }),

      // 4. Heatmap — lazy-loaded via /api/dashboard/context/heatmap (removed from main payload)
      safeRun(() => Promise.resolve(null)),

      // 5. Next events (1.5s timeout)
      safeRun(() =>
        Promise.race([
          fetchNextEvents(userId),
          new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
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

      // 7. Insight count (was SEQUENTIAL after Promise.all — now parallel)
      safeRun(async () => {
        const { count } = await supabaseAdmin
          .from('proactive_insights')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('delivered', false)
          .not('category', 'in', '("email_notification_sent","briefing_email")');
        return count || 0;
      }),
    ]);

    const enrichedGreeting = {
      ...greetingResult,
      insightCount: insightCountResult ?? 0,
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
 * Heatmap — lazy-loaded separately from main context for faster initial dashboard render.
 */
router.get('/heatmap', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const hmCacheKey = `heatmap:${userId}`;
    const cached = await cacheGet(hmCacheKey);
    if (cached) return res.json({ success: true, heatmap: cached });

    const { data, error } = await supabaseAdmin.rpc('get_daily_memory_counts', {
      p_user_id: userId,
    });

    if (error) {
      // audit-2026-05-25 (M4): used to swallow this and return success with
      // an empty heatmap, hiding real RPC failures. Surface 500 so the
      // frontend can decide whether to retry; useDashboardContext.fetchHeatmap
      // already treats non-200 as "show empty heatmap".
      log.error('Heatmap RPC error:', error.message);
      return res.status(500).json({ success: false, error: 'heatmap_unavailable' });
    }

    const heatmap = data || [];
    cacheSet(hmCacheKey, heatmap, 1800).catch(() => {}); // 30min TTL
    return res.json({ success: true, heatmap });
  } catch (err) {
    log.error('Heatmap error:', err.message);
    return res.json({ success: true, heatmap: [] });
  }
});

/**
 * Today's twin activity: proactive insights + agent actions merged chronologically.
 */
router.get('/timeline', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Cache check
    // audit-2026-05-25 (M5): redisClient.get already runs JSON.parse and .set
    // already runs JSON.stringify, so the previous manual parse/stringify
    // double-encoded — the cache effectively never hit. Just hand raw objects
    // to cacheGet/cacheSet like the rest of this file.
    const cacheKey = `timeline:${userId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    const [{ data: insights }, { data: actions }] = await Promise.all([
      supabaseAdmin
        .from('proactive_insights')
        .select('id, insight, category, urgency, delivered, created_at')
        .eq('user_id', userId)
        .gte('created_at', todayISO)
        .not('category', 'in', '("email_notification_sent","briefing_email")')
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
    cacheSet(cacheKey, result, 60).catch(() => {});

    return res.json(result);
  } catch (err) {
    log.error('Timeline fetch failed', { error: err.message });
    return res.status(500).json({ error: 'Timeline unavailable' });
  }
});

export default router;
