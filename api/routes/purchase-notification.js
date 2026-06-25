/**
 * POST /api/purchase-notification/trigger
 *
 * Called by the mobile app when a delivery/commerce notification fires.
 * Applies smart filtering before generating a reflection — only stress-worthy
 * purchases get a message (late night, weekend, big spend, high calendar load).
 */
import crypto from 'crypto';
import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { buildPurchaseContext } from '../services/purchaseContextBuilder.js';
import { generatePurchaseReflection } from '../services/purchaseReflection.js';
import { sendWhatsAppMessage } from '../services/whatsappService.js';
import { supabaseAdmin } from '../services/database.js';
// Cooldown state shared with the WhatsApp capture path (one reflection budget
// across both sources — replan-2026-06-12). See api/services/purchaseCooldown.js.
import { loadPurchaseCooldown, savePurchaseCooldown, COOLDOWN_MS, MAX_DAILY } from '../services/purchaseCooldown.js';
import { normalizeMerchant } from '../services/transactions/merchantNormalizer.js';
import { tagTransactionsBatch } from '../services/transactions/transactionEmotionTagger.js';
import { findLikelyDuplicate } from '../services/transactions/whatsappTransactionCapture.js';
import { createLogger } from '../services/logger.js';

const router = Router();
const log = createLogger('PurchaseNotification');

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

/**
 * Persist a notification-detected purchase into user_transactions
 * (source='notification'). Best-effort: parse failures and DB errors are
 * logged but never block the reflection flow. Dedup is two-layer — the
 * cross-source ±2h heuristic (same purchase forwarded on WhatsApp) plus the
 * per-day content-hash external_id (same app re-notifying).
 */
async function persistNotificationPurchase(userId, { appName, notificationText, amount }) {
  try {
    if (amount === null || amount < 0.01 || amount > 1_000_000) return; // no usable amount — nothing to store

    const dup = await findLikelyDuplicate(userId, {
      amount: -amount,
      dateIso: new Date().toISOString(),
      excludeSource: 'notification',
    });
    if (dup) {
      log.info('notification purchase matches existing transaction — skipping insert', { userId, dupId: dup.id, dupSource: dup.source });
      return;
    }

    const { brand, category } = normalizeMerchant(appName || notificationText);
    const day = new Date().toISOString().slice(0, 10);
    const external_id = `notif:${crypto.createHash('sha256')
      .update(`${userId}|${amount.toFixed(2)}|${(appName || '').toLowerCase()}|${day}`)
      .digest('hex').slice(0, 40)}`;

    const { data, error } = await supabaseAdmin
      .from('user_transactions')
      .upsert([{
        user_id: userId,
        external_id,
        amount: -amount,
        currency: 'BRL',
        merchant_raw: `${appName || 'app'}: ${String(notificationText).slice(0, 200)}`,
        merchant_normalized: brand,
        category,
        transaction_date: new Date().toISOString(),
        source: 'notification',
        account_type: 'credit_card',
      }], { onConflict: 'user_id,external_id', ignoreDuplicates: false })
      .select('id');

    if (error) {
      log.warn('notification purchase insert failed (non-fatal)', { userId, error: error.message });
      return;
    }
    if (data?.[0]?.id) {
      await tagTransactionsBatch(userId, [data[0].id]).catch((err) =>
        log.warn(`emotion tagger failed (non-fatal): ${err.message}`));
    }
  } catch (err) {
    log.warn('persistNotificationPurchase crashed (non-fatal)', { userId, error: err.message });
  }
}

router.post('/trigger', authenticateUser, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { appName, notificationText, amount: rawAmount } = req.body;
  if (!notificationText) return res.status(400).json({ error: 'notificationText required' });

  const amount = parseAmount(rawAmount);

  try {
    // Persist the purchase as a transaction BEFORE any messaging gates
    // (replan-2026-06-12): storage is unconditional, only the reflection is
    // cooldown/cap-gated. Awaited — Vercel kills post-response work.
    await persistNotificationPurchase(userId, { appName, notificationText, amount });

    // Load persistent state first (cooldown + daily cap)
    const state = await loadPurchaseCooldown(userId);

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
    await savePurchaseCooldown(userId, {
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
