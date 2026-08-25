/**
 * Public Portfolio Routes
 *
 * Aggregated public endpoint for the portfolio page.
 * Combines soul signature, personality, behavioral features, and platform data.
 */

import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('PortfolioPublic');

const router = express.Router();

/**
 * GET /api/portfolio/public/:userId
 *
 * Returns aggregated portfolio data for a user whose soul signature is public.
 * No authentication required - this powers the shareable portfolio page.
 */
router.get('/public/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate userId is a proper UUID v4 format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!userId || !uuidRegex.test(userId)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID format' });
    }

    if (!supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    // 1. Fetch soul signature (only if public) - this gates everything
    const { data: signature, error: sigError } = await supabaseAdmin
      .from('soul_signatures')
      .select('archetype_name, archetype_subtitle, narrative, defining_traits, color_scheme, icon_type, updated_at')
      .eq('user_id', userId)
      .eq('is_public', true)
      .single();

    if (sigError || !signature) {
      return res.status(404).json({ success: false, error: 'Portfolio not found or not public' });
    }

    // 2. Fetch remaining data in parallel (all non-critical - failures are graceful)
    const [userResult, personalityResult, featuresResult, enrichedResult, platformsResult, fidelityResult] = await Promise.all([
      // User info
      supabaseAdmin
        .from('users')
        .select('name, first_name, avatar_url')
        .eq('id', userId)
        .single(),

      // Personality scores (Big Five + MBTI)
      supabaseAdmin
        .from('personality_scores')
        .select('openness, conscientiousness, extraversion, agreeableness, neuroticism, openness_confidence, conscientiousness_confidence, extraversion_confidence, agreeableness_confidence, neuroticism_confidence, archetype_code')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),

      // Behavioral features (top features per platform)
      supabaseAdmin
        .from('behavioral_features')
        .select('platform, feature_type, feature_value, confidence')
        .eq('user_id', userId)
        .order('confidence', { ascending: false })
        .limit(30),

      // Enriched profile data
      supabaseAdmin
        .from('enriched_profiles')
        .select('discovered_photo, discovered_title, discovered_location')
        .eq('user_id', userId)
        .single(),

      // Connected platforms
      supabaseAdmin
        .from('platform_connections')
        .select('platform')
        .eq('user_id', userId)
        .eq('status', 'active'),

      // Latest measured fidelity wave (Phase 2: the headline proof metric —
      // "this twin answers as its human NN% of the time"). Only waves where
      // the twin actually answered count (twin_accuracy non-null).
      supabaseAdmin
        .from('twin_fidelity_checks')
        .select('twin_accuracy, self_consistency, normalized_fidelity, user_answers, wave, battery_version, created_at')
        .eq('user_id', userId)
        .not('twin_accuracy', 'is', null)
        // Tie-break matters here. battery_version resets `wave` to 1 on every
        // battery revision, so ordering by wave alone leaves every row tied at
        // 1 and Postgres free to return any of them. In production that served
        // the RETIRED 20-item v1 score (0.825, Aug 3) instead of the current
        // v3 measurement (0.61, Aug 12) — the highest and stalest of three.
        // Newest battery, then latest wave, then most recent.
        .order('battery_version', { ascending: false })
        .order('wave', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

    if (userResult.error) log.error('User fetch error:', userResult.error.message);
    if (personalityResult.error && personalityResult.error.code !== 'PGRST116') log.error('Personality fetch error:', personalityResult.error.message);
    if (featuresResult.error) log.error('Features fetch error:', featuresResult.error.message);
    if (enrichedResult.error && enrichedResult.error.code !== 'PGRST116') log.error('Enriched profile fetch error:', enrichedResult.error.message);
    if (platformsResult.error) log.error('Platforms fetch error:', platformsResult.error.message);
    if (fidelityResult.error) log.error('Fidelity fetch error:', fidelityResult.error.message);

    const user = userResult.data;
    const fidelityWave = fidelityResult.data?.[0] || null;
    const personality = personalityResult.data;
    const features = featuresResult.data || [];
    const enriched = enrichedResult.data;
    const connections = platformsResult.data || [];

    const firstName = user?.first_name || user?.name?.split(' ')[0] || null;

    // Group behavioral features by platform (top 3 per platform)
    const platformFeatureMap = {};
    for (const feat of features) {
      const key = feat.platform;
      if (!platformFeatureMap[key]) {
        platformFeatureMap[key] = [];
      }
      if (platformFeatureMap[key].length < 3) {
        platformFeatureMap[key].push({ type: feat.feature_type, value: feat.feature_value });
      }
    }

    const platforms = connections.map((conn) => ({
      name: conn.platform,
      features: platformFeatureMap[conn.platform] || [],
    }));

    // Parse color_scheme safely
    let colorScheme = signature.color_scheme;
    if (typeof colorScheme === 'string') {
      try {
        colorScheme = JSON.parse(colorScheme);
      } catch {
        colorScheme = null;
      }
    }

    // Parse defining_traits safely
    let definingTraits = signature.defining_traits;
    if (typeof definingTraits === 'string') {
      try {
        definingTraits = JSON.parse(definingTraits);
      } catch {
        definingTraits = [];
      }
    }

    const portfolio = {
      first_name: firstName,
      avatar_url: user?.avatar_url || enriched?.discovered_photo || null,
      title: enriched?.discovered_title || null,
      location: enriched?.discovered_location || null,
      archetype_name: signature.archetype_name,
      archetype_subtitle: signature.archetype_subtitle,
      narrative: signature.narrative,
      defining_traits: Array.isArray(definingTraits) ? definingTraits : [],
      color_scheme: colorScheme || null,
      icon_type: signature.icon_type,
      updated_at: signature.updated_at,
      personality: personality
        ? {
            openness: personality.openness,
            conscientiousness: personality.conscientiousness,
            extraversion: personality.extraversion,
            agreeableness: personality.agreeableness,
            neuroticism: personality.neuroticism,
            mbti_code: personality.archetype_code || null,
          }
        : null,
      platforms,
      // Fidelity, stated honestly (2026-08-25). The page used to publish the
      // RAW twin_accuracy with a "blind test-retest battery" caption, while
      // normalized_fidelity — the paper's actual headline metric, accuracy
      // divided by the human's own test-retest ceiling — sat unused in the
      // same row. A number served to strangers without auth has to carry its
      // own denominator, its n, and its date, or it is a claim rather than a
      // measurement.
      fidelity: fidelityWave
        ? {
            accuracy: fidelityWave.twin_accuracy,
            // Always emit these keys, null when unmeasured — a consumer must
            // be able to tell "no ceiling was measured" from "key missing".
            normalized: fidelityWave.normalized_fidelity ?? null,
            self_consistency: fidelityWave.self_consistency ?? null,
            items: fidelityWave.user_answers && typeof fidelityWave.user_answers === 'object'
              ? Object.keys(fidelityWave.user_answers).length
              : null,
            wave: fidelityWave.wave,
            measured_at: fidelityWave.created_at,
          }
        : null,
    };

    return res.json({ success: true, portfolio });
  } catch (error) {
    log.error('Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch portfolio' });
  }
});

export default router;
