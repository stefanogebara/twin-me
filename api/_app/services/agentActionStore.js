/**
 * The agent_actions table's housekeeping (audit M2-D, 2026-09-22): proposals nobody answered
 * are expired, not deleted, so a later review still finds them.
 */
import { supabaseAdmin } from './database.js';

/** Unanswered proposals older than the cutoff, oldest-first by creation, up to a batch. */
export function staleActions(cutoffIso, { limit } = {}) {
  return supabaseAdmin.from('agent_actions').select('id').is('user_response', null).lt('created_at', cutoffIso).limit(limit);
}
/** Mark a batch expired; answers the count written. */
export function expireActions(ids, patch) {
  return supabaseAdmin.from('agent_actions').update(patch, { count: 'exact' }).in('id', ids);
}
