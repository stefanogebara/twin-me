/**
 * Onboarding Platform Preview
 *
 * After a user connects a platform during onboarding, this endpoint
 * fetches a quick sample of their data and generates a 1-sentence
 * insight about what the twin learned.
 */

import express from 'express';
import { complete, TIER_EXTRACTION } from '../services/llmGateway.js';
import { authenticateUser } from '../middleware/auth.js';
import {
  fetchSpotifyObservations,
  fetchCalendarObservations,
  fetchWhoopObservations,
} from '../services/observationIngestion.js';

const router = express.Router();

const PLATFORM_FETCHERS = {
  spotify: fetchSpotifyObservations,
  google_calendar: fetchCalendarObservations,
  whoop: fetchWhoopObservations,
};

/**
 * GET /api/onboarding/platform-preview/:platform
 *
 * Fetches a quick sample of observations from a just-connected platform
 * and generates a 1-sentence insight about what the twin learned.
 */
router.get('/platform-preview/:platform', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { platform } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const fetcher = PLATFORM_FETCHERS[platform];
    if (!fetcher) {
      // For platforms we don't have fetchers for (youtube, twitch), return a generic message
      return res.json({
        success: true,
        insight: 'Connected! Your twin is learning from your data.',
        rawCount: 0,
      });
    }

    let observations = [];
    try {
      observations = await fetcher(userId);
    } catch (fetchErr) {
      console.warn(`[PlatformPreview] Fetch error for ${platform}:`, fetchErr.message);
      return res.json({
        success: true,
        insight: 'Connected! Your twin is learning from your data.',
        rawCount: 0,
      });
    }

    if (!observations || observations.length === 0) {
      return res.json({
        success: true,
        insight: 'Connected! Your twin is learning from your data.',
        rawCount: 0,
      });
    }

    // Take first 3 observations and generate a brief insight
    const sample = observations.slice(0, 3).map(obs =>
      typeof obs === 'string' ? obs : obs.content
    );

    let insight = '';
    try {
      const result = await complete({
        tier: TIER_EXTRACTION,
        system: `You are generating a brief insight for a user who just connected their ${platform} account. Based on the sample data below, write ONE sentence (max 20 words) about what their twin just learned about them. Be specific and personal, not generic. Don't start with "Your twin learned" - just state the insight directly.

Sample data:
${sample.join('\n')}`,
        messages: [{ role: 'user', content: 'What did you learn?' }],
        maxTokens: 60,
        temperature: 0.7,
        userId,
        serviceName: 'onboarding-platform-preview',
      });
      insight = result.content.replace(/^["']|["']$/g, '').trim();
    } catch (llmErr) {
      console.warn(`[PlatformPreview] LLM error for ${platform}:`, llmErr.message);
      insight = sample[0] || 'Connected! Your twin is learning from your data.';
    }

    return res.json({
      success: true,
      insight,
      rawCount: observations.length,
    });
  } catch (error) {
    console.error('[PlatformPreview] Error:', error);
    return res.json({
      success: true,
      insight: 'Connected! Your twin is learning from your data.',
      rawCount: 0,
    });
  }
});

export default router;
