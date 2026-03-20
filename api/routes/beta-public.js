/**
 * Beta Public Routes (no auth required)
 * - POST /validate — check if invite code is valid
 * - POST /waitlist — join the beta waitlist
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validateInviteCode, addToWaitlist } from '../services/betaInviteService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('BetaPublic');
const router = Router();

const waitlistLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Too many requests. Please try again later.' },
});

// POST /api/beta/validate — check code validity (no auth)
router.post('/validate', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, valid: false, error: 'Code is required' });
    }
    const result = await validateInviteCode(code);
    res.json({ success: true, valid: result.valid, error: result.error || null });
  } catch (error) {
    log.error('Validate error', { error: error.message });
    res.status(500).json({ success: false, error: 'Validation failed' });
  }
});

// POST /api/beta/waitlist — join waitlist (rate-limited, no auth)
router.post('/waitlist', waitlistLimiter, async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ success: false, error: 'Valid email is required' });
    }

    await addToWaitlist(email, name, 'waitlist_page');
    res.json({ success: true, message: "You're on the list. We'll reach out soon." });
  } catch (error) {
    log.error('Waitlist error', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to join waitlist' });
  }
});

export default router;
