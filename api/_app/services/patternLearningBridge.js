/**
 * Pattern Learning Bridge
 *
 * Unified service to push platform data into the Pattern Learning System.
 * Call this from any data extraction service to enable automatic pattern discovery.
 *
 * Supported platforms:
 * - Whoop: recovery, sleep, strain, workout data
 * - Spotify: track plays with audio features
 * - Google Calendar: events, meetings
 * - Discord: messages, voice activity
 * - GitHub: commits, activity
 */

import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('PatternLearningBridge');

/**
 * Push a raw event to the pattern learning system
 * @param {string} userId - User ID
 * @param {string} platform - Platform name (spotify, whoop, google_calendar, etc.)
 * @param {string} eventType - Event type (track_played, recovery_logged, event_scheduled, etc.)
 * @param {Object} eventData - The raw event data with metrics
 * @param {Date|string} timestamp - When the event occurred
 * @param {Object} context - Additional context (time_of_day, day_of_week, etc.)
 * @returns {Object} - Result with event ID
 */
export async function pushRawEvent(userId, platform, eventType, eventData, timestamp = new Date(), context = null) {
  try {
    const eventTimestamp = timestamp instanceof Date ? timestamp : new Date(timestamp);

    // Build context if not provided
    const eventContext = context || buildContext(eventTimestamp);

    const { data, error } = await supabaseAdmin
      .from('pl_raw_behavioral_events')
      .insert({
        user_id: userId,
        platform,
        event_type: eventType,
        event_data: eventData,
        event_timestamp: eventTimestamp.toISOString(),
        context: eventContext
      })
      .select('id')
      .single();

    if (error) {
      // Ignore duplicate errors (same event already logged)
      if (error.code === '23505') {
        return { success: true, duplicate: true };
      }
      log.error(`Error pushing ${platform}/${eventType}:`, error.message);
      return { success: false, error: error.message };
    }

    return { success: true, eventId: data.id };
  } catch (err) {
    log.error(`Error:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Build context object from timestamp
 */
function buildContext(timestamp) {
  const hour = timestamp.getHours();

  let timeOfDay = 'night';
  if (hour >= 5 && hour < 12) timeOfDay = 'morning';
  else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
  else if (hour >= 17 && hour < 21) timeOfDay = 'evening';

  return {
    day_of_week: timestamp.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase(),
    time_of_day: timeOfDay,
    hour,
    timestamp: timestamp.toISOString()
  };
}

// ============================================================================
// WHOOP DATA BRIDGE
// ============================================================================

/**
 * Push Whoop recovery data to pattern learning
 */
export async function pushWhoopRecovery(userId, recoveryData, timestamp = new Date()) {
  const eventData = {
    recovery: {
      score: recoveryData.score ?? recoveryData.recovery_score,
      hrv: recoveryData.hrv ?? recoveryData.hrv_rmssd_milli,
      restingHeartRate: recoveryData.rhr ?? recoveryData.resting_heart_rate,
      spo2: recoveryData.spo2_percentage,
      skinTemp: recoveryData.skin_temp_celsius
    },
    cycle_id: recoveryData.cycle_id,
    sleep_id: recoveryData.sleep_id
  };

  return pushRawEvent(userId, 'whoop', 'recovery_logged', eventData, timestamp);
}

/**
 * Push Whoop sleep data to pattern learning
 */
export async function pushWhoopSleep(userId, sleepData, timestamp = new Date()) {
  const eventData = {
    sleep: {
      totalSleepHours: sleepData.total_sleep_time_milli ? sleepData.total_sleep_time_milli / 3600000 : null,
      efficiency: sleepData.sleep_efficiency,
      remSleepHours: sleepData.rem_sleep_time_milli ? sleepData.rem_sleep_time_milli / 3600000 : null,
      deepSleepHours: sleepData.slow_wave_sleep_time_milli ? sleepData.slow_wave_sleep_time_milli / 3600000 : null,
      lightSleepHours: sleepData.light_sleep_time_milli ? sleepData.light_sleep_time_milli / 3600000 : null,
      awakeHours: sleepData.awake_time_milli ? sleepData.awake_time_milli / 3600000 : null,
      disturbances: sleepData.disturbance_count,
      respiratoryRate: sleepData.respiratory_rate
    },
    sleep_id: sleepData.id
  };

  return pushRawEvent(userId, 'whoop', 'sleep_logged', eventData, timestamp);
}

/**
 * Push Whoop strain data to pattern learning
 */
export async function pushWhoopStrain(userId, strainData, timestamp = new Date()) {
  const eventData = {
    strain: {
      score: strainData.strain ?? strainData.score,
      averageHeartRate: strainData.average_heart_rate,
      maxHeartRate: strainData.max_heart_rate,
      kilojoules: strainData.kilojoule
    },
    cycle_id: strainData.cycle_id
  };

  return pushRawEvent(userId, 'whoop', 'strain_logged', eventData, timestamp);
}

/**
 * Push Whoop workout data to pattern learning
 */
export async function pushWhoopWorkout(userId, workoutData, timestamp = new Date()) {
  const eventData = {
    workout: {
      strain: workoutData.strain ?? workoutData.score,
      averageHeartRate: workoutData.average_heart_rate,
      maxHeartRate: workoutData.max_heart_rate,
      calories: workoutData.kilojoule ? Math.round(workoutData.kilojoule * 0.239) : null,
      durationMinutes: workoutData.duration_milli ? workoutData.duration_milli / 60000 : null,
      sportId: workoutData.sport_id,
      zone1: workoutData.zone_zero_milli,
      zone2: workoutData.zone_one_milli,
      zone3: workoutData.zone_two_milli,
      zone4: workoutData.zone_three_milli,
      zone5: workoutData.zone_four_milli
    },
    workout_id: workoutData.id
  };

  return pushRawEvent(userId, 'whoop', 'workout_logged', eventData, timestamp);
}

// ============================================================================
// SPOTIFY DATA BRIDGE
// ============================================================================

/**
 * Push Spotify track play to pattern learning
 */
export async function pushSpotifyTrackPlay(userId, trackData, audioFeatures, timestamp = new Date()) {
  const eventData = {
    track: {
      id: trackData.id,
      name: trackData.name,
      artist: trackData.artists?.[0]?.name || trackData.artist_name,
      album: trackData.album?.name || trackData.album_name,
      durationMs: trackData.duration_ms,
      // Audio features (the key metrics for pattern learning)
      valence: audioFeatures?.valence,
      energy: audioFeatures?.energy,
      danceability: audioFeatures?.danceability,
      tempo: audioFeatures?.tempo,
      acousticness: audioFeatures?.acousticness,
      instrumentalness: audioFeatures?.instrumentalness,
      loudness: audioFeatures?.loudness,
      speechiness: audioFeatures?.speechiness,
      liveness: audioFeatures?.liveness,
      mode: audioFeatures?.mode,
      key: audioFeatures?.key
    },
    played_at: timestamp instanceof Date ? timestamp.toISOString() : timestamp
  };

  return pushRawEvent(userId, 'spotify', 'track_played', eventData, timestamp);
}

/**
 * Push batch of Spotify tracks (for recently played)
 */
export async function pushSpotifyTracksBatch(userId, tracks) {
  const results = { success: 0, failed: 0, duplicates: 0 };

  for (const item of tracks) {
    const track = item.track || item;
    const audioFeatures = item.audio_features || track.audio_features;
    const playedAt = item.played_at ? new Date(item.played_at) : new Date();

    const result = await pushSpotifyTrackPlay(userId, track, audioFeatures, playedAt);

    if (result.success) {
      if (result.duplicate) {
        results.duplicates++;
      } else {
        results.success++;
      }
    } else {
      results.failed++;
    }
  }

  return results;
}

// ============================================================================
// CALENDAR DATA BRIDGE
// ============================================================================

/**
 * Push Google Calendar event to pattern learning
 */
export async function pushCalendarEvent(userId, eventData, timestamp = new Date()) {
  const startTime = eventData.start?.dateTime || eventData.start?.date;
  const endTime = eventData.end?.dateTime || eventData.end?.date;

  let durationMinutes = null;
  if (startTime && endTime) {
    durationMinutes = (new Date(endTime) - new Date(startTime)) / 60000;
  }

  const data = {
    event: {
      id: eventData.id,
      summary: eventData.summary,
      description: eventData.description?.substring(0, 500),
      location: eventData.location,
      startTime,
      endTime,
      durationMinutes,
      isAllDay: !!eventData.start?.date,
      attendeeCount: eventData.attendees?.length || 0,
      hasVideoConference: !!(eventData.conferenceData || eventData.hangoutLink),
      status: eventData.status,
      visibility: eventData.visibility,
      recurringEventId: eventData.recurringEventId
    }
  };

  const eventType = durationMinutes > 0 ? 'event_scheduled' : 'event_created';
  return pushRawEvent(userId, 'google_calendar', eventType, data, startTime ? new Date(startTime) : timestamp);
}

/**
 * Push daily calendar summary
 */
export async function pushCalendarDailySummary(userId, date, events) {
  const meetings = events.filter(e => (e.attendees?.length || 0) > 0);
  const focusBlocks = events.filter(e =>
    (e.summary?.toLowerCase().includes('focus') ||
     e.summary?.toLowerCase().includes('deep work') ||
     e.summary?.toLowerCase().includes('block'))
  );

  let totalMeetingMinutes = 0;
  for (const meeting of meetings) {
    const start = meeting.start?.dateTime || meeting.start?.date;
    const end = meeting.end?.dateTime || meeting.end?.date;
    if (start && end) {
      totalMeetingMinutes += (new Date(end) - new Date(start)) / 60000;
    }
  }

  const data = {
    daily_meeting_count: meetings.length,
    daily_meeting_hours: totalMeetingMinutes / 60,
    daily_event_count: events.length,
    daily_focus_hours: focusBlocks.reduce((sum, e) => {
      const start = e.start?.dateTime || e.start?.date;
      const end = e.end?.dateTime || e.end?.date;
      if (start && end) {
        return sum + (new Date(end) - new Date(start)) / 3600000;
      }
      return sum;
    }, 0)
  };

  return pushRawEvent(userId, 'calendar', 'daily_summary', data, date);
}

// ============================================================================
// DISCORD DATA BRIDGE
// ============================================================================

/**
 * Push Discord activity summary
 */
export async function pushDiscordActivity(userId, activityData, timestamp = new Date()) {
  const data = {
    daily_messages: activityData.messageCount,
    daily_voice_minutes: activityData.voiceMinutes,
    servers_active: activityData.serversActive,
    channels_active: activityData.channelsActive,
    reactions_given: activityData.reactionsGiven,
    mentions_received: activityData.mentionsReceived
  };

  return pushRawEvent(userId, 'discord', 'daily_summary', data, timestamp);
}

// ============================================================================
// GITHUB DATA BRIDGE
// ============================================================================

/**
 * Push GitHub activity summary
 */
export async function pushGitHubActivity(userId, activityData, timestamp = new Date()) {
  const data = {
    daily_commits: activityData.commits,
    daily_additions: activityData.additions,
    daily_deletions: activityData.deletions,
    repos_active: activityData.reposActive,
    prs_opened: activityData.prsOpened,
    prs_merged: activityData.prsMerged,
    issues_opened: activityData.issuesOpened,
    issues_closed: activityData.issuesClosed
  };

  return pushRawEvent(userId, 'github', 'daily_summary', data, timestamp);
}

// ============================================================================
// BULK SYNC UTILITIES
// ============================================================================

/**
 * Sync existing platform data to pattern learning (for initial setup)
 * Call this once to backfill historical data
 */
export async function syncExistingPlatformData(userId, platform, days = 90) {
  log.info(`Syncing ${days} days of ${platform} data for user ${userId}`);

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  let synced = 0;

  try {
    switch (platform) {
      case 'spotify':
        synced = await syncSpotifyData(userId, startDate);
        break;
      case 'whoop':
        synced = await syncWhoopData(userId, startDate);
        break;
      case 'google_calendar':
      case 'calendar':
        synced = await syncCalendarData(userId, startDate);
        break;
      default:
        log.info(`No sync handler for ${platform}`);
    }

    log.info(`Synced ${synced} ${platform} events`);
    return { success: true, synced };
  } catch (error) {
    log.error(`Sync error for ${platform}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Sync Spotify listening data from both spotify_listening_data table and user_platform_data
 */
async function syncSpotifyData(userId, startDate) {
  let synced = 0;

  // 1. Try dedicated spotify_listening_data table first
  const { data: tracks } = await supabaseAdmin
    .from('spotify_listening_data')
    .select('*')
    .eq('user_id', userId)
    .gte('played_at', startDate.toISOString());

  if (tracks && tracks.length > 0) {
    for (const track of tracks) {
      const audioFeatures = typeof track.audio_features === 'string'
        ? JSON.parse(track.audio_features)
        : track.audio_features;

      const result = await pushSpotifyTrackPlay(
        userId,
        {
          id: track.track_id,
          name: track.track_name,
          artist_name: track.artist_name,
          album_name: track.album_name,
          duration_ms: track.duration_ms
        },
        audioFeatures,
        track.played_at
      );

      if (result.success && !result.duplicate) synced++;
    }
  }

  // 2. Also check user_platform_data for Spotify batches (recently_played, top_tracks)
  // Use pagination to avoid timeout on large datasets
  log.info(`Checking user_platform_data for Spotify (batched)...`);

  const BATCH_SIZE = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: platformData, error: platformError } = await supabaseAdmin
      .from('user_platform_data')
      .select('id, raw_data, extracted_at, data_type')
      .eq('user_id', userId)
      .eq('platform', 'spotify')
      .in('data_type', ['recently_played', 'top_tracks', 'current_playing'])
      .gte('extracted_at', startDate.toISOString())
      .order('extracted_at', { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1);

    if (platformError) {
      log.error(`user_platform_data query error:`, platformError);
      break;
    }

    if (!platformData || platformData.length === 0) {
      hasMore = false;
      continue;
    }

    log.info(`Processing batch of ${platformData.length} Spotify records (offset ${offset})`);

    for (const record of platformData) {
      const rawData = record.raw_data;

      // Handle batch format with items array (recently_played, top_tracks)
      if (rawData?.items && Array.isArray(rawData.items)) {
        for (const item of rawData.items) {
          const track = item.track || item;
          const playedAt = item.played_at ? new Date(item.played_at) : new Date(record.extracted_at);

          const result = await pushSpotifyTrackPlay(
            userId,
            {
              id: track.id,
              name: track.name,
              artists: track.artists,
              album: track.album,
              duration_ms: track.duration_ms
            },
            track.audio_features || null,
            playedAt
          );

          if (result.success && !result.duplicate) synced++;
        }
      }
      // Handle single track format (current_playing)
      else if (rawData?.item && typeof rawData === 'object') {
        const track = rawData.item;
        if (track?.id) {
          const result = await pushSpotifyTrackPlay(
            userId,
            {
              id: track.id,
              name: track.name,
              artists: track.artists,
              album: track.album,
              duration_ms: track.duration_ms
            },
            null,
            record.extracted_at
          );

          if (result.success && !result.duplicate) synced++;
        }
      }
    }

    offset += BATCH_SIZE;
    hasMore = platformData.length === BATCH_SIZE;
  }

  return synced;
}

/**
 * Sync Whoop data from user_platform_data
 */
async function syncWhoopData(userId, startDate) {
  // Try to find Whoop data in various possible tables
  const { data: platformData } = await supabaseAdmin
    .from('user_platform_data')
    .select('*')
    .eq('user_id', userId)
    .eq('platform', 'whoop')
    .gte('extracted_at', startDate.toISOString());

  if (!platformData || platformData.length === 0) return 0;

  let synced = 0;
  for (const record of platformData) {
    const rawData = record.raw_data;
    const dataType = record.data_type;

    let result;
    if (dataType.includes('recovery')) {
      result = await pushWhoopRecovery(userId, rawData, record.extracted_at);
    } else if (dataType.includes('sleep')) {
      result = await pushWhoopSleep(userId, rawData, record.extracted_at);
    } else if (dataType.includes('strain')) {
      result = await pushWhoopStrain(userId, rawData, record.extracted_at);
    } else if (dataType.includes('workout')) {
      result = await pushWhoopWorkout(userId, rawData, record.extracted_at);
    }

    if (result?.success && !result?.duplicate) synced++;
  }

  return synced;
}

/**
 * Sync Calendar data
 */
async function syncCalendarData(userId, startDate) {
  const { data: events } = await supabaseAdmin
    .from('calendar_events')
    .select('*')
    .eq('user_id', userId)
    .gte('start_time', startDate.toISOString());

  if (!events || events.length === 0) {
    // Try user_platform_data
    const { data: platformData } = await supabaseAdmin
      .from('user_platform_data')
      .select('*')
      .eq('user_id', userId)
      .in('platform', ['google_calendar', 'calendar'])
      .gte('extracted_at', startDate.toISOString());

    if (!platformData) return 0;

    let synced = 0;
    for (const record of platformData) {
      const result = await pushCalendarEvent(userId, record.raw_data, record.extracted_at);
      if (result?.success && !result?.duplicate) synced++;
    }
    return synced;
  }

  let synced = 0;
  for (const event of events) {
    const result = await pushCalendarEvent(userId, event, event.start_time);
    if (result?.success && !result?.duplicate) synced++;
  }

  return synced;
}

export default {
  // Core function
  pushRawEvent,

  // Whoop
  pushWhoopRecovery,
  pushWhoopSleep,
  pushWhoopStrain,
  pushWhoopWorkout,

  // Spotify
  pushSpotifyTrackPlay,
  pushSpotifyTracksBatch,

  // Calendar
  pushCalendarEvent,
  pushCalendarDailySummary,

  // Discord
  pushDiscordActivity,

  // GitHub
  pushGitHubActivity,

  // Sync utilities
  syncExistingPlatformData
};
