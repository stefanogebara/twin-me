/**
 * twinActionsService — the action-inbox business logic for M1.
 *
 * Backs the /api/actions endpoints: list a user's pending twin actions, and
 * resolve one by the user's decision (send / edit / reject). Approval-gated by
 * design — a row only ever leaves `pending` through an explicit user decision,
 * and every write is scoped to (user_id, id, status='pending') so an action
 * can't be resolved twice or by anyone but its owner.
 *
 * The decision→patch mapping and validation are pure (resolveActionPatch), so
 * they're unit-tested directly. The DB lives behind an injectable `db` port
 * (default: supabaseAdmin), so the service logic is tested against a fake.
 */
import { createLogger } from './logger.js';

const log = createLogger('TwinActions');

const DECISIONS = new Set(['send', 'edit', 'reject']);
const MAX_REASON = 500;

/**
 * Pure: map an approval decision to the DB patch.
 * @param {{decision:string, finalText?:string, reason?:string}} input
 * @param {string} [resolvedAt]  ISO string; injected for deterministic tests
 * @returns {{ok:true, patch:object} | {ok:false, error:string}}
 */
export function resolveActionPatch({ decision, finalText, reason } = {}, resolvedAt) {
  const at = resolvedAt || new Date().toISOString();
  if (!DECISIONS.has(decision)) return { ok: false, error: 'invalid_decision' };

  if (decision === 'send') {
    return { ok: true, patch: { status: 'sent', resolved_at: at } };
  }
  if (decision === 'edit') {
    const text = typeof finalText === 'string' ? finalText.trim() : '';
    if (!text) return { ok: false, error: 'missing_final_text' };
    return { ok: true, patch: { status: 'edited', final_text: text, resolved_at: at } };
  }
  // reject
  const r = typeof reason === 'string' ? reason.trim().slice(0, MAX_REASON) : '';
  return { ok: true, patch: { status: 'rejected', reject_reason: r || null, resolved_at: at } };
}

/**
 * The action inbox: a user's pending actions, newest first.
 * @returns {Promise<Array<object>>} (empty on error — the inbox never 500s)
 */
export async function listPendingActions(userId, deps = makeDefaultDeps()) {
  if (!userId) return [];
  try {
    return await deps.db.listPending(userId, deps.limit || 50);
  } catch (err) {
    log.warn('listPendingActions failed', { userId, error: err?.message });
    return [];
  }
}

/**
 * Resolve one action by the user's decision.
 * @param {{userId:string, actionId:string, decision:string, finalText?:string, reason?:string}} input
 * @returns {Promise<{ok:true, action:object} | {ok:false, error:string}>}
 */
export async function resolveAction(input, deps = makeDefaultDeps()) {
  const { userId, actionId, decision, finalText, reason } = input || {};
  if (!userId || !actionId) return { ok: false, error: 'missing_input' };

  const built = resolveActionPatch({ decision, finalText, reason }, deps.now && deps.now());
  if (!built.ok) return built;

  try {
    const row = await deps.db.updateAction(userId, actionId, built.patch);
    if (!row) return { ok: false, error: 'not_found' }; // wrong owner, missing, or already resolved
    return { ok: true, action: row };
  } catch (err) {
    log.error('resolveAction failed', { userId, actionId, error: err?.message });
    return { ok: false, error: 'update_failed' };
  }
}

const INBOX_COLS = 'id, type, status, channel, thread_ref, recipient, draft_text, why_signals, created_at';

/** Real DB port. Injected in tests; lazy-imported here so routes stay thin. */
export function makeDefaultDeps() {
  return {
    db: {
      async listPending(userId, limit) {
        const { supabaseAdmin } = await import('./database.js');
        const { data, error } = await supabaseAdmin
          .from('twin_actions')
          .select(INBOX_COLS)
          .eq('user_id', userId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (error) throw new Error(error.message);
        return data || [];
      },
      async updateAction(userId, actionId, patch) {
        const { supabaseAdmin } = await import('./database.js');
        const { data, error } = await supabaseAdmin
          .from('twin_actions')
          .update(patch)
          .eq('id', actionId)
          .eq('user_id', userId)     // ownership
          .eq('status', 'pending')   // idempotency — can't re-resolve
          // draft_text + recipient are returned so the caller can feed the
          // edit/reject learning wire (voiceReplyLearning) without a re-fetch.
          .select('id, status, draft_text, recipient, final_text, reject_reason, resolved_at')
          .maybeSingle();
        if (error) throw new Error(error.message);
        return data || null;
      },
    },
  };
}
