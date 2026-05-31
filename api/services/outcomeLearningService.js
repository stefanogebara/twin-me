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
 * Top-level entry called by the daily cron. Scans the eligible rows and
 * applies procedural-memory updates per outcome.
 */
export async function runOutcomeLearning() {
  const startedAt = Date.now();
  const stats = { scanned: 0, sent: 0, trashed: 0, kept: 0, gone: 0, unknown: 0, errors: 0 };

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
    // Skip rows we've already evaluated (idempotent re-runs).
    if (row.outcome_data?.outcomeChecked) continue;
    // Skip rows that didn't actually create a draft (silent-failure backfill etc).
    const messageId = row.outcome_data?.executionResult?.data?.draft?.messageId;
    if (!messageId) continue;

    stats.scanned++;
    perUserCount.set(row.user_id, (perUserCount.get(row.user_id) || 0) + 1);

    let verdict;
    try {
      verdict = await classifyDraftOutcome(row.user_id, messageId);
    } catch (vErr) {
      log.warn('classifyDraftOutcome threw', { id: row.id, error: vErr.message });
      stats.errors++;
      continue;
    }

    stats[verdict] = (stats[verdict] || 0) + 1;

    // Hebbian update — fire-and-forget so a procedural-memory error doesn't
    // block the loop.
    try {
      if (verdict === 'sent') {
        await strengthenProcedure(row.user_id, row.skill_name);
      } else if (verdict === 'trashed' || verdict === 'gone') {
        await weakenProcedure(row.user_id, row.skill_name);
      }
      // 'kept' and 'unknown' → no update.
    } catch (procErr) {
      log.warn('procedural update failed', { id: row.id, verdict, error: procErr.message });
    }

    // Mark row evaluated so we don't re-check it next run.
    try {
      await supabaseAdmin
        .from('agent_actions')
        .update({
          outcome_data: {
            ...(row.outcome_data || {}),
            outcomeChecked: true,
            outcomeVerdict: verdict,
            outcomeCheckedAt: new Date().toISOString(),
          },
        })
        .eq('id', row.id);
    } catch (mErr) {
      log.warn('outcome_data mark failed', { id: row.id, error: mErr.message });
    }
  }

  const out = { ...stats, durationMs: Date.now() - startedAt };
  log.info('Outcome learning complete', out);
  return out;
}
