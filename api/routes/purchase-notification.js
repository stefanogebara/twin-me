/**
 * POST /api/purchase-notification/trigger
 *
 * Called by the TwinMe mobile app when a delivery/commerce app notification
 * fires (iFood, Rappi, Uber Eats, etc.). Builds behavioral context from the
 * user's Spotify + Calendar data, generates a reflection, and sends it to the
 * user's linked WhatsApp number.
 *
 * Phase: Financial-Emotional Twin (2026-04-24)
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

// One reflection per user per 5 minutes — prevents spam if multiple purchase
// notifications arrive in quick succession (e.g., confirmation + receipt).
const cooldowns = new Map(); // userId → timestamp

router.post('/trigger', authenticateUser, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  // Cooldown check — fast path before any DB or LLM calls
  const lastFired = cooldowns.get(userId) ?? 0;
  if (Date.now() - lastFired < 5 * 60 * 1000) {
    return res.json({ skipped: true, reason: 'cooldown' });
  }

  const { appName, notificationText, amount } = req.body;
  if (!notificationText) return res.status(400).json({ error: 'notificationText required' });

  // Compose a natural-language message that mirrors what the user would type
  const purchaseMsg = amount
    ? `${appName ? `[${appName}] ` : ''}${notificationText} (${amount})`
    : `${appName ? `[${appName}] ` : ''}${notificationText}`;

  try {
    // Look up the user's linked WhatsApp number
    const { data: channel } = await supabaseAdmin
      .from('messaging_channels')
      .select('channel_id')
      .eq('user_id', userId)
      .eq('channel', 'whatsapp')
      .maybeSingle();

    if (!channel?.channel_id) {
      log.warn('No WhatsApp linked', { userId });
      return res.json({ skipped: true, reason: 'no_whatsapp' });
    }

    const phone = channel.channel_id.startsWith('+')
      ? channel.channel_id.slice(1)
      : channel.channel_id;

    cooldowns.set(userId, Date.now());

    // Build context + generate reflection in parallel where possible
    const ctx = await buildPurchaseContext(userId);
    const refl = await generatePurchaseReflection(ctx, purchaseMsg);

    await sendWhatsAppMessage(phone, refl.text);

    log.info('Purchase reflection sent via WhatsApp', {
      userId,
      appName,
      amount,
      lang: refl.lang,
      elapsed_ms: refl.elapsed_ms,
    });

    res.json({ success: true });
  } catch (err) {
    log.error('Purchase notification trigger failed', { userId, error: err.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
