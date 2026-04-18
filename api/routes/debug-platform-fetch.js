/**
 * Diagnostic Endpoint: Platform Fetcher Direct Test
 * ===================================================
 * Calls fetchLinkedInObservations / fetchDiscordObservations / fetchTwitchObservations
 * directly for a specific user and returns the full result + token status + any errors.
 *
 * Used to diagnose why structured data isn't being written to user_platform_data.
 *
 * Usage:
 *   GET /api/debug/platform-fetch?userId=<uuid>&platform=linkedin
 *
 * Security: Protected by CRON_SECRET header (same as cron endpoints)
 */

import express from 'express';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import {
  fetchLinkedInObservations,
  fetchDiscordObservations,
  fetchTwitchObservations,
} from '../services/observationIngestion.js';
import { getValidAccessToken } from '../services/tokenRefreshService.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('DebugPlatformFetch');
const router = express.Router();

const FETCHERS = {
  linkedin: fetchLinkedInObservations,
  discord: fetchDiscordObservations,
  twitch: fetchTwitchObservations,
};

router.all('/', async (req, res) => {
  // Auth via cron secret (same protection as cron endpoints)
  const authResult = verifyCronSecret(req);
  if (!authResult.authorized) {
    return res.status(authResult.status).json({ error: authResult.error });
  }

  const userId = req.query?.userId || req.body?.userId;
  const platform = req.query?.platform || req.body?.platform;

  if (!userId || !platform) {
    return res.status(400).json({ error: 'userId and platform query params required' });
  }

  if (!FETCHERS[platform]) {
    return res.status(400).json({ error: `Unsupported platform: ${platform}. Supported: ${Object.keys(FETCHERS).join(', ')}` });
  }

  const result = {
    userId,
    platform,
    timestamp: new Date().toISOString(),
    steps: [],
  };

  try {
    // Step 1: Check token availability
    const tokenStart = Date.now();
    let tokenResult;
    try {
      tokenResult = await getValidAccessToken(userId, platform);
      result.steps.push({
        step: 'token_check',
        elapsedMs: Date.now() - tokenStart,
        success: tokenResult.success,
        hasToken: !!tokenResult.accessToken,
        tokenPrefix: tokenResult.accessToken ? tokenResult.accessToken.slice(0, 10) + '...' : null,
        error: tokenResult.error || null,
      });
    } catch (e) {
      result.steps.push({
        step: 'token_check',
        elapsedMs: Date.now() - tokenStart,
        success: false,
        error: e.message,
      });
      return res.json(result);
    }

    // Step 2: Check existing user_platform_data BEFORE the fetch
    const beforeStart = Date.now();
    const { data: beforeData, error: beforeError } = await supabaseAdmin
      .from('user_platform_data')
      .select('data_type, raw_data, extracted_at')
      .eq('user_id', userId)
      .eq('platform', platform)
      .order('extracted_at', { ascending: false })
      .limit(3);
    result.steps.push({
      step: 'platform_data_before',
      elapsedMs: Date.now() - beforeStart,
      count: beforeData?.length || 0,
      latestExtractedAt: beforeData?.[0]?.extracted_at || null,
      latestKeys: beforeData?.[0]?.raw_data ? Object.keys(beforeData[0].raw_data) : null,
      error: beforeError?.message || null,
    });

    // Step 3: Call the fetcher function directly
    const fetchStart = Date.now();
    let observations;
    let fetchError = null;
    try {
      observations = await FETCHERS[platform](userId);
    } catch (e) {
      fetchError = e.message;
      observations = [];
    }
    result.steps.push({
      step: 'fetcher_call',
      elapsedMs: Date.now() - fetchStart,
      observationsReturned: observations?.length || 0,
      observations: observations?.slice(0, 5).map(o => ({
        content: typeof o === 'string' ? o.slice(0, 150) : (o.content || '').slice(0, 150),
        contentType: typeof o === 'object' ? o.contentType : undefined,
      })),
      error: fetchError,
    });

    // Step 4: Check user_platform_data AFTER the fetch (did the upsert run?)
    const afterStart = Date.now();
    const { data: afterData, error: afterError } = await supabaseAdmin
      .from('user_platform_data')
      .select('data_type, raw_data, extracted_at')
      .eq('user_id', userId)
      .eq('platform', platform)
      .order('extracted_at', { ascending: false })
      .limit(3);
    result.steps.push({
      step: 'platform_data_after',
      elapsedMs: Date.now() - afterStart,
      count: afterData?.length || 0,
      latestExtractedAt: afterData?.[0]?.extracted_at || null,
      latestKeys: afterData?.[0]?.raw_data ? Object.keys(afterData[0].raw_data) : null,
      latestRawData: afterData?.[0]?.raw_data || null,
      newEntryWritten: (afterData?.[0]?.extracted_at || '') > (beforeData?.[0]?.extracted_at || ''),
      error: afterError?.message || null,
    });

    res.json(result);
  } catch (e) {
    log.error('Diagnostic endpoint error', { error: e.message, stack: e.stack });
    res.status(500).json({
      error: e.message,
      stack: process.env.NODE_ENV !== 'production' ? e.stack?.split('\n').slice(0, 5) : undefined,
      partialResult: result,
    });
  }
});

export default router;
