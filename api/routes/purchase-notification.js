/**
 * POST /api/purchase-notification/trigger
 *
 * Called by the mobile app when a delivery/commerce notification fires.
 * Applies smart filtering before generating a reflection — only stress-worthy
 * purchases get a message (late night, weekend, big spend, high calendar load).
 */
import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { buildPurchaseContext } from '../services/purchaseContextBuilder.js';
import { generatePurchaseReflection } from '../services/purchaseReflection.js';
import { sendWhatsAppMessage } from '../services/whatsappService.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';

const router = Router();
const log = createLogger('PurchaseNotification');

const COOLDOWN_MS = 5 * 60 * 1000;
const MAX_DAILY = 2;

// Persistent state via Supabase — survives Vercel cold starts / multi-instance
async function loadState(userId) {
  const { data } = await supabaseAdmin
    .from('user_platform_data')
    .select('raw_data, extracted_at')
    .eq('user_id', userId)
    .eq('platform', '_internal')
    .eq('data_type', 'purchase_cooldown')
    .maybeSingle();
  return data?.raw_data ?? { last_sent_at: null, day_date: null, daily_count: 0 };
}

async function saveState(userId, state) {
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

// Minimum amount in BRL to trigger on a routine weekday (9am–10pm)
const ROUTINE_MIN_AMOUNT = 80;

function parseAmount(str) {
  if (!str) return null;
  const n = parseFloat(str.replace(/[R$\s]/g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

function getLocalHour(timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, hour: 'numeric', hour12: false,
    }).formatToParts(new Date());
    return Number(parts.find(p => p.type === 'hour')?.value ?? new Date().getUTCHours());
  } catch {
    return new Date().getUTCHours();
  }
}

function getLocalDay(timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, weekday: 'narrow',
    }).formatToParts(new Date());
    const d = parts.find(p => p.type === 'weekday')?.value;
    return d === 'S' ? 'maybe_weekend' : 'weekday'; // crude but avoids locale issues
  } catch {
    const d = new Date().getUTCDay();
    return d === 0 || d === 6 ? 'weekend' : 'weekday';
  }
}

function isStressWorthy(amount, timezone, calendarEventCount) {
  const h = getLocalHour(timezone);
  const isLateNight = h >= 22 || h < 6;
  const isWeekend = [0, 6].includes(new Date().getUTCDay());
  const isBigSpend = amount !== null && amount >= 150;
  const isHighLoad = calendarEventCount >= 3;

  // Always send: late night, weekend, big spend, or packed calendar
  if (isLateNight) return { worthy: true, reason: 'late_night' };
  if (isWeekend)   return { worthy: true, reason: 'weekend' };
  if (isBigSpend)  return { worthy: true, reason: 'big_spend' };
  if (isHighLoad)  return { worthy: true, reason: 'high_calendar_load' };

  // Routine daytime weekday: only if above amount threshold
  if (amount !== null && amount >= ROUTINE_MIN_AMOUNT) {
    return { worthy: true, reason: 'above_threshold' };
  }

  return { worthy: false, reason: 'routine_small' };
}

router.post('/trigger', authenticateUser, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { appName, notificationText, amount: rawAmount } = req.body;
  if (!notificationText) return res.status(400).json({ error: 'notificationText required' });

  const amount = parseAmount(rawAmount);

  try {
    // Load persistent state first (cooldown + daily cap)
    const state = await loadState(userId);

    // 5-min cooldown check (persistent)
    if (state.last_sent_at && Date.now() - new Date(state.last_sent_at).getTime() < COOLDOWN_MS) {
      return res.json({ skipped: true, reason: 'cooldown' });
    }

    // Fetch timezone + WhatsApp in parallel
    const [{ data: userRow }, { data: channel }] = await Promise.all([
      supabaseAdmin.from('users').select('timezone').eq('id', userId).maybeSingle(),
      supabaseAdmin.from('messaging_channels').select('channel_id')
        .eq('user_id', userId).eq('channel', 'whatsapp').maybeSingle(),
    ]);

    if (!channel?.channel_id) {
      return res.json({ skipped: true, reason: 'no_whatsapp' });
    }

    const timezone = userRow?.timezone || 'America/Sao_Paulo';

    // Build context for calendar density signal
    const ctx = await buildPurchaseContext(userId, { timezone });
    const calendarCount = ctx.schedule?.available ? (ctx.schedule.events?.length ?? 0) : 0;

    // Smart filter
    const filter = isStressWorthy(amount, timezone, calendarCount);
    if (!filter.worthy) {
      log.info('Skipped — not stress-worthy', { userId, amount, reason: filter.reason });
      return res.json({ skipped: true, reason: filter.reason });
    }

    // Daily cap check (persistent)
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = state.day_date === today ? (state.daily_count ?? 0) : 0;
    if (todayCount >= MAX_DAILY) {
      log.info('Skipped — daily cap reached', { userId });
      return res.json({ skipped: true, reason: 'daily_cap' });
    }

    // Persist new state before sending (prevents duplicate on retry)
    await saveState(userId, {
      last_sent_at: new Date().toISOString(),
      day_date: today,
      daily_count: todayCount + 1,
    });

    const purchaseMsg = amount
      ? `${appName ? `[${appName}] ` : ''}${notificationText} (${rawAmount})`
      : `${appName ? `[${appName}] ` : ''}${notificationText}`;

    const refl = await generatePurchaseReflection(ctx, purchaseMsg);

    const phone = channel.channel_id.startsWith('+')
      ? channel.channel_id.slice(1)
      : channel.channel_id;

    await sendWhatsAppMessage(phone, refl.text);

    log.info('Purchase reflection sent', {
      userId, appName, amount,
      filter_reason: filter.reason,
      lang: refl.lang,
      elapsed_ms: refl.elapsed_ms,
    });

    res.json({ success: true, filter_reason: filter.reason });
  } catch (err) {
    log.error('Purchase notification trigger failed', { userId, error: err.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
