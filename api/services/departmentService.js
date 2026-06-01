/**
 * Department Service — SoulOS Department Orchestration Layer
 * ===========================================================
 * Core service for managing the 7 SoulOS departments. Each department
 * is a specialized agent team that proposes and executes actions on
 * behalf of the user, subject to autonomy controls and budget limits.
 *
 * Depends on:
 *   - departmentConfig.js  — department definitions
 *   - autonomyService.js   — per-skill autonomy levels + action queuing
 *   - departmentBudgetService.js — per-department LLM spend tracking
 *   - database.js          — Supabase admin client
 */

import { DEPARTMENTS, DEPARTMENT_NAMES, getDepartmentConfig, getToolCostEstimate } from '../config/departmentConfig.js';
import { queueActionForApproval, getAutonomyBySkillName, AUTONOMY_LEVELS } from './autonomyService.js';
import { checkDepartmentBudget } from './departmentBudgetService.js';
import { supabaseAdmin } from './database.js';
import { get as cacheGet, set as cacheSet } from './redisClient.js';
import { complete, TIER_EXTRACTION, TIER_ANALYSIS } from './llmGateway.js';
import { createLogger } from './logger.js';

const log = createLogger('DepartmentService');

/**
 * Whitelist of toolNames the heartbeat may emit, plus the required param keys
 * for each. Anything outside this table is dropped before reaching
 * proposeDepartmentAction so we never queue a ghost proposal the cron cannot
 * execute. Keep in sync with the RULES block in the heartbeat prompt.
 */
const HEARTBEAT_TOOL_WHITELIST = {
  suggest: [],
  gmail_draft: ['to', 'subject', 'body'],
  calendar_create: ['summary', 'start', 'end'],
  docs_create: ['title'],
};

/**
 * Validate an LLM-emitted suggestion against the heartbeat whitelist.
 * Returns { ok: true } if the proposal is safe to queue, otherwise
 * { ok: false, reason, details } explaining why it was dropped.
 */
export function validateHeartbeatProposal(suggestion) {
  const toolName = suggestion.toolName || 'suggest';
  const required = HEARTBEAT_TOOL_WHITELIST[toolName];
  if (!required) {
    return { ok: false, reason: 'tool_not_whitelisted', details: { toolName } };
  }
  const params = suggestion.params || {};
  const missing = required.filter(key => {
    const v = params[key];
    return v === undefined || v === null || String(v).trim() === '';
  });
  if (missing.length > 0) {
    return { ok: false, reason: 'missing_required_params', details: { toolName, missing } };
  }
  return { ok: true, toolName, params };
}

/**
 * Get full status for a single department: config + autonomy + budget + recent activity count.
 */
export async function getDepartmentStatus(userId, department) {
  if (!userId || !department) {
    throw new Error('userId and department are required');
  }

  const config = getDepartmentConfig(department);
  if (!config) {
    throw new Error(`Unknown department: ${department}`);
  }

  try {
    // Fetch autonomy, budget, recent action count, and proposal stats in parallel
    const [autonomyLevel, budgetStatus, recentCount, stats] = await Promise.all([
      resolveAutonomyLevel(userId, department, config),
      checkDepartmentBudget(userId, department, 0),
      countRecentActions(userId, department),
      getDepartmentStats(userId, department),
    ]);

    return {
      department,
      ...config,
      autonomyLevel,
      budget: budgetStatus,
      recentActionsCount: recentCount,
      stats,
    };
  } catch (err) {
    log.error('getDepartmentStatus failed', { userId, department, error: err.message });
    throw err;
  }
}

/**
 * Get all 7 departments with status for the dashboard.
 */
export async function getAllDepartments(userId) {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    const statuses = await Promise.all(
      DEPARTMENT_NAMES.map(dept => getDepartmentStatus(userId, dept).catch(err => {
        log.warn('Failed to get status for department', { department: dept, error: err.message });
        return { department: dept, ...DEPARTMENTS[dept], error: err.message };
      }))
    );

    return statuses;
  } catch (err) {
    log.error('getAllDepartments failed', { userId, error: err.message });
    return [];
  }
}

/**
 * Propose an action from a department. Validates budget, checks autonomy,
 * and queues via queueActionForApproval if level is DRAFT_CONFIRM.
 *
 * @returns {{ actionId: string|null, status: string }}
 */
export async function proposeDepartmentAction(userId, department, { toolName, params, context, reasoning, priority }) {
  if (!userId || !department || !toolName) {
    throw new Error('userId, department, and toolName are required');
  }

  const config = getDepartmentConfig(department);
  if (!config) {
    throw new Error(`Unknown department: ${department}`);
  }

  try {
    // Budget check (estimate 0.01 as a default estimated cost)
    const estimatedCost = getToolCostEstimate(toolName);
    const budgetResult = await checkDepartmentBudget(userId, department, estimatedCost);
    if (!budgetResult.allowed) {
      log.info('Action blocked by budget', { userId, department, toolName });
      return { actionId: null, status: 'budget_exceeded' };
    }

    // Autonomy check
    const autonomyLevel = await resolveAutonomyLevel(userId, department, config);
    if (autonomyLevel <= AUTONOMY_LEVELS.OBSERVE) {
      log.info('Action blocked by autonomy (OBSERVE)', { userId, department, toolName });
      return { actionId: null, status: 'autonomy_blocked' };
    }

    // Queue for approval
    const skillName = `${department}_actions`;
    const actionId = await queueActionForApproval(userId, {
      toolName,
      params: { ...params, priority: priority || 'medium' },
      context: context || `${config.name} department action`,
      reasoning: reasoning && typeof reasoning === 'string' ? reasoning.slice(0, 1000) : null,
      skillName,
      department,
    });

    log.info('Department action proposed', { userId, department, toolName, actionId });

    // Fire-and-forget push notification (non-fatal). Inbox-aware copy:
    //   title = the proposal's verb-led description (e.g. "Block 90 min
    //           tomorrow morning for GitHub PR review") — much better than
    //           the old generic "<Dept>: Action proposed" so the user can
    //           triage from the notification alone
    //   body  = the reasoning evidence line ("Whoop recovery 78%+ three
    //           days running, calendar has no focus blocks") — gives a
    //           reason to tap
    //   url   = /inbox (was /departments which now redirects but adds a hop)
    try {
      const { sendWebPush } = await import('./webPushService.js');
      const deptConfig = getDepartmentConfig(department);
      const pushTitle = context && context.trim().length > 0
        ? context
        : `${deptConfig?.name || department}: Action proposed`;
      const pushBody = reasoning && typeof reasoning === 'string' && reasoning.trim().length > 0
        ? reasoning
        : 'Your AI department has a suggestion for you';
      await sendWebPush(userId, {
        title: pushTitle,
        body: pushBody,
        url: '/inbox',
        tag: `department_proposal_${actionId}`,
        category: 'department_proposal',
      });
    } catch (pushErr) {
      log.debug('Push notification failed (non-fatal)', { error: pushErr.message });
    }

    return { actionId, status: 'pending_approval' };
  } catch (err) {
    log.error('proposeDepartmentAction failed', { userId, department, toolName, error: err.message });
    throw err;
  }
}

/**
 * Generate a human-readable description from a proposal's raw data.
 */
function generateDisplayDescription(action) {
  const ctx = action.context_summary || '';
  const isGeneric = !ctx || ctx.endsWith('department action') || ctx === 'Pending action';
  if (ctx && !isGeneric) return ctx;

  try {
    const parsed = typeof action.proposed_action === 'string'
      ? JSON.parse(action.proposed_action)
      : action.proposed_action;
    if (!parsed) return ctx || 'Pending action';

    const tool = parsed.toolName || parsed.tool || '';
    const p = parsed.params || {};
    const desc = {
      gmail_send: () => p.to ? `Send email to ${p.to}${p.subject ? ': ' + p.subject : ''}` : 'Send email',
      gmail_reply: () => p.subject ? `Reply to: ${p.subject}` : 'Reply to email',
      gmail_draft: () => p.to ? `Draft email to ${p.to}${p.subject ? ': ' + p.subject : ''}` : 'Draft email',
      calendar_create: () => p.summary || p.title ? `Create event: ${p.summary || p.title}` : 'Create calendar event',
      calendar_modify_event: () => p.summary ? `Modify event: ${p.summary}` : 'Modify calendar event',
      docs_create: () => p.title ? `Create document: ${p.title}` : 'Create document draft',
      drive_search: () => p.query ? `Search files for "${p.query}"` : 'Search your files',
      suggest: () => p.suggestion || parsed.description || ctx || 'Suggestion from your twin',
    };
    if (desc[tool]) return desc[tool]();
    if (tool) return tool.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  } catch { /* JSON parse failed */ }

  return ctx || 'Pending action';
}

/**
 * Get pending department proposals for a user.
 * Returns actions where department IS NOT NULL and user_response IS NULL.
 */
export async function getPendingProposals(userId) {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('agent_actions')
      .select('id, department, skill_name, action_type, proposed_action, context_summary, estimated_cost_usd, created_at')
      .eq('user_id', userId)
      .is('user_response', null)
      .not('department', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      log.error('getPendingProposals query failed', { userId, error });
      return [];
    }

    // Enrich with department name and human-readable description
    return (data || []).map(action => {
      const department = extractDepartmentFromSkillName(action.skill_name);
      const display_description = generateDisplayDescription(action);
      return { ...action, department, display_description };
    });
  } catch (err) {
    log.error('getPendingProposals failed', { userId, error: err.message });
    return [];
  }
}

/**
 * Get the unified inbox stream for /api/inbox — pending + resolved proposals
 * merged into one chronological list, sorted by COALESCE(resolved_at, created_at).
 *
 * Status enum (user-facing):
 *   - pending   — user_response IS NULL
 *   - done      — user_response = 'accepted' (executed by user approval)
 *   - skipped   — user_response = 'rejected'
 *   - expired   — user_response = 'expired'  (cron auto-expiry)
 *
 * Cursor: ISO timestamp of the last item's sortAt. Pass it back to fetch the
 * next page. Omit on the first request.
 *
 * @param {string} userId
 * @param {object} opts
 * @param {string|null} opts.cursor   — ISO timestamp to paginate after
 * @param {number} opts.limit         — page size, max 50, default 20
 * @returns {Promise<{ items: Array, nextCursor: string|null }>}
 */
/**
 * Pull a user-facing link to the artifact a tool produced (Gmail draft URL,
 * Google Calendar event URL, Google Doc URL) out of an agent_actions row's
 * outcome_data. Returns { label, url } or null when there's nothing to link to.
 *
 * Defence-in-depth: every URL is forced through an https scheme allowlist
 * before being returned. The frontend renders these directly in <a href>,
 * so an attacker who could write to outcome_data (compromised tool, future
 * bug, SQLi elsewhere) must not be able to pivot to javascript:/data: XSS.
 *
 * The shape comes from the tool registry execution results:
 *   gmail_draft   → executionResult.data.draft.{draftId, messageId}
 *   calendar_create → executionResult.data.htmlLink
 *   docs_create   → executionResult.data.{url|webViewLink|documentId}
 */
function isHttpsUrl(u) {
  if (typeof u !== 'string') return false;
  try {
    const p = new URL(u);
    return p.protocol === 'https:';
  } catch {
    return false;
  }
}

// Google API resource IDs are opaque alphanumeric tokens (plus -, _). Reject
// anything else before interpolating into a URL template.
const GOOGLE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Inner helper that operates on an executionResult directly. Used by both
 * extractOutcomeLink(row) below and the /approve route, which has the fresh
 * result in hand before any DB row has been refetched.
 *
 * @param {object} execResult — the executionResult shape from a tool run
 * @param {string|null} tool   — toolName (or action_type when called from a row)
 * @returns {{label: string, url: string} | null}
 */
export function outcomeLinkFromExecution(execResult, tool) {
  if (!execResult || execResult.success === false) return null;
  const data = execResult.data || {};
  const effectiveTool = execResult.tool || tool || null;

  // Gmail draft → build a stable URL from messageId, but only if it matches
  // the expected opaque-id pattern. Never interpolate user-controlled strings.
  const messageId = data?.draft?.messageId;
  if (typeof messageId === 'string'
      && GOOGLE_ID_RE.test(messageId)
      && (effectiveTool === 'gmail_draft' || effectiveTool === 'draft')) {
    return {
      label: 'View draft',
      url: `https://mail.google.com/mail/u/0/#drafts/${encodeURIComponent(messageId)}`,
    };
  }

  // Calendar event → htmlLink must be a real https URL
  if (isHttpsUrl(data?.htmlLink)) {
    return { label: 'View event', url: data.htmlLink };
  }

  // Google Doc — prefer explicit URLs (validated), fall back to documentId
  // (also validated). Anything that fails the gate is dropped.
  if (isHttpsUrl(data?.url)) {
    return { label: 'View doc', url: data.url };
  }
  if (isHttpsUrl(data?.webViewLink)) {
    return { label: 'View doc', url: data.webViewLink };
  }
  if (typeof data?.documentId === 'string' && GOOGLE_ID_RE.test(data.documentId)) {
    return {
      label: 'View doc',
      url: `https://docs.google.com/document/d/${encodeURIComponent(data.documentId)}`,
    };
  }

  return null;
}

function extractOutcomeLink(row) {
  return outcomeLinkFromExecution(row?.outcome_data?.executionResult, row?.action_type);
}

/**
 * Inner helper that pulls the artifact identifier the inbox /undo route needs
 * to delete the right object from the underlying platform. Returns a
 * { kind, id } pair or null when undo isn't supported for this tool/result.
 *
 * Currently supported:
 *   gmail_draft   → { kind: 'gmail_draft', id: data.draft.draftId }
 *   calendar_create → { kind: 'calendar_event', id: data.eventId }
 *
 * Google Doc undo is not yet wired (needs a drive_trash_file tool).
 */
export function outcomeRefFromExecution(execResult, tool) {
  if (!execResult || execResult.success === false) return null;
  const data = execResult.data || {};
  const effectiveTool = execResult.tool || tool || null;

  const draftId = data?.draft?.draftId;
  if (typeof draftId === 'string'
      && GOOGLE_ID_RE.test(draftId)
      && (effectiveTool === 'gmail_draft' || effectiveTool === 'draft')) {
    return { kind: 'gmail_draft', id: draftId };
  }

  const eventId = data?.eventId;
  if (typeof eventId === 'string'
      && GOOGLE_ID_RE.test(eventId)
      && (effectiveTool === 'calendar_create' || effectiveTool === 'draft')) {
    return { kind: 'calendar_event', id: eventId };
  }

  return null;
}

function extractOutcomeRef(row) {
  return outcomeRefFromExecution(row?.outcome_data?.executionResult, row?.action_type);
}

/**
 * Extract a user-visible preview of the action's payload from proposed_action
 * so the inbox tile can show what would actually happen before the user clicks
 * "Do it". Returns null for advice (suggest) tiles — there's nothing to preview.
 *
 * Shape per kind:
 *   gmail_draft   → { kind:'gmail_draft', to, subject, body }     (body trimmed)
 *   calendar_create → { kind:'calendar_event', summary, start, end, location? }
 *   docs_create   → { kind:'doc', title }
 *
 * proposed_action is jsonb stored as a JSON-encoded string — possibly
 * double-encoded for older rows. Parse defensively.
 */
function extractPreview(row) {
  let parsed = row?.proposed_action;
  if (!parsed) return null;
  try {
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
  } catch {
    return null;
  }
  const tool = parsed?.toolName;
  const p = parsed?.params || {};

  if (tool === 'gmail_draft') {
    const body = typeof p.body === 'string' ? p.body.slice(0, 800) : null;
    return {
      kind: 'gmail_draft',
      to: typeof p.to === 'string' ? p.to : null,
      subject: typeof p.subject === 'string' ? p.subject : null,
      body,
    };
  }

  if (tool === 'calendar_create') {
    return {
      kind: 'calendar_event',
      summary: typeof p.summary === 'string' ? p.summary : null,
      start: typeof p.start === 'string' ? p.start : null,
      end: typeof p.end === 'string' ? p.end : null,
      location: typeof p.location === 'string' ? p.location : null,
    };
  }

  if (tool === 'docs_create') {
    return {
      kind: 'doc',
      title: typeof p.title === 'string' ? p.title : null,
    };
  }

  return null;
}

/**
 * Per-department summary for the last 7 days. Joins:
 *   - per-dept autonomy + budget (via getAllDepartments)
 *   - per-dept weekly accept/skip/fail/pending counts (single aggregate query)
 *
 * One round-trip for the counts, one for the statuses (the existing fan-out).
 * Returns one row per department in DEPARTMENT_NAMES order.
 */
export async function getDepartmentSummary(userId) {
  if (!userId) return [];

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Pull only the columns we aggregate. Cap at a safe upper bound — even a
  // very chatty user shouldn't exceed ~200 proposals in a week.
  const { data: rows, error: countErr } = await supabaseAdmin
    .from('agent_actions')
    .select('department, user_response')
    .eq('user_id', userId)
    .not('department', 'is', null)
    .gte('created_at', weekAgo)
    .limit(1000);

  if (countErr) {
    log.warn('getDepartmentSummary count query failed', { userId, error: countErr.message });
  }

  // Bucket counts in JS (much cheaper than 7 dept * 4 status = 28 SQL roundtrips).
  const counts = {};
  for (const r of (rows || [])) {
    const dept = r.department;
    if (!counts[dept]) counts[dept] = { accepted: 0, rejected: 0, failed: 0, expired: 0, pending: 0, total: 0 };
    counts[dept].total++;
    const resp = r.user_response;
    if (resp === 'accepted') counts[dept].accepted++;
    else if (resp === 'rejected') counts[dept].rejected++;
    else if (resp === 'failed') counts[dept].failed++;
    else if (resp === 'expired') counts[dept].expired++;
    else if (resp == null) counts[dept].pending++;
  }

  let statuses = [];
  try {
    statuses = await getAllDepartments(userId);
  } catch (err) {
    log.warn('getDepartmentSummary status fetch failed', { userId, error: err.message });
  }

  return statuses.map((s) => {
    const c = counts[s.department] || { accepted: 0, rejected: 0, failed: 0, expired: 0, pending: 0, total: 0 };
    const decided = c.accepted + c.rejected + c.failed; // exclude pending/expired from rate
    const acceptRate = decided > 0 ? Math.round((c.accepted / decided) * 100) : null;
    return {
      department: s.department,
      name: s.name || s.department,
      description: s.description || '',
      color: s.config?.color || s.color || '#6366F1',
      autonomyLevel: s.autonomyLevel ?? 0,
      isEnabled: s.isEnabled ?? false,
      budget: s.budget ?? { spent: 0, total: 0 },
      weeklyTotal: c.total,
      weeklyAccepted: c.accepted,
      weeklyRejected: c.rejected,
      weeklyFailed: c.failed,
      weeklyExpired: c.expired,
      weeklyPending: c.pending,
      acceptRate, // null when nothing decided yet (avoid 0% misread)
    };
  });
}

/**
 * Cheap count of the user's pending inbox items. Mirrors the visibility
 * rules of getInboxStream so the sidebar badge matches what the page
 * renders:
 *   - department IS NOT NULL  (department-emitted only)
 *   - user_response IS NULL   (still pending)
 *   - created_at within the 48h auto-expire window  (read-side filter)
 *
 * Uses head:true + count:'exact' so Postgres returns just the count
 * without hauling rows. Errors return 0 (badge stays absent rather
 * than wrong).
 */
export async function getPendingCount(userId) {
  if (!userId) return 0;
  try {
    const PENDING_EXPIRY_MS = 48 * 60 * 60 * 1000;
    const minCreatedAt = new Date(Date.now() - PENDING_EXPIRY_MS).toISOString();
    const nowIso = new Date().toISOString();
    const { count, error } = await supabaseAdmin
      .from('agent_actions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .not('department', 'is', null)
      .is('user_response', null)
      .gte('created_at', minCreatedAt)
      // Exclude active snoozes — a snoozed item shouldn't blink the badge.
      // .or() with .is.null OR .lte.nowIso so rows with no snooze still count.
      .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`);
    if (error) {
      log.warn('getPendingCount query failed', { userId, error: error.message });
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    log.warn('getPendingCount failed', { userId, error: err.message });
    return 0;
  }
}

export async function getInboxStream(userId, { cursor = null, limit = 20 } = {}) {
  if (!userId) {
    throw new Error('userId is required');
  }
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);

  try {
    // Sort by resolved_at when present, otherwise created_at. Postgres handles
    // the COALESCE in the orderBy; supabase-js can't express COALESCE in
    // .order(), so we fetch a larger window and sort in JS. The window is
    // capped at limit*3 to stay cheap.
    let query = supabaseAdmin
      .from('agent_actions')
      .select('id, department, skill_name, action_type, proposed_action, context_summary, reasoning, user_response, outcome_data, created_at, resolved_at, snoozed_until')
      .eq('user_id', userId)
      .not('department', 'is', null);

    if (cursor) {
      // Items strictly older than the cursor's sortAt. We compare against
      // both columns to avoid missing items whose resolved_at < cursor but
      // created_at >= cursor (rare but possible).
      query = query.or(`resolved_at.lt.${cursor},and(resolved_at.is.null,created_at.lt.${cursor})`);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(safeLimit * 3);

    if (error) {
      log.error('getInboxStream query failed', { userId, error });
      return { items: [], nextCursor: null };
    }

    // Hide pre-fix noise tiles: rows where context_summary is exactly the
    // generic "<Dept> department action" placeholder AND proposed_action is
    // a bare suggest with no real payload. These are ad-hoc test/empty
    // proposals from before the propose route rejected blanks. We never
    // delete them (keeps audit history intact); just filter on read.
    const NOISE_CONTEXT_RE = /^[A-Z][a-zA-Z]+ department action$/;
    const isNoise = (row) => {
      if (!row.context_summary || !NOISE_CONTEXT_RE.test(row.context_summary)) return false;
      try {
        // proposed_action can be double-encoded (jsonb storing a JSON string).
        // Parse up to twice so we land on a real object regardless of how it
        // was written.
        let parsed = row.proposed_action;
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        const tool = parsed?.toolName;
        const params = parsed?.params || {};
        if (tool !== 'suggest') return false;
        // A real suggestion lives in params.suggestion (or description/text);
        // priority alone is just bookkeeping.
        const hasRealPayload = ['suggestion', 'description', 'text', 'body']
          .some(k => typeof params[k] === 'string' && params[k].trim().length > 0);
        return !hasRealPayload;
      } catch {
        return false;
      }
    };

    // Sort in JS by max(resolved_at, created_at) DESC, then take page.
    const sorted = (data || [])
      .filter(row => !isNoise(row))
      .map(row => ({ row, sortAt: row.resolved_at || row.created_at }))
      .sort((a, b) => (a.sortAt < b.sortAt ? 1 : a.sortAt > b.sortAt ? -1 : 0));

    const page = sorted.slice(0, safeLimit);
    const nextCursor = page.length === safeLimit ? page[page.length - 1].sortAt : null;

    // Auto-expire: pending proposals older than this threshold are treated as
    // 'expired' in the API response even if the DB still says user_response IS
    // NULL. A nightly cron will persist the change to keep the DB clean, but
    // the UI gets immediate consistency on every read.
    const PENDING_EXPIRY_MS = 48 * 60 * 60 * 1000;
    const now = Date.now();

    const items = page.map(({ row, sortAt }) => {
      const department = row.department || extractDepartmentFromSkillName(row.skill_name);
      const config = getDepartmentConfig(department);
      let status = inboxStatus(row.user_response);
      if (status === 'pending') {
        const ageMs = now - new Date(row.created_at).getTime();
        if (ageMs > PENDING_EXPIRY_MS) status = 'expired';
      }
      // Active snooze hides the row from default views but keeps it in
      // the stream under a 'snoozed' status so the user can find it via
      // the Snoozed filter and unsnooze if needed. Once snoozed_until
      // elapses the read-side check is a no-op and the row reverts to
      // 'pending' naturally.
      if (status === 'pending'
          && row.snoozed_until
          && new Date(row.snoozed_until).getTime() > now) {
        status = 'snoozed';
      }
      return {
        id: row.id,
        status,
        title: generateDisplayDescription(row),
        why: row.context_summary || null,
        reasoning: row.reasoning || null,
        department,
        departmentColor: config?.color || '#6366F1',
        toolName: row.action_type || null,
        outcomeLink: status === 'done' ? extractOutcomeLink(row) : null,
        outcomeRef: status === 'done' ? extractOutcomeRef(row) : null,
        failureReason: status === 'failed' ? (row.outcome_data?.failureReason || null) : null,
        snoozedUntil: status === 'snoozed' ? row.snoozed_until : null,
        // Preview is only useful before the user acts; once status is done/skipped
        // the artifact (or the lack of it) supersedes the proposed payload.
        preview: (status === 'pending' || status === 'snoozed') ? extractPreview(row) : null,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
        sortAt,
      };
    });

    return { items, nextCursor };
  } catch (err) {
    log.error('getInboxStream failed', { userId, error: err.message });
    return { items: [], nextCursor: null };
  }
}

/**
 * Map raw user_response value → user-facing inbox status.
 * Keep narrow: only the four states the UI knows about.
 */
function inboxStatus(userResponse) {
  if (userResponse === null || userResponse === undefined) return 'pending';
  if (userResponse === 'accepted') return 'done';
  if (userResponse === 'rejected') return 'skipped';
  if (userResponse === 'expired') return 'expired';
  if (userResponse === 'undone') return 'undone';
  if (userResponse === 'failed') return 'failed';
  return 'done';
}

// 'snoozed' is computed purely from snoozed_until (no DB value) — handled in
// the inbox stream projection where the row is available.

/**
 * Update autonomy level for all skills in a department.
 * Validates the level is 0-4 and updates user_skill_settings for each tool.
 */
export async function updateDepartmentAutonomy(userId, department, level) {
  if (!userId || !department) {
    throw new Error('userId and department are required');
  }

  if (typeof level !== 'number' || level < 0 || level > 4) {
    throw new Error(`Invalid autonomy level: ${level}. Must be 0-4.`);
  }

  const config = getDepartmentConfig(department);
  if (!config) {
    throw new Error(`Unknown department: ${department}`);
  }

  const skillName = `${department}_actions`;

  try {
    // Look up or create the skill definition for this department
    let { data: skill } = await supabaseAdmin
      .from('skill_definitions')
      .select('id')
      .eq('name', skillName)
      .single();

    if (!skill) {
      // Create a department skill definition if it doesn't exist
      const { data: created, error: createError } = await supabaseAdmin
        .from('skill_definitions')
        .insert({
          name: skillName,
          display_name: `${config.name} Actions`,
          description: config.description,
          category: department,
          default_autonomy_level: config.defaultAutonomy,
          is_enabled: true,
        })
        .select('id')
        .single();

      if (createError) {
        log.error('Failed to create skill definition', { skillName, error: createError });
        throw createError;
      }
      skill = created;
    }

    // Upsert the user's autonomy override
    const { error: upsertError } = await supabaseAdmin
      .from('user_skill_settings')
      .upsert({
        user_id: userId,
        skill_id: skill.id,
        autonomy_level: level,
        is_enabled: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,skill_id' });

    if (upsertError) {
      log.error('Failed to update department autonomy', { userId, department, level, error: upsertError });
      throw upsertError;
    }

    log.info('Department autonomy updated', { userId, department, level });
    return { department, autonomyLevel: level };
  } catch (err) {
    log.error('updateDepartmentAutonomy failed', { userId, department, error: err.message });
    throw err;
  }
}

// ========================================================================
// Internal Helpers
// ========================================================================

/**
 * Resolve the effective autonomy level for a department.
 * Checks user override via the department's skill name, falls back to config default.
 */
async function resolveAutonomyLevel(userId, department, config) {
  try {
    const skillName = `${department}_actions`;
    const level = await getAutonomyBySkillName(userId, skillName);
    return level;
  } catch (err) {
    log.warn('Autonomy resolution failed, using config default', { department, error: err.message });
    return config.defaultAutonomy;
  }
}

/**
 * Count recent actions (last 7 days) for a department.
 */
async function countRecentActions(userId, department) {
  const skillName = `${department}_actions`;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { count, error } = await supabaseAdmin
      .from('agent_actions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('skill_name', skillName)
      .gte('created_at', sevenDaysAgo);

    if (error) {
      log.warn('countRecentActions query failed', { department, error: error.message });
      return 0;
    }

    return count || 0;
  } catch (err) {
    log.warn('countRecentActions failed', { department, error: err.message });
    return 0;
  }
}

/**
 * Get aggregate proposal stats for a department (total, approved, rejected, approval rate).
 * Uses a single query with client-side counting to keep it cheap.
 */
async function getDepartmentStats(userId, department) {
  const skillName = `${department}_actions`;
  const defaultStats = { totalProposals: 0, approved: 0, rejected: 0, approvalRate: 0 };

  try {
    // Use COUNT aggregation instead of fetching all rows into memory
    const [totalResult, acceptedResult, rejectedResult] = await Promise.all([
      supabaseAdmin.from('agent_actions').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('skill_name', skillName),
      supabaseAdmin.from('agent_actions').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('skill_name', skillName).eq('user_response', 'accepted'),
      supabaseAdmin.from('agent_actions').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('skill_name', skillName).eq('user_response', 'rejected'),
    ]);

    const totalProposals = totalResult.count || 0;
    const approved = acceptedResult.count || 0;
    const rejected = rejectedResult.count || 0;
    const approvalRate = totalProposals > 0 ? Math.round((approved / totalProposals) * 100) : 0;

    return { totalProposals, approved, rejected, approvalRate };
  } catch (err) {
    log.warn('getDepartmentStats failed', { department, error: err.message });
    return defaultStats;
  }
}

/**
 * Heartbeat check — called from observation ingestion cron after new data arrives.
 * Analyzes recent observations via LLM and generates department action proposals.
 * Cost-controlled: 2-hour cooldown per user, TIER_EXTRACTION (cheapest model).
 */
export async function checkDepartmentHeartbeats(userId, options = {}) {
  const { skipCooldown = false } = options;

  try {
    const departments = await getAllDepartments(userId);
    const activeDepts = departments.filter(d => d.autonomyLevel > 0);
    if (activeDepts.length === 0) return { proposals: [], skipped: 'no_active_departments' };

    // 1. Cooldown — max 1 heartbeat per user per 2 hours.
    //    Set the cooldown IMMEDIATELY after the check (before the expensive LLM call)
    //    to close the race window where two concurrent calls both pass the check.
    const cooldownKey = `dept_heartbeat:${userId}`;
    if (!skipCooldown) {
      const lastRun = await cacheGet(cooldownKey);
      if (lastRun) return { proposals: [], skipped: 'cooldown' };
      // Claim the slot now — subsequent concurrent calls will see this and bail.
      await cacheSet(cooldownKey, Date.now(), 7200);
    }

    // 2. Fetch recent observations (last 6 hours, max 30)
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data: recentObs } = await supabaseAdmin
      .from('user_memories')
      .select('content, memory_type, metadata, created_at')
      .eq('user_id', userId)
      .in('memory_type', ['observation', 'platform_data'])
      .gte('created_at', sixHoursAgo)
      .order('created_at', { ascending: false })
      .limit(30);

    if (!recentObs || recentObs.length < 3) return { proposals: [], skipped: 'insufficient_data' };

    // 3. Don't create duplicates — cap pending proposals
    const pending = await getPendingProposals(userId);
    if (pending.length >= 5) return { proposals: [], skipped: 'too_many_pending' };

    // 4. Fetch cross-department context for coordinated intelligence
    const { data: recentActions } = await supabaseAdmin
      .from('agent_actions')
      .select('department, action_type, context_summary, created_at')
      .eq('user_id', userId)
      .not('department', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    const crossDeptContext = recentActions?.length > 0
      ? `\nRECENT DEPARTMENT ACTIVITY:\n${recentActions.map(a => `- [${a.department}] ${a.context_summary || a.action_type} (${new Date(a.created_at).toLocaleDateString()})`).join('\n')}`
      : '';

    // 4b. Consume pending cross-department signals for each active department
    const { consumeSignals } = await import('./departmentSignalService.js');
    const signalsByDept = {};
    for (const dept of activeDepts) {
      const signals = await consumeSignals(userId, dept.department);
      if (signals.length) signalsByDept[dept.department] = signals;
    }

    const signalContext = Object.keys(signalsByDept).length > 0
      ? '\nDEPARTMENT SIGNALS (from other departments):\n' +
        Object.entries(signalsByDept).map(([dept, sigs]) =>
          sigs.map(s => `- [${s.from_department} -> ${dept}] ${s.signal_type}: ${JSON.stringify(s.payload)}`).join('\n')
        ).join('\n')
      : '';

    // 4c. Auto-emit Health -> Scheduling signal on low recovery
    const recoveryObs = recentObs.find(o => o.content?.match(/recovery\s+\d+%/i));
    if (recoveryObs) {
      const match = recoveryObs.content.match(/recovery\s+(\d+)%/i);
      if (match && parseInt(match[1]) < 50) {
        const { emitSignal } = await import('./departmentSignalService.js');
        await emitSignal(userId, 'health', 'scheduling', 'low_recovery', {
          recoveryPercent: parseInt(match[1]),
          suggestion: 'Consider blocking recovery time or reducing meeting load',
        });
      }
    }

    // 4d. Fetch active goals for department context
    const { getActiveGoalContext } = await import('./goalTrackingService.js');
    const goalContext = await getActiveGoalContext(userId);
    const goalPromptSection = goalContext
      ? `\n${goalContext}\nDepartments should align proposals with these goals when relevant.`
      : '';

    // 5. Build LLM prompt
    const deptDescriptions = activeDepts.map(d => {
      const tools = (getDepartmentConfig(d.department)?.tools || []).join(', ') || 'none yet';
      return `- ${d.name} (${d.department}): ${d.description}. Tools: ${tools}`;
    }).join('\n');

    const obsText = recentObs.slice(0, 20).map(o => `- ${o.content}`).join('\n');

    // Compute today/tomorrow dates so the LLM can emit real executable calendar times.
    // Previously the example used `{title: "..."}` with no start/end, which produced
    // proposals that failed at execution because `calendar_create` requires {summary, start}.
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const todayDate = now.toISOString().slice(0, 10);
    const tomorrowDate = tomorrow.toISOString().slice(0, 10);

    const prompt = `You are the AI chief of staff for a user. Your departments are ready to take action on their behalf. Your job: look at their recent activity and propose 2-3 HELPFUL, SPECIFIC actions their departments should take RIGHT NOW.

CURRENT DATE: ${todayDate} (tomorrow: ${tomorrowDate})
When proposing calendar events, use these dates. All times MUST be local time (no Z suffix) — the user's timezone is applied automatically.

ACTIVE DEPARTMENTS (pick from these keys): ${activeDepts.map(d => d.department).join(', ')}

${deptDescriptions}

RECENT USER ACTIVITY (last 6 hours):
${obsText}
${crossDeptContext}${signalContext}${goalPromptSection}

EXISTING PENDING PROPOSALS: ${pending.length}/5

YOUR TASK: Based on the data above, output a JSON array of 2-3 specific proposals. Be PROACTIVE, not conservative. If the user has a huge email backlog, propose a triage plan. If they've been listening to the same artist, propose a content idea. If their schedule looks packed, propose blocking focus time.

OUTPUT FORMAT (must be valid JSON):
[
  {"department":"communications","description":"Draft a triage email to unsubscribe from 5 Substack newsletters in your inbox","toolName":"gmail_draft","params":{"to":"user@example.com","subject":"Inbox Triage: 39,723 unread, unsubscribe targets","body":"Top promotional senders this week: substack.com, github.com, vercel.com. A 15-minute unsubscribe sprint on these three would cut future inflow ~40%."},"priority":3,"reasoning":"Gmail shows 39,723 unread (92% unread rate); top 3 senders are newsletters not people"},
  {"department":"scheduling","description":"Block 90 minutes for deep work tomorrow at 9-10:30am","toolName":"calendar_create","params":{"summary":"Deep work","start":"${tomorrowDate}T09:00:00","end":"${tomorrowDate}T10:30:00"},"priority":4,"reasoning":"Calendar has zero focus blocks this week and your Whoop recovery is above 75% three days running"},
  {"department":"health","description":"Schedule a low-strain recovery day tomorrow given Whoop recovery 42%","toolName":"suggest","params":{},"priority":5,"reasoning":"Whoop reports recovery 42% with SpO2 89.5% — both indicate impaired recovery overnight"}
]

RULES:
1. department MUST be one of: ${activeDepts.map(d => d.department).join(', ')}
2. ALLOWED toolName values: "suggest", "gmail_draft", "calendar_create", "docs_create". Anything else will be discarded.
   - NEVER emit "gmail_send", "gmail_reply", "calendar_modify_event", or any tool that needs an ID (messageId, threadId, eventId) you don't have from the observations. Use "suggest" instead.
3. For Health/Finance/Social/Research → toolName: "suggest" (these are observation departments)
4. For Communications → toolName: "gmail_draft" (only if you have a concrete recipient email from observations), else "suggest"
   - gmail_draft params MUST include: to (recipient email address), subject (string), body (draft content string). Without ALL THREE, the action CANNOT execute — use "suggest" instead.
5. For Scheduling → toolName: "calendar_create" (only for new events)
   - calendar_create params MUST include: summary (string, event title), start (ISO local time like "${tomorrowDate}T14:00:00" — no Z suffix), end (ISO local time). Optionally: description, location.
   - Without summary + start + end, the action CANNOT execute. Emit specific times grounded in the user's observed schedule.
   - For modifying existing events, use "suggest" — you don't have event IDs.
6. For Content → toolName: "docs_create" (only if you have a concrete title), else "suggest"
   - docs_create params MUST include: title (string). Without it, use "suggest".

7. The "description" field is the user-facing tile title. It MUST:
   - Start with a concrete verb: Draft, Block, Schedule, Create, Compile, Send, Reply, Add, Open, Review (only if there is a concrete artifact to review)
   - Be 8-20 words
   - Mention at least one specific number, name, or entity from the observations (e.g. "39k unread", "Whoop recovery 42%", "GitHub @vercel/next")
   - NEVER use hedging words: "consider", "think about", "maybe", "could", "might want to", "perhaps"
   GOOD:  "Draft a 15-minute Inbox Zero plan to triage 39,723 unread emails"
   GOOD:  "Block 90 minutes tomorrow morning for GitHub PR review"
   BAD:   "Consider tackling your email backlog" (hedging, no number)
   BAD:   "Communications department action" (placeholder, not specific)
   BAD:   "Review your relationships with newsletter senders" (vague verb, no number)

8. The "reasoning" field is the user-facing evidence line ("Because: …"). It MUST:
   - Cite at least one specific metric, count, or named entity from the observations
   - Be 10-25 words
   - Identify the source: "Gmail shows…", "Whoop reports…", "Calendar has…", "Spotify played…"
   GOOD:  "Gmail shows 39,723 unread (92% unread rate); GitHub and Substack dominate top senders this week"
   GOOD:  "Whoop recovery dropped to 42% with SpO2 89.5% — both indicate impaired recovery overnight"
   BAD:   "User has a lot of emails" (no number, no source)
   BAD:   "Backlog is severe" (no evidence)

9. Return an EMPTY array [] ONLY if there is genuinely no signal in the data. Do NOT emit a proposal you cannot back with a specific observation citation. A skipped run is better than a vague suggestion.

GO. Return only the JSON array, no other text:`;

    // 6. Call LLM (TIER_ANALYSIS — DeepSeek is much better than Mistral at structured output)
    const response = await complete({
      messages: [{ role: 'user', content: prompt }],
      tier: TIER_ANALYSIS,
      maxTokens: 800,
      temperature: 0.5,
      userId,
      serviceName: 'department-heartbeat',
    });

    // 7. Parse response and create proposals (robust JSON extraction)
    const rawText = response?.content || '';
    log.info('Heartbeat LLM response', {
      userId: userId.slice(0, 8),
      textLen: rawText.length,
    });

    // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
    let text = rawText.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();

    // Try greedy match for array
    let jsonMatch = text.match(/\[[\s\S]*\]/);
    // If no array found, try to find a single object and wrap it
    if (!jsonMatch) {
      const objMatch = text.match(/\{[\s\S]*\}/);
      if (objMatch) {
        log.info('Heartbeat found single object, wrapping in array', { userId: userId.slice(0, 8) });
        jsonMatch = [`[${objMatch[0]}]`];
      }
    }
    if (!jsonMatch) {
      log.warn('No JSON array or object in LLM response', {
        userId: userId.slice(0, 8),
        textPreview: text.slice(0, 500)
      });
      return { proposals: [], count: 0 };
    }

    let suggestions;
    try {
      // Clean only trailing commas (most common LLM issue)
      const cleaned = jsonMatch[0].replace(/,\s*([}\]])/g, '$1');
      suggestions = JSON.parse(cleaned);
    } catch (parseErr) {
      log.warn('Heartbeat JSON parse failed', {
        error: parseErr.message,
        jsonPreview: jsonMatch[0].slice(0, 300)
      });
      return { proposals: [], count: 0 };
    }
    if (!Array.isArray(suggestions)) suggestions = [suggestions]; // Single object → array
    if (suggestions.length === 0) return { proposals: [], count: 0 };

    log.info('Heartbeat parsed suggestions', {
      userId: userId.slice(0, 8),
      count: suggestions.length,
      departments: suggestions.map(s => s.department)
    });

    const createdProposals = [];
    const skipped = [];
    for (const s of suggestions.slice(0, 3)) {
      if (!DEPARTMENT_NAMES.includes(s.department)) {
        skipped.push({ reason: 'unknown_department', department: s.department });
        continue;
      }
      if (!activeDepts.find(d => d.department === s.department)) {
        skipped.push({ reason: 'department_inactive', department: s.department });
        continue;
      }

      // Defense-in-depth: even with the hardened prompt, validate the tool + params
      // against the heartbeat whitelist so an off-script LLM emission never produces
      // an unexecutable ghost proposal.
      const validation = validateHeartbeatProposal(s);
      if (!validation.ok) {
        skipped.push({ reason: validation.reason, department: s.department, ...validation.details });
        continue;
      }
      const { toolName, params } = validation;
      try {
        const result = await proposeDepartmentAction(userId, s.department, {
          toolName,
          params,
          context: s.description,
          reasoning: s.reasoning || null,
          priority: s.priority || 5,
        });
        if (result.actionId) {
          createdProposals.push({ ...result, department: s.department, description: s.description });
        } else {
          skipped.push({ reason: result.status || 'no_action_id', department: s.department });
        }
      } catch (err) {
        log.warn('Heartbeat proposal creation failed', { department: s.department, error: err.message });
        skipped.push({ reason: err.message, department: s.department });
      }
    }

    log.info('Heartbeat proposals processed', {
      userId: userId.slice(0, 8),
      created: createdProposals.length,
      skipped: skipped.length,
      skipReasons: skipped
    });

    // 8. Refresh cooldown for the skipCooldown manual path (normal path claimed it earlier).
    //    For the normal path this is a harmless no-op that keeps the TTL fresh.
    if (skipCooldown) {
      await cacheSet(cooldownKey, Date.now(), 7200);
    }

    // 9. Health correlation analysis (24h cooldown, non-fatal)
    const healthDept = activeDepts.find(d => d.department === 'health');
    if (healthDept) {
      const corrCooldownKey = `health_correlation:${userId}`;
      const lastCorr = await cacheGet(corrCooldownKey);
      if (!lastCorr) {
        try {
          const { analyzeHealthPatterns } = await import('./departmentExecutors/healthCorrelationAnalyzer.js');
          const { correlations } = await analyzeHealthPatterns(userId);
          if (correlations.length > 0) {
            const { emitSignal } = await import('./departmentSignalService.js');
            for (const corr of correlations) {
              if (corr.departments?.includes('scheduling')) {
                await emitSignal(userId, 'health', 'scheduling', 'health_pattern', {
                  pattern: corr.pattern,
                  recommendation: corr.recommendation,
                });
              }
            }
          }
          await cacheSet(corrCooldownKey, Date.now(), 86400); // 24h cooldown
        } catch (corrErr) {
          log.debug('Health correlation failed (non-fatal)', { error: corrErr.message });
        }
      }
    }

    log.info('Department heartbeat complete', { userId, proposalsCreated: createdProposals.length });
    return { proposals: createdProposals, count: createdProposals.length };
  } catch (err) {
    log.warn('Department heartbeat check failed', { userId, error: err.message });
    return { proposals: [], error: err.message };
  }
}

/**
 * Extract department key from a skill_name like "communications_actions".
 */
function extractDepartmentFromSkillName(skillName) {
  if (!skillName) return null;
  const suffix = '_actions';
  if (skillName.endsWith(suffix)) {
    return skillName.slice(0, -suffix.length);
  }
  return skillName.split('_')[0] || null;
}
