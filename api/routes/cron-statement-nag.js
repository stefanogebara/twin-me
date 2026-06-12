/**
 * Cron: Monthly Statement Nag — bank-integration strategy Phase 1.
 * =================================================================
 * Runs on the 1st of each month (vercel.json: 0 12 1 * * = 12:00 UTC, 9am BR).
 * For every WhatsApp-linked user whose transaction data has gone stale (no
 * transaction newer than STALE_DAYS), the twin asks for last month's bank
 * statement. The inbound file is handled by the Kapso webhook's document
 * branch (whatsappStatementIngest), closing the loop.
 *
 * Cost posture (Vercel cron rules): monthly cadence, two cheap DB queries, no
 * LLM calls. WhatsApp ToS: the wording asks for "your statement", never for
 * account numbers or identifiers.
 *
 * Delivery caveat: a plain text message only reaches users inside Meta's 24h
 * customer-service window. Outside it Meta silently drops the send (logged in
 * whatsapp_outbound_log). A pre-approved utility template lifts that limit —
 * tracked as a follow-up; for early beta users who message their twin
 * regularly the window is usually open.
 */

import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { sendWhatsAppMessage } from '../services/whatsappService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronStatementNag');
const router = express.Router();

// No transaction newer than this → the user's money picture is stale.
const STALE_DAYS = 25;
// Safety cap per run — at current scale this is far above reality, and it
// bounds the Kapso message budget if the user base grows under us.
const MAX_NAGS_PER_RUN = 50;

const NAG_TEXT =
  'New month! Your bank statement from last month just closed. ' +
  'Export it from your bank app (OFX or CSV — in Nubank: Conta, Exportar extrato) ' +
  'and send the file here. I\'ll read it and keep your money picture sharp.';

router.all('/', async (req, res) => {
  const startTime = Date.now();
  try {
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    // WhatsApp-linked users.
    const { data: channels, error: chErr } = await supabaseAdmin
      .from('messaging_channels')
      .select('user_id, channel_id')
      .eq('channel', 'whatsapp')
      .limit(500);
    if (chErr) throw new Error(`channels query failed: ${chErr.message}`);
    if (!channels?.length) {
      return res.json({ success: true, nagged: 0, reason: 'no whatsapp channels' });
    }

    // Latest transaction per user, one query: fetch recent tx for these users
    // and reduce in memory (user counts are small; the alternative is N
    // queries or an RPC — not worth it at this scale).
    const userIds = [...new Set(channels.map((c) => c.user_id))];
    const cutoff = new Date(Date.now() - STALE_DAYS * 86400_000).toISOString().slice(0, 10);
    const { data: freshTx, error: txErr } = await supabaseAdmin
      .from('user_transactions')
      .select('user_id')
      .in('user_id', userIds)
      .gte('transaction_date', cutoff);
    if (txErr) throw new Error(`transactions query failed: ${txErr.message}`);

    const freshUsers = new Set((freshTx || []).map((r) => r.user_id));
    const staleChannels = channels.filter((c) => !freshUsers.has(c.user_id));

    let nagged = 0;
    const results = [];
    for (const ch of staleChannels.slice(0, MAX_NAGS_PER_RUN)) {
      const sent = await sendWhatsAppMessage(ch.channel_id, NAG_TEXT);
      results.push({ user: ch.user_id, success: sent?.success === true });
      if (sent?.success) nagged++;
    }

    log.info(`statement nag complete: ${nagged}/${staleChannels.length} stale users nagged`);
    return res.json({
      success: true,
      whatsappUsers: channels.length,
      stale: staleChannels.length,
      nagged,
      elapsed_ms: Date.now() - startTime,
    });
  } catch (err) {
    log.error(`statement nag failed: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
