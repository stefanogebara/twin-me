/**
 * Cost Dashboard API
 * ===================
 * Provides AI cost analytics per user, per service, per time period.
 * Used by the settings page to show cost breakdown and projections.
 *
 * Endpoints:
 *   GET /api/costs           — Cost summary for current user
 *   GET /api/costs/breakdown — Service-by-service breakdown
 *   GET /api/costs/daily     — Daily cost trend (last 30 days)
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CostDashboard');
const router = express.Router();

const MAX_DAILY_COST = parseFloat(process.env.MAX_DAILY_AI_COST_USD || '5.00');

/**
 * GET /api/costs — Summary: today, this week, this month, projected
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();

    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);

    const weekStart = new Date(now);
    weekStart.setUTCDate(weekStart.getUTCDate() - 7);

    const monthStart = new Date(now);
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    // Parallel queries
    const [todayResult, weekResult, monthResult] = await Promise.all([
      supabaseAdmin
        .from('llm_usage_log')
        .select('cost_usd')
        .eq('user_id', userId)
        .gte('created_at', todayStart.toISOString()),
      supabaseAdmin
        .from('llm_usage_log')
        .select('cost_usd')
        .eq('user_id', userId)
        .gte('created_at', weekStart.toISOString()),
      supabaseAdmin
        .from('llm_usage_log')
        .select('cost_usd')
        .eq('user_id', userId)
        .gte('created_at', monthStart.toISOString()),
    ]);

    const sum = (rows) => (rows || []).reduce((s, r) => s + (r.cost_usd || 0), 0);

    const todayCost = sum(todayResult.data);
    const weekCost = sum(weekResult.data);
    const monthCost = sum(monthResult.data);

    // Project monthly cost from daily average
    const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getUTCDate();
    const dayOfMonth = now.getUTCDate();
    const dailyAvg = dayOfMonth > 0 ? monthCost / dayOfMonth : 0;
    const projectedMonthly = dailyAvg * daysInMonth;

    return res.json({
      success: true,
      costs: {
        today: Math.round(todayCost * 10000) / 10000,
        week: Math.round(weekCost * 10000) / 10000,
        month: Math.round(monthCost * 10000) / 10000,
        projectedMonthly: Math.round(projectedMonthly * 100) / 100,
        dailyAvg: Math.round(dailyAvg * 10000) / 10000,
        dailyBudget: MAX_DAILY_COST,
        budgetUsedPercent: MAX_DAILY_COST > 0 ? Math.round((todayCost / MAX_DAILY_COST) * 100) : 0,
      },
    });
  } catch (err) {
    log.error('Cost summary failed', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch costs' });
  }
});

/**
 * GET /api/costs/breakdown — Cost by service (twin-chat, reflections, etc.)
 */
router.get('/breakdown', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const days = parseInt(req.query.days || '30', 10);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('llm_usage_log')
      .select('service_name, cost_usd, input_tokens, output_tokens')
      .eq('user_id', userId)
      .gte('created_at', since);

    if (error) throw error;

    // Group by service
    const byService = {};
    for (const row of (data || [])) {
      const svc = row.service_name || 'unknown';
      if (!byService[svc]) {
        byService[svc] = { cost: 0, calls: 0, inputTokens: 0, outputTokens: 0 };
      }
      byService[svc].cost += row.cost_usd || 0;
      byService[svc].calls += 1;
      byService[svc].inputTokens += row.input_tokens || 0;
      byService[svc].outputTokens += row.output_tokens || 0;
    }

    // Sort by cost descending
    const breakdown = Object.entries(byService)
      .map(([service, stats]) => ({
        service,
        cost: Math.round(stats.cost * 10000) / 10000,
        calls: stats.calls,
        inputTokens: stats.inputTokens,
        outputTokens: stats.outputTokens,
        avgCostPerCall: stats.calls > 0 ? Math.round((stats.cost / stats.calls) * 10000) / 10000 : 0,
      }))
      .sort((a, b) => b.cost - a.cost);

    const totalCost = breakdown.reduce((s, b) => s + b.cost, 0);

    return res.json({
      success: true,
      days,
      totalCost: Math.round(totalCost * 10000) / 10000,
      totalCalls: breakdown.reduce((s, b) => s + b.calls, 0),
      breakdown,
    });
  } catch (err) {
    log.error('Cost breakdown failed', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch breakdown' });
  }
});

/**
 * GET /api/costs/daily — Daily cost trend (last N days)
 */
router.get('/daily', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const days = Math.min(parseInt(req.query.days || '30', 10), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('llm_usage_log')
      .select('cost_usd, created_at')
      .eq('user_id', userId)
      .gte('created_at', since);

    if (error) throw error;

    // Group by date
    const byDate = {};
    for (const row of (data || [])) {
      const date = row.created_at.slice(0, 10); // YYYY-MM-DD
      byDate[date] = (byDate[date] || 0) + (row.cost_usd || 0);
    }

    // Fill gaps with 0
    const trend = [];
    const cursor = new Date(since);
    const today = new Date();
    while (cursor <= today) {
      const dateStr = cursor.toISOString().slice(0, 10);
      trend.push({
        date: dateStr,
        cost: Math.round((byDate[dateStr] || 0) * 10000) / 10000,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return res.json({ success: true, days, trend });
  } catch (err) {
    log.error('Daily trend failed', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch trend' });
  }
});

export default router;
