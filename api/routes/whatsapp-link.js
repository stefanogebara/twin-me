/**
 * WhatsApp Link — Self-Serve Phone Number Linking
 * ================================================
 * Users submit their phone number (E.164) from Settings.
 * The backend upserts into messaging_channels and sends
 * a confirmation message via WhatsApp.
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import { sendWhatsAppMessage } from '../services/whatsappService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('WhatsAppLink');
const router = express.Router();

/**
 * Validate E.164 phone number: starts with +, 10-15 digits.
 */
function isValidE164(phone) {
  return typeof phone === 'string' && /^\+\d{10,15}$/.test(phone);
}

/**
 * POST /api/whatsapp-link/link
 * Link a WhatsApp phone number to the user's account.
 */
router.post('/link', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { phone } = req.body;

    if (!phone || !isValidE164(phone)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number. Must be E.164 format (e.g., +5511999999999).',
      });
    }

    // Upsert into messaging_channels
    const { error: dbError } = await supabaseAdmin
      .from('messaging_channels')
      .upsert(
        {
          user_id: userId,
          channel: 'whatsapp',
          channel_id: phone,
          is_enabled: true,
        },
        { onConflict: 'user_id,channel' }
      );

    if (dbError) {
      log.error('Failed to upsert messaging_channels', { userId, error: dbError.message });
      return res.status(500).json({ success: false, error: 'Failed to link WhatsApp.' });
    }

    log.info('WhatsApp linked', { userId, phone: phone.slice(-4) });

    // Send confirmation message (fire-and-forget, don't block response)
    sendWhatsAppMessage(
      phone,
      'Your TwinMe twin is now connected to this WhatsApp. Say hi!'
    ).catch(err => {
      log.warn('Failed to send confirmation WhatsApp', { userId, error: err.message });
    });

    return res.json({ success: true });
  } catch (err) {
    log.error('WhatsApp link error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

/**
 * GET /api/whatsapp-link/status
 * Check if user has WhatsApp linked.
 */
router.get('/status', authenticateUser, async (req, res) => {
  try {
    const { data } = await supabaseAdmin
      .from('messaging_channels')
      .select('channel_id, is_enabled, created_at')
      .eq('user_id', req.user.id)
      .eq('channel', 'whatsapp')
      .single();

    return res.json({
      success: true,
      linked: !!data,
      enabled: data?.is_enabled ?? false,
      phone: data?.channel_id || null,
      linkedAt: data?.created_at || null,
    });
  } catch (err) {
    log.error('WhatsApp status error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to check WhatsApp status.' });
  }
});

/**
 * DELETE /api/whatsapp-link/unlink
 * Disconnect WhatsApp.
 */
router.delete('/unlink', authenticateUser, async (req, res) => {
  try {
    await supabaseAdmin
      .from('messaging_channels')
      .delete()
      .eq('user_id', req.user.id)
      .eq('channel', 'whatsapp');

    log.info('WhatsApp unlinked', { userId: req.user.id });
    return res.json({ success: true });
  } catch (err) {
    log.error('WhatsApp unlink error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to unlink WhatsApp.' });
  }
});

export default router;
