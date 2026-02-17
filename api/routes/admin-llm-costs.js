/**
 * Admin LLM Cost Dashboard API
 *
 * Provides endpoints for monitoring LLM usage and costs.
 * Data comes from the llm_usage_log table populated by llmGateway.js.
 * All endpoints require authentication.
 */

import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

// All admin routes require authentication
router.use(authenticateUser);

/**
 * GET /api/admin/llm-costs
 * Summary by tier, model, and service
 */
router.get('/llm-costs', async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('llm_usage_log')
      .select('tier, model, service_name, input_tokens, output_tokens, cost_usd, cache_hit')
      .gte('created_at', since);

    if (error) throw error;

    // Aggregate in JS since we're using select (not RPC)
    const summary = {};
    let totalCost = 0;
    let totalCalls = 0;
    let totalCacheHits = 0;

    for (const row of data || []) {
      const key = `${row.tier}|${row.model}|${row.service_name}`;
      if (!summary[key]) {
        summary[key] = {
          tier: row.tier,
          model: row.model,
          service_name: row.service_name,
          call_count: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          total_cost_usd: 0,
          cache_hits: 0,
        };
      }
      summary[key].call_count++;
      summary[key].total_input_tokens += row.input_tokens || 0;
      summary[key].total_output_tokens += row.output_tokens || 0;
      summary[key].total_cost_usd += parseFloat(row.cost_usd) || 0;
      if (row.cache_hit) summary[key].cache_hits++;
      totalCost += parseFloat(row.cost_usd) || 0;
      totalCalls++;
      if (row.cache_hit) totalCacheHits++;
    }

    // Calculate monthly projection from daily average
    const periodDays = parseInt(days);
    const dailyAvg = periodDays > 0 ? totalCost / periodDays : 0;
    const monthlyProjection = dailyAvg * 30;

    // Calculate cost by tier for quick breakdown
    const byTier = {};
    for (const row of Object.values(summary)) {
      if (!byTier[row.tier]) {
        byTier[row.tier] = { calls: 0, cost_usd: 0 };
      }
      byTier[row.tier].calls += row.call_count;
      byTier[row.tier].cost_usd += row.total_cost_usd;
    }

    res.json({
      period_days: periodDays,
      total_calls: totalCalls,
      total_cost_usd: Math.round(totalCost * 10000) / 10000,
      daily_average_usd: Math.round(dailyAvg * 10000) / 10000,
      monthly_projection_usd: Math.round(monthlyProjection * 100) / 100,
      cache_hit_rate: totalCalls > 0 ? Math.round((totalCacheHits / totalCalls) * 100) : 0,
      by_tier: byTier,
      breakdown: Object.values(summary).sort((a, b) => b.total_cost_usd - a.total_cost_usd),
    });
  } catch (error) {
    console.error('[Admin LLM Costs] Summary error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/llm-costs/daily
 * Daily cost breakdown
 */
router.get('/llm-costs/daily', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('llm_usage_log')
      .select('created_at, tier, model, cost_usd, cache_hit')
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Group by day
    const daily = {};
    for (const row of data || []) {
      const day = row.created_at.substring(0, 10); // YYYY-MM-DD
      if (!daily[day]) {
        daily[day] = { day, calls: 0, cost_usd: 0, cache_hits: 0, by_tier: {} };
      }
      daily[day].calls++;
      daily[day].cost_usd += parseFloat(row.cost_usd) || 0;
      if (row.cache_hit) daily[day].cache_hits++;

      if (!daily[day].by_tier[row.tier]) {
        daily[day].by_tier[row.tier] = { calls: 0, cost_usd: 0 };
      }
      daily[day].by_tier[row.tier].calls++;
      daily[day].by_tier[row.tier].cost_usd += parseFloat(row.cost_usd) || 0;
    }

    res.json({
      period_days: parseInt(days),
      daily: Object.values(daily).map(d => ({
        ...d,
        cost_usd: Math.round(d.cost_usd * 10000) / 10000,
      })),
    });
  } catch (error) {
    console.error('[Admin LLM Costs] Daily error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/llm-costs/realtime
 * Last 100 calls for real-time monitoring
 */
router.get('/llm-costs/realtime', async (req, res) => {
  try {
    const { limit = 100 } = req.query;

    const { data, error } = await supabaseAdmin
      .from('llm_usage_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Math.min(parseInt(limit), 500));

    if (error) throw error;

    res.json({
      count: data?.length || 0,
      calls: data || [],
    });
  } catch (error) {
    console.error('[Admin LLM Costs] Realtime error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/llm-costs/by-user
 * Cost breakdown by user — shows who's driving spend
 */
router.get('/llm-costs/by-user', async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('llm_usage_log')
      .select('user_id, tier, cost_usd, input_tokens, output_tokens')
      .gte('created_at', since);

    if (error) throw error;

    // Aggregate by user
    const users = {};
    for (const row of data || []) {
      const uid = row.user_id || 'system';
      if (!users[uid]) {
        users[uid] = { user_id: uid, call_count: 0, total_cost_usd: 0, total_tokens: 0, by_tier: {} };
      }
      users[uid].call_count++;
      users[uid].total_cost_usd += parseFloat(row.cost_usd) || 0;
      users[uid].total_tokens += (row.input_tokens || 0) + (row.output_tokens || 0);

      if (!users[uid].by_tier[row.tier]) {
        users[uid].by_tier[row.tier] = { calls: 0, cost_usd: 0 };
      }
      users[uid].by_tier[row.tier].calls++;
      users[uid].by_tier[row.tier].cost_usd += parseFloat(row.cost_usd) || 0;
    }

    // Fetch user emails for display
    const userIds = Object.keys(users).filter(id => id !== 'system');
    let userEmails = {};
    if (userIds.length > 0) {
      const { data: usersData } = await supabaseAdmin
        .from('users')
        .select('id, email, first_name')
        .in('id', userIds);

      for (const u of usersData || []) {
        userEmails[u.id] = u.email || u.first_name || u.id.substring(0, 8);
      }
    }

    // Attach email and sort by cost
    const result = Object.values(users)
      .map(u => ({
        ...u,
        email: userEmails[u.user_id] || (u.user_id === 'system' ? 'system' : u.user_id.substring(0, 8)),
        total_cost_usd: Math.round(u.total_cost_usd * 10000) / 10000,
      }))
      .sort((a, b) => b.total_cost_usd - a.total_cost_usd);

    res.json({
      period_days: parseInt(days),
      users: result,
    });
  } catch (error) {
    console.error('[Admin LLM Costs] By-user error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
