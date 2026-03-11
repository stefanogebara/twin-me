/**
 * Admin LLM Cost Dashboard API
 *
 * Provides endpoints for monitoring LLM usage and costs.
 * Data comes from the llm_usage_log table populated by llmGateway.js.
 * All endpoints require authentication.
 */

import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { authenticateUser, requireProfessor } from '../middleware/auth.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('AdminLLMCosts');

const router = express.Router();

// All admin routes require authentication and admin/professor role
router.use(authenticateUser, requireProfessor);

// Safe integer parsing helpers — prevent NaN from crashing date/limit calculations
function parseDays(val, defaultVal = 7) {
  const n = parseInt(val, 10);
  if (isNaN(n) || n < 1) return defaultVal;
  return Math.min(n, 365);
}

function parseLimit(val, defaultVal = 100, max = 500) {
  const n = parseInt(val, 10);
  if (isNaN(n) || n < 1) return defaultVal;
  return Math.min(n, max);
}

/**
 * GET /api/admin/llm-costs
 * Summary by tier, model, and service
 */
router.get('/llm-costs', async (req, res) => {
  try {
    const periodDays = parseDays(req.query.days, 7);
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin.rpc('aggregate_llm_costs_summary', {
      since_date: since,
    });

    if (error) throw error;

    const breakdown = (data || []).map(row => ({
      tier: row.tier,
      model: row.model,
      service_name: row.service_name,
      call_count: parseInt(row.call_count),
      total_input_tokens: parseInt(row.total_input_tokens),
      total_output_tokens: parseInt(row.total_output_tokens),
      total_cost_usd: parseFloat(row.total_cost_usd) || 0,
      cache_hits: parseInt(row.cache_hits),
    }));

    let totalCost = 0;
    let totalCalls = 0;
    let totalCacheHits = 0;
    const byTier = {};

    for (const row of breakdown) {
      totalCost += row.total_cost_usd;
      totalCalls += row.call_count;
      totalCacheHits += row.cache_hits;
      if (!byTier[row.tier]) {
        byTier[row.tier] = { calls: 0, cost_usd: 0 };
      }
      byTier[row.tier].calls += row.call_count;
      byTier[row.tier].cost_usd += row.total_cost_usd;
    }

    const dailyAvg = periodDays > 0 ? totalCost / periodDays : 0;
    const monthlyProjection = dailyAvg * 30;

    res.json({
      period_days: periodDays,
      total_calls: totalCalls,
      total_cost_usd: Math.round(totalCost * 10000) / 10000,
      daily_average_usd: Math.round(dailyAvg * 10000) / 10000,
      monthly_projection_usd: Math.round(monthlyProjection * 100) / 100,
      cache_hit_rate: totalCalls > 0 ? Math.round((totalCacheHits / totalCalls) * 100) : 0,
      by_tier: byTier,
      breakdown,
    });
  } catch (error) {
    log.error('Summary error:', error.message);
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/admin/llm-costs/daily
 * Daily cost breakdown
 */
router.get('/llm-costs/daily', async (req, res) => {
  try {
    const periodDays = parseDays(req.query.days, 30);
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin.rpc('aggregate_llm_costs_daily', {
      since_date: since,
    });

    if (error) throw error;

    // Group RPC rows (day x tier) into day objects with by_tier breakdown
    const daily = {};
    for (const row of data || []) {
      const dayStr = typeof row.day === 'string' ? row.day.substring(0, 10) : row.day;
      if (!daily[dayStr]) {
        daily[dayStr] = { day: dayStr, calls: 0, cost_usd: 0, cache_hits: 0, by_tier: {} };
      }
      const calls = parseInt(row.call_count);
      const cost = parseFloat(row.total_cost_usd) || 0;
      const cacheHits = parseInt(row.cache_hits);

      daily[dayStr].calls += calls;
      daily[dayStr].cost_usd += cost;
      daily[dayStr].cache_hits += cacheHits;
      daily[dayStr].by_tier[row.tier] = { calls, cost_usd: cost };
    }

    res.json({
      period_days: periodDays,
      daily: Object.values(daily).map(d => ({
        ...d,
        cost_usd: Math.round(d.cost_usd * 10000) / 10000,
      })),
    });
  } catch (error) {
    log.error('Daily error:', error.message);
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/admin/llm-costs/realtime
 * Last 100 calls for real-time monitoring
 */
router.get('/llm-costs/realtime', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('llm_usage_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseLimit(req.query.limit, 100, 500));

    if (error) throw error;

    res.json({
      count: data?.length || 0,
      calls: data || [],
    });
  } catch (error) {
    log.error('Realtime error:', error.message);
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/admin/llm-costs/by-user
 * Cost breakdown by user — shows who's driving spend
 */
router.get('/llm-costs/by-user', async (req, res) => {
  try {
    const periodDays = parseDays(req.query.days, 7);
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();

    // Use RPC/raw SQL for server-side aggregation (table has 50k+ rows)
    const { data: aggregated, error } = await supabaseAdmin.rpc('aggregate_llm_costs_by_user', {
      since_date: since,
    });

    let users;
    if (error) {
      // Fallback: paginated client-side aggregation
      log.warn('RPC fallback, using paginated query:', error.message);
      const usersMap = {};
      let offset = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: page, error: pageErr } = await supabaseAdmin
          .from('llm_usage_log')
          .select('user_id, tier, cost_usd, input_tokens, output_tokens')
          .gte('created_at', since)
          .range(offset, offset + pageSize - 1);

        if (pageErr) throw pageErr;
        if (!page || page.length === 0) { hasMore = false; break; }

        for (const row of page) {
          const uid = row.user_id || 'system';
          if (!usersMap[uid]) {
            usersMap[uid] = { user_id: uid, call_count: 0, total_cost_usd: 0, total_tokens: 0, by_tier: {} };
          }
          usersMap[uid].call_count++;
          usersMap[uid].total_cost_usd += parseFloat(row.cost_usd) || 0;
          usersMap[uid].total_tokens += (row.input_tokens || 0) + (row.output_tokens || 0);

          if (!usersMap[uid].by_tier[row.tier]) {
            usersMap[uid].by_tier[row.tier] = { calls: 0, cost_usd: 0 };
          }
          usersMap[uid].by_tier[row.tier].calls++;
          usersMap[uid].by_tier[row.tier].cost_usd += parseFloat(row.cost_usd) || 0;
        }

        offset += pageSize;
        if (page.length < pageSize) hasMore = false;
      }

      users = Object.values(usersMap);
    } else {
      // RPC returns pre-aggregated rows
      users = (aggregated || []).map(row => ({
        user_id: row.user_id || 'system',
        call_count: parseInt(row.call_count),
        total_cost_usd: parseFloat(row.total_cost_usd) || 0,
        total_tokens: parseInt(row.total_tokens) || 0,
        by_tier: {},
      }));
    }

    // Fetch user emails for display
    const userIds = users.map(u => u.user_id).filter(id => id !== 'system');
    let userEmails = {};
    if (userIds.length > 0) {
      try {
        const { data: usersData } = await supabaseAdmin
          .from('users')
          .select('id, email, first_name')
          .in('id', userIds.slice(0, 50));

        for (const u of usersData || []) {
          userEmails[u.id] = u.email || u.first_name || u.id.substring(0, 8);
        }
      } catch (lookupErr) {
        log.warn('User lookup failed:', lookupErr.message);
      }
    }

    // Attach email and sort by cost
    const result = users
      .map(u => ({
        ...u,
        email: userEmails[u.user_id] || (u.user_id === 'system' ? 'system' : u.user_id.substring(0, 8)),
        total_cost_usd: Math.round(u.total_cost_usd * 10000) / 10000,
      }))
      .sort((a, b) => b.total_cost_usd - a.total_cost_usd);

    res.json({
      period_days: periodDays,
      users: result,
    });
  } catch (error) {
    log.error('By-user error:', error.message);
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error' });
  }
});

export default router;
