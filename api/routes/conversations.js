import express from 'express';
import { body, validationResult } from 'express-validator';
import { serverDb, supabaseAdmin } from '../services/database.js';
import { authenticateUser, userRateLimit } from '../middleware/auth.js';
import { getConversationStats, getUserWritingProfile } from '../services/conversationLearning.js';

const router = express.Router();

// Input validation middleware
const validateConversationRequest = [
  body('twin_id')
    .isUUID()
    .withMessage('Invalid twin ID format'),
  body('title')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Title must not exceed 200 characters'),
];

const validateMessageRequest = [
  body('conversation_id')
    .isUUID()
    .withMessage('Invalid conversation ID format'),
  body('content')
    .trim()
    .isLength({ min: 1, max: 5000 })
    .withMessage('Message content must be between 1 and 5000 characters'),
  body('is_user_message')
    .isBoolean()
    .withMessage('is_user_message must be a boolean'),
  body('message_type')
    .optional()
    .isIn(['text', 'voice', 'image'])
    .withMessage('message_type must be text, voice, or image'),
  body('audio_url')
    .optional()
    .isURL()
    .withMessage('audio_url must be a valid URL'),
  body('metadata')
    .optional()
    .isObject()
    .withMessage('metadata must be an object'),
];

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// GET /api/conversations - Get all conversations for the authenticated user
router.get('/', authenticateUser, userRateLimit(100, 15 * 60 * 1000), async (req, res) => {
  try {
    const userId = req.user.id;
    const { data: conversations, error } = await serverDb.getConversationsByStudent(userId);

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch conversations',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }

    res.json({
      success: true,
      conversations,
      count: conversations.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch conversations',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET /api/conversations/stats/:userId - Get conversation sync stats (must be before /:id)
router.get('/stats/:userId', authenticateUser, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID required' });
    }

    if (userId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden', message: 'Access denied' });
    }

    const stats = await getConversationStats(userId);
    const writingProfile = await getUserWritingProfile(userId);

    const claudeDesktopConversations = (stats.bySource?.claude_desktop_import || 0) +
      (stats.bySource?.claude_desktop || 0);

    const { data: lastLog } = await supabaseAdmin
      .from('mcp_conversation_logs')
      .select('created_at')
      .eq('user_id', userId)
      .in('mcp_client', ['claude_desktop_import', 'claude_desktop'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    res.json({
      success: true,
      totalConversations: stats.totalConversations,
      claudeDesktopConversations,
      bySource: stats.bySource,
      topTopics: stats.topTopics,
      topIntents: stats.topIntents,
      writingProfile,
      lastSyncAt: lastLog?.created_at || null
    });

  } catch (error) {
    console.error('Error fetching conversation stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch conversation stats',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET /api/conversations/:id - Get a specific conversation
router.get('/:id', authenticateUser, userRateLimit(200, 15 * 60 * 1000), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { data: conversation, error } = await serverDb.getConversation(id);

    if (error) {
      return res.status(500).json({
        error: 'Failed to fetch conversation',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }

    if (!conversation) {
      return res.status(404).json({
        error: 'Conversation not found'
      });
    }

    // IDOR guard: only the conversation owner may read it
    if (conversation.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      conversation,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({
      error: 'Failed to fetch conversation',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// POST /api/conversations - Create a new conversation
router.post('/', authenticateUser, userRateLimit(50, 15 * 60 * 1000), validateConversationRequest, handleValidationErrors, async (req, res) => {
  try {
    const userId = req.user.id;
    const { twin_id, title } = req.body;

    // Verify twin exists and is accessible
    const { data: twin, error: twinError } = await serverDb.getDigitalTwin(twin_id);

    if (twinError) {
      return res.status(500).json({
        error: 'Failed to verify twin access',
        message: process.env.NODE_ENV === 'development' ? twinError.message : 'Internal server error'
      });
    }

    if (!twin) {
      return res.status(404).json({
        error: 'Digital twin not found'
      });
    }

    // Check if user can access this twin (own twin or active professor twin)
    if (twin.creator_id !== userId && !(twin.is_active && twin.twin_type === 'professor')) {
      return res.status(403).json({
        error: 'Access denied to this digital twin'
      });
    }

    const conversationData = {
      user_id: userId,
      twin_id: twin_id,
      title: title || `Chat with ${twin.name}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: conversation, error } = await serverDb.createConversation(conversationData);

    if (error) {
      return res.status(500).json({
        error: 'Failed to create conversation',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }

    res.status(201).json({
      conversation,
      message: 'Conversation created successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({
      error: 'Failed to create conversation',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// DELETE /api/conversations/:id - Delete a conversation
router.delete('/:id', authenticateUser, userRateLimit(20, 15 * 60 * 1000), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // IDOR guard: verify ownership before deleting
    const { data: conversation, error: fetchError } = await serverDb.getConversation(id);
    if (fetchError) {
      return res.status(500).json({ error: 'Failed to verify conversation ownership' });
    }
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    if (conversation.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete conversation (this will cascade delete messages due to foreign key constraint)
    const { success, error } = await serverDb.deleteConversation(id);

    if (error) {
      return res.status(500).json({
        error: 'Failed to delete conversation',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }

    res.json({
      message: 'Conversation deleted successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({
      error: 'Failed to delete conversation',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET /api/conversations/:id/messages - Get messages for a conversation
router.get('/:id/messages', authenticateUser, userRateLimit(200, 15 * 60 * 1000), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);

    // IDOR guard: verify conversation ownership before fetching messages
    const { data: conversation, error: fetchError } = await serverDb.getConversation(id);
    if (fetchError) {
      return res.status(500).json({ error: 'Failed to verify conversation ownership' });
    }
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    if (conversation.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data: messages, error } = await serverDb.getMessagesByConversation(id, limit);

    if (error) {
      return res.status(500).json({
        error: 'Failed to fetch messages',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }

    res.json({
      messages,
      count: messages.length,
      conversationId: id,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      error: 'Failed to fetch messages',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// POST /api/conversations/:id/messages - Add a message to a conversation
router.post('/:id/messages', authenticateUser, userRateLimit(100, 15 * 60 * 1000), validateMessageRequest, handleValidationErrors, async (req, res) => {
  try {
    const conversationId = req.params.id;
    const {
      content,
      is_user_message,
      message_type = 'text',
      audio_url,
      metadata = {}
    } = req.body;

    const messageData = {
      conversation_id: conversationId,
      content,
      is_user_message,
      message_type,
      audio_url: audio_url || null,
      metadata,
      created_at: new Date().toISOString()
    };

    const { data: message, error } = await serverDb.createMessage(messageData);

    if (error) {
      return res.status(500).json({
        error: 'Failed to create message',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }

    // Update conversation's last message time
    const { error: updateConvoErr } = await serverDb.updateConversationLastMessage(conversationId);
    if (updateConvoErr) console.error('[Conversations] Failed to update last message time:', updateConvoErr.message);

    res.status(201).json({
      message,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error creating message:', error);
    res.status(500).json({
      error: 'Failed to create message',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});


export default router;