/**
 * Feature Extraction Runner
 *
 * Runs all platform-specific behavioral feature extractors for a user.
 * Called from the observation ingestion cron to keep features fresh.
 * Non-blocking — errors are logged but never propagated.
 */
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('FeatureExtractionRunner');

// Map of platform names to their extractor module paths
const EXTRACTOR_MAP = {
  spotify: './featureExtractors/spotifyExtractor.js',
  youtube: './featureExtractors/youtubeFeatureExtractor.js',
  calendar: './featureExtractors/calendarExtractor.js',
  google_calendar: './featureExtractors/calendarExtractor.js',
  whoop: './featureExtractors/whoopExtractor.js',
  twitch: './featureExtractors/twitchExtractor.js',
  discord: './featureExtractors/discordExtractor.js',
  github: './featureExtractors/githubExtractor.js',
  google_gmail: './featureExtractors/gmailExtractor.js',
  gmail: './featureExtractors/gmailExtractor.js',
  linkedin: './featureExtractors/linkedinExtractor.js',
  reddit: './featureExtractors/redditExtractor.js',
};

/**
 * Run feature extraction for all connected platforms of a user.
 * @param {string} userId
 * @returns {{ extracted: number, errors: string[] }}
 */
export async function extractFeaturesForUser(userId) {
  const results = { extracted: 0, errors: [] };

  // Find which platforms have data for this user
  const { data: platforms, error } = await supabaseAdmin
    .from('user_platform_data')
    .select('platform')
    .eq('user_id', userId)
    .limit(1000);

  if (error || !platforms) {
    log.warn('Could not fetch platforms for user', { userId, error: error?.message });
    return results;
  }

  const uniquePlatforms = [...new Set(platforms.map(p => p.platform))];

  for (const platform of uniquePlatforms) {
    const extractorPath = EXTRACTOR_MAP[platform];
    if (!extractorPath) continue;

    try {
      const mod = await import(extractorPath);
      const extractor = mod.default;
      if (!extractor?.extractFeatures || !extractor?.saveFeatures) continue;

      const features = await extractor.extractFeatures(userId);
      if (features && features.length > 0) {
        await extractor.saveFeatures(features);
        results.extracted += features.length;
        log.info('Extracted features', { platform, count: features.length, userId: userId.slice(0, 8) });
      }
    } catch (err) {
      results.errors.push(`${platform}: ${err.message}`);
      log.warn('Feature extraction failed', { platform, userId: userId.slice(0, 8), error: err.message });
    }
  }

  return results;
}
