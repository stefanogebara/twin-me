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

// Per-user cooldown: 5 min between triggers regardless of filtering outcome
const cooldowns = new Map();

// Per-user daily cap: max 2 reflections per calendar day
const dailyCounts = new Map(); // `${userId}_${YYYY-MM-DD}` → count
const MAX_DAILY = 2;

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

function checkDailyCap(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${userId}_${today}`;
  const count = dailyCounts.get(key) ?? 0;
  if (count >= MAX_DAILY) return true;
  dailyCounts.set(key, count + 1);
  return false;
}

router.post('/trigger', authenticateUser, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  // 5-min cooldown — fast path before any DB calls
  const lastFired = cooldowns.get(userId) ?? 0;
  if (Date.now() - lastFired < 5 * 60 * 1000) {
    return res.json({ skipped: true, reason: 'cooldown' });
  }

  const { appName, notificationText, amount: rawAmount } = req.body;
  if (!notificationText) return res.status(400).json({ error: 'notificationText required' });

  const amount = parseAmount(rawAmount);

  try {
    // Fetch timezone + WhatsApp in one query (cheap, no LLM yet)
    const [{ data: userRow }, { data: channel }] = await Promise.all([
      supabaseAdmin.from('users').select('timezone').eq('id', userId).maybeSingle(),
      supabaseAdmin.from('messaging_channels').select('channel_id')
        .eq('user_id', userId).eq('channel', 'whatsapp').maybeSingle(),
    ]);

    if (!channel?.channel_id) {
      return res.json({ skipped: true, reason: 'no_whatsapp' });
    }

    const timezone = userRow?.timezone || 'America/Sao_Paulo';

    // Build context for calendar density signal (parallel fetch anyway)
    const ctx = await buildPurchaseContext(userId, { timezone });
    const calendarCount = ctx.schedule?.available ? (ctx.schedule.events?.length ?? 0) : 0;

    // Smart filter — check AFTER context so we have calendar density
    const filter = isStressWorthy(amount, timezone, calendarCount);
    if (!filter.worthy) {
      log.info('Skipped — not stress-worthy', { userId, amount, reason: filter.reason });
      return res.json({ skipped: true, reason: filter.reason });
    }

    // Daily cap
    if (checkDailyCap(userId)) {
      log.info('Skipped — daily cap reached', { userId });
      return res.json({ skipped: true, reason: 'daily_cap' });
    }

    cooldowns.set(userId, Date.now());

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
