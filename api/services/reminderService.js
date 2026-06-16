/**
 * Reminders / scheduled nudges
 * ============================
 * The twin sets time-based reminders ("me lembra de pagar o boleto dia 10")
 * and delivers them on the user's channels at the time. Delivery piggybacks on
 * the existing every-15-minute prospective-check cron (no new cron invocations
 * — Vercel cost rule), routed through messageRouter so it reaches whatever
 * channel the user has live (WhatsApp, Telegram, push).
 */

import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('Reminders');

const MAX_DELIVERY_ATTEMPTS = 5;

/**
 * Convert a wall-clock local time (ISO 8601 WITHOUT offset, e.g.
 * "2026-06-17T09:00:00") interpreted in `timeZone` to the corresponding UTC
 * instant. Runtime-tz-independent: the machine tz cancels in the offset diff.
 * If `localISO` already carries a Z/offset, it's used as-is.
 */
export function zonedLocalToUtc(localISO, timeZone = 'UTC') {
  const s = String(localISO).trim().replace(' ', 'T');
  if (/[zZ]$|[+\-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    if (isNaN(d.getTime())) throw new Error('invalid datetime');
    return d;
  }
  const asUtc = new Date(s.endsWith('Z') ? s : s + 'Z');
  if (isNaN(asUtc.getTime())) throw new Error('invalid datetime');
  const local = new Date(asUtc.toLocaleString('en-US', { timeZone }));
  const utc = new Date(asUtc.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMs = local.getTime() - utc.getTime(); // tz offset from UTC at that instant
  return new Date(asUtc.getTime() - offsetMs);
}

/**
 * Create a reminder. `remindAt` is a local ISO (no Z) interpreted in `timeZone`,
 * or an absolute ISO with offset/Z. Never throws — returns { success, ... }.
 */
export async function createReminder(userId, { remindAt, timeZone = 'UTC', message, source = 'twin' }) {
  if (!userId || !message || !remindAt) {
    return { success: false, error: 'userId, message and remindAt are required' };
  }
  let remindAtUtc;
  try {
    remindAtUtc = zonedLocalToUtc(remindAt, timeZone);
  } catch {
    return { success: false, error: 'invalid remindAt' };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('reminders')
      .insert({
        user_id: userId,
        message: String(message).slice(0, 1000),
        remind_at: remindAtUtc.toISOString(),
        source,
      })
      .select('id, remind_at')
      .single();
    if (error) {
      log.warn(`createReminder insert failed for ${userId}: ${error.message}`);
      return { success: false, error: error.message };
    }
    log.info(`reminder set for ${userId}`, { id: data.id, remindAt: data.remind_at });
    return { success: true, id: data.id, remindAt: data.remind_at };
  } catch (err) {
    log.error(`createReminder threw for ${userId}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * List the user's upcoming (pending) reminders, soonest first. Never throws.
 */
export async function listReminders(userId, { limit = 10 } = {}) {
  try {
    const { data, error } = await supabaseAdmin
      .from('reminders')
      .select('id, message, remind_at')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('remind_at', { ascending: true })
      .limit(limit);
    if (error) return { success: false, error: error.message, reminders: [] };
    return { success: true, reminders: data || [] };
  } catch (err) {
    return { success: false, error: err.message, reminders: [] };
  }
}

/**
 * Cancel a pending reminder — by id, or by a short text match on its message
 * ("boleto"). Ambiguous (>1 match) returns the candidates so the twin can ask.
 * The user's own data — no approval needed. Never throws.
 */
export async function cancelReminder(userId, { id, query } = {}) {
  try {
    if (id) {
      const { data, error } = await supabaseAdmin
        .from('reminders')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .eq('user_id', userId)
        .eq('status', 'pending')
        .select('id, message')
        .maybeSingle();
      if (error) return { success: false, error: error.message };
      if (!data) return { success: false, error: 'not_found', message: 'No matching pending reminder.' };
      return { success: true, cancelled: [data] };
    }

    if (query) {
      const { data, error } = await supabaseAdmin
        .from('reminders')
        .select('id, message, remind_at')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .ilike('message', `%${query}%`);
      if (error) return { success: false, error: error.message };
      if (!data?.length) return { success: false, error: 'not_found', message: `No pending reminder matching "${query}".` };
      if (data.length > 1) return { success: false, error: 'ambiguous', matches: data, message: `Found ${data.length} reminders matching "${query}" — which one?` };
      const r = data[0];
      await supabaseAdmin.from('reminders').update({ status: 'cancelled' }).eq('id', r.id).eq('user_id', userId);
      return { success: true, cancelled: [r] };
    }

    return { success: false, error: 'id or query required' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Deliver every due, still-pending reminder. Called by the 15-min cron. Routes
 * each through messageRouter.deliverInsight (multi-channel). Marks delivered on
 * success; counts attempts and gives up after MAX_DELIVERY_ATTEMPTS so a user
 * with no live channel doesn't get retried forever. Never throws.
 */
export async function deliverDueReminders({ limit = 25 } = {}) {
  const nowISO = new Date().toISOString();
  let due;
  try {
    const { data, error } = await supabaseAdmin
      .from('reminders')
      .select('id, user_id, message, attempts')
      .eq('status', 'pending')
      .lte('remind_at', nowISO)
      .order('remind_at', { ascending: true })
      .limit(limit);
    if (error) {
      log.warn(`due-reminders lookup failed: ${error.message}`);
      return { delivered: 0, scanned: 0 };
    }
    due = data || [];
  } catch (err) {
    log.warn(`due-reminders lookup threw: ${err.message}`);
    return { delivered: 0, scanned: 0 };
  }

  if (due.length === 0) return { delivered: 0, scanned: 0 };

  const { deliverInsight } = await import('./messageRouter.js');
  let delivered = 0;

  for (const r of due) {
    let out;
    try {
      out = await deliverInsight(r.user_id, {
        id: r.id,
        insight: r.message,
        category: 'reminder',
        urgency: 'medium',
      });
    } catch (err) {
      log.warn(`reminder delivery threw for ${r.id}: ${err.message}`);
      out = { delivered: 0 };
    }

    if ((out?.delivered || 0) > 0) {
      await supabaseAdmin
        .from('reminders')
        .update({ status: 'delivered', delivered_at: new Date().toISOString() })
        .eq('id', r.id);
      delivered++;
    } else {
      const attempts = (r.attempts || 0) + 1;
      const patch = attempts >= MAX_DELIVERY_ATTEMPTS ? { status: 'failed', attempts } : { attempts };
      await supabaseAdmin.from('reminders').update(patch).eq('id', r.id);
    }
  }

  if (delivered > 0) log.info(`delivered ${delivered}/${due.length} due reminders`);
  return { delivered, scanned: due.length };
}
