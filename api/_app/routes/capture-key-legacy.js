/**
 * POST /api/api-keys, kept for the Android builds already installed (2026-09-26). The twin's key
 * routes left with it (M2-B), but a sideloaded build cannot be updated from here, and it still
 * makes its capture key at this address and reads `key` from the top of the answer. So this
 * answers POST only, in the old route's shape, from the same service as the product's own
 * POST /api/money/capture-key. Nothing else is served here: no list, no revoke.
 */
import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as S from './moneySchemas.js';
import { createCaptureKey } from '../services/money/store.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CaptureKeyLegacy');
const router = Router();

router.post('/', authenticateUser, validate({ body: S.CAPTURE_KEY }), async (req, res) => {
  try {
    const { key, id, name, created_at } = await createCaptureKey(req.user.id, req.body.name);
    res.json({ success: true, key, id, name, created_at, warning: 'Copy this key now. It will not be shown again.' });
  } catch (error) {
    log.error('legacy capture key failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to create API key' });
  }
});

export default router;
