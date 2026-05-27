/**
 * Twin Directives API
 * =====================
 * User-facing CRUD for the directives learned by the self-improving twin
 * (pi-reflect pattern). The cron job WRITES directives; this surface lets
 * the user READ, EDIT, PAUSE, or DELETE them.
 *
 * Endpoints:
 *   GET    /api/twin-directives                    — list active+paused directives, grouped by category
 *   GET    /api/twin-directives/correction-rate    — dashboard metric (?days=30)
 *   PATCH  /api/twin-directives/:id                — edit content / pause / resume (sets user_edited=true)
 *   DELETE /api/twin-directives/:id                — soft-delete (status='deleted')
 *
 * All endpoints require JWT auth. Service uses public.users.id (not auth.users.id)
 * per CLAUDE.md convention.
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import { getCorrectionRate } from '../services/twinSelfImprovement.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('TwinDirectives');

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_CATEGORIES = new Set(['preference', 'fact', 'tone', 'topic-avoid', 'topic-prefer']);
const VALID_STATUSES_FOR_UPDATE = new Set(['active', 'paused']);
const MAX_CONTENT_CHARS = 2000;

// ====================================================================
// GET / — list directives
// ====================================================================
/**
 * Returns directives the user still owns (active + paused, not deleted),
 * ordered by reinforcement_count DESC. Optional ?status filter.
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    let query = supabaseAdmin
      .from('twin_directives')
      .select('id, content, category, reinforcement_count, last_reinforced_at, user_edited, status, source_conversation_id, created_at, updated_at')
      .eq('user_id', userId)
      .order('reinforcement_count', { ascending: false })
      .order('last_reinforced_at', { ascending: false });

    if (status && VALID_STATUSES_FOR_UPDATE.has(status)) {
      query = query.eq('status', status);
    } else {
      // Hide deleted rows by default; surface both active and paused.
      query = query.neq('status', 'deleted');
    }

    const { data, error } = await query;
    if (error) {
      log.error('List query failed', { error: error.message });
      return res.status(500).json({ success: false, error: 'Failed to fetch directives' });
    }

    res.json({ success: true, directives: data || [], data: data || [] });
  } catch (err) {
    log.error('List error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to fetch directives' });
  }
});

// ====================================================================
// GET /correction-rate — dashboard metric
// ====================================================================
router.get('/correction-rate', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const daysRaw = parseInt(req.query.days, 10);
    const days = Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 365 ? daysRaw : 30;

    const metrics = await getCorrectionRate(userId, days);
    res.json({ success: true, days, data: metrics });
  } catch (err) {
    log.error('Correction rate error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to fetch correction rate' });
  }
});

// ====================================================================
// PATCH /:id — edit content or toggle pause
// ====================================================================
/**
 * Body: { content?: string, category?: string, status?: 'active'|'paused' }
 *
 * Any PATCH that changes content/category sets user_edited=true, which
 * the merge step in twinSelfImprovement respects — manual edits are never
 * auto-overwritten by the extraction loop.
 */
router.patch('/:id', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!id || !UUID_RE.test(id)) {
      return res.status(400).json({ success: false, error: 'Invalid directive ID' });
    }

    const updates = {};
    let changedContent = false;

    if (typeof req.body.content === 'string') {
      const trimmed = req.body.content.trim();
      if (trimmed.length === 0 || trimmed.length > MAX_CONTENT_CHARS) {
        return res.status(400).json({ success: false, error: `content must be 1-${MAX_CONTENT_CHARS} characters` });
      }
      updates.content = trimmed;
      changedContent = true;
    }

    if (typeof req.body.category === 'string') {
      const cat = req.body.category.trim().toLowerCase();
      if (!VALID_CATEGORIES.has(cat)) {
        return res.status(400).json({ success: false, error: 'Invalid category' });
      }
      updates.category = cat;
      changedContent = true;
    }

    if (typeof req.body.status === 'string') {
      if (!VALID_STATUSES_FOR_UPDATE.has(req.body.status)) {
        return res.status(400).json({ success: false, error: 'Status must be active or paused' });
      }
      updates.status = req.body.status;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    if (changedContent) {
      updates.user_edited = true;
    }
    updates.updated_at = new Date().toISOString();

    // Scope by user_id so a user can never edit someone else's directive
    // even if they guess a UUID — defense-in-depth alongside RLS.
    const { data, error } = await supabaseAdmin
      .from('twin_directives')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .neq('status', 'deleted')
      .select('id, content, category, reinforcement_count, last_reinforced_at, user_edited, status, updated_at')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ success: false, error: 'Directive not found' });
      }
      log.error('Update failed', { error: error.message });
      return res.status(500).json({ success: false, error: 'Failed to update directive' });
    }

    res.json({ success: true, data });
  } catch (err) {
    log.error('Update error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to update directive' });
  }
});

// ====================================================================
// DELETE /:id — soft-delete
// ====================================================================
/**
 * Soft-delete: sets status='deleted'. Row remains for audit traceability
 * (so twin_corrections.resulting_directive_id never dangles). The active
 * directives query and the prompt-injection hot path both filter it out.
 */
router.delete('/:id', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!id || !UUID_RE.test(id)) {
      return res.status(400).json({ success: false, error: 'Invalid directive ID' });
    }

    const { data, error } = await supabaseAdmin
      .from('twin_directives')
      .update({ status: 'deleted', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .neq('status', 'deleted')
      .select('id')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ success: false, error: 'Directive not found' });
      }
      log.error('Delete failed', { error: error.message });
      return res.status(500).json({ success: false, error: 'Failed to delete directive' });
    }

    res.json({ success: true, data });
  } catch (err) {
    log.error('Delete error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to delete directive' });
  }
});

export default router;
