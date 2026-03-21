/**
 * Insight Feedback — Thumbs Up/Down on Proactive Insights
 * =========================================================
 * Allows users to rate proactive insights (briefings, music suggestions,
 * triggers) so the action reflection engine can learn what works.
 *
 * POST /api/insights/:id/feedback  — { rating: 1 | -1 }
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { logAgentAction } from '../services/autonomyService.js';
import { collectFromActionFeedback } from '../services/finetuning/preferenceCollector.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('InsightFeedback');
const router = express.Router();

router.post('/:id/feedback', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { rating } = req.body;
    const userId = req.user.id;

    if (rating !== 1 && rating !== -1) {
      return res.status(400).json({ error: 'rating must be 1 or -1' });
    }

    // Verify the insight belongs to this user
    const { data: insight, error: fetchError } = await supabaseAdmin
      .from('proactive_insights')
      .select('id, user_id, category, insight')
      .eq('id', id)
      .single();

    if (fetchError || !insight) {
      return res.status(404).json({ error: 'Insight not found' });
    }

    if (insight.user_id !== userId) {
      return res.status(403).json({ error: 'Not your insight' });
    }

    // Update insight engagement status
    const { error: updateError } = await supabaseAdmin
      .from('proactive_insights')
      .update({ engaged: rating === 1 })
      .eq('id', id);

    if (updateError) {
      log.error('Failed to update insight', { id, error: updateError.message });
      return res.status(500).json({ error: 'Failed to record feedback' });
    }

    // Log as agent_action for the reflection engine to analyze
    await logAgentAction(userId, {
      skillName: insight.category || 'proactive_insight',
      actionType: 'insight_delivery',
      content: (insight.insight || '').slice(0, 300),
      autonomyLevel: 1,
    }).then(async (action) => {
      if (action?.id) {
        // Immediately resolve with user feedback
        await supabaseAdmin
          .from('agent_actions')
          .update({
            user_response: rating === 1 ? 'accepted' : 'rejected',
            outcome_data: { source: 'web_feedback', insight_id: id },
            resolved_at: new Date().toISOString(),
          })
          .eq('id', action.id);
      }
    }).catch(err => {
      log.warn('Failed to log feedback action', { id, error: err.message });
    });

    // Try to create a DPO preference pair from contrasting insights
    // Look for a recent insight from the same category with opposite engagement
    const contrastEngaged = rating === 1 ? false : true;
    const { data: contrastInsight } = await supabaseAdmin
      .from('proactive_insights')
      .select('insight')
      .eq('user_id', userId)
      .eq('category', insight.category)
      .eq('engaged', contrastEngaged)
      .neq('id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (contrastInsight?.insight && insight.insight) {
      const actions = rating === 1
        ? [
            { content: insight.insight.slice(0, 500), response: 'accepted' },
            { content: contrastInsight.insight.slice(0, 500), response: 'rejected' },
          ]
        : [
            { content: contrastInsight.insight.slice(0, 500), response: 'accepted' },
            { content: insight.insight.slice(0, 500), response: 'rejected' },
          ];

      collectFromActionFeedback(userId, insight.category, actions).catch(err => {
        log.warn('DPO pair from insight feedback failed', { error: err.message });
      });
    }

    log.info('Insight feedback recorded', { userId, insightId: id, rating });
    return res.json({ success: true, rating });
  } catch (err) {
    log.error('Insight feedback error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
