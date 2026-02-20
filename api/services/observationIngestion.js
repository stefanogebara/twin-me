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

import axios from 'axios';
import crypto from 'crypto';
import { getValidAccessToken } from './tokenRefresh.js';
import { addPlatformObservation } from './memoryStreamService.js';
import { shouldTriggerReflection, generateReflections } from './reflectionEngine.js';
import { generateProactiveInsights } from './proactiveInsights.js';
import { trackGoalProgress, generateGoalSuggestions } from './goalTrackingService.js';

// Lazy-load to avoid circular dependency
let supabaseAdmin = null;
async function getSupabase() {
  if (!supabaseAdmin) {
    const mod = await import('./database.js');
    supabaseAdmin = mod.supabaseAdmin;
  }
  return supabaseAdmin;
}

// Platforms we know how to ingest
const SUPPORTED_PLATFORMS = ['spotify', 'google_calendar', 'whoop'];

// ====================================================================
// De-duplication
// ====================================================================

/**
 * Generate a short hash for de-duplication.
 * We hash platform + first 100 chars of content to catch near-duplicates.
 */
function contentHash(platform, content) {
  return crypto
    .createHash('sha256')
    .update(`${platform}:${content.substring(0, 100)}`)
    .digest('hex')
    .substring(0, 16);
}

/**
 * Content-type-aware time windows for de-duplication.
 * Different observation types have different natural refresh rates.
 */
const DEDUP_WINDOWS_MS = {
  current_state: 1 * 60 * 60 * 1000,       // 1 hour
  trend: 4 * 60 * 60 * 1000,               // 4 hours
  daily_summary: 24 * 60 * 60 * 1000,      // 24 hours
  weekly_summary: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/**
 * Check if a similar observation already exists within the appropriate time window.
 * Uses content-type-aware windows when contentType is provided, defaults to 1 hour.
 *
 * @param {string} userId
 * @param {string} platform
 * @param {string} content
 * @param {string} [contentType] - 'current_state' | 'trend' | 'daily_summary' | 'weekly_summary'
 */
async function isDuplicate(userId, platform, content, contentType) {
  try {
    const supabase = await getSupabase();
    if (!supabase) return false;

    const windowMs = (contentType && DEDUP_WINDOWS_MS[contentType]) || DEDUP_WINDOWS_MS.current_state;
    const cutoff = new Date(Date.now() - windowMs).toISOString();

    const { data, error } = await supabase
      .from('user_memories')
      .select('id, content')
      .eq('user_id', userId)
      .eq('memory_type', 'platform_data')
      .gte('created_at', cutoff)
      .limit(50);

    if (error || !data) return false;

    // Check for exact or near-exact content match
    const newHash = contentHash(platform, content);
    for (const mem of data) {
      const meta = mem.content || '';
      if (contentHash(platform, meta) === newHash) {
        return true;
      }
    }

    return false;
  } catch (err) {
    console.warn('[ObservationIngestion] De-dup check failed, proceeding:', err.message);
    return false;
  }
}

// ====================================================================
// Platform-specific observation generators
// ====================================================================

/**
 * Fetch Spotify data and return natural-language observations.
 * Reuses the same API call patterns from twin-chat.js.
 */
async function fetchSpotifyObservations(userId) {
  const observations = [];

  const tokenResult = await getValidAccessToken(userId, 'spotify');
  if (!tokenResult.success || !tokenResult.accessToken) {
    console.warn('[ObservationIngestion] Spotify: no valid token for user', userId);
    return observations;
  }

  const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };

  // Currently playing
  try {
    const currentRes = await axios.get(
      'https://api.spotify.com/v1/me/player/currently-playing',
      { headers, timeout: 10000 }
    );
    if (currentRes.data?.item) {
      const track = currentRes.data.item.name;
      const artist = currentRes.data.item.artists?.[0]?.name || 'Unknown';
      observations.push(`Currently playing '${track}' by ${artist}`);
    }
  } catch (e) {
    // No current playback — that's fine
  }

  // Recently played (last hour only to avoid re-ingesting old data)
  try {
    const recentRes = await axios.get(
      'https://api.spotify.com/v1/me/player/recently-played?limit=10',
      { headers, timeout: 10000 }
    );

    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentTracks = (recentRes.data?.items || []).filter(item => {
      return new Date(item.played_at).getTime() > oneHourAgo;
    });

    for (const item of recentTracks) {
      const track = item.track?.name;
      const artist = item.track?.artists?.[0]?.name || 'Unknown';
      const playedAt = new Date(item.played_at);
      const timeStr = playedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      observations.push(`Listened to '${track}' by ${artist} at ${timeStr}`);
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Spotify recently-played error:', e.message);
  }

  // Top artists (short term) — generate one summary observation
  let topArtistNames = [];
  try {
    const topRes = await axios.get(
      'https://api.spotify.com/v1/me/top/artists?limit=5&time_range=short_term',
      { headers, timeout: 10000 }
    );
    const topArtists = topRes.data?.items || [];
    topArtistNames = topArtists.map(a => a.name);
    if (topArtists.length > 0) {
      observations.push(`Top artist this week: ${topArtists[0].name}`);
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Spotify top-artists error:', e.message);
  }

  // --- Richer observation templates ---

  // Time-of-day listening
  const hour = new Date().getHours();
  if (observations.length > 1) {
    if (hour >= 0 && hour < 5) {
      observations.push({ content: 'Late-night listening session (after midnight)', contentType: 'current_state' });
    } else if (hour >= 5 && hour < 7) {
      observations.push({ content: 'Early morning music ritual (before 7am)', contentType: 'current_state' });
    }
  }

  // New artist discovery: compare recent track artists vs top artists
  if (topArtistNames.length > 0) {
    try {
      const recentRes = await axios.get(
        'https://api.spotify.com/v1/me/player/recently-played?limit=10',
        { headers, timeout: 10000 }
      );
      const recentItems = recentRes.data?.items || [];
      const recentArtists = recentItems.map(item => item.track?.artists?.[0]?.name).filter(Boolean);
      const topSet = new Set(topArtistNames.map(n => n.toLowerCase()));
      for (const artist of recentArtists) {
        if (!topSet.has(artist.toLowerCase())) {
          observations.push({ content: `Discovered new artist: ${artist}`, contentType: 'daily_summary' });
          break; // Only report one new discovery per ingestion
        }
      }
    } catch (e) {
      // Ignore - we already fetched recent tracks above
    }
  }

  // Session density: if multiple tracks in recent list
  try {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentRes = await axios.get(
      'https://api.spotify.com/v1/me/player/recently-played?limit=10',
      { headers, timeout: 10000 }
    );
    const recentTracks = (recentRes.data?.items || []).filter(item =>
      new Date(item.played_at).getTime() > oneHourAgo
    );
    if (recentTracks.length >= 4) {
      observations.push({ content: `Extended listening session (${recentTracks.length} tracks recently)`, contentType: 'current_state' });
    }
  } catch (e) {
    // Ignore
  }

  return observations;
}

/**
 * Fetch Google Calendar data and return natural-language observations.
 * Reuses the same API call patterns from twin-chat.js.
 */
async function fetchCalendarObservations(userId) {
  const observations = [];

  const tokenResult = await getValidAccessToken(userId, 'google_calendar');
  if (!tokenResult.success || !tokenResult.accessToken) {
    console.warn('[ObservationIngestion] Calendar: no valid token for user', userId);
    return observations;
  }

  try {
    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const calRes = await axios.get(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
        params: {
          timeMin: now.toISOString(),
          timeMax: todayEnd.toISOString(),
          maxResults: 10,
          singleEvents: true,
          orderBy: 'startTime',
        },
        timeout: 10000,
      }
    );

    const events = calRes.data?.items || [];
    for (const e of events) {
      const title = e.summary || 'Untitled event';
      const startRaw = e.start?.dateTime || e.start?.date;
      const endRaw = e.end?.dateTime || e.end?.date;

      if (startRaw && endRaw) {
        const startTime = new Date(startRaw).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const endTime = new Date(endRaw).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        observations.push(`Has a meeting '${title}' from ${startTime} to ${endTime}`);
      } else if (startRaw) {
        observations.push(`Has an all-day event '${title}'`);
      }
    }

    // Detect free afternoon
    if (events.length === 0) {
      const hourNow = now.getHours();
      if (hourNow >= 12) {
        observations.push(`Free afternoon - no meetings after ${hourNow}:00`);
      }
    } else {
      const lastEventEnd = events[events.length - 1]?.end?.dateTime;
      if (lastEventEnd) {
        const lastEnd = new Date(lastEventEnd);
        if (lastEnd.getHours() < 17) {
          const freeFrom = lastEnd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          observations.push(`Free afternoon - no meetings after ${freeFrom}`);
        }
      }
    }

    // --- Richer observation templates ---

    // Workload assessment: heavy meeting day
    if (events.length >= 5) {
      observations.push({ content: `Heavy meeting day: ${events.length} meetings scheduled`, contentType: 'daily_summary' });
    }

    // Back-to-back detection: events where one ends and next starts within 15 minutes
    for (let i = 0; i < events.length - 1; i++) {
      const currentEnd = events[i].end?.dateTime;
      const nextStart = events[i + 1].start?.dateTime;
      if (currentEnd && nextStart) {
        const gapMs = new Date(nextStart).getTime() - new Date(currentEnd).getTime();
        if (gapMs >= 0 && gapMs <= 15 * 60 * 1000) {
          const currentTitle = events[i].summary || 'meeting';
          const nextTitle = events[i + 1].summary || 'meeting';
          observations.push({ content: `Back-to-back meetings: '${currentTitle}' then '${nextTitle}' with ${Math.round(gapMs / 60000)} min gap`, contentType: 'current_state' });
        }
      }
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Calendar error:', e.message);
  }

  return observations;
}

/**
 * Fetch Whoop data and return natural-language observations.
 * Handles both NANGO_MANAGED and self-managed tokens, same as twin-chat.js.
 */
async function fetchWhoopObservations(userId) {
  const observations = [];

  try {
    const supabase = await getSupabase();
    if (!supabase) return observations;

    // Check if connection is NANGO_MANAGED
    const { data: whoopConn } = await supabase
      .from('platform_connections')
      .select('access_token')
      .eq('user_id', userId)
      .eq('platform', 'whoop')
      .single();

    let recoveryData = null;
    let sleepRecords = [];

    let allRecoveryRecords = [];

    if (whoopConn?.access_token === 'NANGO_MANAGED') {
      // Use Nango proxy
      const nangoService = await import('./nangoService.js');
      const [recoveryResult, sleepResult] = await Promise.all([
        nangoService.whoop.getRecovery(userId, 3),
        nangoService.whoop.getSleep(userId, 5),
      ]);
      allRecoveryRecords = recoveryResult.success ? (recoveryResult.data?.records || []) : [];
      recoveryData = allRecoveryRecords[0] || null;
      sleepRecords = sleepResult.success ? (sleepResult.data?.records || []) : [];
    } else {
      // Self-managed token — direct API
      const tokenResult = await getValidAccessToken(userId, 'whoop');
      if (!tokenResult.success || !tokenResult.accessToken) {
        console.warn('[ObservationIngestion] Whoop: no valid token for user', userId);
        return observations;
      }
      const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };
      const [recoveryRes, sleepRes] = await Promise.all([
        axios.get('https://api.prod.whoop.com/developer/v2/recovery?limit=3', { headers, timeout: 10000 }),
        axios.get('https://api.prod.whoop.com/developer/v2/activity/sleep?limit=5', { headers, timeout: 10000 }),
      ]);
      allRecoveryRecords = recoveryRes.data?.records || [];
      recoveryData = allRecoveryRecords[0] || null;
      sleepRecords = sleepRes.data?.records || [];
    }

    // Process recovery
    if (recoveryData?.score) {
      const score = recoveryData.score.recovery_score;
      const hrv = recoveryData.score.hrv_rmssd_milli
        ? Math.round(recoveryData.score.hrv_rmssd_milli)
        : null;

      // Calculate sleep from recent records
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const todaysSleeps = sleepRecords.filter(s => new Date(s.end) >= yesterday);

      let totalSleepMs = 0;
      todaysSleeps.forEach(sleep => {
        const stageSummary = sleep.score?.stage_summary || {};
        totalSleepMs += sleep.score?.total_sleep_time_milli ||
          (stageSummary.total_in_bed_time_milli - (stageSummary.total_awake_time_milli || 0)) ||
          stageSummary.total_in_bed_time_milli || 0;
      });

      const sleepHours = (totalSleepMs / (1000 * 60 * 60)).toFixed(1);

      // Build recovery level label
      let level = 'moderate';
      if (score >= 67) level = 'green';
      else if (score <= 33) level = 'red';

      const parts = [`Recovery score: ${score}% (${level})`];
      if (parseFloat(sleepHours) > 0) parts.push(`Slept ${sleepHours}h`);
      if (hrv) parts.push(`HRV: ${hrv}ms`);

      observations.push(parts.join('. '));
    }

    // Strain observation (if available from recovery data)
    if (recoveryData?.score?.user_calibrating === false) {
      // Strain is on the cycle, not recovery — skip unless we fetch it separately
      // For now, we only generate recovery observations
    }

    // --- Richer observation templates ---

    // Trend analysis: if 3 recovery records, compute trend
    if (allRecoveryRecords.length >= 3) {
      const scores = allRecoveryRecords
        .slice(0, 3)
        .map(r => r.score?.recovery_score)
        .filter(s => s != null);
      if (scores.length === 3) {
        const trend = scores[0] > scores[2] ? 'up' : scores[0] < scores[2] ? 'down' : 'stable';
        // scores[0] is most recent, scores[2] is oldest
        observations.push({ content: `Recovery trending ${trend}: ${scores[2]}% -> ${scores[1]}% -> ${scores[0]}% over 3 days`, contentType: 'trend' });
      }
    }

    // Strain-recovery balance: high strain with low recovery
    if (recoveryData?.score) {
      const strain = recoveryData.score.strain_score || 0;
      const recovery = recoveryData.score.recovery_score || 0;
      if (strain > 15 && recovery < 40) {
        observations.push({ content: 'High strain with low recovery - body under load', contentType: 'current_state' });
      }
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Whoop error:', e.message);
  }

  return observations;
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
async function runObservationIngestion() {
  console.log('[ObservationIngestion] Starting ingestion run...');
  const startTime = Date.now();

  const stats = {
    usersProcessed: 0,
    observationsStored: 0,
    reflectionsTriggered: 0,
    errors: [],
  };

  try {
    const supabase = await getSupabase();
    if (!supabase) {
      console.warn('[ObservationIngestion] Database not available, skipping');
      return stats;
    }

    // Find all users with at least one active platform connection
    const { data: connections, error: connErr } = await supabase
      .from('platform_connections')
      .select('user_id, platform')
      .not('connected_at', 'is', null)
      .in('platform', SUPPORTED_PLATFORMS);

    if (connErr || !connections || connections.length === 0) {
      console.log('[ObservationIngestion] No active platform connections found');
      return stats;
    }

    // Group connections by user
    const userPlatforms = new Map();
    for (const conn of connections) {
      if (!userPlatforms.has(conn.user_id)) {
        userPlatforms.set(conn.user_id, []);
      }
      userPlatforms.get(conn.user_id).push(conn.platform);
    }

    console.log(`[ObservationIngestion] Found ${userPlatforms.size} users with ${connections.length} connections`);

    // Process each user
    for (const [userId, platforms] of userPlatforms) {
      try {
        let userObsCount = 0;

        for (const platform of platforms) {
          try {
            // Fetch observations from platform
            let observations = [];
            switch (platform) {
              case 'spotify':
                observations = await fetchSpotifyObservations(userId);
                break;
              case 'google_calendar':
                observations = await fetchCalendarObservations(userId);
                break;
              case 'whoop':
                observations = await fetchWhoopObservations(userId);
                break;
            }

            // Store each observation (with de-duplication)
            // Observations can be strings (legacy) or { content, contentType } objects (richer templates)
            for (const obs of observations) {
              const content = typeof obs === 'string' ? obs : obs.content;
              const contentType = typeof obs === 'string' ? undefined : obs.contentType;
              const duplicate = await isDuplicate(userId, platform, content, contentType);
              if (duplicate) {
                continue;
              }

              const result = await addPlatformObservation(userId, content, platform, {
                ingestion_source: 'background',
                ingested_at: new Date().toISOString(),
                ...(contentType ? { content_type: contentType } : {}),
              });

              if (result) {
                userObsCount++;
                stats.observationsStored++;
              }
            }
          } catch (platformErr) {
            const errMsg = `${platform} for user ${userId}: ${platformErr.message}`;
            console.warn(`[ObservationIngestion] Platform error - ${errMsg}`);
            stats.errors.push(errMsg);
          }
        }

        stats.usersProcessed++;

        // After all platform data is ingested for this user, check reflection trigger
        if (userObsCount > 0) {
          try {
            const shouldReflect = await shouldTriggerReflection(userId);
            if (shouldReflect) {
              console.log(`[ObservationIngestion] Triggering reflections for user ${userId}`);
              // Run in background — don't block the ingestion loop
              generateReflections(userId).catch(err =>
                console.warn(`[ObservationIngestion] Reflection error for ${userId}:`, err.message)
              );
              stats.reflectionsTriggered++;
            }
          } catch (reflErr) {
            console.warn(`[ObservationIngestion] Reflection check failed for ${userId}:`, reflErr.message);
          }

          // After reflection trigger, also generate proactive insights
          generateProactiveInsights(userId).catch(err =>
            console.warn(`[ObservationIngestion] Proactive insights failed for ${userId}:`, err.message)
          );

          // Track goal progress from ingested platform data (non-blocking)
          trackGoalProgress(userId, null).catch(err =>
            console.warn(`[ObservationIngestion] Goal tracking failed for ${userId}:`, err.message)
          );

          // Generate goal suggestions based on observed patterns (throttled: max once/24h)
          generateGoalSuggestions(userId).catch(err =>
            console.warn(`[ObservationIngestion] Goal suggestions failed for ${userId}:`, err.message)
          );
        }
      } catch (userErr) {
        const errMsg = `User ${userId}: ${userErr.message}`;
        console.warn(`[ObservationIngestion] User error - ${errMsg}`);
        stats.errors.push(errMsg);
      }
    }
  } catch (error) {
    console.error('[ObservationIngestion] Fatal error:', error.message);
    stats.errors.push(`Fatal: ${error.message}`);
  }

  const durationMs = Date.now() - startTime;
  const elapsed = (durationMs / 1000).toFixed(1);
  console.log(
    `[ObservationIngestion] Completed in ${elapsed}s: ` +
    `${stats.usersProcessed} users, ${stats.observationsStored} observations, ` +
    `${stats.reflectionsTriggered} reflections, ${stats.errors.length} errors`
  );

  // Log to ingestion_health_log (4E - Production Hardening)
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
        console.warn('[ObservationIngestion] Failed to log health record:', logError.message);
      }
    }
  } catch (healthLogErr) {
    console.warn('[ObservationIngestion] Health logging error (non-fatal):', healthLogErr.message);
  }

  return stats;
}

// ====================================================================
// Scheduling
// ====================================================================

let ingestionInterval = null;

/**
 * Start the observation ingestion on a 30-minute interval.
 * For development: runs as setInterval.
 * For production: called via Vercel Cron endpoint.
 */
function startObservationIngestion() {
  if (ingestionInterval) {
    console.warn('[ObservationIngestion] Already running, skipping duplicate start');
    return;
  }

  const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

  console.log('[ObservationIngestion] Starting background ingestion (every 10 minutes)');

  // Run once on startup after a short delay (let tokens warm up)
  setTimeout(() => {
    runObservationIngestion().catch(err =>
      console.error('[ObservationIngestion] Initial run failed:', err.message)
    );
  }, 60 * 1000); // 1 minute delay

  // Then run on interval
  ingestionInterval = setInterval(() => {
    runObservationIngestion().catch(err =>
      console.error('[ObservationIngestion] Interval run failed:', err.message)
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
    console.log('[ObservationIngestion] Stopped background ingestion');
  }
}

/**
 * Post-onboarding trigger: runs a single ingestion pass for a user
 * who just completed onboarding. This ensures platform data is immediately
 * available for the twin to use in the first conversation.
 */
async function runPostOnboardingIngestion(userId) {
  console.log(`[ObservationIngestion] Running post-onboarding ingestion for user ${userId}`);

  try {
    const supabase = await getSupabase();
    if (!supabase) return { observationsStored: 0 };

    // Find connected platforms for this user
    const { data: connections } = await supabase
      .from('platform_connections')
      .select('platform')
      .eq('user_id', userId)
      .not('connected_at', 'is', null)
      .in('platform', SUPPORTED_PLATFORMS);

    if (!connections || connections.length === 0) {
      return { observationsStored: 0 };
    }

    let totalStored = 0;
    for (const conn of connections) {
      try {
        let observations = [];
        switch (conn.platform) {
          case 'spotify':
            observations = await fetchSpotifyObservations(userId);
            break;
          case 'google_calendar':
            observations = await fetchCalendarObservations(userId);
            break;
          case 'whoop':
            observations = await fetchWhoopObservations(userId);
            break;
        }

        for (const obs of observations) {
          const content = typeof obs === 'string' ? obs : obs.content;
          const contentType = typeof obs === 'string' ? undefined : obs.contentType;
          const dup = await isDuplicate(userId, conn.platform, content, contentType);
          if (dup) continue;

          const result = await addPlatformObservation(userId, content, conn.platform, {
            ingestion_source: 'post_onboarding',
            ingested_at: new Date().toISOString(),
            ...(contentType ? { content_type: contentType } : {}),
          });
          if (result) totalStored++;
        }
      } catch (err) {
        console.warn(`[ObservationIngestion] Post-onboarding ${conn.platform} error:`, err.message);
      }
    }

    // Trigger reflections if enough data
    if (totalStored > 0) {
      try {
        const shouldReflect = await shouldTriggerReflection(userId);
        if (shouldReflect) {
          generateReflections(userId).catch(err =>
            console.warn(`[ObservationIngestion] Post-onboarding reflection error:`, err.message)
          );
        }
      } catch { /* non-critical */ }

      generateGoalSuggestions(userId).catch(err =>
        console.warn(`[ObservationIngestion] Post-onboarding goal suggestion error:`, err.message)
      );
    }

    console.log(`[ObservationIngestion] Post-onboarding: stored ${totalStored} observations for user ${userId}`);
    return { observationsStored: totalStored };
  } catch (err) {
    console.error(`[ObservationIngestion] Post-onboarding error:`, err.message);
    return { observationsStored: 0 };
  }
}

export {
  runObservationIngestion,
  startObservationIngestion,
  stopObservationIngestion,
  fetchSpotifyObservations,
  fetchCalendarObservations,
  fetchWhoopObservations,
  runPostOnboardingIngestion,
};
