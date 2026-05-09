/**
 * Beta Feedback Route — authenticated, NOT admin.
 *
 * Mounted at /api/beta. Any signed-in user can submit their own feedback.
 *
 * audit-2026-05-08 Security MED-3: split out from `beta-admin.js` so the file
 * name no longer suggests admin protection. Future devs adding admin routes to
 * `beta-admin.js` cannot accidentally drop a sensitive endpoint into the
 * non-admin router by proximity. The admin counterpart is `beta-admin.js`.
 *
 * POST /api/beta/feedback — submit user feedback (auth required)
 */

import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('BetaFeedback');
const router = Router();

router.post('/feedback', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { category, message, pageUrl } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'Message is required (min 3 chars)' });
    }

    const validCategories = ['bug', 'feature', 'general', 'ux'];
    const safeCategory = validCategories.includes(category) ? category : 'general';

    const { error } = await supabaseAdmin
      .from('beta_feedback')
      .insert({
        user_id: userId,
        category: safeCategory,
        message: message.trim().slice(0, 2000),
        page_url: pageUrl?.slice(0, 500) || null,
      });

    if (error) {
      log.error('Failed to save feedback', { error });
      return res.status(500).json({ success: false, error: 'Failed to save feedback' });
    }

    res.json({ success: true, message: 'Thank you for your feedback!' });
  } catch (error) {
    log.error('Feedback error', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to submit feedback' });
  }
});

export default router;
