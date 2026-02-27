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
import { runPlatformExpert } from './platformExperts.js';
import { generateProactiveInsights } from './proactiveInsights.js';
import { trackGoalProgress, generateGoalSuggestions } from './goalTrackingService.js';
import { generateTwinSummary } from './twinSummaryService.js';
import { seedMemoriesFromEnrichment } from './enrichmentMemoryBridge.js';

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
const SUPPORTED_PLATFORMS = ['spotify', 'google_calendar', 'youtube', 'discord', 'linkedin', 'whoop', 'github'];

// ====================================================================
// Prompt injection defense
// ====================================================================

/**
 * Sanitize a string from an external (untrusted) API before embedding
 * it in an LLM prompt. Truncates to maxLen chars and strips common
 * prompt injection starters so injected content cannot override instructions.
 *
 * @param {string} str - Raw external API string (channel name, video title, etc.)
 * @param {number} maxLen - Max character length (default 100)
 * @returns {string} Sanitized, truncated string safe for LLM context
 */
function sanitizeExternal(str, maxLen = 100) {
  if (typeof str !== 'string') return '';
  // Truncate first to avoid processing huge strings
  let s = str.slice(0, maxLen * 2);
  // Strip potential prompt injection markers — characters that could
  // start new instructions: newlines, and common injection prefixes
  s = s.replace(/[\r\n]+/g, ' ');
  // Remove common injection patterns (case-insensitive)
  s = s.replace(/\b(ignore|disregard|forget|override)\s+(previous|prior|above|all)\b/gi, '[filtered]');
  s = s.replace(/\bsystem\s*prompt\b/gi, '[filtered]');
  return s.slice(0, maxLen).trim();
}

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

  // Recently played — fetch once, reuse for observations, discovery, and session density
  let recentItems = [];
  let recentTracks = [];
  try {
    const recentRes = await axios.get(
      'https://api.spotify.com/v1/me/player/recently-played?limit=10',
      { headers, timeout: 10000 }
    );
    recentItems = recentRes.data?.items || [];
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    recentTracks = recentItems.filter(item => new Date(item.played_at).getTime() > oneHourAgo);
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

  // New artist discovery: compare recent track artists vs top artists (reuse cached recentItems)
  if (topArtistNames.length > 0 && recentItems.length > 0) {
    const recentArtists = recentItems.map(item => item.track?.artists?.[0]?.name).filter(Boolean);
    const topSet = new Set(topArtistNames.map(n => n.toLowerCase()));
    for (const artist of recentArtists) {
      if (!topSet.has(artist.toLowerCase())) {
        observations.push({ content: `Discovered new artist: ${artist}`, contentType: 'daily_summary' });
        break; // Only report one new discovery per ingestion
      }
    }
  }

  // Session density: reuse cached recentTracks (already filtered to last hour)
  if (recentTracks.length >= 4) {
    observations.push({ content: `Extended listening session (${recentTracks.length} tracks recently)`, contentType: 'current_state' });
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
        const startDate = new Date(startRaw);
        const endDate = new Date(endRaw);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) continue;
        const startTime = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const endTime = endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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
 * Fetch YouTube data and return natural-language observations.
 * Uses the YouTube Data API v3 to pull subscriptions and liked videos.
 */
async function fetchYouTubeObservations(userId) {
  const observations = [];

  const tokenResult = await getValidAccessToken(userId, 'youtube');
  if (!tokenResult.success || !tokenResult.accessToken) {
    console.warn('[ObservationIngestion] YouTube: no valid token for user', userId);
    return observations;
  }

  const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };

  // Subscribed channels
  try {
    const subsRes = await axios.get(
      'https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=20',
      { headers, timeout: 10000 }
    );
    const items = subsRes.data?.items || [];
    if (items.length > 0) {
      const channelNames = items.map(i => sanitizeExternal(i.snippet?.title)).filter(Boolean).slice(0, 10);
      let obs = `Subscribed to YouTube channels: ${channelNames.join(', ')}`;
      observations.push({ content: obs, contentType: 'weekly_summary' });
    }
  } catch (e) {
    console.warn('[ObservationIngestion] YouTube subscriptions error:', e.message);
  }

  // Liked videos (recent activity signal)
  try {
    const likedRes = await axios.get(
      'https://www.googleapis.com/youtube/v3/videos?part=snippet&myRating=like&maxResults=10',
      { headers, timeout: 10000 }
    );
    const videos = likedRes.data?.items || [];
    if (videos.length > 0) {
      const titles = videos.map(v => sanitizeExternal(v.snippet?.title, 80)).filter(Boolean).slice(0, 5);
      const channelsSeen = [...new Set(videos.map(v => sanitizeExternal(v.snippet?.channelTitle)).filter(Boolean))].slice(0, 5);
      observations.push({
        content: `Recently liked YouTube videos: "${titles.join('", "')}" — from channels: ${channelsSeen.join(', ')}`,
        contentType: 'daily_summary',
      });
    }
  } catch (e) {
    console.warn('[ObservationIngestion] YouTube liked videos error:', e.message);
  }

  // Watch activity (activities endpoint — reflects recent engagement)
  try {
    const actRes = await axios.get(
      'https://www.googleapis.com/youtube/v3/activities?part=snippet&mine=true&maxResults=10',
      { headers, timeout: 10000 }
    );
    const activities = actRes.data?.items || [];
    const watchItems = activities.filter(a => a.snippet?.type === 'watch');
    if (watchItems.length > 0) {
      const recentTitles = watchItems.map(a => sanitizeExternal(a.snippet?.title, 80)).filter(Boolean).slice(0, 3);
      observations.push({
        content: `Recently watched on YouTube: ${recentTitles.map(t => `"${t}"`).join(', ')}`,
        contentType: 'current_state',
      });
    }
  } catch (e) {
    // Activities endpoint may not always be available — non-critical
  }

  return observations;
}

/**
 * Detect broad community interest categories from a list of Discord server names.
 * Returns an array of { label, count } objects sorted by count descending.
 */
function detectDiscordCategories(serverNames) {
  const patterns = {
    'gaming':    /\b(game|gaming|gamer|esport|clan|guild|pvp|mmo|fps|rpg|minecraft|valorant|league|fortnite|apex|steam|roblox|overwatch|wow|warcraft)\b/i,
    'tech/dev':  /\b(dev|code|coding|programming|software|tech|web|python|javascript|typescript|hackathon|open.?source|linux|cyber|ai|ml|data|cloud|backend|frontend)\b/i,
    'creative':  /\b(art|design|creative|writing|writer|photo|film|video|animation|3d|illustration|poetry|fiction|manga|draw|pixel|vfx|ux)\b/i,
    'learning':  /\b(study|learn|school|university|college|class|course|tutorial|math|science|language|book|research|exam|homework|knowledge)\b/i,
    'community': /\b(community|server|hangout|friends|social|general|vibe|lounge|chat|chill|talk|discuss)\b/i,
    'music':     /\b(music|spotify|playlist|dj|producer|beats|rap|hip.?hop|edm|rock|jazz|classical|band|sound|audio|synth|piano)\b/i,
    'finance':   /\b(finance|invest|trading|stock|forex|crypto|bitcoin|nft|defi|web3|money|wallet|portfolio|market|hedge)\b/i,
    'health':    /\b(health|fitness|gym|workout|nutrition|diet|mental.health|wellness|yoga|meditation|run|sport|body|lift|cardio)\b/i,
    'sports':    /\b(sport|football|soccer|basketball|baseball|tennis|golf|esport|nba|nfl|f1|racing|cricket|rugby|hockey)\b/i,
    'education': /\b(educat|academ|phd|masters|degree|student|professor|lecture|curriculum|stem|homework|scholarship|tutoring)\b/i,
  };
  const results = [];
  for (const [label, re] of Object.entries(patterns)) {
    const count = serverNames.filter(name => re.test(name)).length;
    if (count > 0) results.push({ label, count });
  }
  return results.sort((a, b) => b.count - a.count);
}

/**
 * Fetch Discord data and return natural-language observations.
 * Uses the Discord REST API with `identify` + `guilds` scopes.
 */
async function fetchDiscordObservations(userId) {
  const observations = [];

  const tokenResult = await getValidAccessToken(userId, 'discord');
  if (!tokenResult.success || !tokenResult.accessToken) {
    console.warn('[ObservationIngestion] Discord: no valid token for user', userId);
    return observations;
  }

  const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };

  // Guild (server) memberships — primary signal
  try {
    const guildsRes = await axios.get(
      'https://discord.com/api/v10/users/@me/guilds?limit=200',
      { headers, timeout: 10000 }
    );
    const guilds = guildsRes.data || [];
    if (guilds.length > 0) {
      const names = guilds.map(g => sanitizeExternal(g.name, 60)).filter(Boolean);

      // Full server list observation
      const preview = names.slice(0, 8).join(', ');
      const suffix = names.length > 8 ? ` and ${names.length - 8} more` : '';
      observations.push({
        content: `Member of ${names.length} Discord communities: ${preview}${suffix}`,
        contentType: 'weekly_summary',
      });

      // Category interests from server names (with counts for downstream parsing)
      const categories = detectDiscordCategories(names);
      if (categories.length > 0) {
        const catString = categories.map(c => `${c.label} (${c.count} server${c.count === 1 ? '' : 's'})`).join(', ');
        observations.push({
          content: `Discord community interests suggest: ${catString}`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Discord guilds error:', e.message);
  }

  return observations;
}

/**
 * Fetch LinkedIn data and return natural-language observations.
 * Uses the LinkedIn REST API + OpenID Connect userinfo endpoint.
 */
async function fetchLinkedInObservations(userId) {
  const observations = [];

  const tokenResult = await getValidAccessToken(userId, 'linkedin');
  if (!tokenResult.success || !tokenResult.accessToken) {
    console.warn('[ObservationIngestion] LinkedIn: no valid token for user', userId);
    return observations;
  }

  const headers = {
    Authorization: `Bearer ${tokenResult.accessToken}`,
    'LinkedIn-Version': '202304',
  };

  // Try richer LinkedIn v2 profile first (r_liteprofile scope)
  let headline = null;
  let industry = null;
  try {
    const profileRes = await axios.get(
      'https://api.linkedin.com/v2/me?projection=(localizedFirstName,localizedLastName,localizedHeadline,industryName)',
      { headers, timeout: 10000 }
    );
    headline = sanitizeExternal(profileRes.data?.localizedHeadline, 120) || null;
    industry = sanitizeExternal(profileRes.data?.industryName, 80) || null;
  } catch {
    // Scope may not cover this endpoint — fall through to userinfo
  }

  // OpenID Connect userinfo fallback (works with `profile` scope)
  let locale = null;
  try {
    const userInfoRes = await axios.get(
      'https://api.linkedin.com/v2/userinfo',
      { headers, timeout: 10000 }
    );
    const data = userInfoRes.data || {};
    if (!headline && data.name) {
      headline = sanitizeExternal(data.name, 120);
    }
    // locale is an object {country, language} or a string like "en_US"
    if (data.locale) {
      const country = typeof data.locale === 'object' ? data.locale.country : null;
      if (country) locale = country;
    }
  } catch (e) {
    console.warn('[ObservationIngestion] LinkedIn userinfo error:', e.message);
  }

  // Emit observations only for fields that have real signal
  if (headline) {
    observations.push({
      content: `LinkedIn professional headline: "${headline}"`,
      contentType: 'weekly_summary',
    });
  }
  if (industry) {
    observations.push({
      content: `Works in the ${industry} industry (from LinkedIn)`,
      contentType: 'weekly_summary',
    });
  }
  if (locale && !industry && !headline) {
    // Only emit locale if we have nothing else
    observations.push({
      content: `LinkedIn profile located in ${locale}`,
      contentType: 'weekly_summary',
    });
  }

  return observations;
}

/**
 * Check if a user has a Nango-managed connection for a given platform.
 * Used as fallback when platform_connections row is missing.
 */
async function _hasNangoMapping(supabase, userId, platform) {
  const { data } = await supabase
    .from('nango_connection_mappings')
    .select('id')
    .eq('user_id', userId)
    .eq('platform', platform)
    .eq('status', 'connected')
    .single();
  return !!data;
}

/**
 * Fetch Whoop health data and return natural-language observations.
 * Supports both Nango-managed connections and direct OAuth tokens.
 */
async function fetchWhoopObservations(userId) {
  const observations = [];

  const supabase = await getSupabase();
  if (!supabase) return observations;

  // Check if this is a Nango-managed Whoop connection
  const { data: whoopConn } = await supabase
    .from('platform_connections')
    .select('access_token')
    .eq('user_id', userId)
    .eq('platform', 'whoop')
    .single();

  // Also check nango_connection_mappings for users whose Whoop is Nango-only
  const isNangoManaged = whoopConn?.access_token === 'NANGO_MANAGED' || (!whoopConn && await _hasNangoMapping(supabase, userId, 'whoop'));

  let recoveryData = null;
  let sleepData = null;

  if (isNangoManaged) {
    try {
      const nangoService = await import('./nangoService.js');
      const [recoveryResult, sleepResult] = await Promise.all([
        nangoService.whoop.getRecovery(userId, 1),
        nangoService.whoop.getSleep(userId, 3),
      ]);
      recoveryData = recoveryResult.success ? recoveryResult.data?.records?.[0] : null;
      sleepData = sleepResult.success ? (sleepResult.data?.records || []) : [];
    } catch (e) {
      console.warn('[ObservationIngestion] Whoop Nango fetch error:', e.message);
      return observations;
    }
  } else {
    const tokenResult = await getValidAccessToken(userId, 'whoop');
    if (!tokenResult.success || !tokenResult.accessToken) {
      console.warn('[ObservationIngestion] Whoop: no valid token for user', userId);
      return observations;
    }
    const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };
    try {
      const [recoveryRes, sleepRes] = await Promise.all([
        axios.get('https://api.prod.whoop.com/developer/v2/recovery?limit=1', { headers, timeout: 10000 }),
        axios.get('https://api.prod.whoop.com/developer/v2/activity/sleep?limit=3', { headers, timeout: 10000 }),
      ]);
      recoveryData = recoveryRes.data?.records?.[0] || null;
      sleepData = sleepRes.data?.records || [];
    } catch (e) {
      console.warn('[ObservationIngestion] Whoop direct API error:', e.message);
      return observations;
    }
  }

  // ── Recovery observation ──────────────────────────────────────────────────
  const recoveryScore = recoveryData?.score?.recovery_score ?? null;
  const hrv = recoveryData?.score?.hrv_rmssd_milli ? Math.round(recoveryData.score.hrv_rmssd_milli) : null;
  const restingHR = recoveryData?.score?.resting_heart_rate ? Math.round(recoveryData.score.resting_heart_rate) : null;

  if (recoveryScore !== null) {
    const recoveryLabel = recoveryScore >= 70 ? 'high' : recoveryScore >= 50 ? 'moderate' : 'low';
    const parts = [`Recovery score: ${recoveryScore}% (${recoveryLabel} recovery)`];
    if (hrv) parts.push(`HRV ${hrv}ms`);
    if (restingHR) parts.push(`resting heart rate ${restingHR}bpm`);
    observations.push({
      content: parts.join(', '),
      contentType: 'daily_summary',
    });

    // Actionable insight for extremes
    if (recoveryScore >= 85) {
      observations.push({ content: 'Excellent Whoop recovery today — body is primed and energized', contentType: 'daily_summary' });
    } else if (recoveryScore < 40) {
      observations.push({ content: `Low Whoop recovery (${recoveryScore}%) — likely needs rest or light activity`, contentType: 'daily_summary' });
    }
  }

  // ── Sleep observation ─────────────────────────────────────────────────────
  if (sleepData.length > 0) {
    const latestSleep = sleepData[0];
    const stageSummary = latestSleep.score?.stage_summary || {};
    const totalSleepMs = latestSleep.score?.total_sleep_time_milli
      || (stageSummary.total_in_bed_time_milli - (stageSummary.total_awake_time_milli || 0))
      || stageSummary.total_in_bed_time_milli
      || 0;
    const sleepHours = totalSleepMs / (1000 * 60 * 60);
    const sleepPerf = latestSleep.score?.sleep_performance_percentage ?? null;

    if (sleepHours > 0.5) {
      const sleepLabel = sleepHours >= 7.5 ? 'well-rested' : sleepHours >= 6 ? 'moderate sleep' : 'under-slept';
      let obs = `Slept ${sleepHours.toFixed(1)} hours (${sleepLabel})`;
      if (sleepPerf !== null) obs += ` — sleep performance ${sleepPerf}%`;
      observations.push({ content: obs, contentType: 'daily_summary' });
    }
  }

  return observations;
}

// ====================================================================
// B1: Web Browsing (Browser Extension)
// ====================================================================

/**
 * Convert recent browser-extension tab visits (stored in user_platform_data)
 * into natural-language observations for the memory stream.
 *
 * This is called directly from the extension batch endpoint — the extension
 * already pushed events into user_platform_data; we just need to turn them
 * into observations and store them in user_memories via addPlatformObservation.
 *
 * @param {string} userId
 * @param {object[]} events - Raw tab_visit events from the extension batch
 * @returns {Promise<string[]>} NL observation strings
 */
export async function ingestWebObservations(userId, events) {
  if (!events || events.length === 0) return [];

  const supabase = await getSupabase();
  if (!supabase) return [];

  // Aggregate visits: group by domain, sum dwell time
  const domainMap = new Map(); // domain → { totalSeconds, titles, count }
  const searches = [];

  for (const e of events) {
    if (e.data_type === 'extension_search_query') {
      if (e.raw_data?.searchQuery) searches.push(sanitizeExternal(e.raw_data.searchQuery, 80));
      continue;
    }
    if (!['extension_page_visit', 'extension_article_read', 'extension_web_video', 'tab_visit'].includes(e.data_type || '')) continue;

    const raw = e.raw_data || e;
    const domain = raw.domain || extractDomainFromUrl(raw.url || '');
    if (!domain || domain.length < 3) continue;

    const secs = parseInt(raw.duration_seconds || raw.durationSeconds || 0, 10);
    if (secs < 10) continue; // skip drive-bys

    if (!domainMap.has(domain)) domainMap.set(domain, { totalSeconds: 0, titles: [], count: 0 });
    const entry = domainMap.get(domain);
    entry.totalSeconds += secs;
    entry.count += 1;
    const title = sanitizeExternal(raw.title || '', 60);
    if (title && !entry.titles.includes(title)) entry.titles.push(title);
  }

  const observations = [];

  // Top domains by dwell time
  const topDomains = [...domainMap.entries()]
    .sort((a, b) => b[1].totalSeconds - a[1].totalSeconds)
    .slice(0, 6);

  for (const [domain, { totalSeconds, count }] of topDomains) {
    if (totalSeconds < 30) continue;
    const mins = Math.round(totalSeconds / 60);
    const minLabel = mins < 1 ? `${totalSeconds}s` : `${mins} minute${mins !== 1 ? 's' : ''}`;
    observations.push(`Spent ${minLabel} on ${domain} (${count} page${count !== 1 ? 's' : ''} visited)`);
  }

  // Search queries summary
  if (searches.length > 0) {
    const uniq = [...new Set(searches)].slice(0, 5);
    observations.push(`Searched for: ${uniq.join(', ')}`);
  }

  if (observations.length === 0) return [];

  // Batch dedup against recent memories
  const maxWindowMs = Math.max(...Object.values(DEDUP_WINDOWS_MS));
  const cutoff = new Date(Date.now() - maxWindowMs).toISOString();
  const existingHashes = new Set();
  const { data: recentMems } = await supabase
    .from('user_memories')
    .select('content')
    .eq('user_id', userId)
    .eq('memory_type', 'platform_data')
    .gte('created_at', cutoff)
    .limit(200);
  for (const mem of (recentMems || [])) {
    existingHashes.add(contentHash('web', mem.content || ''));
  }

  let stored = 0;
  for (const obs of observations) {
    const hash = contentHash('web', obs);
    if (existingHashes.has(hash)) continue;
    const ok = await addPlatformObservation(userId, obs, 'web', { ingestion_source: 'extension_batch' });
    if (ok) { stored++; existingHashes.add(hash); }
  }

  if (stored > 0) {
    console.log(`[WebBrowsing] Stored ${stored} observations for user ${userId}`);
  }
  return observations;
}

function extractDomainFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// ====================================================================
// B2: GitHub (Personal Access Token)
// ====================================================================

/**
 * Fetch recent GitHub activity and convert to NL observations.
 * Uses the user's stored PAT from user_github_config table.
 *
 * @param {string} userId
 * @returns {Promise<string[]>} NL observation strings
 */
async function fetchGitHubObservations(userId) {
  const supabase = await getSupabase();
  if (!supabase) return [];

  const { data: config } = await supabase
    .from('user_github_config')
    .select('github_username, access_token')
    .eq('user_id', userId)
    .single();

  if (!config?.github_username || !config?.access_token) {
    console.warn('[GitHub] No PAT configured for user', userId);
    return [];
  }

  const { github_username, access_token } = config;
  const headers = {
    Authorization: `token ${access_token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'TwinMe/1.0',
  };

  const observations = [];

  try {
    const eventsRes = await axios.get(
      `https://api.github.com/users/${github_username}/events?per_page=30`,
      { headers, timeout: 10000 }
    );

    const events = eventsRes.data || [];
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    // Group push events by repo
    const pushByRepo = new Map();
    const prsSeen = new Set();

    for (const event of events) {
      const eventTime = new Date(event.created_at).getTime();
      if (eventTime < oneDayAgo) continue; // only last 24h

      const repo = sanitizeExternal(event.repo?.name || '', 60).replace(/^[^/]+\//, ''); // strip owner

      switch (event.type) {
        case 'PushEvent': {
          const commits = event.payload?.commits || [];
          if (commits.length === 0) break;
          if (!pushByRepo.has(repo)) pushByRepo.set(repo, []);
          for (const c of commits.slice(0, 3)) {
            const msg = sanitizeExternal(c.message?.split('\n')[0] || '', 80);
            if (msg) pushByRepo.get(repo).push(msg);
          }
          break;
        }
        case 'PullRequestEvent': {
          const pr = event.payload?.pull_request;
          if (!pr || prsSeen.has(pr.number)) break;
          prsSeen.add(pr.number);
          const action = event.payload?.action;
          if (!['opened', 'closed', 'merged'].includes(action)) break;
          const state = action === 'closed' && pr.merged ? 'merged' : action;
          const title = sanitizeExternal(pr.title || '', 80);
          observations.push(`${state === 'merged' ? 'Merged' : state === 'opened' ? 'Opened' : 'Closed'} PR in ${repo}: "${title}"`);
          break;
        }
        case 'IssuesEvent': {
          const issue = event.payload?.issue;
          const action = event.payload?.action;
          if (!issue || action !== 'opened') break;
          const title = sanitizeExternal(issue.title || '', 80);
          observations.push(`Opened issue in ${repo}: "${title}"`);
          break;
        }
        case 'CreateEvent': {
          const refType = event.payload?.ref_type;
          if (refType === 'repository') {
            observations.push(`Created new repository: ${repo}`);
          } else if (refType === 'branch') {
            const branch = sanitizeExternal(event.payload?.ref || '', 60);
            if (branch) observations.push(`Created branch "${branch}" in ${repo}`);
          }
          break;
        }
      }
    }

    // Summarize pushes per repo
    for (const [repo, messages] of pushByRepo) {
      const count = messages.length;
      const msgPreview = messages.slice(0, 2).map(m => `"${m}"`).join(', ');
      observations.push(`Pushed ${count} commit${count !== 1 ? 's' : ''} to ${repo}: ${msgPreview}`);
    }

    // Weekly coding summary (commits across all repos in last 7 days)
    try {
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const weekEvents = events.filter(e => e.type === 'PushEvent' && new Date(e.created_at).getTime() > weekAgo);
      const weekCommits = weekEvents.reduce((sum, e) => sum + (e.payload?.commits?.length || 0), 0);
      const weekRepos = new Set(weekEvents.map(e => e.repo?.name)).size;
      if (weekCommits > 0) {
        observations.push({ content: `Made ${weekCommits} commit${weekCommits !== 1 ? 's' : ''} across ${weekRepos} repo${weekRepos !== 1 ? 's' : ''} this week`, contentType: 'weekly_summary' });
      }
    } catch { /* non-fatal */ }

    console.log(`[GitHub] Generated ${observations.length} observations for ${github_username}`);

    // Update last_synced_at timestamp
    await supabase
      .from('user_github_config')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('user_id', userId);
  } catch (err) {
    console.warn('[GitHub] API fetch error:', err.message);
  }

  return observations;
}

async function fetchRecentWebEvents(userId) {
  const since = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
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
async function runObservationIngestion() {
  console.log('[ObservationIngestion] Starting ingestion run...');
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
      console.warn('[ObservationIngestion] Database not available, skipping');
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
    if (pcRes.error) console.warn('[ObservationIngestion] platform_connections fetch error:', pcRes.error.message);
    if (nangoRes.error) console.warn('[ObservationIngestion] nango_connection_mappings fetch error:', nangoRes.error.message);
    const pcResult = pcRes.data || [];
    const nangoResult = nangoRes.data || [];
    const githubResult = (githubRes.data || []).map(r => ({ user_id: r.user_id, platform: 'github' }));

    const allConnections = [...pcResult, ...nangoResult, ...githubResult];
    if (allConnections.length === 0) {
      console.log('[ObservationIngestion] No active platform connections found');
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

    console.log(`[ObservationIngestion] Found ${userPlatforms.size} users with ${allConnections.length} connections (pc: ${pcResult.length}, nango: ${nangoResult.length})`);

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
              case 'youtube':
                observations = await fetchYouTubeObservations(userId);
                break;
              case 'discord':
                observations = await fetchDiscordObservations(userId);
                break;
              case 'linkedin':
                observations = await fetchLinkedInObservations(userId);
                break;
              case 'whoop':
                observations = await fetchWhoopObservations(userId);
                break;
              case 'github':
                observations = await fetchGitHubObservations(userId);
                break;
            }

            // Batch de-duplication: pre-fetch recent memories once per platform
            // instead of one DB query per observation (N+1 fix).
            // Use the longest dedup window (weekly_summary = 7 days) to be conservative.
            const maxWindowMs = Math.max(...Object.values(DEDUP_WINDOWS_MS));
            const batchCutoff = new Date(Date.now() - maxWindowMs).toISOString();
            const dedupSupabase = await getSupabase();
            const existingHashes = new Set();
            if (dedupSupabase) {
              const { data: recentMems } = await dedupSupabase
                .from('user_memories')
                .select('content')
                .eq('user_id', userId)
                .eq('memory_type', 'platform_data')
                .gte('created_at', batchCutoff)
                .limit(200);
              for (const mem of (recentMems || [])) {
                existingHashes.add(contentHash(platform, mem.content || ''));
              }
            }

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

              const result = await addPlatformObservation(userId, content, platform, {
                ingestion_source: 'background',
                ingested_at: new Date().toISOString(),
                ...(contentType ? { content_type: contentType } : {}),
              });

              if (result) {
                userObsCount++;
                platformObsCount++;
                stats.observationsStored++;
                // Track newly stored hashes to prevent within-batch duplicates
                existingHashes.add(hash);
              }
            }

            // After storing observations for this platform, run platform-specific expert reflection.
            // Only fires when new data was ingested — skips platforms with no updates this run.
            // Non-blocking: capped at 5 reflections per platform per sync.
            if (platformObsCount > 0) {
              runPlatformExpert(userId, platform).catch(err =>
                console.warn(`[ObservationIngestion] Platform expert (${platform}) failed for ${userId}:`, err.message)
              );
            }
          } catch (platformErr) {
            const errMsg = `${platform} for user ${userId}: ${platformErr.message}`;
            console.warn(`[ObservationIngestion] Platform error - ${errMsg}`);
            stats.errors.push(errMsg);
          }
        }

        // Web dwell-time: re-process any accumulated extension events from the last 25h
        try {
          const webEvents = await fetchRecentWebEvents(userId);
          if (webEvents.length > 0) {
            await ingestWebObservations(userId, webEvents);
            console.log(`[ObservationIngestion] Web: ingested ${webEvents.length} events for ${userId}`);
          }
        } catch (err) {
          console.warn('[ObservationIngestion] Web events failed (non-fatal):', err.message);
        }

        stats.usersProcessed++;

        // After all platform data is ingested for this user, check reflection trigger
        if (userObsCount > 0) {
          stats.processedUserIds.push(userId);
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

          // Regenerate twin summary after a delay to allow reflections to complete
          // Reflections have priority, so wait 45s before summarizing.
          // unref() ensures this timer doesn't prevent graceful process shutdown.
          const summaryTimer = setTimeout(() => {
            generateTwinSummary(userId).catch(err =>
              console.warn(`[ObservationIngestion] Twin summary error for ${userId}:`, err.message)
            );
          }, 45000); // 45s delay: reflections have priority, then summary
          summaryTimer.unref();
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function runPostOnboardingIngestion(userId) {
  if (!userId || !UUID_RE.test(userId)) {
    console.warn('[ObservationIngestion] runPostOnboardingIngestion: invalid userId', userId);
    return { observationsStored: 0 };
  }
  console.log(`[ObservationIngestion] Running post-onboarding ingestion for user ${userId}`);

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
    if (pcConnsRes.error) console.warn('[PostOnboarding] platform_connections fetch error:', pcConnsRes.error.message);
    if (nangoConnsRes.error) console.warn('[PostOnboarding] nango_connection_mappings fetch error:', nangoConnsRes.error.message);
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
        let observations = [];
        switch (platform) {
          case 'spotify':
            observations = await fetchSpotifyObservations(userId);
            break;
          case 'google_calendar':
            observations = await fetchCalendarObservations(userId);
            break;
          case 'youtube':
            observations = await fetchYouTubeObservations(userId);
            break;
          case 'github':
            observations = await fetchGitHubObservations(userId);
            break;
        }

        for (const obs of observations) {
          const content = typeof obs === 'string' ? obs : obs.content;
          const contentType = typeof obs === 'string' ? undefined : obs.contentType;

          // Skip invalid observations - empty/null content corrupts the memory stream
          if (!content || typeof content !== 'string' || content.trim() === '') {
            continue;
          }

          const dup = await isDuplicate(userId, platform, content, contentType);
          if (dup) continue;

          const result = await addPlatformObservation(userId, content, platform, {
            ingestion_source: 'post_onboarding',
            ingested_at: new Date().toISOString(),
            ...(contentType ? { content_type: contentType } : {}),
          });
          if (result) totalStored++;
        }
      } catch (err) {
        console.warn(`[ObservationIngestion] Post-onboarding ${platform} error:`, err.message);
      }
    }

    // Seed memories from enrichment data for new users with thin memory streams.
    // This runs regardless of platform connections — gives the twin something to say
    // on first chat even if the user hasn't connected any platforms yet.
    try {
      const supabaseForCount = await getSupabase();
      const { count, error: countErr } = await supabaseForCount
        .from('user_memories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (countErr) console.warn('[PostOnboarding] Memory count error:', countErr.message);
      if ((count || 0) < 10) {
        const seedResult = await seedMemoriesFromEnrichment(userId);
        if (seedResult.memoriesStored > 0) {
          totalStored += seedResult.memoriesStored;
          console.log(`[PostOnboarding] Seeded ${seedResult.memoriesStored} memories from enrichment for user ${userId}`);
        }
      }
    } catch (err) {
      console.warn('[PostOnboarding] Enrichment memory seeding error:', err.message);
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

      // Generate proactive insights immediately — don't wait for cron
      generateProactiveInsights(userId).catch(err =>
        console.warn(`[ObservationIngestion] Post-onboarding proactive insights error:`, err.message)
      );

      generateGoalSuggestions(userId).catch(err =>
        console.warn(`[ObservationIngestion] Post-onboarding goal suggestion error:`, err.message)
      );

      // Regenerate twin summary after a delay to allow reflections to complete
      // The reflection engine runs in parallel, so wait 30 seconds before summarizing
      // unref() ensures this timer doesn't prevent graceful process shutdown.
      const summaryTimer = setTimeout(() => {
        generateTwinSummary(userId).catch(err =>
          console.warn(`[PostOnboarding] Twin summary regeneration error:`, err.message)
        );
      }, 30000); // 30s delay gives reflection engine time to complete
      summaryTimer.unref();
    }

    console.log(`[ObservationIngestion] Post-onboarding: stored ${totalStored} observations for user ${userId}`);
    return { observationsStored: totalStored };
  } catch (err) {
    console.error(`[ObservationIngestion] Post-onboarding error:`, err.message);
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

    console.log(`[Location] Stored ${observations.length} NL observations for user ${userId}`);
  } catch (err) {
    console.error('[Location] ingestLocationClusters error:', err.message);
  }
}

export {
  runObservationIngestion,
  startObservationIngestion,
  stopObservationIngestion,
  fetchSpotifyObservations,
  fetchCalendarObservations,
  fetchYouTubeObservations,
  fetchDiscordObservations,
  fetchLinkedInObservations,
  fetchGitHubObservations,
  runPostOnboardingIngestion,
};
