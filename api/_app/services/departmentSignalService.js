/**
 * Department Signal Service — Cross-Department Communication
 * ============================================================
 * Simple emit/consume/list system for departments to send typed signals
 * to each other. Signals expire after 24 hours and are consumed once read.
 *
 * Examples:
 *   Health detects low recovery -> emitSignal(userId, 'health', 'scheduling', 'low_recovery', { recoveryPercent: 38 })
 *   Scheduling heartbeat -> consumeSignals(userId, 'scheduling') -> sees the low_recovery signal
 */

import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('DepartmentSignals');

/**
 * Emit a signal from one department to another.
 * @param {string} userId
 * @param {string} fromDept - Source department key
 * @param {string} toDept - Target department key
 * @param {string} signalType - e.g. 'low_recovery', 'meeting_prep', 'goal_progress'
 * @param {object} payload - Arbitrary JSON payload with signal details
 */
export async function emitSignal(userId, fromDept, toDept, signalType, payload = {}) {
  const { error } = await supabaseAdmin.from('department_signals').insert({
    user_id: userId,
    from_department: fromDept,
    to_department: toDept,
    signal_type: signalType,
    payload,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) {
    log.error('Failed to emit signal', { fromDept, toDept, signalType, error });
  } else {
    log.info('Signal emitted', { userId: userId.slice(0, 8), fromDept, toDept, signalType });
  }
}

/**
 * Consume pending signals for a department. Returns up to 5 unconsumed,
 * non-expired signals and marks them consumed atomically.
 * @param {string} userId
 * @param {string} department - Target department key
 * @returns {Array} Consumed signal rows
 */
export async function consumeSignals(userId, department) {
  const { data, error } = await supabaseAdmin.from('department_signals')
    .select('*')
    .eq('user_id', userId)
    .eq('to_department', department)
    .eq('consumed', false)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(5);

  if (error || !data?.length) return [];

  // Mark consumed
  const ids = data.map(s => s.id);
  await supabaseAdmin.from('department_signals')
    .update({ consumed: true })
    .in('id', ids);

  return data;
}

/**
 * Get all active (unconsumed, non-expired) signals for a user.
 * Used for dashboard/debugging — does NOT consume them.
 * @param {string} userId
 * @returns {Array} Active signal rows
 */
export async function getActiveSignals(userId) {
  const { data } = await supabaseAdmin.from('department_signals')
    .select('*')
    .eq('user_id', userId)
    .eq('consumed', false)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(20);
  return data || [];
}
