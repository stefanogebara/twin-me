/**
 * Observation Ingestion Service
 * =============================
 * Background service that periodically pulls data from connected platforms
 * and stores natural-language observations in the memory stream.
 *
 * This fills the gap where addPlatformObservation() exists but is never called
 * from any background process — platform data was only fetched on-demand during chat.
 *
 * Architecture:
 *   For each user with connected platforms:
 *     For each connected platform:
 *       Fetch recent data from platform API
 *       Convert raw data to natural-language observations
 *       De-duplicate against recent observations
 *       Call addPlatformObservation() for each new observation
 *       After all observations stored, check if reflection should trigger
 *
 * Reuses the exact same API call patterns from twin-chat.js getPlatformData().
 */

import { addPlatformObservation } from './memoryStreamService.js';
import { shouldTriggerReflection, generateReflections } from './reflectionEngine.js';
import { runPlatformExpert } from './platformExperts.js';
import { generateProactiveInsights, evaluateNudgeOutcomes } from './proactiveInsights.js';
import { trackGoalProgress, generateGoalSuggestions } from './goalTrackingService.js';
import { generateTwinSummary } from './twinSummaryService.js';
import { seedMemoriesFromEnrichment } from './enrichmentMemoryBridge.js';
import { compileWikiPages } from './wikiCompilationService.js';
import { checkConditionTriggered } from './prospectiveMemoryService.js';
import { tagSensitivity } from './sensitivityClassifier.js';
import { calculateAllActivityMetrics, detectActivityAnomaly } from './activityMetricsService.js';

import { createLogger } from './logger.js';
import {
  sanitizeExternal,
  contentHash,
  DEDUP_WINDOWS_MS,
  isDuplicate,
  getSupabase,
} from './observationUtils.js';

import { fetchSpotifyObservations } from './observationFetchers/spotify.js';
import { fetchCalendarObservations } from './observationFetchers/calendar.js';
import { fetchYouTubeObservations } from './observationFetchers/youtube.js';
import { fetchDiscordObservations } from './observationFetchers/discord.js';
import { fetchGmailObservations } from './observationFetchers/gmail.js';
import { fetchGitHubObservations } from './observationFetchers/github.js';
import { fetchWhoopObservations } from './observationFetchers/whoop.js';
import { fetchLinkedInObservations } from './observationFetchers/linkedin.js';
import { fetchSlackObservations } from './observationFetchers/slack.js';
import { fetchRedditObservations } from './observationFetchers/reddit.js';
import { fetchGoogleDriveObservations } from './observationFetchers/googleDrive.js';
import { fetchOutlookObservations } from './observationFetchers/outlook.js';
import { fetchStravaObservations } from './observationFetchers/strava.js';
import { fetchGarminObservations } from './observationFetchers/garmin.js';
import { fetchFitbitObservations } from './observationFetchers/fitbit.js';
import { fetchTwitchObservations } from './observationFetchers/twitch.js';
import { fetchOuraObservations } from './observationFetchers/oura.js';
import { fetchAppleMusicObservations } from './observationFetchers/appleMusic.js';

const log = createLogger('ObservationIngestion');

// Platforms we know how to ingest
const SUPPORTED_PLATFORMS = ['spotify', 'google_calendar', 'youtube', 'discord', 'linkedin', 'reddit', 'whoop', 'github', 'google_gmail', 'google_drive', 'outlook', 'strava', 'garmin', 'fitbit', 'twitch', 'oura', 'slack', 'apple_music'];

// ====================================================================
// Prospective memory: extract metrics from observations for condition triggers
// ====================================================================

// Platform categories for skill triggers and metric extraction
const HEALTH_PLATFORMS = ['whoop', 'oura', 'garmin', 'fitbit', 'strava'];
const CALENDAR_PLATFORMS = ['google_calendar', 'outlook'];
const MUSIC_PLATFORMS = ['spotify', 'apple_music'];

// Registry of metric extractors per platform — add new platforms here
const METRIC_EXTRACTORS = {
  // Health platforms
  whoop: [
    [/Recovery score:\s*(\d+)%/i, 'recovery', parseInt],
    [/HRV\s+(\d+)ms/i, 'hrv', parseInt],
    [/resting heart rate\s+(\d+)bpm/i, 'resting_heart_rate', parseInt],
    [/Slept\s+([\d.]+)\s+hours/i, 'sleep_hours', parseFloat],
    [/sleep performance\s+(\d+)%/i, 'sleep_performance', parseInt],
    [/strain[:\s]+(\d+\.?\d*)/i, 'strain', parseFloat],
  ],
  oura: [
    [/Readiness(?:\s+score)?:\s*(\d+)/i, 'readiness', parseInt],
    [/Slept\s+([\d.]+)\s+hours/i, 'sleep_hours', parseFloat],
    [/Sleep score:\s*(\d+)/i, 'sleep_score', parseInt],
    [/HRV\s+(\d+)/i, 'hrv', parseInt],
    [/activity score:\s*(\d+)/i, 'activity_score', parseInt],
  ],
  garmin: [
    [/Body Battery:\s*(\d+)/i, 'body_battery', parseInt],
    [/Stress:\s*(\d+)/i, 'stress', parseInt],
    [/(\d[\d,]*)\s*steps/i, 'steps', s => parseInt(s.replace(/,/g, ''), 10)],
    [/Slept\s+([\d.]+)\s+hours/i, 'sleep_hours', parseFloat],
    [/VO2\s*Max:\s*(\d+)/i, 'vo2_max', parseInt],
  ],
  fitbit: [
    [/(\d[\d,]*)\s*steps/i, 'steps', s => parseInt(s.replace(/,/g, ''), 10)],
    [/Slept\s+([\d.]+)\s+hours/i, 'sleep_hours', parseFloat],
    [/Sleep score:\s*(\d+)/i, 'sleep_score', parseInt],
    [/resting heart rate\s+(\d+)/i, 'resting_heart_rate', parseInt],
    [/active minutes:\s*(\d+)/i, 'active_minutes', parseInt],
  ],
  strava: [
    [/(\d+\.?\d*)\s*(?:km|miles)/i, 'distance', parseFloat],
    [/(\d+)\s*min(?:utes)?\s+(?:run|ride|swim|activity)/i, 'activity_minutes', parseInt],
    [/(?:average|avg)\s+(?:heart rate|HR):\s*(\d+)/i, 'avg_heart_rate', parseInt],
  ],
  // Music platforms
  spotify: [
    [/Currently listening/i, 'is_playing', () => 1],
    [/(\d+)\s*minutes?\s+of\s+listening/i, 'listening_minutes', parseInt],
  ],
  apple_music: [
    [/Currently listening/i, 'is_playing', () => 1],
  ],
  // Calendar/schedule platforms
  google_calendar: [
    [/(\d+)\s+events?\s+today/i, 'events_today', parseInt],
    [/(\d+)\s+meetings?/i, 'meetings', parseInt],
  ],
  outlook: [
    [/(\d+)\s+events?\s+today/i, 'events_today', parseInt],
    [/(\d+)\s+meetings?/i, 'meetings', parseInt],
  ],
  // Activity platforms
  github: [
    [/(\d+)\s+commit/i, 'commits', parseInt],
    [/(\d+)\s+pull request/i, 'pull_requests', parseInt],
  ],
  discord: [
    [/(\d+)\s+messages?\s+sent/i, 'messages_sent', parseInt],
  ],
  youtube: [
    [/watched\s+(\d+)/i, 'videos_watched', parseInt],
    [/(\d+)\s*(?:min|minutes)\s+watched/i, 'watch_minutes', parseInt],
  ],
};

/**
 * Extract numeric metrics from observation strings for condition-triggered
 * prospective memory matching. Platform-agnostic — uses METRIC_EXTRACTORS registry.
 *
 * @param {string} platform - Platform name
 * @param {Array} observations - Array of observation strings or { content } objects
 * @returns {Object} Extracted metrics (e.g., { recovery: 65, hrv: 45, sleep_hours: 7.2 })
 */
function extractPlatformMetrics(platform, observations) {
  const extractors = METRIC_EXTRACTORS[platform];
  if (!extractors) return {};

  const metrics = {};
  for (const obs of observations) {
    const text = typeof obs === 'string' ? obs : obs.content;
    if (!text) continue;

    for (const [pattern, metricName, parser] of extractors) {
      const match = text.match(pattern);
      if (match) {
        metrics[metricName] = parser(match[1] || match[0], 10);
      }
    }
  }

  return metrics;
}

/**
 * Extract simple keywords from observation text for keyword-based condition matching.
 * Platform-agnostic — works on any observation text.
 */
function extractObservationKeywords(observations) {
  const keywords = new Set();
  for (const obs of observations) {
    const text = (typeof obs === 'string' ? obs : obs.content || '').toLowerCase();
    // Health/energy keywords
    if (/low recovery|under-slept|poor sleep|exhausted|low readiness|low body battery/i.test(text)) keywords.add('tired');
    if (/high recovery|excellent|well-rested|high readiness|fully charged/i.test(text)) keywords.add('energized');
    if (/workout|exercise|training|gym|run|ride|swim/i.test(text)) keywords.add('workout');
    // Schedule keywords
    if (/meeting|call|event|appointment/i.test(text)) keywords.add('meeting');
    if (/free|no events|open/i.test(text)) keywords.add('free');
    // Pattern keywords
    if (/streak/i.test(text)) keywords.add('streak');
    if (/overtraining|over.?exert/i.test(text)) keywords.add('overtraining');
    if (/irregular|inconsistent/i.test(text)) keywords.add('irregular');
    if (/consistent|routine/i.test(text)) keywords.add('consistent');
    // Social/activity keywords
    if (/commit|push|pull request|merge/i.test(text)) keywords.add('coding');
    if (/message|chat|dm|replied/i.test(text)) keywords.add('social');
    if (/watched|listening|played/i.test(text)) keywords.add('consuming');
  }
  return [...keywords];
}

// ====================================================================
// Web extension observation helpers
// ====================================================================

function extractDomainFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/**
 * Convert raw web extension events (tab visits, article reads, search queries, video watches)
 * into natural-language observations and store them in the memory stream.
 *
 * @param {string} userId
 * @param {Array<{data_type: string, raw_data: {url, domain, title, duration_seconds, timestamp}}>} events
 */
export async function ingestWebObservations(userId, events) {
  if (!events || events.length === 0) return 0;

  let count = 0;

  for (const event of events) {
    try {
      const d = event.raw_data || event;
      const domain = d.domain || extractDomainFromUrl(d.url || '');
      const title = sanitizeExternal(d.title || d.name || '', 150);
      const durationSec = d.duration_seconds || d.durationSeconds || 0;
      const durationMin = durationSec > 0 ? Math.round(durationSec / 60) : null;
      const dataType = event.data_type || 'extension_page_visit';

      let content = '';

      if (dataType === 'search_query' || dataType === 'extension_search_query') {
        const query = sanitizeExternal(d.query || title, 200);
        if (!query) continue;
        content = `Searched for "${query}"${domain ? ` on ${domain}` : ''}.`;
      } else if (dataType === 'extension_video_watch' || dataType === 'extension_web_video') {
        const platform = sanitizeExternal(d.platform || domain, 60);
        if (!title) continue;
        content = `Watched "${title}"${platform ? ` on ${platform}` : ''}${durationMin ? ` for ${durationMin} minutes` : ''}.`;
      } else if (dataType === 'extension_article_read' || dataType === 'reading_completion' || dataType === 'reading_analysis') {
        if (!title && !domain) continue;
        content = `Read "${title || domain}"${domain && title ? ` at ${domain}` : ''}${durationMin ? ` (${durationMin} min)` : ''}.`;
      } else {
        // Generic page visit
        if (!domain && !title) continue;
        const label = title || domain;
        content = durationMin
          ? `Spent ${durationMin} minutes on ${label}.`
          : `Visited ${label}.`;
      }

      if (!content) continue;

      const deduped = await isDuplicate(userId, 'web', content, 'current_state');
      if (deduped) continue;

      await addPlatformObservation(userId, content, {
        source: 'browser_extension',
        platform: 'web',
        data_type: dataType,
      });
      count++;
    } catch (err) {
      log.warn('Web observation failed (non-fatal)', { error: err.message });
    }
  }

  return count;
}

async function fetchRecentWebEvents(userId) {
  const supabase = await getSupabase();
  if (!supabase) return [];
  const since = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('user_platform_data')
    .select('raw_data, data_type, extracted_at')
    .eq('user_id', userId)
    .eq('platform', 'web')
    .like('data_type', 'extension_%')
    .gte('extracted_at', since)
    .order('extracted_at', { ascending: false })
    .limit(200);
  return (data ?? []).map(row => ({ ...row.raw_data, data_type: row.data_type }));
}

// ====================================================================
// Main Ingestion Loop
// ====================================================================

/**
 * Run observation ingestion for all users with connected platforms.
 * This is the function to call from a cron route or setInterval.
 *
 * @returns {{ usersProcessed, observationsStored, reflectionsTriggered, errors }}
 */
// Platform name -> fetch function lookup for parallel execution
const PLATFORM_FETCHERS = {
  spotify: fetchSpotifyObservations,
  google_calendar: fetchCalendarObservations,
  youtube: fetchYouTubeObservations,
  discord: fetchDiscordObservations,
  linkedin: fetchLinkedInObservations,
  slack: fetchSlackObservations,
  reddit: fetchRedditObservations,
  whoop: fetchWhoopObservations,
  github: fetchGitHubObservations,
  google_gmail: fetchGmailObservations,
  google_drive: fetchGoogleDriveObservations,
  outlook: fetchOutlookObservations,
  strava: fetchStravaObservations,
  garmin: fetchGarminObservations,
  fitbit: fetchFitbitObservations,
  twitch: fetchTwitchObservations,
  oura: fetchOuraObservations,
  apple_music: fetchAppleMusicObservations,
};

async function runObservationIngestion(options = {}) {
  const { targetUserIds = null } = options;
  log.info('Starting ingestion run...', targetUserIds ? { targetUserIds } : {});
  const startTime = Date.now();

  const stats = {
    usersProcessed: 0,
    observationsStored: 0,
    reflectionsTriggered: 0,
    errors: [],
    processedUserIds: [],
  };

  try {
    const supabase = await getSupabase();
    if (!supabase) {
      log.warn('Database not available, skipping');
      return stats;
    }

    // Find all users with at least one active platform connection.
    // Check platform_connections (direct OAuth), nango_connection_mappings (Nango-managed),
    // AND user_github_config (PAT-based connections that don't go through OAuth).
    const [pcRes, nangoRes, githubRes] = await Promise.all([
      supabase
        .from('platform_connections')
        .select('user_id, platform')
        .not('connected_at', 'is', null)
        .in('platform', SUPPORTED_PLATFORMS),
      supabase
        .from('nango_connection_mappings')
        .select('user_id, platform')
        .eq('status', 'active')
        .in('platform', SUPPORTED_PLATFORMS),
      supabase
        .from('user_github_config')
        .select('user_id')
        .not('access_token', 'is', null),
    ]);
    if (pcRes.error) log.warn('platform_connections fetch error', { error: pcRes.error });
    if (nangoRes.error) log.warn('nango_connection_mappings fetch error', { error: nangoRes.error });
    const pcResult = pcRes.data || [];
    const nangoResult = nangoRes.data || [];
    const githubResult = (githubRes.data || []).map(r => ({ user_id: r.user_id, platform: 'github' }));

    let allConnections = [...pcResult, ...nangoResult, ...githubResult];

    // Scope to specific users if targetUserIds provided (for manual testing)
    if (Array.isArray(targetUserIds) && targetUserIds.length > 0) {
      const targetSet = new Set(targetUserIds);
      allConnections = allConnections.filter(c => targetSet.has(c.user_id));
    }

    if (allConnections.length === 0) {
      log.info('No active platform connections found');
      return stats;
    }

    // Group connections by user — deduplicate per user+platform
    const userPlatforms = new Map();
    for (const conn of allConnections) {
      if (!userPlatforms.has(conn.user_id)) {
        userPlatforms.set(conn.user_id, new Set());
      }
      userPlatforms.get(conn.user_id).add(conn.platform);
    }
    // Convert Sets to Arrays for iteration
    for (const [uid, set] of userPlatforms) {
      userPlatforms.set(uid, [...set]);
    }

    log.info('Found users with connections', { users: userPlatforms.size, connections: allConnections.length, pc: pcResult.length, nango: nangoResult.length });

    // Global timeout guard — stop processing before Vercel kills us (60s limit)
    const GLOBAL_TIMEOUT_MS = 50_000;
    const isTimedOut = () => Date.now() - startTime > GLOBAL_TIMEOUT_MS;

    // Round-robin: rotate which user starts first so all users get serviced.
    const MAX_USERS_PER_RUN = 3;
    const userEntries = [...userPlatforms.entries()];
    const rotationOffset = new Date().getMinutes() % userEntries.length;
    const rotatedUsers = [...userEntries.slice(rotationOffset), ...userEntries.slice(0, rotationOffset)]
      .slice(0, MAX_USERS_PER_RUN);
    log.info('User selection', { total: userEntries.length, processing: rotatedUsers.length, rotationOffset });

    // Process each user (with timeout guard)
    for (const [userId, platforms] of rotatedUsers) {
      if (isTimedOut()) {
        log.info('Global timeout reached, stopping ingestion', { elapsed: Date.now() - startTime, usersProcessed: stats.usersProcessed });
        break;
      }
      try {
        let userObsCount = 0;

        // ---- Phase 1: Parallel platform fetch (all platforms concurrently) ----
        const PER_PLATFORM_TIMEOUT_MS = 15_000;
        const platformFetchResults = {};
        await Promise.all(
          platforms.map(async (platform) => {
            const fetcher = PLATFORM_FETCHERS[platform];
            if (!fetcher) {
              platformFetchResults[platform] = { observations: [], error: null };
              return;
            }
            try {
              const obs = await Promise.race([
                fetcher(userId),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error(`${platform} fetch timeout (${PER_PLATFORM_TIMEOUT_MS / 1000}s)`)), PER_PLATFORM_TIMEOUT_MS)
                ),
              ]);
              platformFetchResults[platform] = { observations: obs || [], error: null };
            } catch (err) {
              platformFetchResults[platform] = { observations: [], error: err };
            }
          })
        );
        log.info('Parallel fetch complete', {
          userId: userId.slice(0, 8),
          platforms: platforms.length,
          elapsed: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
        });

        // Single dedup pre-fetch for ALL platforms (1 DB query instead of N)
        const batchWindowMs = DEDUP_WINDOWS_MS.daily_summary; // 24 hours
        const batchCutoff = new Date(Date.now() - batchWindowMs).toISOString();
        const dedupSupabase = await getSupabase();
        const existingHashes = new Set();
        if (dedupSupabase) {
          const { data: recentMems } = await dedupSupabase
            .from('user_memories')
            .select('content, metadata')
            .eq('user_id', userId)
            .eq('memory_type', 'platform_data')
            .gte('created_at', batchCutoff)
            .limit(2000);
          for (const mem of (recentMems || [])) {
            const memPlatform = mem.metadata?.source || mem.metadata?.platform || '';
            existingHashes.add(contentHash(memPlatform, mem.content || ''));
          }
        }

        // ---- Phase 2: Sequential dedup + store per platform ----
        for (const platform of platforms) {
          if (isTimedOut()) break;
          const fetchResult = platformFetchResults[platform];
          if (fetchResult?.error) {
            const errMsg = `${platform} for user ${userId}: ${fetchResult.error.message}`;
            log.warn('Platform fetch error', { message: errMsg });
            stats.errors.push(errMsg);
            continue;
          }
          try {
            const observations = fetchResult?.observations || [];

            // Store each observation (with de-duplication)
            // Observations can be strings (legacy) or { content, contentType } objects (richer templates)
            let platformObsCount = 0; // track new obs for THIS platform in this run
            for (const obs of observations) {
              const content = typeof obs === 'string' ? obs : obs.content;
              const contentType = typeof obs === 'string' ? undefined : obs.contentType;

              // Skip invalid observations - empty/null content corrupts the memory stream
              if (!content || typeof content !== 'string' || content.trim() === '') {
                continue;
              }

              // Check pre-fetched hash set instead of per-observation DB query
              const hash = contentHash(platform, content);
              if (existingHashes.has(hash)) {
                continue;
              }

              // For weekly_summary observations the 24h batch window above is too short —
              // fall back to a targeted DB check using the full 7-day window.
              if (contentType === 'weekly_summary') {
                const dup = await isDuplicate(userId, platform, content, contentType);
                if (dup) continue;
              }

              const baseMeta = {
                ingestion_source: 'background',
                ingested_at: new Date().toISOString(),
                ...(contentType ? { content_type: contentType } : {}),
              };
              const result = await addPlatformObservation(userId, content, platform,
                tagSensitivity(content, { ...baseMeta, platform })
              );

              if (result) {
                userObsCount++;
                platformObsCount++;
                stats.observationsStored++;
                // Track newly stored hashes to prevent within-batch duplicates
                existingHashes.add(hash);
              }
            }

            // After storing observations for this platform, run platform-specific expert reflection.
            if (platformObsCount > 0) {
              runPlatformExpert(userId, platform).catch(err =>
                log.warn('Platform expert failed', { platform, userId, error: err })
              );

              // Check prospective memory condition triggers against new platform data.
              const platformMetrics = extractPlatformMetrics(platform, observations);
              const platformKeywords = extractObservationKeywords(observations);
              if (Object.keys(platformMetrics).length > 0 || platformKeywords.length > 0) {
                checkConditionTriggered(userId, {
                  platform,
                  data: platformMetrics,
                  keywords: platformKeywords,
                }).catch(err =>
                  log.warn('Prospective condition check failed (non-fatal)', { platform, userId, error: err })
                );
              }
            }

            // Update sync status for tracking (non-blocking)
            const syncSupabase = await getSupabase();
            if (syncSupabase) {
              const syncTimestamp = new Date().toISOString();
              const syncStatus = observations.length > 0 ? 'success' : 'no_new_data';

              syncSupabase
                .from('platform_connections')
                .update({
                  last_sync_at: syncTimestamp,
                  last_sync_status: syncStatus,
                  last_sync_error: null,
                  updated_at: syncTimestamp,
                })
                .eq('user_id', userId)
                .eq('platform', platform)
                .then(() => {});

              syncSupabase
                .from('nango_connection_mappings')
                .update({
                  last_synced_at: syncTimestamp,
                  status: syncStatus === 'success' ? 'active' : 'active',
                  updated_at: syncTimestamp,
                })
                .eq('user_id', userId)
                .eq('platform', platform)
                .then(() => {});
            }
          } catch (platformErr) {
            const errMsg = `${platform} for user ${userId}: ${platformErr.message}`;
            log.warn('Platform error', { message: errMsg });
            stats.errors.push(errMsg);
          }
        }

        // Web dwell-time: re-process any accumulated extension events from the last 25h
        try {
          const webEvents = await fetchRecentWebEvents(userId);
          if (webEvents.length > 0) {
            await ingestWebObservations(userId, webEvents);
            log.info('Web: ingested events', { count: webEvents.length, userId });
          }
        } catch (err) {
          log.warn('Web events failed (non-fatal)', { error: err });
        }

        stats.usersProcessed++;

        // After all platform data is ingested for this user, check reflection trigger
        if (userObsCount > 0) {
          stats.processedUserIds.push(userId);
          try {
            const shouldReflect = await shouldTriggerReflection(userId);
            if (shouldReflect) {
              log.info('Triggering reflections', { userId });
              // Run in background — don't block the ingestion loop
              generateReflections(userId)
                .then(count => {
                  // Chain wiki compilation after reflections settle (60s delay)
                  if (count > 0) {
                    const wikiTimer = setTimeout(() => {
                      compileWikiPages(userId).catch(err =>
                        log.warn('Wiki compilation error', { userId, error: err })
                      );
                    }, 60000);
                    wikiTimer.unref();
                  }
                })
                .catch(err =>
                  log.warn('Reflection error', { userId, error: err })
                );
              stats.reflectionsTriggered++;
            }
          } catch (reflErr) {
            log.warn('Reflection check failed', { userId, error: reflErr });
          }

          // After reflection trigger, also generate proactive insights
          generateProactiveInsights(userId).catch(err =>
            log.warn('Proactive insights failed', { userId, error: err })
          );

          // Evaluate nudge outcomes: check if user followed through on past suggestions (non-blocking)
          evaluateNudgeOutcomes(userId).catch(err =>
            log.warn('Nudge evaluation failed', { userId, error: err })
          );

          // Track goal progress from ingested platform data (non-blocking)
          trackGoalProgress(userId, null).catch(err =>
            log.warn('Goal tracking failed', { userId, error: err })
          );

          // Generate goal suggestions based on observed patterns (throttled: max once/24h)
          generateGoalSuggestions(userId).catch(err =>
            log.warn('Goal suggestions failed', { userId, error: err })
          );

          // Update activity metrics for all connected platforms (non-blocking)
          calculateAllActivityMetrics(userId).then(async () => {
            // After metrics updated, check for anomalies per platform
            try {
              const sb = await getSupabase();
              const { data: conns } = await sb.from('platform_connections')
                .select('platform, content_volume')
                .eq('user_id', userId)
                .in('status', ['connected', 'pending']);
              for (const conn of (conns || [])) {
                const anomaly = await detectActivityAnomaly(userId, conn.platform, conn.content_volume || 0);
                if (anomaly?.anomaly) {
                  // Store as proactive insight
                  await sb.from('proactive_insights').insert({
                    user_id: userId,
                    category: 'activity_anomaly',
                    content: anomaly.message,
                    urgency: 'medium',
                    metadata: { platform: conn.platform, zScore: anomaly.zScore, direction: anomaly.direction },
                  }).catch(() => {});
                }
              }
            } catch (e) {
              log.warn('Anomaly detection failed', { userId, error: e.message });
            }
          }).catch(err =>
            log.warn('Activity metrics update failed', { userId, error: err })
          );

          // Regenerate twin summary after a delay to allow reflections to complete
          const summaryTimer = setTimeout(() => {
            generateTwinSummary(userId).catch(err =>
              log.warn('Twin summary error', { userId, error: err })
            );
          }, 45000); // 45s delay: reflections have priority, then summary
          summaryTimer.unref();
        }
      } catch (userErr) {
        const errMsg = `User ${userId}: ${userErr.message}`;
        log.warn('User error', { message: errMsg });
        stats.errors.push(errMsg);
      }
    }
  } catch (error) {
    log.error('Fatal error', { error });
    stats.errors.push(`Fatal: ${error.message}`);
  }

  const durationMs = Date.now() - startTime;
  const elapsed = (durationMs / 1000).toFixed(1);
  log.info('Ingestion completed', {
    elapsed,
    usersProcessed: stats.usersProcessed,
    observationsStored: stats.observationsStored,
    reflectionsTriggered: stats.reflectionsTriggered,
    errors: stats.errors.length,
  });

  // Pre-warm caches for users who had new data stored (fire-and-forget)
  if (stats.observationsStored > 0) {
    import('./cacheWarmer.js').then(({ warmUserCaches }) => {
      for (const userId of stats.processedUserIds || []) {
        warmUserCaches(userId, 'observation-ingestion').catch(() => {});
      }
    }).catch(() => {});
  }

  // Log to ingestion_health_log
  try {
    const supabase = await getSupabase();
    if (supabase) {
      const { error: logError } = await supabase
        .from('ingestion_health_log')
        .insert({
          run_at: new Date(startTime).toISOString(),
          duration_ms: durationMs,
          users_processed: stats.usersProcessed,
          observations_stored: stats.observationsStored,
          reflections_triggered: stats.reflectionsTriggered,
          errors: stats.errors.length,
          error_details: stats.errors.length > 0 ? { messages: stats.errors } : null,
        });
      if (logError) {
        log.warn('Failed to log health record', { error: logError });
      }
    }
  } catch (healthLogErr) {
    log.warn('Health logging error (non-fatal)', { error: healthLogErr });
  }

  return stats;
}

// ====================================================================
// Scheduling
// ====================================================================

let ingestionInterval = null;

/**
 * Start the observation ingestion on a 10-minute interval.
 * For development: runs as setInterval.
 * For production: called via Vercel Cron endpoint.
 */
function startObservationIngestion() {
  if (ingestionInterval) {
    log.warn('Already running, skipping duplicate start');
    return;
  }

  const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

  log.info('Starting background ingestion (every 10 minutes)');

  // Run once on startup after a short delay (let tokens warm up)
  setTimeout(() => {
    runObservationIngestion().catch(err =>
      log.error('Initial run failed', { error: err })
    );
  }, 60 * 1000); // 1 minute delay

  // Then run on interval
  ingestionInterval = setInterval(() => {
    runObservationIngestion().catch(err =>
      log.error('Interval run failed', { error: err })
    );
  }, INTERVAL_MS);
}

/**
 * Stop the background ingestion interval.
 */
function stopObservationIngestion() {
  if (ingestionInterval) {
    clearInterval(ingestionInterval);
    ingestionInterval = null;
    log.info('Stopped background ingestion');
  }
}

/**
 * Post-onboarding trigger: runs a single ingestion pass for a user
 * who just completed onboarding.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function runPostOnboardingIngestion(userId) {
  if (!userId || !UUID_RE.test(userId)) {
    log.warn('runPostOnboardingIngestion: invalid userId', { userId });
    return { observationsStored: 0 };
  }
  log.info('Running post-onboarding ingestion', { userId });

  try {
    const supabase = await getSupabase();
    if (!supabase) return { observationsStored: 0 };

    // Find connected platforms for this user — check both platform_connections (legacy)
    // and nango_connection_mappings (primary OAuth flow via Nango)
    const [pcConnsRes, nangoConnsRes] = await Promise.all([
      supabase
        .from('platform_connections')
        .select('platform')
        .eq('user_id', userId)
        .not('connected_at', 'is', null)
        .in('platform', SUPPORTED_PLATFORMS),
      supabase
        .from('nango_connection_mappings')
        .select('platform')
        .eq('user_id', userId)
        .eq('status', 'active')
        .in('platform', SUPPORTED_PLATFORMS),
    ]);
    if (pcConnsRes.error) log.warn('platform_connections fetch error', { error: pcConnsRes.error });
    if (nangoConnsRes.error) log.warn('nango_connection_mappings fetch error', { error: nangoConnsRes.error });
    const pcConns = pcConnsRes.data || [];
    const nangoConns = nangoConnsRes.data || [];

    const platforms = [...new Set([
      ...pcConns.map(c => c.platform),
      ...nangoConns.map(c => c.platform),
    ])];

    if (platforms.length === 0) {
      return { observationsStored: 0 };
    }

    let totalStored = 0;
    for (const platform of platforms) {
      try {
        const fetcher = PLATFORM_FETCHERS[platform];
        const observations = fetcher ? await fetcher(userId) : [];

        for (const obs of observations) {
          const content = typeof obs === 'string' ? obs : obs.content;
          const contentType = typeof obs === 'string' ? undefined : obs.contentType;

          // Skip invalid observations - empty/null content corrupts the memory stream
          if (!content || typeof content !== 'string' || content.trim() === '') {
            continue;
          }

          const dup = await isDuplicate(userId, platform, content, contentType);
          if (dup) continue;

          const onboardMeta = {
            ingestion_source: 'post_onboarding',
            ingested_at: new Date().toISOString(),
            ...(contentType ? { content_type: contentType } : {}),
          };
          const result = await addPlatformObservation(userId, content, platform,
            tagSensitivity(content, { ...onboardMeta, platform })
          );
          if (result) totalStored++;
        }
      } catch (err) {
        log.warn('Post-onboarding platform error', { platform, error: err });
      }
    }

    // Seed memories from enrichment data for new users with thin memory streams.
    try {
      const supabaseForCount = await getSupabase();
      const { count, error: countErr } = await supabaseForCount
        .from('user_memories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (countErr) log.warn('Memory count error', { error: countErr });
      if ((count || 0) < 10) {
        const seedResult = await seedMemoriesFromEnrichment(userId);
        if (seedResult.memoriesStored > 0) {
          totalStored += seedResult.memoriesStored;
          log.info('Seeded memories from enrichment', { count: seedResult.memoriesStored, userId });
        }
      }
    } catch (err) {
      log.warn('Enrichment memory seeding error', { error: err });
    }

    // Trigger reflections if enough data
    if (totalStored > 0) {
      try {
        const shouldReflect = await shouldTriggerReflection(userId);
        if (shouldReflect) {
          generateReflections(userId)
            .then(count => {
              if (count > 0) {
                const wikiTimer = setTimeout(() => {
                  compileWikiPages(userId).catch(err =>
                    log.warn('Post-onboarding wiki compilation error', { error: err })
                  );
                }, 60000);
                wikiTimer.unref();
              }
            })
            .catch(err =>
              log.warn('Post-onboarding reflection error', { error: err })
            );
        }
      } catch { /* non-critical */ }

      // Generate proactive insights immediately — don't wait for cron
      generateProactiveInsights(userId).catch(err =>
        log.warn('Post-onboarding proactive insights error', { error: err })
      );

      generateGoalSuggestions(userId).catch(err =>
        log.warn('Post-onboarding goal suggestion error', { error: err })
      );

      const summaryTimer = setTimeout(() => {
        generateTwinSummary(userId).catch(err =>
          log.warn('Twin summary regeneration error', { error: err })
        );
      }, 30000); // 30s delay gives reflection engine time to complete
      summaryTimer.unref();
    }

    log.info('Post-onboarding: stored observations', { count: totalStored, userId });
    return { observationsStored: totalStored };
  } catch (err) {
    log.error('Post-onboarding error', { error: err });
    return { observationsStored: 0 };
  }
}

/**
 * Ingest location clusters as NL observations into the memory stream.
 * Called asynchronously after cluster upsert in POST /api/location/clusters.
 *
 * @param {string} userId
 * @param {Array} clusters - Cluster objects from mobile (centroid + visit patterns)
 */
export async function ingestLocationClusters(userId, clusters) {
  if (!clusters || clusters.length === 0) return;
  try {
    const sorted = [...clusters].sort((a, b) => (b.visit_count ?? 0) - (a.visit_count ?? 0));

    function hasNightHours(hours) {
      return (hours || []).some((h) => h < 7 || h >= 22);
    }
    function hasWorkHours(hours) {
      return (hours || []).some((h) => h >= 9 && h <= 18);
    }
    function isWeekdaysOnly(days) {
      return (days || []).length > 0 && (days || []).every((d) => d >= 1 && d <= 5);
    }
    function hasWeekend(days) {
      return (days || []).some((d) => d === 0 || d === 6);
    }

    const homeCluster = sorted.find(
      (c) => c.label_hint === 'home' || (hasNightHours(c.typical_hours) && (c.visit_count ?? 0) > 5)
    );
    const workCluster = sorted.find(
      (c) =>
        c.label_hint === 'work' ||
        (isWeekdaysOnly(c.typical_days) && hasWorkHours(c.typical_hours) && (c.visit_count ?? 0) > 3)
    );
    const weekendSpot = sorted.find(
      (c) => c !== homeCluster && c !== workCluster && hasWeekend(c.typical_days)
    );

    const observations = [];

    if (homeCluster && workCluster) {
      observations.push(
        'Has a clear home-work lifestyle split — two distinct recurring locations, one active during work hours (weekdays 9–18h) and one dominating evenings and weekends'
      );
    } else if (homeCluster) {
      observations.push(
        'Strong home-base pattern — most location activity centers around a primary home location with limited recurring external spots'
      );
    } else if (workCluster) {
      observations.push(
        'Consistent weekday routine with a fixed daytime location — suggests structured work schedule'
      );
    }

    if (weekendSpot) {
      const days = weekendSpot.typical_days || [];
      const dayName = days.includes(6) ? 'Saturdays' : 'Sundays';
      const hours = weekendSpot.typical_hours || [];
      const timeOfDay = hours.some((h) => h < 12) ? 'mornings' : 'afternoons';
      observations.push(
        `Has a recurring ${dayName} ${timeOfDay} spot — a regular haunt suggesting a consistent weekend ritual (gym, market, hobby, or social meetup)`
      );
    }

    if (sorted.length >= 4) {
      observations.push(
        `Frequents ${sorted.length} distinct recurring locations — an active person with varied routines across multiple regular spots`
      );
    } else if (sorted.length <= 2 && sorted.length > 0) {
      observations.push(
        'Location patterns show a routine-oriented lifestyle — two or fewer recurring spots suggesting consistent, predictable daily rhythms'
      );
    }

    for (const obs of observations) {
      await addPlatformObservation(userId, obs, 'location', { ingestion_source: 'location_clusters' });
    }

    log.info('Stored NL observations', { count: observations.length, userId });
  } catch (err) {
    log.error('ingestLocationClusters error', { error: err });
  }
}

export {
  runObservationIngestion,
  startObservationIngestion,
  stopObservationIngestion,
  runPostOnboardingIngestion,
  SUPPORTED_PLATFORMS,
  HEALTH_PLATFORMS,
  CALENDAR_PLATFORMS,
  MUSIC_PLATFORMS,
  extractPlatformMetrics,
  extractObservationKeywords,
};
