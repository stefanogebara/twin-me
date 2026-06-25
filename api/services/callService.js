/**
 * Call Service — the twin places outbound phone calls (Vapi, BYOK)
 * ================================================================
 * The twin places a user-approved outbound PSTN call toward a specific goal
 * ("call the dentist and book a cleaning"), holds a voice conversation via a
 * managed voice-agent platform (Vapi), then reports the outcome back on the
 * user's channel.
 *
 * DOUBLE-GATED so the feature is inert in prod until deliberately turned on:
 *   1. VAPI_API_KEY + VAPI_PHONE_NUMBER_ID env vars must be present, AND
 *   2. the per-user `phone_calls` feature flag must be explicitly true.
 * Either missing → placeCall returns { error: 'calling_not_configured' }.
 *
 * Regulatory posture (see .claude/plans/2026-06-16-twin-phone-calls): every call
 * is user-initiated, per-call, to a number the user named; the agent discloses
 * it's an AI assistant; recording is off by default. No bulk/marketing calling.
 *
 * Cost controls (Vercel rules): hard max call duration + daily per-user quota.
 * No cron-driven calling — volume is bounded by user approvals.
 *
 * NOTE: Vapi request/webhook field names are encoded in ONE place each
 * (placeCall body, handleCallWebhook parser) and should be re-checked against
 * Vapi's current docs when the key is first added — there is no live call test
 * without an account.
 */

import axios from 'axios';
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('CallService');

const VAPI_API_BASE = 'https://api.vapi.ai';
const MAX_CALL_DURATION_SECONDS = 300; // 5 min hard cap → bounds per-call cost
const DAILY_CALL_QUOTA = 10;           // per-user calls / 24h

/**
 * Calling is live only when both gates are satisfied: provider env configured
 * AND the user has explicitly opted into the phone_calls flag. Never throws.
 */
export async function isCallingEnabled(userId) {
  if (!process.env.VAPI_API_KEY || !process.env.VAPI_PHONE_NUMBER_ID) return false;
  if (!userId) return false;
  try {
    const { getFeatureFlags } = await import('./featureFlagsService.js');
    const flags = await getFeatureFlags(userId);
    // Explicit opt-in: default-absent flags are "on" platform-wide, but a call
    // is sensitive, so we require the flag to be literally true.
    return flags.phone_calls === true;
  } catch {
    return false;
  }
}

/**
 * Build the call system prompt: AI disclosure, the goal, and bounded behavior so
 * the call actually ends. Pure.
 */
export function buildCallPrompt({ userName, goal, toName }) {
  const onBehalf = userName || 'the person I represent';
  return [
    `You are a polite personal AI assistant placing a phone call on behalf of ${onBehalf}.`,
    toName ? `You are calling ${toName}.` : '',
    `The moment someone answers, clearly state that you are an AI assistant calling on behalf of ${onBehalf}. Never imply you are a human.`,
    `Your goal: ${goal}.`,
    `Be natural and concise. Accomplish the goal, read back the key details to confirm, then politely end the call. If the person declines or it cannot be done, thank them and end. Do not agree to anything beyond the stated goal. Keep the call under ${Math.round(MAX_CALL_DURATION_SECONDS / 60)} minutes.`,
  ].filter(Boolean).join(' ');
}

async function dailyCallCount(userId) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  try {
    const { count } = await supabaseAdmin
      .from('twin_calls')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', since);
    return count || 0;
  } catch {
    return 0;
  }
}

/**
 * Place an outbound call. Inserts a twin_calls row, asks Vapi to dial, and
 * records the provider call id for webhook correlation. Never throws — returns
 * { success, ... }. The actual outcome arrives later via handleCallWebhook.
 */
export async function placeCall(userId, { toNumber, toName = null, goal }) {
  if (!userId || !toNumber || !goal) {
    return { success: false, error: 'userId, toNumber and goal are required' };
  }
  if (!(await isCallingEnabled(userId))) {
    return { success: false, error: 'calling_not_configured', message: 'Phone calling isn\'t set up yet.' };
  }
  if (await dailyCallCount(userId) >= DAILY_CALL_QUOTA) {
    return { success: false, error: 'daily_quota_exceeded', message: `Daily call limit (${DAILY_CALL_QUOTA}) reached.` };
  }

  let userName = null;
  try {
    const { data } = await supabaseAdmin.from('users').select('name, full_name').eq('id', userId).single();
    userName = data?.name || data?.full_name || null;
  } catch { /* non-fatal */ }

  // Record the intent first so a row always exists for the webhook to find.
  let callId;
  try {
    const { data, error } = await supabaseAdmin
      .from('twin_calls')
      .insert({ user_id: userId, to_number: toNumber, to_name: toName, goal: String(goal).slice(0, 1000), provider: 'vapi', status: 'queued' })
      .select('id')
      .single();
    if (error) return { success: false, error: error.message };
    callId = data.id;
  } catch (err) {
    return { success: false, error: err.message };
  }

  try {
    const prompt = buildCallPrompt({ userName, goal, toName });
    const body = {
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
      customer: { number: toNumber },
      assistant: {
        model: { provider: 'openai', model: 'gpt-4o', messages: [{ role: 'system', content: prompt }] },
        maxDurationSeconds: MAX_CALL_DURATION_SECONDS,
        recordingEnabled: false,
      },
      metadata: { twinCallId: callId, userId },
    };
    const { data } = await axios.post(`${VAPI_API_BASE}/call`, body, {
      headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    const providerCallId = data?.id || null;
    await supabaseAdmin.from('twin_calls').update({ provider_call_id: providerCallId, status: 'dialing' }).eq('id', callId);
    log.info('call placed', { userId, callId, providerCallId, toName });
    return { success: true, callId, providerCallId, status: 'dialing' };
  } catch (err) {
    const errMsg = err.response?.data?.message || err.message;
    log.warn('vapi create-call failed', { callId, error: errMsg, status: err.response?.status });
    await supabaseAdmin.from('twin_calls').update({ status: 'failed', outcome: `Couldn't place the call: ${errMsg}` }).eq('id', callId);
    return { success: false, error: errMsg, callId };
  }
}

/** Map Vapi endedReason to our coarse status. */
export function mapEndedReasonToStatus(reason) {
  const r = String(reason || '').toLowerCase();
  // Vapi reasons like "customer-did-not-answer", "customer-busy", "voicemail".
  if (/no[-_ ]?answer|did-?not-?answer|busy|voicemail|unreachable/.test(r)) return 'no_answer';
  if (/failed|error|rejected/.test(r)) return 'failed';
  return 'completed';
}

async function summarizeOutcome(goal, transcript) {
  if (!transcript) return null;
  try {
    const { complete, TIER_ANALYSIS } = await import('./llmGateway.js');
    const resp = await complete({
      messages: [{ role: 'user', content: `The goal of this phone call was: ${goal}\n\nTranscript:\n${String(transcript).slice(0, 4000)}\n\nIn ONE plain sentence (no preamble), state whether the goal was achieved and the concrete result.` }],
      tier: TIER_ANALYSIS,
      maxTokens: 120,
      temperature: 0.2,
      serviceName: 'call-outcome-summary',
    });
    return resp?.content?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Handle a Vapi server webhook. Processes the terminal end-of-call-report:
 * stores the transcript + outcome summary, sets status/duration, and delivers a
 * one-line summary to the user. Other event types are acknowledged and ignored.
 * Never throws — returns { handled, ... }.
 */
export async function handleCallWebhook(payload) {
  const msg = payload?.message || payload || {};
  const type = msg.type;
  // We only act on the final report; everything else is a no-op ack.
  if (type && type !== 'end-of-call-report') {
    return { handled: false, reason: `ignored_type:${type}` };
  }

  const call = msg.call || payload?.call || {};
  const providerCallId = call.id || msg.callId || null;
  const twinCallId = call.metadata?.twinCallId || msg.metadata?.twinCallId || null;
  if (!providerCallId && !twinCallId) return { handled: false, reason: 'no_call_id' };

  const transcript = msg.artifact?.transcript || msg.transcript || call.transcript || null;
  const endedReason = msg.endedReason || call.endedReason || null;
  const durationSeconds = Math.round(msg.durationSeconds || call.duration || 0) || null;
  const providerSummary = msg.analysis?.summary || msg.summary || null;

  // Locate our row (prefer the metadata id; fall back to provider id).
  let row = null;
  try {
    if (twinCallId) {
      const { data } = await supabaseAdmin.from('twin_calls').select('id, user_id, goal, to_name, status').eq('id', twinCallId).maybeSingle();
      row = data;
    }
    if (!row && providerCallId) {
      const { data } = await supabaseAdmin.from('twin_calls').select('id, user_id, goal, to_name, status').eq('provider_call_id', providerCallId).maybeSingle();
      row = data;
    }
  } catch (err) {
    log.warn('twin_calls lookup failed', { error: err.message });
    return { handled: false, reason: 'lookup_failed' };
  }
  if (!row) return { handled: false, reason: 'row_not_found' };
  if (row.status === 'completed' || row.status === 'failed' || row.status === 'no_answer') {
    return { handled: false, reason: 'already_finalized' }; // idempotent — webhooks can retry
  }

  const status = mapEndedReasonToStatus(endedReason);
  const outcome = providerSummary || (await summarizeOutcome(row.goal, transcript)) || 'The call ended.';

  try {
    await supabaseAdmin.from('twin_calls').update({
      status, transcript, outcome, duration_seconds: durationSeconds, ended_at: new Date().toISOString(),
    }).eq('id', row.id);
  } catch (err) {
    log.warn('twin_calls finalize update failed', { error: err.message });
  }

  try {
    const { deliverInsight } = await import('./messageRouter.js');
    const label = row.to_name ? `Call to ${row.to_name}` : 'Call';
    await deliverInsight(row.user_id, { id: row.id, insight: `${label}: ${outcome}`, category: 'call', urgency: 'medium' });
  } catch (err) {
    log.warn('call outcome delivery failed', { error: err.message });
  }

  log.info('call finalized', { callId: row.id, status, durationSeconds });
  return { handled: true, callId: row.id, status, outcome };
}

export const CALL_LIMITS = Object.freeze({ MAX_CALL_DURATION_SECONDS, DAILY_CALL_QUOTA });
