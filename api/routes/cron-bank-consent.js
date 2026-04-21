/**
 * Cron: Bank Consent Expiry Reminder — Financial-Emotional Twin
 * ================================================================
 * Runs daily. Sweeps user_bank_connections for consent_expires_at falling in
 * the next N days and emits a proactive_insights banner + Resend email so
 * the user reconnects before the bank stops sharing data.
 *
 * Pluggy OF consent: 12 months
 * TrueLayer UK OB:  90 days (some providers 180d)
 *
 * Both share the same consent_expires_at column. This cron is provider-
 * agnostic — it just reads the column and acts on whatever's there.
 *
 * Reminder cadence: 14 days out, 7 days out, 1 day out. We mark the
 * reminder in proactive_insights.metadata.consent_remind_stage so we don't
 * spam the user with the same reminder every morning.
 */

import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { sendPushToUser } from '../services/pushNotificationService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('cron-bank-consent');
const router = express.Router();

// Windows we check, in days. Keep descending so a connection at 14d gets that
// reminder before it rolls into 7d on a subsequent run.
const REMIND_STAGES = [14, 7, 1];

function stageForDaysLeft(daysLeft) {
  for (const s of REMIND_STAGES) {
    if (daysLeft <= s) return s;
  }
  return null;
}

async function hasAlreadyRemindedAtStage(userId, connectionId, stage) {
  const { data, error } = await supabaseAdmin
    .from('proactive_insights')
    .select('id')
    .eq('user_id', userId)
    .eq('category', 'consent_expiry')
    .contains('metadata', { connection_id: connectionId, stage })
    .limit(1);
  if (error) {
    log.warn(`dedup check failed user ${userId}: ${error.message}`);
    return false;
  }
  return (data || []).length > 0;
}

async function emitReminder({ userId, connection, daysLeft, stage }) {
  const providerName = connection.connector_name || 'seu banco';
  const title = daysLeft <= 1
    ? 'Reconecte agora'
    : `Reconecte ${providerName} em breve`;
  const body = daysLeft <= 1
    ? `O consentimento do ${providerName} expira hoje. Reconecte para não perder seu histórico de transações.`
    : `Seu consentimento do ${providerName} expira em ${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'}. Reconectar leva 30 segundos.`;

  const { error: insErr } = await supabaseAdmin
    .from('proactive_insights')
    .insert({
      user_id: userId,
      insight: `${title} — ${body}`,
      category: 'consent_expiry',
      urgency: daysLeft <= 1 ? 'high' : 'medium',
      metadata: {
        title,
        body,
        connection_id: connection.id,
        stage,
        days_left: daysLeft,
        provider: connection.provider,
        connector_name: connection.connector_name,
        consent_expires_at: connection.consent_expires_at,
      },
    });

  if (insErr) {
    log.warn(`insert consent insight failed user ${userId}: ${insErr.message}`);
    return { sent: false, reason: 'db_insert' };
  }

  try {
    await sendPushToUser(userId, {
      title,
      body,
      notificationType: 'consent_expiry',
      data: { connectionId: connection.id, stage, daysLeft },
      // Force-send the 1-day reminder even in quiet hours — missing the
      // reconnect deadline is worse than waking the user up.
      force: daysLeft <= 1,
    });
  } catch (err) {
    log.warn(`push consent reminder failed user ${userId}: ${err.message}`);
  }

  return { sent: true };
}

export async function runConsentReminderSweep() {
  const now = Date.now();
  // Look 15 days out (one day past the earliest stage) so we catch anyone
  // just entering the 14-day window.
  const horizon = new Date(now + 15 * 86400_000).toISOString();

  const { data: rows, error } = await supabaseAdmin
    .from('user_bank_connections')
    .select('id, user_id, provider, connector_name, consent_expires_at, status')
    .is('deleted_at', null)
    .not('consent_expires_at', 'is', null)
    .lt('consent_expires_at', horizon);

  if (error) {
    log.error(`sweep query failed: ${error.message}`);
    return { processed: 0, sent: 0, skipped: 0 };
  }

  let sent = 0;
  let skipped = 0;

  for (const row of rows || []) {
    const expiresAt = new Date(row.consent_expires_at).getTime();
    const daysLeft = Math.ceil((expiresAt - now) / 86400_000);
    if (daysLeft < 0) {
      // Already expired — not our job to remind, UI should surface reconnect
      // banner separately from status/LOGIN_ERROR.
      skipped++;
      continue;
    }
    const stage = stageForDaysLeft(daysLeft);
    if (stage === null) { skipped++; continue; }

    if (await hasAlreadyRemindedAtStage(row.user_id, row.id, stage)) {
      skipped++;
      continue;
    }

    const { sent: s } = await emitReminder({
      userId: row.user_id,
      connection: row,
      daysLeft,
      stage,
    });
    if (s) sent++;
  }

  log.info(`consent sweep: ${rows?.length || 0} approaching, ${sent} reminders sent, ${skipped} skipped`);
  return { processed: rows?.length || 0, sent, skipped };
}

/**
 * Vercel cron endpoint. Schedule via vercel.json (daily at 10am UTC = 7am SP).
 */
router.get('/', async (_req, res) => {
  try {
    const result = await runConsentReminderSweep();
    res.json({ success: true, ...result });
  } catch (err) {
    log.error(`cron failed: ${err.message}\n${err.stack}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
