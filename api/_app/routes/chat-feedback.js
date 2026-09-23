/**
 * Chat Feedback Route
 * ===================
 * POST /api/chat/feedback — Record thumbs up/down on a twin chat message.
 *
 * Extracted from the deleted routes/finetuning.js (replan-2026-06-10 cycle 4,
 * DPO/fine-tuning stack removal). Feedback still lands in
 * `chat_message_feedback` for analytics and the action reflection engine;
 * the old auto-creation of DPO preference pairs on thumbs-down is gone.
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('ChatFeedback');
const router = express.Router();

router.post('/feedback', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId, conversationId, rating, messageContent, userMessage, modelVersion } = req.body;

    // Validate required fields
    if (rating !== 1 && rating !== -1) {
      return res.status(400).json({ success: false, error: 'Rating must be 1 or -1' });
    }
    if (!messageContent || typeof messageContent !== 'string') {
      return res.status(400).json({ success: false, error: 'messageContent is required' });
    }

    // Insert feedback
    const { data: feedback, error: feedbackError } = await supabaseAdmin
      .from('chat_message_feedback')
      .insert({
        user_id: userId,
        message_id: messageId || null,
        conversation_id: conversationId || null,
        rating,
        message_content: messageContent.slice(0, 10000),
        user_message: userMessage ? userMessage.slice(0, 5000) : null,
        model_version: modelVersion || 'unknown',
      })
      .select('id')
      .single();

    if (feedbackError) {
      log.error('Failed to insert chat feedback', { error: feedbackError.message });
      return res.status(500).json({ success: false, error: 'Failed to save feedback' });
    }

    log.info('Chat feedback recorded', {
      feedbackId: feedback.id,
      rating,
      userId: userId.slice(0, 8),
    });

    return res.json({
      success: true,
      feedbackId: feedback.id,
    });
  } catch (error) {
    log.error('Feedback error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to record feedback' });
  }
});

export default router;
