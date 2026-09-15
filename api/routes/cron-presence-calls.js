/**
 * Cron: Presence calls
 * ====================
 * Every hour, dial the presences whose local clock says it is their hour
 * (presenceCallScheduling decides: her hour on her days, one dial a day, a
 * second attempt the hour after a no-answer). The brief is compiled at dial
 * time and travels as overrides; ElevenLabs places the call through its
 * Twilio integration and reports back on the post-call webhook.
 *
 * Schedule: 0 * * * * (vercel.json). Security: CRON_SECRET.
 * Cost: one query when nothing is due; no LLM call here. PRESENCE_CALLS_ENABLED
 * gates dialing (off by default), MAX_DIALS_PER_RUN caps a runaway.
 * Env: ELEVENLABS_PRESENCE_AGENT_ID, ELEVENLABS_PRESENCE_PHONE_NUMBER_ID, and
 * ELEVENLABS_PRESENCE_PHONE_PROVIDER ('sip_trunk' by default, 'twilio' for a
 * number imported through ElevenLabs' native Twilio integration).
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { logCronExecution } from '../services/cronLogger.js';
import { listCallablePresences, listCallsSince, createCall } from '../services/presenceStore.js';
import { isDue } from '../services/presenceCallScheduling.js';
import { compileCallBrief } from '../services/presenceCallBrief.js';
import { voiceService } from '../services/voiceService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronPresenceCalls');
const router = express.Router();

export const MAX_DIALS_PER_RUN = 20;
const CALL_LANGUAGE = 'pt-br';
// Calls placed in the last 36 hours cover "today" in every timezone.
const LOOKBACK_MS = 36 * 3600 * 1000;

/** The overrides the agent receives for this call: the brief, the first message, her voice. */
export function overridesFor(brief) {
  const overrides = { agent: { prompt: { prompt: brief.prompt }, first_message: brief.firstMessage, language: CALL_LANGUAGE } };
  if (brief.voiceId) overrides.tts = { voice_id: brief.voiceId };
  return overrides;
}

export async function dialDuePresences(now = new Date()) {
  const agentId = process.env.ELEVENLABS_PRESENCE_AGENT_ID;
  const phoneNumberId = process.env.ELEVENLABS_PRESENCE_PHONE_NUMBER_ID;
  if (!agentId || !phoneNumberId || !voiceService.isEnabled()) {
    return { skipped: 'not_configured', dialed: 0, failed: 0 };
  }

  const { data: presences, error } = await listCallablePresences();
  if (error) throw error;
  if (!presences?.length) return { dialed: 0, failed: 0, due: 0 };

  const since = new Date(now.getTime() - LOOKBACK_MS).toISOString();
  const { data: calls, error: callsError } = await listCallsSince(presences.map((p) => p.id), since);
  if (callsError) throw callsError;
  const callsByPresence = new Map();
  for (const call of calls || []) {
    if (!callsByPresence.has(call.presence_id)) callsByPresence.set(call.presence_id, []);
    callsByPresence.get(call.presence_id).push(call);
  }

  const due = presences
    .map((presence) => ({ presence, verdict: isDue(presence, callsByPresence.get(presence.id) || [], now) }))
    .filter(({ verdict }) => verdict.due)
    .slice(0, MAX_DIALS_PER_RUN);

  let dialed = 0;
  let failed = 0;
  for (const { presence, verdict } of due) {
    const firstCall = !presence.elder_assent_at;
    const brief = await compileCallBrief(presence, { firstCall });
    const placed = await voiceService.startOutboundCall({
      agentId,
      phoneNumberId,
      toNumber: presence.elder_phone,
      overrides: overridesFor(brief),
      dynamicVariables: { presence_id: presence.id },
      provider: process.env.ELEVENLABS_PRESENCE_PHONE_PROVIDER === 'twilio' ? 'twilio' : 'sip_trunk',
    });
    const row = {
      presence_id: presence.id,
      scheduled_for: now.toISOString(),
      attempt: verdict.attempt,
      direction: 'outbound',
      status: placed.success ? 'dialing' : 'failed',
      provider_conversation_id: placed.success ? placed.conversationId : null,
      call_sid: placed.success ? placed.callSid || null : null,
      failure_reason: placed.success ? null : String(placed.error || 'dial failed').slice(0, 500),
    };
    const { error: createError } = await createCall(row);
    if (createError) log.error('Call not recorded', { presenceId: presence.id, error: createError.message });
    if (placed.success) {
      dialed += 1;
      log.info('Dialed', { presenceId: presence.id, attempt: verdict.attempt, firstCall, conversationId: placed.conversationId });
    } else {
      failed += 1;
      log.error('Dial failed', { presenceId: presence.id, error: placed.error });
    }
  }
  return { dialed, failed, due: due.length };
}

// Accept both GET and POST: Vercel crons send GET by default.
router.all('/', async (req, res) => {
  const startTime = Date.now();
  try {
    const authResult = verifyCronSecret(req);
    if (!authResult.authorized) {
      return res.status(authResult.status).json({ error: authResult.error });
    }
    if (process.env.PRESENCE_CALLS_ENABLED !== 'true') {
      return res.json({ success: true, skipped: 'disabled' });
    }

    const result = await dialDuePresences(new Date());
    const elapsed = Date.now() - startTime;
    log.info('Presence calls cron complete', { ...result, elapsedMs: elapsed });
    await logCronExecution('presence-calls', 'success', elapsed, result);
    return res.json({ success: true, ...result, elapsedMs: elapsed });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    await logCronExecution('presence-calls', 'error', elapsed, null, err.message);
    log.error('Presence calls cron failed', { error: err.message });
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
