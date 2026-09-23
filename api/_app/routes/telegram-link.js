/**
 * Telegram Link — Generate One-Time Codes for Account Linking
 * ==============================================================
 * Frontend calls this to get a 6-digit code. User sends the code
 * to the TwinMe bot on Telegram. Bot verifies and links accounts.
 */

import express from 'express';
import crypto from 'crypto';
import { authenticateUser } from '../middleware/auth.js';
import { getRedisClient, isRedisAvailable } from '../services/redisClient.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('TelegramLink');
const router = express.Router();

const CODE_TTL_SECONDS = 300; // 5 minutes

/**
 * POST /api/telegram/generate-code
 * Generate a 6-char alphanumeric link code.
 */
router.post('/generate-code', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const code = crypto.randomBytes(3).toString('hex').toUpperCase(); // e.g., "A3F1B2"

    const redis = isRedisAvailable() ? getRedisClient() : null;

    if (redis) {
      await redis.setex(`telegram_link:${code}`, CODE_TTL_SECONDS, userId);
    } else {
      // Fallback: store in agent_events (telegram-webhook.js reads this)
      await supabaseAdmin.from('agent_events').insert({
        user_id: userId,
        event_type: 'telegram_link_code',
        event_data: { code },
        source: 'telegram_link',
      });
    }

    log.info('Telegram link code generated', { userId, code });

    return res.json({
      success: true,
      code,
      expiresIn: CODE_TTL_SECONDS,
      botUsername: process.env.TELEGRAM_BOT_USERNAME || 'TwinMeBot',
    });
  } catch (err) {
    log.error('Failed to generate link code', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to generate code' });
  }
});

/**
 * GET /api/telegram/status
 * Check if user has Telegram linked.
 */
router.get('/status', authenticateUser, async (req, res) => {
  const { data } = await supabaseAdmin
    .from('messaging_channels')
    .select('channel_id, is_enabled, created_at')
    .eq('user_id', req.user.id)
    .eq('channel', 'telegram')
    .single();

  return res.json({
    success: true,
    linked: !!data,
    enabled: data?.is_enabled ?? false,
    linkedAt: data?.created_at || null,
  });
});

/**
 * DELETE /api/telegram/unlink
 * Disconnect Telegram.
 */
router.delete('/unlink', authenticateUser, async (req, res) => {
  await supabaseAdmin
    .from('messaging_channels')
    .delete()
    .eq('user_id', req.user.id)
    .eq('channel', 'telegram');

  log.info('Telegram unlinked', { userId: req.user.id });
  return res.json({ success: true });
});

export default router;
