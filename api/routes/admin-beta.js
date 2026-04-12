/**
 * Admin Beta Monitoring Dashboard API
 *
 * Top-level visibility into the beta program: user activity, proposal flow,
 * department adoption, and cost-per-user. Read-only.
 *
 * Endpoints (all require admin email match):
 *   GET /api/admin/beta/overview     — Top-level metrics
 *   GET /api/admin/beta/users        — Per-user activity + spend
 *   GET /api/admin/beta/departments  — Department adoption + flow
 *
 * Admin check: req.user.email must be in ADMIN_EMAILS env (comma-separated).
 */

import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { authenticateUser } from '../middleware/auth.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('AdminBeta');
const router = express.Router();

// ─────────────────────────────────────────────────────────────
// Admin check: email allowlist
// ─────────────────────────────────────────────────────────────
function requireAdminEmail(req, res, next) {
  const email = req.user?.email?.toLowerCase();
  if (!email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const allowlist = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  if (!allowlist.includes(email)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  next();
}

router.use(authenticateUser, requireAdminEmail);

// ─────────────────────────────────────────────────────────────
// Helpers — safe aggregation, graceful missing data
// ─────────────────────────────────────────────────────────────
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function round4(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

async function countRows(table, filter = {}) {
  try {
    let query = supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
    for (const [k, v] of Object.entries(filter)) {
      query = query.eq(k, v);
    }
    const { count, error } = await query;
    if (error) {
      log.warn(`countRows(${table}) failed`, { error: error.message });
      return 0;
    }
    return count || 0;
  } catch (err) {
    log.warn(`countRows(${table}) threw`, { error: err.message });
    return 0;
  }
}

// Paginated fetch helper to work around Supabase 1000-row default
async function fetchAll(table, select, builder = q => q) {
  const pageSize = 1000;
  let offset = 0;
  const rows = [];
  while (true) {
    const base = supabaseAdmin.from(table).select(select).range(offset, offset + pageSize - 1);
    const { data, error } = await builder(base);
    if (error) {
      log.warn(`fetchAll(${table}) failed`, { error: error.message });
      break;
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────
// GET /api/admin/beta/overview
// ─────────────────────────────────────────────────────────────
router.get('/overview', async (req, res) => {
  try {
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Run all top-level counts in parallel
    const [
      totalUsers,
      proposalsGenerated,
      proposalsApproved,
      activeUsersData,
      costSumData,
    ] = await Promise.all([
      countRows('beta_applications'),
      // Proposals = agent_actions with department set
      supabaseAdmin
        .from('agent_actions')
        .select('*', { count: 'exact', head: true })
        .not('department', 'is', null)
        .then(r => r.count || 0, () => 0),
      supabaseAdmin
        .from('agent_actions')
        .select('*', { count: 'exact', head: true })
        .not('department', 'is', null)
        .eq('user_response', 'accepted')
        .then(r => r.count || 0, () => 0),
      // Active users: distinct user_id from agent_actions in last 7d
      supabaseAdmin
        .from('agent_actions')
        .select('user_id')
        .gte('created_at', sevenDaysAgo)
        .then(r => r.data || [], () => []),
      // Cost sum from llm_usage_log last 30d
      supabaseAdmin
        .from('llm_usage_log')
        .select('cost_usd, user_id')
        .gte('created_at', thirtyDaysAgo)
        .then(r => r.data || [], () => []),
    ]);

    const activeUserIds = new Set(activeUsersData.map(r => r.user_id).filter(Boolean));
    const activeUsers = activeUserIds.size;

    let totalCostUSD = 0;
    for (const row of costSumData) {
      totalCostUSD += Number(row.cost_usd) || 0;
    }

    const approvalRate = proposalsGenerated > 0
      ? round2((proposalsApproved / proposalsGenerated) * 100)
      : 0;

    const avgCostPerUser = activeUsers > 0
      ? round4(totalCostUSD / activeUsers)
      : 0;

    res.json({
      totalUsers,
      activeUsers,
      proposalsGenerated,
      proposalsApproved,
      approvalRate,
      totalCostUSD: round4(totalCostUSD),
      avgCostPerUser,
    });
  } catch (error) {
    log.error('overview error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/beta/users
// ─────────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    // 1. Pull beta applications (one row per beta user)
    const { data: apps, error: appsErr } = await supabaseAdmin
      .from('beta_applications')
      .select('id, name, email, user_id, created_at, approved_at, status')
      .order('created_at', { ascending: false });

    if (appsErr) throw appsErr;

    const applications = apps || [];
    const userIds = applications.map(a => a.user_id).filter(Boolean);

    if (applications.length === 0) {
      return res.json({ users: [] });
    }

    // 2. Parallel: platforms, agent_actions, llm costs, memories
    const [platformRows, actionRows, llmRows, memoryRows] = await Promise.all([
      userIds.length
        ? fetchAll(
            'platform_connections',
            'user_id',
            q => q.in('user_id', userIds),
          )
        : [],
      userIds.length
        ? fetchAll(
            'agent_actions',
            'user_id, department, user_response, created_at',
            q => q.in('user_id', userIds),
          )
        : [],
      userIds.length
        ? fetchAll(
            'llm_usage_log',
            'user_id, cost_usd, created_at',
            q => q.in('user_id', userIds),
          )
        : [],
      userIds.length
        ? fetchAll(
            'user_memories',
            'user_id, created_at',
            q => q.in('user_id', userIds).order('created_at', { ascending: false }),
          )
        : [],
    ]);

    // 3. Departments with autonomy > 0 per user
    let autonomyRows = [];
    if (userIds.length) {
      const { data } = await supabaseAdmin
        .from('user_skill_settings')
        .select('user_id, autonomy_level, skill_id, skill_definitions!inner(department)')
        .in('user_id', userIds)
        .gt('autonomy_level', 0);
      autonomyRows = data || [];
    }

    // 4. Aggregate per user
    const platformCount = new Map();
    for (const r of platformRows) {
      platformCount.set(r.user_id, (platformCount.get(r.user_id) || 0) + 1);
    }

    const proposalsReceived = new Map();
    const proposalsApproved = new Map();
    const lastActionAt = new Map();
    for (const r of actionRows) {
      if (!r.department) continue;
      proposalsReceived.set(r.user_id, (proposalsReceived.get(r.user_id) || 0) + 1);
      if (r.user_response === 'accepted') {
        proposalsApproved.set(r.user_id, (proposalsApproved.get(r.user_id) || 0) + 1);
      }
      const prev = lastActionAt.get(r.user_id);
      if (!prev || new Date(r.created_at) > new Date(prev)) {
        lastActionAt.set(r.user_id, r.created_at);
      }
    }

    const costByUser = new Map();
    for (const r of llmRows) {
      costByUser.set(r.user_id, (costByUser.get(r.user_id) || 0) + (Number(r.cost_usd) || 0));
    }

    const lastMemoryAt = new Map();
    for (const r of memoryRows) {
      const prev = lastMemoryAt.get(r.user_id);
      if (!prev || new Date(r.created_at) > new Date(prev)) {
        lastMemoryAt.set(r.user_id, r.created_at);
      }
    }

    const activeDepts = new Map();
    for (const r of autonomyRows) {
      const dept = r.skill_definitions?.department;
      if (!dept || dept === 'general') continue;
      if (!activeDepts.has(r.user_id)) {
        activeDepts.set(r.user_id, new Set());
      }
      activeDepts.get(r.user_id).add(dept);
    }

    // 5. Build response
    const users = applications.map(app => {
      const uid = app.user_id;
      const lastAction = uid ? lastActionAt.get(uid) : null;
      const lastMemory = uid ? lastMemoryAt.get(uid) : null;
      const lastActivity = [lastAction, lastMemory]
        .filter(Boolean)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;

      return {
        id: app.id,
        userId: uid,
        email: app.email,
        name: app.name,
        signupDate: app.created_at,
        activatedAt: app.approved_at,
        platformsConnected: uid ? (platformCount.get(uid) || 0) : 0,
        activeDepartments: uid ? (activeDepts.get(uid)?.size || 0) : 0,
        proposalsReceived: uid ? (proposalsReceived.get(uid) || 0) : 0,
        proposalsApproved: uid ? (proposalsApproved.get(uid) || 0) : 0,
        totalCostUSD: uid ? round4(costByUser.get(uid) || 0) : 0,
        lastActivity,
      };
    });

    res.json({ users });
  } catch (error) {
    log.error('users error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/beta/departments
// ─────────────────────────────────────────────────────────────
router.get('/departments', async (req, res) => {
  try {
    // 1. All agent_actions with department context
    const actionRows = await fetchAll(
      'agent_actions',
      'user_id, department, user_response',
      q => q.not('department', 'is', null),
    );

    // 2. Autonomy rows — active users per department
    const { data: autonomyRows, error: autErr } = await supabaseAdmin
      .from('user_skill_settings')
      .select('user_id, autonomy_level, skill_definitions!inner(department)')
      .gt('autonomy_level', 0);

    if (autErr) {
      log.warn('departments: user_skill_settings fetch failed', { error: autErr.message });
    }

    // 3. Department budgets
    const { data: budgetRows, error: budErr } = await supabaseAdmin
      .from('department_budgets')
      .select('department, monthly_budget_usd, spent_this_month_usd');

    if (budErr) {
      log.warn('departments: budgets fetch failed', { error: budErr.message });
    }

    // Aggregate per department
    const byDept = new Map();
    const ensure = (name) => {
      if (!byDept.has(name)) {
        byDept.set(name, {
          department: name,
          usersActive: 0,
          _activeUserSet: new Set(),
          totalProposals: 0,
          approvedProposals: 0,
          _budgetSum: 0,
          _budgetCount: 0,
          _spentSum: 0,
          _spentCount: 0,
        });
      }
      return byDept.get(name);
    };

    for (const r of actionRows) {
      const d = ensure(r.department);
      d.totalProposals += 1;
      if (r.user_response === 'accepted') d.approvedProposals += 1;
    }

    for (const r of autonomyRows || []) {
      const dept = r.skill_definitions?.department;
      if (!dept || dept === 'general') continue;
      const d = ensure(dept);
      d._activeUserSet.add(r.user_id);
    }

    for (const r of budgetRows || []) {
      const d = ensure(r.department);
      d._budgetSum += Number(r.monthly_budget_usd) || 0;
      d._budgetCount += 1;
      d._spentSum += Number(r.spent_this_month_usd) || 0;
      d._spentCount += 1;
    }

    const departments = Array.from(byDept.values()).map(d => ({
      department: d.department,
      usersActive: d._activeUserSet.size,
      totalProposals: d.totalProposals,
      approvalRate: d.totalProposals > 0
        ? round2((d.approvedProposals / d.totalProposals) * 100)
        : 0,
      avgBudget: d._budgetCount > 0 ? round2(d._budgetSum / d._budgetCount) : 0,
      avgSpent: d._budgetCount > 0 ? round4(d._spentSum / d._budgetCount) : 0,
    }));

    // Sort by activity (users * proposals)
    departments.sort((a, b) => (b.usersActive * 100 + b.totalProposals) - (a.usersActive * 100 + a.totalProposals));

    res.json({ departments });
  } catch (error) {
    log.error('departments error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
