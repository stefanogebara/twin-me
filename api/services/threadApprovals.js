/**
 * Thread Approvals — proposals live in the conversation (one-interface, 2026-06-12).
 * ===================================================================================
 * The /inbox page is gone. Its job — "see what your twin wants to do, say yes
 * or no" — moves into the WhatsApp thread, Magie-style:
 *
 *   1. OFFER: after the twin replies to an inbound message (the 24h service
 *      window is open and the user is engaged), offer the OLDEST pending
 *      proposal that hasn't been offered yet, as one compact message ending
 *      in a yes/skip protocol line. One at a time — never a list dump.
 *   2. RESOLVE: when a SHORT affirmation/rejection arrives and exactly one
 *      offered proposal is awaiting a reply, resolve it deterministically —
 *      no LLM in the loop (deterministic spine, AI skin):
 *        yes/sim/ok/do it/faz -> executeApprovedAction (same path as the old
 *                                inbox Approve button)
 *        skip/no/nao/pula     -> recordActionResponse('rejected')
 *
 * Anything that isn't a short protocol reply falls through to normal twin
 * chat — a long "yes, and also..." message is conversation, not a button
 * press. The twin also still sees PENDING_ACTIONS in its context, so it can
 * discuss proposals naturally; this module is only the deterministic rail.
 */

import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('thread-approvals');

// A protocol reply is SHORT. Long messages are conversation for the twin.
const MAX_PROTOCOL_REPLY_LEN = 24;
const APPROVE_RE = /^(yes|y|sim|s|ok|okay|do it|go|faz|pode|manda|aprovar|aprova|confirma|confirmo|\u{1F44D})[!. ]*$/iu;
const REJECT_RE = /^(no|n|skip|nao|não|pula|cancela|cancel|rejeitar|rejeita|dispensa|later|depois)[!. ]*$/iu;

// An offer goes stale after this long — a "yes" two days later is too
// ambiguous to treat as a button press.
const OFFER_TTL_HOURS = 24;

/**
 * Classify a short inbound message as a protocol reply.
 * @returns {'approve'|'reject'|null}
 */
export function classifyProtocolReply(text) {
  const t = (text || '').trim();
  if (!t || t.length > MAX_PROTOCOL_REPLY_LEN) return null;
  if (APPROVE_RE.test(t)) return 'approve';
  if (REJECT_RE.test(t)) return 'reject';
  return null;
}

/**
 * The single proposal currently awaiting a thread reply: pending, offered via
 * WhatsApp, offer still fresh. Newest offer wins if several exist (shouldn't
 * happen — offerNextProposal only offers when nothing is awaiting).
 */
export async function getAwaitingProposal(userId) {
  const cutoff = new Date(Date.now() - OFFER_TTL_HOURS * 3600_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('agent_actions')
    .select('id, department, context_summary, proposed_action, wa_delivered_at')
    .eq('user_id', userId)
    .is('user_response', null)
    .not('wa_delivered_at', 'is', null)
    .gte('wa_delivered_at', cutoff)
    .order('wa_delivered_at', { ascending: false })
    .limit(1);
  if (error) {
    log.warn(`awaiting-proposal lookup failed: ${error.message}`);
    return null;
  }
  return data?.[0] || null;
}

/**
 * Resolve a protocol reply against the awaiting proposal. Returns the
 * confirmation text to send, or null when there's nothing awaiting (caller
 * falls through to normal twin chat).
 */
export async function resolveProtocolReply(userId, intent) {
  const proposal = await getAwaitingProposal(userId);
  if (!proposal) return null;

  const label = proposal.context_summary || 'that action';
  try {
    if (intent === 'approve') {
      const { executeApprovedAction } = await import('./autonomyService.js');
      const result = await executeApprovedAction(userId, proposal.id);
      const ok = result?.success !== false;
      log.info(`thread-approved proposal ${proposal.id}`, { userId, ok });
      return ok
        ? `Done. ${label} is handled.`
        : `I tried, but it didn't go through (${result?.error || 'unknown error'}). It's back in my queue.`;
    }
    const { recordActionResponse } = await import('./autonomyService.js');
    await recordActionResponse(userId, proposal.id, 'rejected', {
      rejectedAt: new Date().toISOString(),
      via: 'whatsapp_thread',
    });
    log.info(`thread-rejected proposal ${proposal.id}`, { userId });
    return `Skipped. I won't do that one.`;
  } catch (err) {
    log.error(`protocol resolve failed for ${proposal.id}: ${err.message}`);
    return `Something went wrong handling that — I'll keep it pending.`;
  }
}

/**
 * Offer the oldest unoffered pending proposal — at most one in flight.
 * Returns the offer text to send, or null when there's nothing to offer
 * (no pending proposals, or one is already awaiting a reply).
 *
 * Called AFTER the twin's normal reply, so the offer rides the same open
 * service window without interrupting the conversation.
 */
export async function offerNextProposal(userId) {
  // Never stack offers: if one is awaiting, stay quiet.
  if (await getAwaitingProposal(userId)) return null;

  const { data, error } = await supabaseAdmin
    .from('agent_actions')
    .select('id, department, context_summary, action_type, created_at')
    .eq('user_id', userId)
    .is('user_response', null)
    .is('wa_delivered_at', null)
    .gt('created_at', new Date(Date.now() - 48 * 3600_000).toISOString()) // inbox-era 48h expiry
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) {
    log.warn(`offer lookup failed: ${error.message}`);
    return null;
  }
  const proposal = data?.[0];
  if (!proposal) return null;

  const { error: markErr } = await supabaseAdmin
    .from('agent_actions')
    .update({ wa_delivered_at: new Date().toISOString() })
    .eq('id', proposal.id)
    .eq('user_id', userId);
  if (markErr) {
    log.warn(`offer mark failed for ${proposal.id}: ${markErr.message}`);
    return null; // don't offer what we can't track
  }

  const label = proposal.context_summary || 'an action I think would help';
  return `One more thing — I'd like to: ${label}. Reply "yes" and I'll do it, or "skip".`;
}
