import express from 'express';
import { body, validationResult } from 'express-validator';
import { serverDb, supabaseAdmin } from '../services/database.js';
import { authenticateUser, requireProfessor, userRateLimit } from '../middleware/auth.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Input validation middleware
const validateTwinRequest = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters')
    .escape(),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must not exceed 1000 characters'),
  body('subject_area')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Subject area must not exceed 200 characters'),
  body('twin_type')
    .isIn(['professor', 'personal'])
    .withMessage('Twin type must be either "professor" or "personal"'),
  body('personality_traits')
    .optional()
    .isObject()
    .withMessage('Personality traits must be an object'),
  body('teaching_style')
    .optional()
    .isObject()
    .withMessage('Teaching style must be an object'),
  body('common_phrases')
    .optional()
    .isArray()
    .withMessage('Common phrases must be an array'),
  body('favorite_analogies')
    .optional()
    .isArray()
    .withMessage('Favorite analogies must be an array'),
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

// GET /api/twins - Get all twins for the authenticated user
router.get('/', authenticateUser, userRateLimit(100, 15 * 60 * 1000), async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: twins, error } = await serverDb.getDigitalTwinsByCreator(userId);

    if (error) {
      return res.status(500).json({
        error: 'Failed to fetch digital twins',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }

    res.json({
      twins,
      count: twins.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching twins:', error);
    res.status(500).json({
      error: 'Failed to fetch digital twins',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET /api/twins/:id - Get a specific twin by ID
router.get('/:id', authenticateUser, userRateLimit(200, 15 * 60 * 1000), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // UUID validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        error: 'Invalid twin ID format'
      });
    }

    const { data: twin, error } = await serverDb.getDigitalTwin(id);

    if (error) {
      return res.status(500).json({
        error: 'Failed to fetch digital twin',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }

    if (!twin) {
      return res.status(404).json({
        error: 'Digital twin not found'
      });
    }

    // Check if user owns this twin or if it's an active professor twin
    if (twin.creator_id !== userId && !(twin.is_active && twin.twin_type === 'professor')) {
      return res.status(403).json({
        error: 'Access denied to this digital twin'
      });
    }

    res.json({
      twin,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching twin:', error);
    res.status(500).json({
      error: 'Failed to fetch digital twin',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// POST /api/twins - Create a new digital twin
router.post('/', authenticateUser, userRateLimit(20, 15 * 60 * 1000), validateTwinRequest, handleValidationErrors, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('✅ Twin creation request:', {
      userId,
      userName: req.user.email,
      body: req.body
    });

    const {
      name,
      description,
      subject_area,
      twin_type,
      personality_traits = {},
      teaching_style = {},
      common_phrases = [],
      favorite_analogies = []
    } = req.body;

    // Check if user can create professor twins (require professor role)
    if (twin_type === 'professor' && req.user.role !== 'professor') {
      return res.status(403).json({
        error: 'Only professors can create professor-type digital twins'
      });
    }

    const twinData = {
      user_id: userId,     // User who owns this twin (required NOT NULL field)
      creator_id: userId,  // User who created this twin
      name,
      description: description || null,
      subject_area: subject_area || null,
      twin_type,
      is_active: false, // New twins start inactive
      personality_traits,
      teaching_style,
      common_phrases,
      favorite_analogies,
      knowledge_base_status: 'empty'
    };

    const { data: twin, error } = await serverDb.createDigitalTwin(twinData);

    if (error) {
      return res.status(500).json({
        error: 'Failed to create digital twin',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }

    // Return consistent structure that matches what frontend expects
    res.status(201).json({
      success: true,
      id: twin.id,
      twin: twin,
      message: 'Digital twin created successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error creating twin:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      details: error.details || error
    });
    res.status(500).json({
      error: 'Failed to create digital twin',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack, details: error.details })
    });
  }
});

// PUT /api/twins/:id - Update a digital twin
router.put('/:id', authenticateUser, userRateLimit(50, 15 * 60 * 1000), validateTwinRequest, handleValidationErrors, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // UUID validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        error: 'Invalid twin ID format'
      });
    }

    // Check if twin exists and user owns it
    const { data: existingTwin, error: fetchError } = await serverDb.getDigitalTwin(id);

    if (fetchError) {
      return res.status(500).json({
        error: 'Failed to fetch digital twin',
        message: process.env.NODE_ENV === 'development' ? fetchError.message : 'Internal server error'
      });
    }

    if (!existingTwin) {
      return res.status(404).json({
        error: 'Digital twin not found'
      });
    }

    if (existingTwin.creator_id !== userId) {
      return res.status(403).json({
        error: 'Access denied: You can only update your own digital twins'
      });
    }

    const {
      name,
      description,
      subject_area,
      twin_type,
      personality_traits,
      teaching_style,
      common_phrases,
      favorite_analogies,
      is_active
    } = req.body;

    // Check if user can create professor twins
    if (twin_type === 'professor' && req.user.role !== 'professor') {
      return res.status(403).json({
        error: 'Only professors can create professor-type digital twins'
      });
    }

    const updates = {
      name,
      description: description || null,
      subject_area: subject_area || null,
      twin_type,
      personality_traits: personality_traits || existingTwin.personality_traits,
      teaching_style: teaching_style || existingTwin.teaching_style,
      common_phrases: common_phrases || existingTwin.common_phrases,
      favorite_analogies: favorite_analogies || existingTwin.favorite_analogies
    };

    // Only professors can change activation status
    if (typeof is_active === 'boolean' && req.user.role === 'professor') {
      updates.is_active = is_active;
    }

    const { data: twin, error } = await serverDb.updateDigitalTwin(id, updates);

    if (error) {
      return res.status(500).json({
        error: 'Failed to update digital twin',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }

    res.json({
      twin,
      message: 'Digital twin updated successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error updating twin:', error);
    res.status(500).json({
      error: 'Failed to update digital twin',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// DELETE /api/twins/:id - Delete a digital twin
router.delete('/:id', authenticateUser, userRateLimit(20, 15 * 60 * 1000), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // UUID validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        error: 'Invalid twin ID format'
      });
    }

    // Check if twin exists and user owns it
    const { data: existingTwin, error: fetchError } = await serverDb.getDigitalTwin(id);

    if (fetchError) {
      return res.status(500).json({
        error: 'Failed to fetch digital twin',
        message: process.env.NODE_ENV === 'development' ? fetchError.message : 'Internal server error'
      });
    }

    if (!existingTwin) {
      return res.status(404).json({
        error: 'Digital twin not found'
      });
    }

    if (existingTwin.creator_id !== userId) {
      return res.status(403).json({
        error: 'Access denied: You can only delete your own digital twins'
      });
    }

    const { success, error } = await serverDb.deleteDigitalTwin(id);

    if (error) {
      return res.status(500).json({
        error: 'Failed to delete digital twin',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }

    res.json({
      message: 'Digital twin deleted successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error deleting twin:', error);
    res.status(500).json({
      error: 'Failed to delete digital twin',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET /api/twins/public/active - Get all active professor twins (public endpoint)
router.get('/public/active', userRateLimit(100, 15 * 60 * 1000), async (req, res) => {
  try {
    const { data: twins, error } = await serverDb.getDigitalTwinsByCreator(''); // This will be modified to get active professor twins

    // For now, let's create a direct query for active professor twins
    const { data, error: queryError } = await supabaseAdmin
      .from('digital_twins')
      .select('id, name, description, subject_area, creator_id, created_at')
      .eq('is_active', true)
      .eq('twin_type', 'professor')
      .order('created_at', { ascending: false });

    if (queryError) {
      return res.status(500).json({
        error: 'Failed to fetch active professor twins',
        message: process.env.NODE_ENV === 'development' ? queryError.message : 'Internal server error'
      });
    }

    res.json({
      twins: data,
      count: data.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching active professor twins:', error);
    res.status(500).json({
      error: 'Failed to fetch active professor twins',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

export default router;