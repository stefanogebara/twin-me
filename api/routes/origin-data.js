import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { originQuestionsService } from '../services/originQuestionsService.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const router = express.Router();

/**
 * Origin Data API Routes
 *
 * Handles "hands-on" user-provided data that platforms can't reveal:
 * - Geographic origin (birthplace, current location, cultural background)
 * - Education background (degrees, field of study, learning style)
 * - Career stage (industry, experience, work style)
 * - Core values and life priorities
 *
 * This forms the Origin Universe component of the Soul Signature.
 */

// ============================================================================
// GET /api/origin/questions - Get question definitions for the origin form
// ============================================================================
router.get('/questions', async (req, res) => {
  try {
    const questions = originQuestionsService.getQuestions();

    res.json({
      success: true,
      questions,
      metadata: {
        totalSections: Object.keys(questions).length,
        isSkippable: true
      }
    });
  } catch (error) {
    console.error('Error fetching origin questions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch origin questions',
      details: error.message
    });
  }
});

// ============================================================================
// GET /api/origin/data - Fetch user's origin data
// ============================================================================
router.get('/data', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required in query params'
      });
    }

    const { data: originData, error } = await supabase
      .from('origin_data')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      console.error('Error fetching origin data:', error);
      throw error;
    }

    res.json({
      success: true,
      data: originData || null,
      hasData: !!originData,
      completionPercentage: originData?.completion_percentage || 0
    });
  } catch (error) {
    console.error('Error fetching origin data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch origin data',
      details: error.message
    });
  }
});

// ============================================================================
// POST /api/origin/data - Save origin data (create or update)
// ============================================================================
router.post('/data', async (req, res) => {
  try {
    const { userId, ...originFields } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required in request body'
      });
    }

    // Validate core_values (max 5)
    if (originFields.core_values && originFields.core_values.length > 5) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 5 core values allowed'
      });
    }

    // Check if user already has origin data
    const { data: existing } = await supabase
      .from('origin_data')
      .select('id')
      .eq('user_id', userId)
      .single();

    let result;

    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('origin_data')
        .update({
          ...originFields,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Insert new
      const { data, error } = await supabase
        .from('origin_data')
        .insert({
          user_id: userId,
          ...originFields
        })
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    console.log(`Origin data saved for user ${userId} (${result.completion_percentage}% complete)`);

    res.json({
      success: true,
      data: result,
      message: existing ? 'Origin data updated' : 'Origin data created',
      completionPercentage: result.completion_percentage
    });
  } catch (error) {
    console.error('Error saving origin data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save origin data',
      details: error.message
    });
  }
});

// ============================================================================
// PATCH /api/origin/data - Partial update of origin data
// ============================================================================
router.patch('/data', async (req, res) => {
  try {
    const { userId, section, ...sectionFields } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required in request body'
      });
    }

    // Ensure origin data exists for user
    const { data: existing } = await supabase
      .from('origin_data')
      .select('id')
      .eq('user_id', userId)
      .single();

    let result;

    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('origin_data')
        .update({
          ...sectionFields,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Create new with partial data
      const { data, error } = await supabase
        .from('origin_data')
        .insert({
          user_id: userId,
          ...sectionFields
        })
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    console.log(`Origin data section "${section}" updated for user ${userId}`);

    res.json({
      success: true,
      data: result,
      message: `Section "${section}" updated`,
      completionPercentage: result.completion_percentage
    });
  } catch (error) {
    console.error('Error updating origin data section:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update origin data section',
      details: error.message
    });
  }
});

// ============================================================================
// DELETE /api/origin/data - Delete user's origin data
// ============================================================================
router.delete('/data', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required in request body'
      });
    }

    const { error } = await supabase
      .from('origin_data')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;

    console.log(`Origin data deleted for user ${userId}`);

    res.json({
      success: true,
      message: 'Origin data deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting origin data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete origin data',
      details: error.message
    });
  }
});

// ============================================================================
// GET /api/origin/summary - Get a summary of origin data for soul signature
// ============================================================================
router.get('/summary', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required in query params'
      });
    }

    const { data: originData, error } = await supabase
      .from('origin_data')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (!originData) {
      return res.json({
        success: true,
        summary: null,
        hasData: false
      });
    }

    // Create a summary object for soul signature integration
    const summary = {
      geographic: {
        origin: originData.birthplace_city
          ? `${originData.birthplace_city}, ${originData.birthplace_country}`
          : originData.birthplace_country || null,
        current: originData.current_city
          ? `${originData.current_city}, ${originData.current_country}`
          : originData.current_country || null,
        culturalInfluences: originData.cultural_background || [],
        languages: originData.languages_spoken || [],
        mobilityScore: (originData.places_lived?.length || 0)
      },
      education: {
        level: originData.highest_education,
        field: originData.field_of_study,
        learningStyle: originData.learning_style
      },
      career: {
        stage: originData.career_stage,
        industry: originData.industry,
        yearsExperience: originData.years_experience,
        workStyle: originData.work_style,
        goals: originData.career_goals
      },
      values: {
        core: originData.core_values || [],
        priorities: originData.life_priorities || {},
        motto: originData.life_motto
      },
      completionPercentage: originData.completion_percentage
    };

    res.json({
      success: true,
      summary,
      hasData: true,
      completionPercentage: originData.completion_percentage
    });
  } catch (error) {
    console.error('Error fetching origin summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch origin summary',
      details: error.message
    });
  }
});

// ============================================================================
// GET /api/origin/values/options - Get available core value options
// ============================================================================
router.get('/values/options', async (req, res) => {
  try {
    const valueOptions = originQuestionsService.getValueOptions();

    res.json({
      success: true,
      options: valueOptions
    });
  } catch (error) {
    console.error('Error fetching value options:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch value options',
      details: error.message
    });
  }
});

export default router;
