/**
 * Onboarding Questions API
 *
 * Endpoints for managing user personality questionnaire
 * that helps personalize recommendations before platform data is available.
 */

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  ONBOARDING_QUESTIONS,
  calculatePreferencesFromAnswers,
  applyPreferencesToMusicParams,
  generatePreferenceExplanation
} from '../services/onboardingQuestionsService.js';

const router = express.Router();

/**
 * GET /api/onboarding/questions
 * Get all onboarding questions
 */
router.get('/questions', authenticateToken, (req, res) => {
  try {
    // Return questions without the score data (for security)
    const questionsForClient = ONBOARDING_QUESTIONS.map(q => ({
      id: q.id,
      category: q.category,
      question: q.question,
      options: q.options.map(o => ({
        value: o.value,
        label: o.label,
        icon: o.icon  // Lucide icon name
      }))
    }));

    res.json({
      success: true,
      questions: questionsForClient,
      totalQuestions: questionsForClient.length
    });
  } catch (error) {
    console.error('[Onboarding] Error fetching questions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch questions'
    });
  }
});

/**
 * POST /api/onboarding/answers
 * Save user's questionnaire answers
 */
router.post('/answers', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { answers } = req.body;

    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Answers object required'
      });
    }

    console.log(`[Onboarding] Saving answers for user ${userId}:`, Object.keys(answers).length, 'questions answered');

    // Calculate preferences from answers
    const preferences = calculatePreferencesFromAnswers(answers);

    // Build the personality quiz data
    const personalityQuiz = {
      answers,
      preferences,
      completedAt: new Date().toISOString(),
      version: 1
    };

    // Save to users table
    const { error } = await supabaseAdmin
      .from('users')
      .update({
        personality_quiz: personalityQuiz,
        onboarding_completed_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) {
      console.error('[Onboarding] Error saving answers:', error);
      throw error;
    }

    // Also update onboarding_state if it exists
    await supabaseAdmin
      .from('onboarding_state')
      .upsert({
        user_id: userId,
        current_step: 'completed',
        completed: true,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    console.log(`[Onboarding] Successfully saved preferences for user ${userId}`);

    res.json({
      success: true,
      message: 'Answers saved successfully',
      preferences: {
        morning_person: preferences.morning_person,
        peak_hours: preferences.peak_hours,
        novelty_seeking: preferences.novelty_seeking,
        music_emotional_strategy: preferences.music_emotional_strategy,
        stress_coping: preferences.stress_coping
      }
    });
  } catch (error) {
    console.error('[Onboarding] Error saving answers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save answers'
    });
  }
});

/**
 * GET /api/onboarding/answers
 * Get user's existing questionnaire answers
 */
router.get('/answers', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('personality_quiz, onboarding_completed_at')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('[Onboarding] Error fetching answers:', error);
      throw error;
    }

    const hasCompleted = !!user?.onboarding_completed_at;
    const answers = user?.personality_quiz?.answers || {};
    const preferences = user?.personality_quiz?.preferences || null;

    res.json({
      success: true,
      hasCompleted,
      completedAt: user?.onboarding_completed_at,
      answers,
      preferences
    });
  } catch (error) {
    console.error('[Onboarding] Error fetching answers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch answers'
    });
  }
});

/**
 * GET /api/onboarding/status
 * Check if user has completed onboarding questionnaire
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('personality_quiz, onboarding_completed_at')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('[Onboarding] Error checking status:', error);
      throw error;
    }

    const answeredCount = user?.personality_quiz?.answers
      ? Object.keys(user.personality_quiz.answers).length
      : 0;

    res.json({
      success: true,
      hasCompleted: !!user?.onboarding_completed_at,
      completedAt: user?.onboarding_completed_at,
      questionsAnswered: answeredCount,
      totalQuestions: ONBOARDING_QUESTIONS.length,
      percentComplete: Math.round((answeredCount / ONBOARDING_QUESTIONS.length) * 100)
    });
  } catch (error) {
    console.error('[Onboarding] Error checking status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check status'
    });
  }
});

/**
 * POST /api/onboarding/skip
 * Skip the onboarding questionnaire
 */
router.post('/skip', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Mark as completed but with no answers
    const { error } = await supabaseAdmin
      .from('users')
      .update({
        personality_quiz: {
          skipped: true,
          skippedAt: new Date().toISOString()
        },
        onboarding_completed_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) {
      console.error('[Onboarding] Error skipping:', error);
      throw error;
    }

    console.log(`[Onboarding] User ${userId} skipped questionnaire`);

    res.json({
      success: true,
      message: 'Questionnaire skipped'
    });
  } catch (error) {
    console.error('[Onboarding] Error skipping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to skip questionnaire'
    });
  }
});

/**
 * DELETE /api/onboarding/answers
 * Reset user's questionnaire (allow retaking)
 */
router.delete('/answers', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const { error } = await supabaseAdmin
      .from('users')
      .update({
        personality_quiz: {},
        onboarding_completed_at: null
      })
      .eq('id', userId);

    if (error) {
      console.error('[Onboarding] Error resetting:', error);
      throw error;
    }

    console.log(`[Onboarding] Reset questionnaire for user ${userId}`);

    res.json({
      success: true,
      message: 'Questionnaire reset'
    });
  } catch (error) {
    console.error('[Onboarding] Error resetting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset questionnaire'
    });
  }
});

/**
 * GET /api/onboarding/preferences-impact
 * Preview how preferences affect recommendations (for debugging/transparency)
 */
router.get('/preferences-impact', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's preferences
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('personality_quiz')
      .eq('id', userId)
      .single();

    if (error || !user?.personality_quiz?.preferences) {
      return res.json({
        success: true,
        hasPreferences: false,
        message: 'Complete the questionnaire to see how your preferences affect recommendations'
      });
    }

    const preferences = user.personality_quiz.preferences;

    // Generate example impacts for different contexts
    const impacts = {
      morning_routine: applyPreferencesToMusicParams(preferences, {
        purpose: 'general',
        calendar: { recentMeetings: 0 }
      }),
      pre_presentation: applyPreferencesToMusicParams(preferences, {
        purpose: 'pre-event',
        calendar: { recentMeetings: 1 }
      }),
      focus_session: applyPreferencesToMusicParams(preferences, {
        purpose: 'focus',
        calendar: { recentMeetings: 0 }
      }),
      low_recovery: applyPreferencesToMusicParams(preferences, {
        purpose: 'general',
        whoop: { recovery: 30 },
        mood: 'low'
      }),
      after_meetings: applyPreferencesToMusicParams(preferences, {
        purpose: 'general',
        calendar: { recentMeetings: 4 }
      })
    };

    res.json({
      success: true,
      hasPreferences: true,
      preferences: {
        morning_person: preferences.morning_person,
        peak_hours: preferences.peak_hours,
        music_emotional_strategy: preferences.music_emotional_strategy,
        stress_coping: preferences.stress_coping,
        introversion: preferences.introversion,
        novelty_seeking: preferences.novelty_seeking
      },
      impacts
    });
  } catch (error) {
    console.error('[Onboarding] Error fetching impacts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch preference impacts'
    });
  }
});

export default router;
