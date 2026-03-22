/**
 * Web Push API — Subscribe/Unsubscribe for Browser Push Notifications
 *
 * GET  /api/web-push/vapid-key     — public VAPID key for frontend
 * POST /api/web-push/subscribe     — save push subscription
 * POST /api/web-push/unsubscribe   — remove push subscription
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { saveSubscription, removeSubscription } from '../services/webPushService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('WebPushRoutes');
const router = express.Router();

// Public — frontend needs this to subscribe
router.get('/vapid-key', (req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json({ error: 'Web push not configured' });
  return res.json({ publicKey: key });
});

// Save subscription after user grants permission
router.post('/subscribe', authenticateUser, async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription?.endpoint) {
      return res.status(400).json({ error: 'subscription with endpoint required' });
    }

    const ok = await saveSubscription(req.user.id, subscription);
    return res.json({ success: ok });
  } catch (err) {
    log.error('Subscribe failed', { error: err.message });
    return res.status(500).json({ error: 'Subscribe failed' });
  }
});

// Remove subscription
router.post('/unsubscribe', authenticateUser, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'endpoint required' });

    await removeSubscription(req.user.id, endpoint);
    return res.json({ success: true });
  } catch (err) {
    log.error('Unsubscribe failed', { error: err.message });
    return res.status(500).json({ error: 'Unsubscribe failed' });
  }
});

export default router;
