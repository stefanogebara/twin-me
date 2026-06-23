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
import { requestChannelOtp, verifyChannelOtp } from '../services/messagingChannelOtpService.js';
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
 * POST /api/whatsapp-link/link/request
 * Step 1 of secure linking: generate a one-time code and deliver it to the
 * phone via WhatsApp. The number is NOT linked yet — receiving the code proves
 * the caller controls it. (Requires a live WhatsApp send path; dormant today.)
 */
router.post('/link/request', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { phone } = req.body;

    if (!phone || !isValidE164(phone)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number. Must be E.164 format (e.g., +5511999999999).',
      });
    }

    const otp = await requestChannelOtp({
      userId,
      channel: 'whatsapp',
      channelId: phone,
      ipAddress: req.ip,
    });

    if (!otp.success) {
      if (otp.error === 'cooldown') {
        return res.status(429).json({
          success: false,
          error: 'A code was just sent. Please wait a moment before requesting another.',
          retryAfterMs: otp.retryAfterMs,
        });
      }
      return res.status(500).json({ success: false, error: 'Could not generate a verification code.' });
    }

    // Deliver the code over the channel being verified (Kapso/Meta want no '+').
    const recipientPhone = phone.startsWith('+') ? phone.slice(1) : phone;
    const sendResult = await sendWhatsAppMessage(
      recipientPhone,
      `Your TwinMe verification code is ${otp.code}. It expires in 10 minutes. If you did not request this, ignore this message.`
    );

    if (!sendResult.success) {
      log.warn('OTP delivery failed', { userId, phone: phone.slice(-4), error: sendResult.error });
      return res.status(502).json({
        success: false,
        error: 'Could not send the verification code over WhatsApp. Make sure the number is correct and reachable.',
      });
    }

    log.info('OTP requested', { userId, phone: phone.slice(-4), provider: sendResult.provider });
    return res.json({ success: true, sent: true });
  } catch (err) {
    log.error('WhatsApp link request error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

/**
 * POST /api/whatsapp-link/link/verify
 * Step 2 of secure linking: check the submitted code; only on success is the
 * phone linked into messaging_channels (and a confirmation sent).
 */
router.post('/link/verify', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { phone, code } = req.body;

    if (!phone || !isValidE164(phone)) {
      return res.status(400).json({ success: false, error: 'Invalid phone number.' });
    }
    if (!code || !/^\d{6}$/.test(String(code))) {
      return res.status(400).json({ success: false, error: 'Enter the 6-digit code sent to your WhatsApp.' });
    }

    const result = await verifyChannelOtp({
      userId,
      channel: 'whatsapp',
      channelId: phone,
      code: String(code),
    });

    if (!result.success) {
      const messages = {
        not_found: 'No pending verification for this number. Request a new code.',
        expired: 'That code expired. Request a new one.',
        too_many_attempts: 'Too many incorrect attempts. Request a new code.',
        invalid: 'Incorrect code. Please try again.',
        missing_params: 'Missing code.',
        storage_failed: 'Verification failed. Please try again.',
      };
      const status = result.reason === 'too_many_attempts' ? 429 : 400;
      return res.status(status).json({
        success: false,
        error: messages[result.reason] || 'Verification failed.',
        attemptsRemaining: result.attemptsRemaining,
      });
    }

    // Ownership proven — now link the channel.
    const { error: dbError } = await supabaseAdmin
      .from('messaging_channels')
      .upsert(
        { user_id: userId, channel: 'whatsapp', channel_id: phone, is_enabled: true },
        { onConflict: 'user_id,channel' }
      );

    if (dbError) {
      log.error('Failed to upsert messaging_channels after verify', { userId, error: dbError.message });
      return res.status(500).json({ success: false, error: 'Failed to link WhatsApp.' });
    }

    // Confirmation (best-effort — never block linking on the send).
    const recipientPhone = phone.startsWith('+') ? phone.slice(1) : phone;
    try {
      const sendResult = await sendWhatsAppMessage(
        recipientPhone,
        'Your TwinMe twin is now connected to this WhatsApp. Say hi!'
      );
      if (!sendResult.success) {
        log.warn('Confirmation send returned failure', { userId, error: sendResult.error });
      }
    } catch (err) {
      log.error('Failed to send confirmation WhatsApp', { userId, error: err.message });
    }

    log.info('WhatsApp linked (verified)', { userId, phone: phone.slice(-4) });
    return res.json({ success: true, linked: true });
  } catch (err) {
    log.error('WhatsApp link verify error', { error: err.message });
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
