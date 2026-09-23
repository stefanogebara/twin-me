/**
 * Outcome Learning Service
 * ========================
 * Daily cron that checks 24h+ after a gmail_draft approval whether the
 * draft was actually sent. If yes → strengthenProcedure for that skill.
 * If the draft is trashed or 404 → weakenProcedure (the user didn't want it).
 * If still in the drafts label only → neutral (user hasn't decided yet).
 *
 * Loop is intentionally narrow:
 *   - Only gmail_draft proposals (no calendar/docs yet — separate iterations)
 *   - Only accepted rows resolved >= 24h ago and <= 7 days ago
 *   - Only rows we haven't already evaluated (outcome_data.outcomeChecked
 *     missing or false)
 *
 * Cost: 1 gmail.users.messages.get per row. Rate-limited at MAX_PER_USER and
 * MAX_TOTAL per cron tick so a backlog can't blow through the Vercel budget.
 */

import { supabaseAdmin } from './database.js';
import { getValidAccessToken } from './tokenRefreshService.js';
import { createLogger } from './logger.js';
import axios from 'axios';

const log = createLogger('OutcomeLearning');

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';
const REQUEST_TIMEOUT = 10_000;

const MAX_PER_USER = 20;
const MAX_TOTAL = 200;

// Inspect a single gmail_draft outcome and classify it. Returns one of:
//   'sent'    — draft was sent; user followed through
//   'trashed' — message was trashed; user actively rejected the drafted text
//   'kept'    — still in DRAFT label only; user hasn't acted
//   'gone'    — 404; draft was deleted; treat as a soft weak signal
//   'unknown' — couldn't determine (no messageId, transient error)
async function classifyDraftOutcome(userId, messageId) {
  if (!messageId) return 'unknown';

  const tokenResult = await getValidAccessToken(userId, 'google_gmail');
  if (!tokenResult.success || !tokenResult.accessToken) {
    log.warn('No valid gmail token for outcome check', { userId });
    return 'unknown';
  }

  try {
    const res = await axios.get(
      `${GMAIL_BASE}/messages/${encodeURIComponent(messageId)}`,
      {
        headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
        params: { format: 'minimal' },
        timeout: REQUEST_TIMEOUT,
      }
    );
    const labels = res.data?.labelIds || [];
    if (labels.includes('SENT')) return 'sent';
    if (labels.includes('TRASH')) return 'trashed';
    if (labels.includes('DRAFT')) return 'kept';
    return 'unknown';
  } catch (err) {
    if (err.response?.status === 404) return 'gone';
    log.warn('classifyDraftOutcome request failed', {
      userId, messageId, status: err.response?.status, error: err.message,
    });
    return 'unknown';
  }
}

/**
 * Inspect a single calendar_create outcome. Returns one of:
 *   'attended'   — event in the past, user's responseStatus = 'accepted' OR user is the creator and event still exists
 *   'declined'   — user's responseStatus = 'declined'
 *   'cancelled'  — Google flagged the event as cancelled (status='cancelled')
 *   'scheduled'  — event still in the future; too early to judge
 *   'gone'       — 404; user deleted the event entirely
 *   'unknown'    — auth or transient error
 *
 * Procedural mapping:
 *   attended            → strengthen  (user actually showed up / kept the block)
 *   declined / cancelled / gone → weaken (user actively rejected)
 *   scheduled           → no update    (defer until it's past)
 *   unknown             → no update
 */
async function classifyCalendarOutcome(userId, eventId) {
  if (!eventId) return 'unknown';

  const tokenResult = await getValidAccessToken(userId, 'google_calendar');
  if (!tokenResult.success || !tokenResult.accessToken) {
    log.warn('No valid calendar token for outcome check', { userId });
    return 'unknown';
  }

  try {
    const res = await axios.get(
      `${CALENDAR_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}`,
      {
        headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
        timeout: REQUEST_TIMEOUT,
      }
    );
    const ev = res.data || {};

    // Google preserves cancelled events in the API with status='cancelled'
    // (separate from a 404 if the user actually purged it).
    if (ev.status === 'cancelled') return 'cancelled';

    // If the user is in the attendees list, trust their responseStatus.
    const userEmail = (ev.attendees || []).find(a => a?.self)?.email || null;
    const selfAttendee = (ev.attendees || []).find(a => a?.self);
    if (selfAttendee?.responseStatus === 'declined') return 'declined';
    if (selfAttendee?.responseStatus === 'accepted') {
      const endIso = ev.end?.dateTime || ev.end?.date || null;
      if (endIso && new Date(endIso).getTime() < Date.now()) return 'attended';
      return 'scheduled';
    }

    // Lone-user events have no attendees array — falls through to time-based.
    const endIso = ev.end?.dateTime || ev.end?.date || null;
    if (endIso && new Date(endIso).getTime() < Date.now()) return 'attended';
    return 'scheduled';
  } catch (err) {
    if (err.response?.status === 404) return 'gone';
    if (err.response?.status === 410) return 'gone'; // Google sometimes uses 410 for deleted recurring instances
    log.warn('classifyCalendarOutcome request failed', {
      userId, eventId, status: err.response?.status, error: err.message,
    });
    return 'unknown';
  }
}

/**
 * Top-level entry called by the daily cron. Scans the eligible rows and
 * applies procedural-memory updates per outcome.
 */
export async function runOutcomeLearning() {
  const startedAt = Date.now();
  const stats = {
    scanned: 0, errors: 0,
    // gmail_draft verdicts
    sent: 0, trashed: 0, kept: 0, gone: 0,
    // calendar verdicts
    attended: 0, declined: 0, cancelled: 0, scheduled: 0,
    // shared
    unknown: 0,
  };

  // Verdict → procedural-memory direction. 'reinforce' = strengthen,
  // 'punish' = weaken, anything else = neutral (no update).
  const VERDICT_DIRECTION = {
    sent: 'reinforce', attended: 'reinforce',
    trashed: 'punish', gone: 'punish', cancelled: 'punish', declined: 'punish',
    kept: 'neutral', scheduled: 'neutral', unknown: 'neutral',
  };

  // Window: resolved between 24h ago and 7d ago. Older than 7d is stale —
  // user's procedural memory should already have moved on.
  const minResolved = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const maxResolved = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await supabaseAdmin
    .from('agent_actions')
    .select('id, user_id, skill_name, action_type, outcome_data, resolved_at')
    .eq('user_response', 'accepted')
    .eq('action_type', 'draft')  // gmail_draft writes action_type='draft'
    .gte('resolved_at', minResolved)
    .lte('resolved_at', maxResolved)
    .order('resolved_at', { ascending: true })
    .limit(MAX_TOTAL);

  if (error) {
    log.error('runOutcomeLearning fetch failed', { error: error.message });
    return { ...stats, error: error.message };
  }
  if (!rows || rows.length === 0) {
    return { ...stats, durationMs: Date.now() - startedAt };
  }

  // Per-user cap so a single power user can't crowd out everyone else.
  const perUserCount = new Map();
  const { strengthenProcedure, weakenProcedure } = await import('./proceduralMemoryService.js');

  for (const row of rows) {
    if ((perUserCount.get(row.user_id) || 0) >= MAX_PER_USER) continue;
    if (row.outcome_data?.outcomeChecked) continue; // idempotent re-runs

    // Dispatch by which tool actually ran. action_type='draft' is a catch-all
    // for any writer tool (gmail_draft, calendar_create, docs_create) — the
    // real tool name lives in executionResult.tool.
    const exec = row.outcome_data?.executionResult;
    if (!exec) continue;
    const tool = exec.tool;
    const data = exec.data || {};

    let kind = null;        // 'gmail' | 'calendar'
    let targetId = null;    // messageId or eventId
    if (tool === 'gmail_draft') {
      targetId = data?.draft?.messageId;
      kind = targetId ? 'gmail' : null;
    } else if (tool === 'calendar_create') {
      targetId = data?.eventId;
      kind = targetId ? 'calendar' : null;
    }
    // docs_create deliberately not handled — Docs API is currently disabled
    // for this project, so all those rows are in failed state already.

    if (!kind) continue;

    stats.scanned++;
    perUserCount.set(row.user_id, (perUserCount.get(row.user_id) || 0) + 1);

    let verdict;
    try {
      verdict = kind === 'gmail'
        ? await classifyDraftOutcome(row.user_id, targetId)
        : await classifyCalendarOutcome(row.user_id, targetId);
    } catch (vErr) {
      log.warn('outcome classify threw', { id: row.id, kind, error: vErr.message });
      stats.errors++;
      continue;
    }

    stats[verdict] = (stats[verdict] || 0) + 1;

    // Hebbian update — fire-and-forget so a procedural-memory error doesn't
    // block the loop. Direction comes from the shared VERDICT_DIRECTION map
    // so gmail and calendar paths agree on what counts as positive/negative.
    try {
      const dir = VERDICT_DIRECTION[verdict];
      if (dir === 'reinforce') {
        await strengthenProcedure(row.user_id, row.skill_name);
      } else if (dir === 'punish') {
        await weakenProcedure(row.user_id, row.skill_name);
      }
    } catch (procErr) {
      log.warn('procedural update failed', { id: row.id, verdict, error: procErr.message });
    }

    // Mark row evaluated so we don't re-check it next run — UNLESS the
    // verdict is provisional ('scheduled' = calendar event still in the
    // future, 'unknown' = transient auth/network glitch). Defer to a
    // future cron tick which may produce a definitive verdict.
    const isProvisional = verdict === 'scheduled' || verdict === 'unknown';
    if (!isProvisional) {
      try {
        await supabaseAdmin
          .from('agent_actions')
          .update({
            outcome_data: {
              ...(row.outcome_data || {}),
              outcomeChecked: true,
              outcomeVerdict: verdict,
              outcomeKind: kind,
              outcomeCheckedAt: new Date().toISOString(),
            },
          })
          .eq('id', row.id);
      } catch (mErr) {
        log.warn('outcome_data mark failed', { id: row.id, error: mErr.message });
      }
    }
  }

  const out = { ...stats, durationMs: Date.now() - startedAt };
  log.info('Outcome learning complete', out);
  return out;
}
