// api/services/nudgeService.js
// Finds beta users who need nudge emails (signed up but inactive).

import { supabaseAdmin } from './database.js';
import { sendPlatformNudge } from './emailService.js';
import { createLogger } from './logger.js';

const log = createLogger('NudgeService');

/** Minimum hours since signup before nudging. */
const MIN_HOURS_SINCE_SIGNUP = 24;

/**
 * Find users who:
 * 1. Signed up > 24 hours ago
 * 2. Have 0 platform connections
 * 3. Have 0 twin conversations (never chatted)
 * 4. Haven't been nudged already (platform_nudge_sent_at IS NULL)
 * 5. Haven't unsubscribed from emails
 *
 * @returns {Array<{ id: string, email: string, first_name: string, created_at: string }>}
 */
export async function findUsersNeedingNudge() {
  const cutoff = new Date(Date.now() - MIN_HOURS_SINCE_SIGNUP * 60 * 60 * 1000).toISOString();

  // Step 1: Get users who signed up before cutoff, not nudged, not unsubscribed
  const { data: candidates, error: userErr } = await supabaseAdmin
    .from('users')
    .select('id, email, first_name, created_at')
    .lt('created_at', cutoff)
    .is('platform_nudge_sent_at', null)
    .or('email_digest_unsubscribed.is.null,email_digest_unsubscribed.eq.false')
    .not('email', 'is', null)
    .limit(50);

  if (userErr) {
    log.error('Failed to query nudge candidates', { error: userErr.message });
    return [];
  }

  if (!candidates?.length) return [];

  // Step 2: Filter out users who have platform connections
  const userIds = candidates.map(u => u.id);

  const { data: connectedUsers, error: connErr } = await supabaseAdmin
    .from('platform_connections')
    .select('user_id')
    .in('user_id', userIds)
    .eq('status', 'connected');

  if (connErr) {
    log.error('Failed to query platform connections', { error: connErr.message });
    return [];
  }

  const connectedSet = new Set((connectedUsers || []).map(c => c.user_id));

  // Step 3: Filter out users who have chatted (have twin_conversations)
  const { data: chattedUsers, error: chatErr } = await supabaseAdmin
    .from('twin_conversations')
    .select('user_id')
    .in('user_id', userIds);

  if (chatErr) {
    log.error('Failed to query twin conversations', { error: chatErr.message });
    return [];
  }

  const chattedSet = new Set((chattedUsers || []).map(c => c.user_id));

  // Return users with 0 connections AND 0 conversations
  return candidates.filter(u => !connectedSet.has(u.id) && !chattedSet.has(u.id));
}

/**
 * Send nudge emails to all eligible users and mark them as nudged.
 * @returns {{ sent: number, skipped: number, errors: number }}
 */
export async function sendNudgeEmails() {
  const users = await findUsersNeedingNudge();

  if (!users.length) {
    log.info('No users need nudging');
    return { sent: 0, skipped: 0, errors: 0 };
  }

  log.info(`Found ${users.length} users needing nudge`);

  let sent = 0;
  let errors = 0;

  for (const user of users) {
    try {
      await sendPlatformNudge({
        toEmail: user.email,
        firstName: user.first_name || user.email.split('@')[0],
        userId: user.id,
      });

      // Mark user as nudged to prevent duplicate sends
      const { error: updateErr } = await supabaseAdmin
        .from('users')
        .update({ platform_nudge_sent_at: new Date().toISOString() })
        .eq('id', user.id);

      if (updateErr) {
        log.warn('Failed to mark user as nudged', { userId: user.id, error: updateErr.message });
      }

      sent++;
    } catch (err) {
      log.error('Failed to nudge user', { userId: user.id, error: err.message });
      errors++;
    }
  }

  log.info('Nudge run complete', { sent, errors, total: users.length });
  return { sent, skipped: users.length - sent - errors, errors };
}
