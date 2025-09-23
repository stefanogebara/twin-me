import express from 'express';
import { body, validationResult } from 'express-validator';
import { serverDb } from '../services/database.js';
import { authenticateUser, userRateLimit } from '../middleware/auth.js';

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
        error: 'Failed to fetch conversations',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }

    res.json({
      conversations,
      count: conversations.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({
      error: 'Failed to fetch conversations',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET /api/conversations/:id - Get a specific conversation
router.get('/:id', authenticateUser, userRateLimit(200, 15 * 60 * 1000), async (req, res) => {
  try {
    const { id } = req.params;
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
      student_id: userId,
      twin_id: twin_id,
      title: title || `Chat with ${twin.name}`,
      started_at: new Date().toISOString(),
      last_message_at: new Date().toISOString()
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
    const limit = parseInt(req.query.limit) || 50;

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
    await serverDb.updateConversationLastMessage(conversationId);

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