/**
 * /api/actions — the M1 action inbox.
 *
 *   GET  /api/actions            → the user's pending twin actions (the inbox)
 *   POST /api/actions/:id/send   → approve & mark sent
 *   POST /api/actions/:id/edit   → send an edited version { finalText }
 *   POST /api/actions/:id/reject → reject with a reason  { reason }
 *
 * Auth-gated; every action is scoped to the authenticated user in the service
 * layer (ownership + pending-only). The twin never resolves an action on its
 * own — these endpoints ARE the human approval gate.
 *
 * WIRE (one line, verify against server.js): register with
 *   app.use('/api/actions', actionsRouter)
 * alongside the other authenticated routers.
 */
import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { listPendingActions, resolveAction } from '../services/twinActionsService.js';
import { learnFromResolution } from '../services/voiceReplyLearning.js';

const router = express.Router();
router.use(authenticateUser);

// GET /api/actions?status=pending → the inbox
router.get('/', async (req, res) => {
  const userId = req.user?.id;
  const actions = await listPendingActions(userId);
  return res.json({ success: true, data: actions, meta: { total: actions.length } });
});

const STATUS_FOR_ERROR = {
  missing_input: 400,
  invalid_decision: 400,
  missing_final_text: 400,
  not_found: 404,
};

async function resolve(decision, req, res) {
  const r = await resolveAction({
    userId: req.user?.id,
    actionId: req.params.id,
    decision,
    finalText: req.body?.finalText,
    reason: req.body?.reason,
  });

  if (!r.ok) {
    return res.status(STATUS_FOR_ERROR[r.error] || 500).json({ success: false, error: r.error });
  }

  // Edit/reject teaches the twin. Fire-and-forget so learning never blocks the
  // user's approval, and a learning failure can't fail the request.
  if (decision === 'edit' || decision === 'reject') {
    learnFromResolution({ userId: req.user?.id, action: r.action })
      .catch(() => { /* best-effort; learnFromResolution logs its own failures */ });
  }

  // TODO(M1 · instrumentation): emit PostHog action_approved/edited/rejected here.
  return res.json({ success: true, data: r.action });
}

router.post('/:id/send', (req, res) => resolve('send', req, res));
router.post('/:id/edit', (req, res) => resolve('edit', req, res));
router.post('/:id/reject', (req, res) => resolve('reject', req, res));

export default router;
