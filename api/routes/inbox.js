/**
 * Inbox API — unified proposal stream
 * ====================================
 * One endpoint that backs the new /inbox page, merging pending and resolved
 * proposals from all departments into a single chronological feed.
 *
 * Phase 1 of the /departments → /inbox collapse: the endpoint ships first,
 * the UI ships behind a feature flag once parity is confirmed.
 */

import express from 'express';
import { authenticateUser, userRateLimit } from '../middleware/auth.js';
import { createLogger } from '../services/logger.js';

const getDepartmentService = () => import('../services/departmentService.js');

const log = createLogger('InboxRoutes');
const router = express.Router();

// Inbox is a hot read path on every /inbox visit and on push notifications.
// Cap at 60/min/user — well above any reasonable polling interval.
const inboxLimiter = userRateLimit(60, 60 * 1000);

// pending-count is polled from the sidebar on every page (every 60s via React
// Query). Allow a higher cap since the query is cheap (just a COUNT) and
// triggers from many devices/tabs of the same user.
const pendingCountLimiter = userRateLimit(180, 60 * 1000);

// ========================================================================
// GET /api/inbox — unified proposal stream (pending + resolved)
// ========================================================================
// Query params:
//   cursor — ISO timestamp from the previous response's nextCursor
//   limit  — page size 1..50 (default 20)
//
// Response:
//   { success: true, items: [...], nextCursor: ISO|null }
//
// See departmentService.getInboxStream for the item shape.
router.get('/', authenticateUser, inboxLimiter, async (req, res) => {
  try {
    const { cursor, limit } = req.query;
    const { getInboxStream } = await getDepartmentService();
    const { items, nextCursor } = await getInboxStream(req.user.id, {
      cursor: typeof cursor === 'string' && cursor.length > 0 ? cursor : null,
      limit: parseInt(limit, 10) || 20,
    });
    return res.json({ success: true, items, nextCursor });
  } catch (err) {
    log.error('Failed to fetch inbox', { userId: req.user.id, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch inbox' });
  }
});

// ========================================================================
// GET /api/inbox/pending-count — cheap COUNT for the sidebar badge
// ========================================================================
// Backs the count badge on the "Inbox" sidebar nav item. Polled every 60s
// from anywhere in the app, so we avoid the full inbox payload and just
// run a single Postgres COUNT.
//
// Response:
//   { success: true, count: <number> }
router.get('/pending-count', authenticateUser, pendingCountLimiter, async (req, res) => {
  try {
    const { getPendingCount } = await getDepartmentService();
    const count = await getPendingCount(req.user.id);
    return res.json({ success: true, count });
  } catch (err) {
    log.error('Failed to fetch inbox pending-count', { userId: req.user.id, error: err.message });
    // Match the helper: errors return 0 rather than a 500 so the badge
    // disappears instead of breaking layout.
    return res.json({ success: true, count: 0 });
  }
});

export default router;
