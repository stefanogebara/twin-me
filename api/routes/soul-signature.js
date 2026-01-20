/**
 * Soul Signature API Routes
 *
 * Endpoints for personality analysis, soul signature generation,
 * and privacy controls based on behavioral data from 30+ platforms.
 */

import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { authenticateToken } from '../middleware/auth.js';
import spotifyFeatureExtractor from '../services/featureExtractors/spotifyExtractor.js';
import calendarFeatureExtractor from '../services/featureExtractors/calendarExtractor.js';
import whoopFeatureExtractor from '../services/featureExtractors/whoopExtractor.js';
import personalityAnalyzerService from '../services/personalityAnalyzerService.js';
import soulSignatureGenerator from '../services/soulSignatureGenerator.js';
import uniquePatternDetector from '../services/uniquePatternDetector.js';
import { ARCHETYPES } from '../services/personalityAssessmentService.js';

const router = express.Router();

// Platform extractors map
const platformExtractors = {
  spotify: spotifyFeatureExtractor,
  calendar: calendarFeatureExtractor,
  whoop: whoopFeatureExtractor
};

// ====================================================================
// GET /api/soul-signature/profile
// Get complete soul signature profile for a user
// ====================================================================
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.query.userId || req.user.id;

    console.log(`📊 [Soul Signature] Fetching profile for user ${userId}`);

    // Fetch complete profile from view (joins all related tables)
    const { data: profile, error } = await supabaseAdmin
      .from('soul_signature_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No profile found - return empty profile structure
        const { data: user } = await supabaseAdmin
          .from('users')
          .select('id, email, full_name')
          .eq('id', userId)
          .single();

        return res.json({
          success: true,
          profile: {
            user_id: userId,
            email: user?.email || '',
            full_name: user?.full_name,
            is_public: false,
            global_reveal_level: 50
          }
        });
      }
      throw error;
    }

    res.json({
      success: true,
      profile
    });

  } catch (error) {
    console.error('❌ [Soul Signature] Error fetching profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch soul signature profile',
      message: error.message
    });
  }
});

// ====================================================================
// GET /api/soul-signature/personality-scores
// Get Big Five personality dimensions with confidence scores
// ====================================================================
router.get('/personality-scores', authenticateToken, async (req, res) => {
  try {
    const userId = req.query.userId || req.user.id;

    console.log(`🧠 [Soul Signature] Fetching personality scores for user ${userId}`);

    // First check personality_estimates (60-question assessment)
    const { data: estimates } = await supabaseAdmin
      .from('personality_estimates')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (estimates && estimates.total_questions_answered > 0) {
      console.log(`🧠 [Soul Signature] Found assessment data: ${estimates.archetype_code} (${estimates.total_questions_answered} questions)`);

      // Also check for behavioral confidence from personality_scores
      const { data: behavioralScores } = await supabaseAdmin
        .from('personality_scores')
        .select('openness_confidence, conscientiousness_confidence, extraversion_confidence, agreeableness_confidence, neuroticism_confidence')
        .eq('user_id', userId)
        .single();

      // Use behavioral confidence if available (higher is better), otherwise fall back to assessment CI
      const getConfidence = (behavioralConf, assessmentCi, fallback = 10) => {
        if (behavioralConf && behavioralConf > 0) {
          return behavioralConf; // Behavioral confidence is already 0-100
        }
        return 100 - parseFloat(assessmentCi || fallback); // Assessment uses CI, so invert
      };

      const hasBehavioral = behavioralScores && (
        behavioralScores.openness_confidence > 0 ||
        behavioralScores.conscientiousness_confidence > 0 ||
        behavioralScores.extraversion_confidence > 0
      );

      if (hasBehavioral) {
        console.log(`🔬 [Soul Signature] Merging behavioral confidence:`, behavioralScores);
      }

      return res.json({
        success: true,
        data: {
          user_id: userId,
          source: hasBehavioral ? 'assessment+behavioral' : 'assessment',
          // MBTI dimensions (new)
          mind: parseFloat(estimates.mind || estimates.extraversion),
          energy: parseFloat(estimates.energy || estimates.openness),
          nature: parseFloat(estimates.nature || estimates.agreeableness),
          tactics: parseFloat(estimates.tactics || estimates.conscientiousness),
          identity: parseFloat(estimates.identity || (100 - estimates.neuroticism)),
          mind_ci: parseFloat(estimates.mind_ci || estimates.extraversion_ci || 25),
          energy_ci: parseFloat(estimates.energy_ci || estimates.openness_ci || 25),
          nature_ci: parseFloat(estimates.nature_ci || estimates.agreeableness_ci || 25),
          tactics_ci: parseFloat(estimates.tactics_ci || estimates.conscientiousness_ci || 25),
          identity_ci: parseFloat(estimates.identity_ci || estimates.neuroticism_ci || 25),
          // Legacy Big Five (for backward compatibility)
          openness: parseFloat(estimates.openness),
          conscientiousness: parseFloat(estimates.conscientiousness),
          extraversion: parseFloat(estimates.extraversion),
          agreeableness: parseFloat(estimates.agreeableness),
          neuroticism: parseFloat(estimates.neuroticism),
          // Use behavioral confidence when available
          openness_confidence: getConfidence(behavioralScores?.openness_confidence, estimates.openness_ci),
          conscientiousness_confidence: getConfidence(behavioralScores?.conscientiousness_confidence, estimates.conscientiousness_ci),
          extraversion_confidence: getConfidence(behavioralScores?.extraversion_confidence, estimates.extraversion_ci),
          agreeableness_confidence: getConfidence(behavioralScores?.agreeableness_confidence, estimates.agreeableness_ci),
          neuroticism_confidence: getConfidence(behavioralScores?.neuroticism_confidence, estimates.neuroticism_ci),
          archetype_code: estimates.archetype_code,
          analyzed_platforms: hasBehavioral ? ['personality_assessment', 'behavioral'] : ['personality_assessment'],
          sample_size: estimates.total_questions_answered
        }
      });
    }

    // Fall back to behavioral personality_scores
    const { data: scores, error } = await supabaseAdmin
      .from('personality_scores')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No scores yet
        return res.json({
          success: true,
          data: null,
          message: 'No personality scores found. Complete the personality assessment first.'
        });
      }
      throw error;
    }

    console.log(`🧠 [Soul Signature] Using behavioral personality scores`);

    // Compute archetype_code from Big Five scores for MBTI display
    const computeArchetypeCode = (scores) => {
      // Map Big Five to MBTI dimensions
      const E = scores.extraversion >= 50 ? 'E' : 'I';
      const N = scores.openness >= 50 ? 'N' : 'S';
      const F = scores.agreeableness >= 50 ? 'F' : 'T';
      const J = scores.conscientiousness >= 50 ? 'J' : 'P';
      const A = scores.neuroticism <= 50 ? 'A' : 'T'; // Low neuroticism = Assertive
      return `${E}${N}${F}${J}-${A}`;
    };

    // Compute MBTI dimensions from Big Five for the UI
    const archetypeCode = computeArchetypeCode(scores);
    const mbtiDimensions = {
      mind: parseFloat(scores.extraversion) || 50,
      energy: parseFloat(scores.openness) || 50,
      nature: parseFloat(scores.agreeableness) || 50,
      tactics: parseFloat(scores.conscientiousness) || 50,
      identity: 100 - (parseFloat(scores.neuroticism) || 50),
      mind_ci: parseFloat(scores.extraversion_confidence) || 70,
      energy_ci: parseFloat(scores.openness_confidence) || 70,
      nature_ci: parseFloat(scores.agreeableness_confidence) || 70,
      tactics_ci: parseFloat(scores.conscientiousness_confidence) || 70,
      identity_ci: parseFloat(scores.neuroticism_confidence) || 70
    };

    res.json({
      success: true,
      data: {
        ...scores,
        ...mbtiDimensions,
        archetype_code: archetypeCode,
        source: 'behavioral'
      }
    });

  } catch (error) {
    console.error('❌ [Soul Signature] Error fetching personality scores:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch personality scores',
      message: error.message
    });
  }
});

// ====================================================================
// GET /api/soul-signature/archetype
// Get soul signature archetype with narrative
// ====================================================================
router.get('/archetype', authenticateToken, async (req, res) => {
  try {
    const userId = req.query.userId || req.user.id;

    console.log(`✨ [Soul Signature] Fetching archetype for user ${userId}`);

    // First try soul_signatures table
    const { data: signature, error } = await supabaseAdmin
      .from('soul_signatures')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (signature && !error) {
      console.log(`✨ [Soul Signature] Found soul signature: ${signature.archetype_name}`);
      return res.json({
        success: true,
        data: signature
      });
    }

    // Fall back to personality_estimates (from 60-question assessment)
    const { data: estimates } = await supabaseAdmin
      .from('personality_estimates')
      .select('archetype_code, openness, conscientiousness, extraversion, agreeableness, neuroticism, total_questions_answered')
      .eq('user_id', userId)
      .single();

    if (estimates?.archetype_code) {
      const archetype = ARCHETYPES[estimates.archetype_code];
      console.log(`✨ [Soul Signature] Using personality assessment archetype: ${estimates.archetype_code} - ${archetype?.name}`);

      // Generate a narrative based on Big Five scores
      const narrative = generateArchetypeNarrative(estimates.archetype_code, archetype, estimates);

      return res.json({
        success: true,
        data: {
          user_id: userId,
          archetype_name: archetype?.name || estimates.archetype_code,
          archetype_code: estimates.archetype_code,
          archetype_subtitle: `${archetype?.group || 'Personality'} Type`,
          narrative: narrative,
          color_scheme: { primary: archetype?.color || '#6366f1' },
          source: 'assessment',
          questions_answered: estimates.total_questions_answered
        }
      });
    }

    // No data found in either table
    return res.json({
      success: true,
      data: null,
      message: 'No soul signature found. Complete the personality assessment first.'
    });

  } catch (error) {
    console.error('❌ [Soul Signature] Error fetching archetype:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch soul signature',
      message: error.message
    });
  }
});

// Helper function to generate narrative from archetype and Big Five scores
function generateArchetypeNarrative(code, archetype, estimates) {
  const traits = [];

  if (estimates.openness > 60) traits.push('imaginative and open to new experiences');
  else if (estimates.openness < 40) traits.push('practical and grounded');

  if (estimates.conscientiousness > 60) traits.push('organized and goal-oriented');
  else if (estimates.conscientiousness < 40) traits.push('flexible and spontaneous');

  if (estimates.extraversion > 60) traits.push('energized by social interaction');
  else if (estimates.extraversion < 40) traits.push('thoughtful and introspective');

  if (estimates.agreeableness > 60) traits.push('compassionate and cooperative');
  else if (estimates.agreeableness < 40) traits.push('independent and analytical');

  if (estimates.neuroticism > 60) traits.push('emotionally attuned');
  else if (estimates.neuroticism < 40) traits.push('calm and composed');

  const name = archetype?.name || code;
  const group = archetype?.group || 'Personality';

  return `As ${name}, you are part of the ${group} group. Based on your personality assessment, you are ${traits.join(', ')}. This unique combination shapes how you approach life, relationships, and challenges.`;
}

// ====================================================================
// GET /api/soul-signature/patterns
// Get unique behavioral patterns (top 5% behaviors)
// ====================================================================
router.get('/patterns', authenticateToken, async (req, res) => {
  try {
    const userId = req.query.userId || req.user.id;
    const definingOnly = req.query.defining === 'true';

    console.log(`🔍 [Soul Signature] Fetching patterns for user ${userId}`);

    let query = supabaseAdmin
      .from('unique_patterns')
      .select('*')
      .eq('user_id', userId)
      .order('uniqueness_score', { ascending: false });

    if (definingOnly) {
      query = query.eq('is_defining', true);
    }

    const { data: patterns, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: patterns || [],
      count: patterns?.length || 0
    });

  } catch (error) {
    console.error('❌ [Soul Signature] Error fetching patterns:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch unique patterns',
      message: error.message
    });
  }
});

// ====================================================================
// GET /api/soul-signature/features
// Get behavioral features extracted from platforms
// ====================================================================
router.get('/features', authenticateToken, async (req, res) => {
  try {
    const userId = req.query.userId || req.user.id;
    const platform = req.query.platform;

    console.log(`📈 [Soul Signature] Fetching features for user ${userId}`);

    let query = supabaseAdmin
      .from('behavioral_features')
      .select('*')
      .eq('user_id', userId)
      .order('confidence_score', { ascending: false });

    if (platform) {
      query = query.eq('platform', platform);
    }

    const { data: features, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: features || [],
      count: features?.length || 0
    });

  } catch (error) {
    console.error('❌ [Soul Signature] Error fetching features:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch behavioral features',
      message: error.message
    });
  }
});

// ====================================================================
// GET /api/soul-signature/privacy
// Get privacy settings
// ====================================================================
router.get('/privacy', authenticateToken, async (req, res) => {
  try {
    const userId = req.query.userId || req.user.id;

    console.log(`🔒 [Soul Signature] Fetching privacy settings for user ${userId}`);

    const { data: settings, error } = await supabaseAdmin
      .from('privacy_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Create default privacy settings
        const { data: newSettings, error: createError } = await supabaseAdmin
          .from('privacy_settings')
          .insert({
            user_id: userId,
            global_reveal_level: 50,
            openness_reveal: 50,
            conscientiousness_reveal: 50,
            extraversion_reveal: 50,
            agreeableness_reveal: 50,
            neuroticism_reveal: 50,
            personal_clusters_reveal: 50,
            professional_clusters_reveal: 50,
            creative_clusters_reveal: 50,
            platform_overrides: {},
            audience_profiles: []
          })
          .select()
          .single();

        if (createError) throw createError;

        return res.json({
          success: true,
          data: newSettings
        });
      }
      throw error;
    }

    res.json({
      success: true,
      data: settings
    });

  } catch (error) {
    console.error('❌ [Soul Signature] Error fetching privacy settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch privacy settings',
      message: error.message
    });
  }
});

// ====================================================================
// PUT /api/soul-signature/privacy
// Update privacy settings
// ====================================================================
router.put('/privacy', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      global_reveal_level,
      dimension_reveals,
      cluster_reveals,
      platform_overrides,
      audience_profiles
    } = req.body;

    console.log(`🔒 [Soul Signature] Updating privacy settings for user ${userId}`);

    // Build update object
    const updates = {
      updated_at: new Date().toISOString()
    };

    if (global_reveal_level !== undefined) {
      updates.global_reveal_level = global_reveal_level;
    }

    if (dimension_reveals) {
      if (dimension_reveals.openness !== undefined) updates.openness_reveal = dimension_reveals.openness;
      if (dimension_reveals.conscientiousness !== undefined) updates.conscientiousness_reveal = dimension_reveals.conscientiousness;
      if (dimension_reveals.extraversion !== undefined) updates.extraversion_reveal = dimension_reveals.extraversion;
      if (dimension_reveals.agreeableness !== undefined) updates.agreeableness_reveal = dimension_reveals.agreeableness;
      if (dimension_reveals.neuroticism !== undefined) updates.neuroticism_reveal = dimension_reveals.neuroticism;
    }

    if (cluster_reveals) {
      if (cluster_reveals.personal !== undefined) updates.personal_clusters_reveal = cluster_reveals.personal;
      if (cluster_reveals.professional !== undefined) updates.professional_clusters_reveal = cluster_reveals.professional;
      if (cluster_reveals.creative !== undefined) updates.creative_clusters_reveal = cluster_reveals.creative;
    }

    if (platform_overrides) {
      updates.platform_overrides = platform_overrides;
    }

    if (audience_profiles) {
      updates.audience_profiles = audience_profiles;
    }

    const { data: settings, error } = await supabaseAdmin
      .from('privacy_settings')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      data: settings
    });

  } catch (error) {
    console.error('❌ [Soul Signature] Error updating privacy settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update privacy settings',
      message: error.message
    });
  }
});

// ====================================================================
// POST /api/soul-signature/generate
// Generate soul signature from behavioral data
// ====================================================================
router.post('/generate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { platforms, force_refresh } = req.body;

    console.log(`🎨 [Soul Signature] Generating soul signature for user ${userId}`);
    console.log(`📊 [Soul Signature] Platforms: ${platforms?.join(', ') || 'all'}`);

    // Check if user already has a soul signature
    if (!force_refresh) {
      const { data: existing } = await supabaseAdmin
        .from('soul_signatures')
        .select('id, created_at')
        .eq('user_id', userId)
        .single();

      if (existing) {
        return res.json({
          success: false,
          error: 'Soul signature already exists',
          message: 'Use force_refresh: true to regenerate'
        });
      }
    }

    // Step 1: Extract features from all connected platforms
    console.log(`📊 [Soul Signature] Step 1: Extracting behavioral features...`);
    const platformsToExtract = platforms || Object.keys(platformExtractors);

    for (const platform of platformsToExtract) {
      const extractor = platformExtractors[platform];
      if (extractor) {
        try {
          const features = await extractor.extractFeatures(userId);
          if (features.length > 0) {
            await extractor.saveFeatures(features);
          }
        } catch (extractError) {
          console.log(`⚠️ [Soul Signature] Skipping ${platform}: ${extractError.message}`);
        }
      }
    }

    // Step 2: Detect unique patterns
    console.log(`🔍 [Soul Signature] Step 2: Detecting unique patterns...`);
    await uniquePatternDetector.detectUniquePatterns(userId);

    // Step 3: Analyze personality
    console.log(`🧠 [Soul Signature] Step 3: Analyzing personality...`);
    const analysisResult = await personalityAnalyzerService.analyzePersonality(userId);

    if (!analysisResult.success) {
      return res.status(400).json({
        success: false,
        error: analysisResult.error
      });
    }

    // Step 4: Generate soul signature
    console.log(`✨ [Soul Signature] Step 4: Generating soul signature...`);
    const signatureResult = await soulSignatureGenerator.generateSoulSignature(userId);

    if (!signatureResult.success) {
      return res.status(500).json({
        success: false,
        error: signatureResult.error
      });
    }

    console.log(`🎉 [Soul Signature] Generation complete: "${signatureResult.soulSignature.archetype_name}"`);

    res.json({
      success: true,
      message: 'Soul signature generated successfully',
      soulSignature: signatureResult.soulSignature,
      personalityScores: signatureResult.personalityScores
    });

  } catch (error) {
    console.error('❌ [Soul Signature] Error generating soul signature:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate soul signature',
      message: error.message
    });
  }
});

// ====================================================================
// POST /api/soul-signature/extract-features
// Extract behavioral features from a platform
// ====================================================================
router.post('/extract-features', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { platform } = req.body;

    if (!platform) {
      return res.status(400).json({
        success: false,
        error: 'Platform is required'
      });
    }

    const extractor = platformExtractors[platform];

    if (!extractor) {
      return res.status(400).json({
        success: false,
        error: `No extractor available for platform: ${platform}`,
        availablePlatforms: Object.keys(platformExtractors)
      });
    }

    console.log(`📊 [Soul Signature] Extracting features from ${platform} for user ${userId}`);

    // Extract features
    const features = await extractor.extractFeatures(userId);

    if (features.length === 0) {
      return res.json({
        success: true,
        message: `No data found for ${platform}. Connect the platform first.`,
        platform,
        featuresExtracted: 0
      });
    }

    // Save features to database
    const saveResult = await extractor.saveFeatures(features);

    res.json({
      success: true,
      message: `Extracted ${features.length} features from ${platform}`,
      platform,
      featuresExtracted: features.length,
      featureTypes: features.map(f => f.feature_type)
    });

  } catch (error) {
    console.error('❌ [Soul Signature] Error extracting features:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extract features',
      message: error.message
    });
  }
});

// ====================================================================
// GET /api/soul-signature/extraction-progress
// Get status of feature extraction job
// ====================================================================
router.get('/extraction-progress', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.query;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'Job ID is required'
      });
    }

    // This will be implemented with a job tracking system
    // For now, return mock progress
    res.json({
      success: true,
      jobId,
      status: 'pending',
      progress: 0,
      message: 'Job tracking system not yet implemented'
    });

  } catch (error) {
    console.error('❌ [Soul Signature] Error checking progress:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check extraction progress',
      message: error.message
    });
  }
});

export default router;
