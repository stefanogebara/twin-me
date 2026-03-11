/**
 * Device Token Routes
 * ===================
 * POST /api/device-tokens  — register or refresh an Expo push token
 * DELETE /api/device-tokens/:token — remove a token on logout
 */

import { Router } from 'express';
import { authenticateUser as authMiddleware } from '../middleware/auth.js';
import { registerDeviceToken } from '../services/pushNotificationService.js';
import { supabaseAdmin } from '../services/database.js';

const router = Router();
router.use(authMiddleware);

// POST /api/device-tokens
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { token, platform, token_type = 'expo' } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, error: 'token required' });
    }
    if (!['android', 'ios'].includes(platform)) {
      return res.status(400).json({ success: false, error: 'platform must be android or ios' });
    }
    if (!['expo', 'fcm'].includes(token_type)) {
      return res.status(400).json({ success: false, error: 'token_type must be expo or fcm' });
    }

    await registerDeviceToken(userId, token, platform, token_type);
    res.json({ success: true });
  } catch (err) {
    console.error('[DeviceTokens] Register error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to register device token' });
  }
});

// DELETE /api/device-tokens/:token — call on logout to stop push delivery
router.delete('/:token', async (req, res) => {
  try {
    const userId = req.user.id;
    const { token } = req.params;

    await supabaseAdmin
      .from('device_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('token', token);

    res.json({ success: true });
  } catch (err) {
    console.error('[DeviceTokens] Delete error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to remove device token' });
  }
});

export default router;
