/**
 * Purchase reflection cooldown — shared state (replan-2026-06-12)
 * ================================================================
 * Extracted from api/routes/purchase-notification.js so the WhatsApp
 * transaction capture path and the mobile notification path share ONE
 * reflection budget (5-min cooldown + 2/day cap). Without sharing, a user
 * with both sources active would get doubled reflection volume.
 *
 * State lives in user_platform_data (platform '_internal', data_type
 * 'purchase_cooldown') — survives Vercel cold starts / multi-instance.
 */
import { supabaseAdmin } from './database.js';

export const COOLDOWN_MS = 5 * 60 * 1000;
export const MAX_DAILY = 2;

export async function loadPurchaseCooldown(userId) {
  const { data } = await supabaseAdmin
    .from('user_platform_data')
    .select('raw_data, extracted_at')
    .eq('user_id', userId)
    .eq('platform', '_internal')
    .eq('data_type', 'purchase_cooldown')
    .maybeSingle();
  return data?.raw_data ?? { last_sent_at: null, day_date: null, daily_count: 0 };
}

export async function savePurchaseCooldown(userId, state) {
  await supabaseAdmin
    .from('user_platform_data')
    .upsert({
      user_id: userId,
      platform: '_internal',
      data_type: 'purchase_cooldown',
      raw_data: state,
      extracted_at: new Date().toISOString(),
    }, { onConflict: 'user_id,platform,data_type' });
}

/**
 * Check cooldown + daily cap in one shot.
 * @returns {{ allowed: boolean, reason?: 'cooldown'|'daily_cap', state, today, todayCount }}
 */
export async function checkPurchaseCooldown(userId) {
  const state = await loadPurchaseCooldown(userId);
  if (state.last_sent_at && Date.now() - new Date(state.last_sent_at).getTime() < COOLDOWN_MS) {
    return { allowed: false, reason: 'cooldown', state };
  }
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = state.day_date === today ? (state.daily_count ?? 0) : 0;
  if (todayCount >= MAX_DAILY) {
    return { allowed: false, reason: 'daily_cap', state, today, todayCount };
  }
  return { allowed: true, state, today, todayCount };
}

/**
 * Bump the shared budget after a reflection is sent (or committed to send).
 */
export async function bumpPurchaseCooldown(userId, { today, todayCount }) {
  await savePurchaseCooldown(userId, {
    last_sent_at: new Date().toISOString(),
    day_date: today,
    daily_count: todayCount + 1,
  });
}
