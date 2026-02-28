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
const SUPPORTED_PLATFORMS = ['spotify', 'google_calendar', 'youtube', 'discord', 'linkedin', 'reddit', 'whoop', 'github', 'google_gmail', 'outlook', 'strava', 'garmin', 'fitbit', 'twitch', 'oura'];

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
 * Supports both Nango-managed connections (proxy) and direct OAuth tokens.
 */
async function fetchYouTubeObservations(userId) {
  const observations = [];

  const supabase = await getSupabase();
  if (!supabase) return observations;

  // Check if this is a Nango-managed YouTube connection
  const { data: ytConn } = await supabase
    .from('platform_connections')
    .select('access_token')
    .eq('user_id', userId)
    .eq('platform', 'youtube')
    .single();

  const isNangoManaged = ytConn?.access_token === 'NANGO_MANAGED' || (!ytConn && await _hasNangoMapping(supabase, userId, 'youtube'));

  let subsItems = [];
  let likedItems = [];

  if (isNangoManaged) {
    try {
      const nangoService = await import('./nangoService.js');
      const [subsResult, likedResult] = await Promise.all([
        nangoService.youtube.getSubscriptions(userId),
        nangoService.youtube.getLikedVideos(userId),
      ]);
      subsItems = subsResult.success ? (subsResult.data?.items || []) : [];
      likedItems = likedResult.success ? (likedResult.data?.items || []) : [];
    } catch (e) {
      console.warn('[ObservationIngestion] YouTube Nango fetch error:', e.message);
      return observations;
    }
  } else {
    const tokenResult = await getValidAccessToken(userId, 'youtube');
    if (!tokenResult.success || !tokenResult.accessToken) {
      console.warn('[ObservationIngestion] YouTube: no valid token for user', userId);
      return observations;
    }
    const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };

    try {
      const subsRes = await axios.get(
        'https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=20',
        { headers, timeout: 10000 }
      );
      subsItems = subsRes.data?.items || [];
    } catch (e) {
      console.warn('[ObservationIngestion] YouTube subscriptions error:', e.message);
    }

    try {
      const likedRes = await axios.get(
        'https://www.googleapis.com/youtube/v3/videos?part=snippet&myRating=like&maxResults=10',
        { headers, timeout: 10000 }
      );
      likedItems = likedRes.data?.items || [];
    } catch (e) {
      console.warn('[ObservationIngestion] YouTube liked videos error:', e.message);
    }

    // Watch activity (activities endpoint — direct token only, not available via Nango proxy)
    try {
      const actRes = await axios.get(
        'https://www.googleapis.com/youtube/v3/activities?part=snippet&mine=true&maxResults=10',
        { headers: { Authorization: `Bearer ${tokenResult.accessToken}` }, timeout: 10000 }
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
  }

  // Subscribed channels
  if (subsItems.length > 0) {
    const channelNames = subsItems.map(i => sanitizeExternal(i.snippet?.title)).filter(Boolean).slice(0, 10);
    observations.push({ content: `Subscribed to YouTube channels: ${channelNames.join(', ')}`, contentType: 'weekly_summary' });
  }

  // Liked videos (recent activity signal)
  if (likedItems.length > 0) {
    const titles = likedItems.map(v => sanitizeExternal(v.snippet?.title, 80)).filter(Boolean).slice(0, 5);
    const channelsSeen = [...new Set(likedItems.map(v => sanitizeExternal(v.snippet?.channelTitle)).filter(Boolean))].slice(0, 5);
    observations.push({
      content: `Recently liked YouTube videos: "${titles.join('", "')}" — from channels: ${channelsSeen.join(', ')}`,
      contentType: 'daily_summary',
    });
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
 * Fetch Reddit subscribed-subreddit data and return natural-language observations.
 * Groups subreddits by topic category to surface interest patterns.
 */
async function fetchRedditObservations(userId) {
  const observations = [];

  const tokenResult = await getValidAccessToken(userId, 'reddit');
  if (!tokenResult.success || !tokenResult.accessToken) {
    console.warn('[ObservationIngestion] Reddit: no valid token for user', userId);
    return observations;
  }

  const headers = {
    Authorization: `Bearer ${tokenResult.accessToken}`,
    'User-Agent': 'TwinMe/1.0',
  };

  // Fetch subscribed subreddits (top 20)
  let subreddits = [];
  try {
    const subRes = await axios.get(
      'https://oauth.reddit.com/subreddits/mine/subscriber?limit=20',
      { headers, timeout: 10000 }
    );
    subreddits = (subRes.data?.data?.children || []).map(c => c.data);
  } catch (e) {
    console.warn('[ObservationIngestion] Reddit subreddits error:', e.message);
    return observations;
  }

  if (subreddits.length === 0) return observations;

  const names = subreddits.map(s => sanitizeExternal(s.display_name || s.name, 60)).filter(Boolean);
  const top3 = names.slice(0, 3).map(n => `r/${n}`).join(', ');

  observations.push({
    content: `Subscribed to ${names.length} subreddits including ${top3}`,
    contentType: 'weekly_summary',
  });

  // Group subreddits into broad topic categories
  const categoryPatterns = {
    'programming/tech': /\b(programming|coding|code|software|dev|web|python|javascript|typescript|linux|open.?source|cyber|ai|ml|data|cloud|backend|frontend|rust|golang|java|csharp|dotnet|devops|sysadmin|netsec|hacking|compsci|computerscience)\b/i,
    'gaming':           /\b(gaming|gamer|game|games|rpg|mmo|fps|strategy|indie|minecraft|valorant|league|fortnite|apex|steam|roblox|overwatch|wow|warcraft|dota|hearthstone|pokemon|nintendo|playstation|xbox)\b/i,
    'finance/investing': /\b(finance|invest|investing|stocks|trading|forex|crypto|bitcoin|ethereum|defi|web3|personalfinance|wallstreet|options|etf|realestate|entrepreneur)\b/i,
    'science/learning': /\b(science|physics|math|biology|chemistry|neuroscience|space|astronomy|history|philosophy|psychology|sociology|learn|askscience|explainlikeimfive|todayilearned|futurology)\b/i,
    'fitness/health':   /\b(fitness|gym|workout|running|yoga|meditation|nutrition|diet|weightlifting|bodybuilding|cycling|hiking|health|mentalhealth|loseit|gainit)\b/i,
    'creative/art':     /\b(art|design|creative|writing|fiction|draw|illustration|photography|film|animation|3d|poetry|music|piano|guitar|diy|crafts|woodworking)\b/i,
    'news/politics':    /\b(news|politics|world|geopolitics|economics|policy|government|law|legal|environment|climate)\b/i,
    'entertainment':    /\b(movies|tv|television|anime|manga|books|reading|music|podcasts|comedy|humor|aww|funny|memes|pop)\b/i,
  };

  const categoryHits = {};
  for (const name of names) {
    for (const [category, pattern] of Object.entries(categoryPatterns)) {
      if (pattern.test(name)) {
        categoryHits[category] = (categoryHits[category] || 0) + 1;
      }
    }
  }

  const topCategories = Object.entries(categoryHits)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([cat]) => cat);

  if (topCategories.length > 0) {
    observations.push({
      content: `Reddit community interests span: ${topCategories.join(', ')}`,
      contentType: 'weekly_summary',
    });
  }

  return observations;
}

/**
 * Fetch Gmail behavioral signals and return natural-language observations.
 * Privacy-safe: reads only aggregate stats, label names, and message Date/From headers.
 * Never reads message content or subject lines.
 */
async function fetchGmailObservations(userId) {
  const observations = [];

  const tokenResult = await getValidAccessToken(userId, 'google_gmail');
  if (!tokenResult.success || !tokenResult.accessToken) {
    console.warn('[ObservationIngestion] Gmail: no valid token for user', userId);
    return observations;
  }

  const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };
  const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

  // ── 1. Profile: inbox size category ────────────────────────────────────────
  let totalMessages = null;
  try {
    const profileRes = await axios.get(`${BASE}/profile`, { headers, timeout: 10000 });
    totalMessages = profileRes.data?.messagesTotal ?? null;
  } catch (e) {
    console.warn('[ObservationIngestion] Gmail profile error:', e.message);
    return observations;
  }

  if (totalMessages !== null) {
    const sizeLabel =
      totalMessages > 50000 ? 'a very large mailbox (50 000+ messages)' :
      totalMessages > 10000 ? `a large mailbox (~${Math.round(totalMessages / 1000)}k messages)` :
      totalMessages > 1000  ? `a moderate-sized mailbox (~${Math.round(totalMessages / 1000)}k messages)` :
                              `a lean mailbox (${totalMessages} messages)`;
    observations.push({ content: `Manages ${sizeLabel}`, contentType: 'weekly_summary' });
  }

  // ── 2. Custom labels — reveals organization habits ─────────────────────────
  try {
    const labelsRes = await axios.get(`${BASE}/labels`, { headers, timeout: 10000 });
    const customLabels = (labelsRes.data?.labels || [])
      .filter(l => l.type === 'user')
      .map(l => sanitizeExternal(l.name, 60))
      .filter(Boolean);
    if (customLabels.length > 0) {
      const top = customLabels.slice(0, 5).join(', ');
      observations.push({
        content: `Uses ${customLabels.length} custom email labels including: ${top}`,
        contentType: 'weekly_summary',
      });
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Gmail labels error:', e.message);
  }

  // ── 3. Weekly volume estimate (INBOX + SENT) ────────────────────────────────
  try {
    const [inboxRes, sentRes] = await Promise.all([
      axios.get(`${BASE}/messages?labelIds=INBOX&q=newer_than:7d&maxResults=1`, { headers, timeout: 10000 }),
      axios.get(`${BASE}/messages?labelIds=SENT&q=newer_than:7d&maxResults=1`, { headers, timeout: 10000 }),
    ]);
    const weeklyInbox = inboxRes.data?.resultSizeEstimate ?? 0;
    const weeklySent = sentRes.data?.resultSizeEstimate ?? 0;
    const total = weeklyInbox + weeklySent;
    if (total > 0) {
      const volLabel =
        total > 200 ? 'heavy (200+ per week)' :
        total > 50  ? `moderate (~${total} per week)` :
                      `light (~${total} per week)`;
      observations.push({
        content: `Email activity this week is ${volLabel} — ~${weeklyInbox} received, ~${weeklySent} sent`,
        contentType: 'weekly_summary',
      });
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Gmail volume estimate error:', e.message);
  }

  // ── 4. Time-of-day peak from recent sent messages ──────────────────────────
  try {
    const sentListRes = await axios.get(
      `${BASE}/messages?labelIds=SENT&maxResults=20`,
      { headers, timeout: 10000 }
    );
    const sentIds = (sentListRes.data?.messages || []).map(m => m.id);
    if (sentIds.length >= 5) {
      const dateStrings = await Promise.all(
        sentIds.map(id =>
          axios.get(`${BASE}/messages/${id}?format=metadata&metadataHeaders=Date`, { headers, timeout: 10000 })
            .then(r => r.data?.payload?.headers?.find(h => h.name === 'Date')?.value || null)
            .catch(() => null)
        )
      );
      const hourCounts = { morning: 0, afternoon: 0, evening: 0, night: 0 };
      for (const dateStr of dateStrings.filter(Boolean)) {
        const hour = new Date(dateStr).getHours();
        if (isNaN(hour)) continue;
        if (hour >= 6 && hour < 12) hourCounts.morning++;
        else if (hour >= 12 && hour < 18) hourCounts.afternoon++;
        else if (hour >= 18 && hour < 23) hourCounts.evening++;
        else hourCounts.night++;
      }
      const peakSlot = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
      if (peakSlot && peakSlot[1] > 0) {
        observations.push({
          content: `Tends to send emails in the ${peakSlot[0]} (from recent sent patterns)`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Gmail time-of-day error:', e.message);
  }

  // ── 5. Sender domain diversity from last 30 days ───────────────────────────
  try {
    const inboxListRes = await axios.get(
      `${BASE}/messages?labelIds=INBOX&q=newer_than:30d&maxResults=30`,
      { headers, timeout: 10000 }
    );
    const inboxIds = (inboxListRes.data?.messages || []).map(m => m.id);
    if (inboxIds.length >= 5) {
      const domains = await Promise.all(
        inboxIds.map(id =>
          axios.get(`${BASE}/messages/${id}?format=metadata&metadataHeaders=From`, { headers, timeout: 10000 })
            .then(r => {
              const from = r.data?.payload?.headers?.find(h => h.name === 'From')?.value || '';
              const match = from.match(/@([a-zA-Z0-9.-]+)/);
              return match ? match[1].toLowerCase() : null;
            })
            .catch(() => null)
        )
      );
      const uniqueDomains = [...new Set(domains.filter(Boolean))];
      // Filter out known automation/transactional senders
      const automatedPattern = /\b(noreply|no-reply|newsletter|notifications|support|mailer|bounce|amazonses|mailchimp|sendgrid|mailgun|hubspot|constantcontact)\b/i;
      const personalDomains = uniqueDomains.filter(d => !automatedPattern.test(d));
      if (personalDomains.length > 0) {
        observations.push({
          content: `Receives email from ${personalDomains.length} distinct senders/organizations in the past month`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Gmail sender diversity error:', e.message);
  }

  // ── 6. Subject line pattern analysis from 30 SENT messages ────────────────
  // Reads only Subject and Date metadata headers — no body content accessed.
  try {
    const sentSubjectListRes = await axios.get(
      `${BASE}/messages?labelIds=SENT&maxResults=30`,
      { headers, timeout: 10000 }
    );
    const sentSubjectIds = (sentSubjectListRes.data?.messages || []).map(m => m.id);
    if (sentSubjectIds.length >= 5) {
      const subjects = await Promise.all(
        sentSubjectIds.map(id =>
          axios.get(`${BASE}/messages/${id}?format=metadata&metadataHeaders=Subject`, { headers, timeout: 10000 })
            .then(r => r.data?.payload?.headers?.find(h => h.name === 'Subject')?.value || null)
            .catch(() => null)
        )
      );

      // PII stripping: remove email addresses, phone numbers, and sequences of
      // two or more capitalized words (potential person names).
      const stripPii = (s) => s
        .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '')
        .replace(/\b\d[\d\s().+-]{6,}\d\b/g, '')
        .replace(/\b([A-Z][a-z]+\s){1,}[A-Z][a-z]+\b/g, '');

      // Regex-based register classification (no LLM)
      const registers = {
        formal: /\b(meeting|request|per our|following up|follow.?up|regarding|per your|as discussed|action item|proposal|invoice|agenda|quarterly|schedule|confirm|pursuant|sincerely|dear\s+\w+)\b/i,
        casual: /\b(hey|hi|quick question|quick update|thoughts|fyi|heads up|checking in|catching up|loop you in|just wanted|what do you think|lmk|tbh|btw)\b/i,
        action_oriented: /\b(action required|please review|please confirm|urgent|deadline|time.sensitive|asap|reminder|due|overdue|next steps|deliverable|approve|sign off)\b/i,
        personal: /\b(happy birthday|happy anniversary|congrats|congratulations|miss you|miss me|love you|thinking of you|personal|family|vacation|holiday|weekend|dinner|lunch|party|celebrate|wedding|baby)\b/i,
      };

      const counts = { formal: 0, casual: 0, action_oriented: 0, personal: 0 };
      for (const raw of subjects.filter(Boolean)) {
        const s = stripPii(sanitizeExternal(raw, 200));
        if (registers.formal.test(s)) counts.formal++;
        if (registers.casual.test(s)) counts.casual++;
        if (registers.action_oriented.test(s)) counts.action_oriented++;
        if (registers.personal.test(s)) counts.personal++;
      }
      const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const topRegister = dominant[0];
      if (topRegister && topRegister[1] > 0) {
        const label = topRegister[0].replace('_', '-');
        observations.push({
          content: `Email writing tends toward a ${label} register based on sent subjects (${topRegister[1]} of ${subjects.filter(Boolean).length} classified messages)`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Gmail subject pattern error:', e.message);
  }

  // ── 7. Day-of-week sending pattern from recent SENT messages ──────────────
  // Uses Date metadata header only — no body content accessed.
  try {
    const sentDowListRes = await axios.get(
      `${BASE}/messages?labelIds=SENT&maxResults=30`,
      { headers, timeout: 10000 }
    );
    const sentDowIds = (sentDowListRes.data?.messages || []).map(m => m.id);
    if (sentDowIds.length >= 5) {
      const dateHeaders = await Promise.all(
        sentDowIds.map(id =>
          axios.get(`${BASE}/messages/${id}?format=metadata&metadataHeaders=Date`, { headers, timeout: 10000 })
            .then(r => r.data?.payload?.headers?.find(h => h.name === 'Date')?.value || null)
            .catch(() => null)
        )
      );
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayCounts = { weekday: 0, weekend: 0 };
      const hourBuckets = Array(24).fill(0);
      for (const dateStr of dateHeaders.filter(Boolean)) {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) continue;
        const dow = d.getDay();
        if (dow === 0 || dow === 6) dayCounts.weekend++;
        else dayCounts.weekday++;
        hourBuckets[d.getHours()]++;
      }
      const total = dayCounts.weekday + dayCounts.weekend;
      if (total >= 5) {
        const weekendPct = Math.round((dayCounts.weekend / total) * 100);
        const dowLabel = weekendPct >= 40
          ? 'tends to email on both weekdays and weekends'
          : weekendPct >= 20
            ? 'primarily emails on weekdays but also on weekends'
            : 'emails almost exclusively on weekdays';
        observations.push({
          content: `Sending rhythm: ${dowLabel} (${weekendPct}% weekend sends from recent activity)`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Gmail day-of-week pattern error:', e.message);
  }

  // ── 8. Sent network size (unique To: domains from last 30 SENT messages) ──
  // Reads only To metadata header — no body content accessed.
  try {
    const sentToListRes = await axios.get(
      `${BASE}/messages?labelIds=SENT&maxResults=30`,
      { headers, timeout: 10000 }
    );
    const sentToIds = (sentToListRes.data?.messages || []).map(m => m.id);
    if (sentToIds.length >= 5) {
      const toHeaders = await Promise.all(
        sentToIds.map(id =>
          axios.get(`${BASE}/messages/${id}?format=metadata&metadataHeaders=To`, { headers, timeout: 10000 })
            .then(r => r.data?.payload?.headers?.find(h => h.name === 'To')?.value || null)
            .catch(() => null)
        )
      );
      const sentDomains = [];
      for (const toVal of toHeaders.filter(Boolean)) {
        // A To: header may contain multiple addresses — extract all domains
        const matches = toVal.matchAll(/@([a-zA-Z0-9.-]+)/g);
        for (const m of matches) {
          sentDomains.push(m[1].toLowerCase());
        }
      }
      const uniqueSentDomains = [...new Set(sentDomains)];
      const automatedPattern = /\b(noreply|no-reply|newsletter|notifications|support|mailer|bounce|amazonses|mailchimp|sendgrid|mailgun|hubspot|constantcontact)\b/i;
      const humanSentDomains = uniqueSentDomains.filter(d => !automatedPattern.test(d));
      if (humanSentDomains.length > 0) {
        const breadth = humanSentDomains.length >= 15 ? 'broad' : humanSentDomains.length >= 6 ? 'moderate' : 'focused';
        observations.push({
          content: `Outgoing email reaches ${humanSentDomains.length} distinct domain${humanSentDomains.length !== 1 ? 's' : ''} — ${breadth} sent communication network`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Gmail sent network size error:', e.message);
  }

  return observations;
}

// ====================================================================
// Outlook (Nango-managed via Microsoft Graph)
// ====================================================================

/**
 * Fetch Microsoft Outlook signals and return natural-language observations.
 * Privacy-safe: only folder/count metadata, no message content.
 *
 * Signals emitted:
 *  1. Inbox size estimate (totalItemCount from inbox folder)
 *  2. Custom mail folder count (organization habits)
 *  3. Contact count (network breadth)
 */
async function fetchOutlookObservations(userId) {
  const observations = [];

  const supabase = await getSupabase();
  if (!supabase) return observations;

  const isNangoManaged = await _hasNangoMapping(supabase, userId, 'outlook');
  if (!isNangoManaged) {
    console.warn('[ObservationIngestion] Outlook: no Nango connection for user', userId);
    return observations;
  }

  let nangoService;
  try {
    nangoService = await import('./nangoService.js');
  } catch (e) {
    console.warn('[ObservationIngestion] Outlook: nangoService import failed:', e.message);
    return observations;
  }

  // ── 1. Mail folders (inbox size + custom folder count) ───────────────────
  let inboxCount = null;
  let customFolderCount = 0;
  try {
    const foldersResult = await nangoService.outlook.getMailFolders(userId);
    if (foldersResult.success && Array.isArray(foldersResult.data?.value)) {
      const folders = foldersResult.data.value;
      const inbox = folders.find(f => f.displayName === 'Inbox' || f.id === 'inbox');
      if (inbox?.totalItemCount != null && inbox.totalItemCount > 0) {
        inboxCount = inbox.totalItemCount;
      }
      // Count folders the user created (not system defaults)
      const systemNames = new Set(['Inbox', 'Sent Items', 'Deleted Items', 'Drafts', 'Junk Email', 'Outbox', 'Archive', 'Conversation History', 'Notes']);
      customFolderCount = folders.filter(f => !systemNames.has(f.displayName)).length;
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Outlook mail folders error:', e.message);
  }

  if (inboxCount !== null) {
    const sizeLabel = inboxCount > 5000 ? 'very large' : inboxCount > 1000 ? 'large' : inboxCount > 200 ? 'moderate' : 'manageable';
    observations.push({
      content: `Outlook inbox contains approximately ${inboxCount.toLocaleString()} messages (${sizeLabel} inbox)`,
      contentType: 'weekly_summary',
    });
  }
  if (customFolderCount > 0) {
    observations.push({
      content: `Organizes Outlook email into ${customFolderCount} custom folder${customFolderCount !== 1 ? 's' : ''} — structured email habits`,
      contentType: 'weekly_summary',
    });
  }

  // ── 2. Contact count (network breadth) ────────────────────────────────────
  try {
    const contactsResult = await nangoService.outlook.getContacts(userId, 100);
    if (contactsResult.success) {
      const contacts = contactsResult.data?.value || [];
      if (contacts.length > 0) {
        observations.push({
          content: `Outlook contacts list has at least ${contacts.length} contact${contacts.length !== 1 ? 's' : ''} — ${contacts.length >= 80 ? 'broad' : contacts.length >= 30 ? 'moderate' : 'focused'} professional network`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Outlook contacts error:', e.message);
  }

  // ── 3. Subject classification from recent inbox messages ─────────────────
  // Reads subject field from Microsoft Graph message objects — no body accessed.
  try {
    const messagesResult = await nangoService.outlook.getRecentMessages(userId, 50);
    if (messagesResult.success && Array.isArray(messagesResult.data?.value)) {
      const messages = messagesResult.data.value;

      // PII stripping: remove email addresses, phone numbers, title-case name sequences
      const stripPii = (s) => s
        .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '')
        .replace(/\b\d[\d\s().+-]{6,}\d\b/g, '')
        .replace(/\b([A-Z][a-z]+\s){1,}[A-Z][a-z]+\b/g, '');

      // Regex-based register classification — no LLM
      const registers = {
        formal: /\b(meeting|request|per our|following up|follow.?up|regarding|per your|as discussed|action item|proposal|invoice|agenda|quarterly|schedule|confirm|pursuant|sincerely|dear\s+\w+)\b/i,
        casual: /\b(hey|hi|quick question|quick update|thoughts|fyi|heads up|checking in|catching up|loop you in|just wanted|what do you think|lmk|tbh|btw)\b/i,
        action_oriented: /\b(action required|please review|please confirm|urgent|deadline|time.sensitive|asap|reminder|due|overdue|next steps|deliverable|approve|sign off)\b/i,
        personal: /\b(happy birthday|happy anniversary|congrats|congratulations|miss you|miss me|love you|thinking of you|personal|family|vacation|holiday|weekend|dinner|lunch|party|celebrate|wedding|baby)\b/i,
      };

      const counts = { formal: 0, casual: 0, action_oriented: 0, personal: 0 };
      let classifiedCount = 0;
      for (const msg of messages) {
        const raw = sanitizeExternal(msg.subject || '', 200);
        if (!raw) continue;
        const s = stripPii(raw);
        let matched = false;
        if (registers.formal.test(s)) { counts.formal++; matched = true; }
        if (registers.casual.test(s)) { counts.casual++; matched = true; }
        if (registers.action_oriented.test(s)) { counts.action_oriented++; matched = true; }
        if (registers.personal.test(s)) { counts.personal++; matched = true; }
        if (matched) classifiedCount++;
      }
      const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const topRegister = dominant[0];
      if (topRegister && topRegister[1] > 0) {
        const label = topRegister[0].replace('_', '-');
        observations.push({
          content: `Outlook inbox reflects a ${label} communication register (${topRegister[1]} of ${classifiedCount} classified inbox subjects matched this pattern)`,
          contentType: 'weekly_summary',
        });
      }

      // Sender domain diversity from the same batch of inbox messages
      const senderDomains = messages
        .map(msg => {
          const addr = msg.from?.emailAddress?.address || '';
          const match = addr.match(/@([a-zA-Z0-9.-]+)/);
          return match ? match[1].toLowerCase() : null;
        })
        .filter(Boolean);
      const automatedPattern = /\b(noreply|no-reply|newsletter|notifications|support|mailer|bounce|amazonses|mailchimp|sendgrid|mailgun|hubspot|constantcontact)\b/i;
      const uniquePersonalDomains = [...new Set(senderDomains.filter(d => !automatedPattern.test(d)))];
      if (uniquePersonalDomains.length > 0) {
        observations.push({
          content: `Outlook inbox receives messages from ${uniquePersonalDomains.length} distinct sender domain${uniquePersonalDomains.length !== 1 ? 's' : ''} — ${uniquePersonalDomains.length >= 15 ? 'broad' : uniquePersonalDomains.length >= 6 ? 'moderate' : 'focused'} incoming network`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Outlook subject/sender analysis error:', e.message);
  }

  // ── 4. Meeting pattern analysis from calendar events ─────────────────────
  // Reads event subject and start/end times only — no attendee PII accessed.
  try {
    const eventsResult = await nangoService.outlook.getCalendarEvents(userId, 100);
    if (eventsResult.success && Array.isArray(eventsResult.data?.value)) {
      const events = eventsResult.data.value;

      // Filter to upcoming / recent 30-day window
      const now = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const windowEvents = events.filter(ev => {
        const start = ev.start?.dateTime ? new Date(ev.start.dateTime).getTime() : null;
        return start !== null && Math.abs(start - now) < thirtyDaysMs;
      });

      if (windowEvents.length > 0) {
        // Meeting type patterns from subject (regex, no LLM)
        const meetingPatterns = {
          one_on_one: /\b(1:1|one.on.one|1 on 1|1-on-1|sync|check.?in)\b/i,
          standup: /\b(standup|stand.?up|daily|scrum)\b/i,
          review: /\b(review|retrospective|retro|demo|showcase|planning)\b/i,
          call: /\b(call|phone|interview|intro)\b/i,
        };
        const meetCounts = { one_on_one: 0, standup: 0, review: 0, call: 0, other: 0 };
        for (const ev of windowEvents) {
          const subj = sanitizeExternal(ev.subject || '', 150);
          let matched = false;
          for (const [type, pattern] of Object.entries(meetingPatterns)) {
            if (pattern.test(subj)) { meetCounts[type]++; matched = true; break; }
          }
          if (!matched) meetCounts.other++;
        }

        // Weekly meeting frequency
        const weeksInWindow = Math.max(1, thirtyDaysMs / (7 * 24 * 60 * 60 * 1000));
        const meetingsPerWeek = Math.round(windowEvents.length / weeksInWindow);
        const freqLabel = meetingsPerWeek >= 15 ? 'heavy meeting load' : meetingsPerWeek >= 7 ? 'moderate meeting cadence' : 'light meeting schedule';
        observations.push({
          content: `Calendar shows approximately ${meetingsPerWeek} meeting${meetingsPerWeek !== 1 ? 's' : ''} per week — ${freqLabel} (${windowEvents.length} events in 30-day window)`,
          contentType: 'weekly_summary',
        });

        // Dominant meeting type
        const topMeetType = Object.entries(meetCounts)
          .filter(([k]) => k !== 'other')
          .sort((a, b) => b[1] - a[1])[0];
        if (topMeetType && topMeetType[1] > 0) {
          const typeLabel = topMeetType[0].replace('_', '-');
          observations.push({
            content: `Most frequent calendar event type: ${typeLabel} meetings (${topMeetType[1]} in past 30 days)`,
            contentType: 'weekly_summary',
          });
        }
      }
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Outlook calendar meeting pattern error:', e.message);
  }

  return observations;
}

// ====================================================================
// Strava (Nango-managed)
// ====================================================================

/**
 * Fetch Strava athlete and activity data as natural-language observations.
 *
 * Signals emitted:
 *  1. Athlete sport type and follower/following counts
 *  2. Activity type breakdown from last 10 activities
 *  3. Weekly distance and elevation from last 7 days
 *  4. Heart rate zone distribution if available
 */
async function fetchStravaObservations(userId) {
  const observations = [];

  const supabase = await getSupabase();
  if (!supabase) return observations;

  const isNangoManaged = await _hasNangoMapping(supabase, userId, 'strava');
  if (!isNangoManaged) {
    console.warn('[ObservationIngestion] Strava: no Nango connection for user', userId);
    return observations;
  }

  let nangoService;
  try {
    nangoService = await import('./nangoService.js');
  } catch (e) {
    console.warn('[ObservationIngestion] Strava: nangoService import failed:', e.message);
    return observations;
  }

  // ── 1. Athlete profile ────────────────────────────────────────────────────
  let athleteId = null;
  try {
    const athleteResult = await nangoService.strava.getAthlete(userId);
    if (athleteResult.success && athleteResult.data) {
      const athlete = athleteResult.data;
      athleteId = athlete.id || null;
      const country = sanitizeExternal(athlete.country || '', 50);
      const followers = athlete.follower_count ?? null;
      const following = athlete.friend_count ?? null;

      const parts = [];
      if (country) parts.push(`based in ${country}`);
      if (followers !== null) parts.push(`${followers} follower${followers !== 1 ? 's' : ''}`);
      if (following !== null) parts.push(`following ${following} athlete${following !== 1 ? 's' : ''}`);

      if (parts.length > 0) {
        observations.push({
          content: `Strava athlete: ${parts.join(', ')}`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Strava athlete profile error:', e.message);
  }

  // ── 2. Recent activities (last 50, analyze last 10 + weekly window) ───────
  let activities = [];
  try {
    const activitiesResult = await nangoService.strava.getActivities(userId, 1);
    if (activitiesResult.success && Array.isArray(activitiesResult.data)) {
      activities = activitiesResult.data;
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Strava activities error:', e.message);
  }

  if (activities.length > 0) {
    // Activity type breakdown from last 10
    const last10 = activities.slice(0, 10);
    const typeCounts = {};
    for (const act of last10) {
      const type = sanitizeExternal(act.type || act.sport_type || 'Unknown', 30);
      if (type) typeCounts[type] = (typeCounts[type] || 0) + 1;
    }
    const typeEntries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    if (typeEntries.length > 0) {
      const typeStr = typeEntries.map(([t, c]) => `${c} ${t.toLowerCase()}${c !== 1 ? 's' : ''}`).join(', ');
      observations.push({
        content: `Recent Strava activities: ${typeStr} (last ${last10.length} activities)`,
        contentType: 'weekly_summary',
      });
    }

    // Weekly distance and elevation (last 7 days)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weekActivities = activities.filter(a => {
      const ts = a.start_date ? new Date(a.start_date).getTime() : 0;
      return ts > sevenDaysAgo;
    });

    if (weekActivities.length > 0) {
      const totalDistanceM = weekActivities.reduce((sum, a) => sum + (a.distance || 0), 0);
      const totalElevationM = weekActivities.reduce((sum, a) => sum + (a.total_elevation_gain || 0), 0);
      const totalDistanceKm = totalDistanceM / 1000;
      const parts = [`${weekActivities.length} workout${weekActivities.length !== 1 ? 's' : ''}`];
      if (totalDistanceKm >= 0.1) parts.push(`${totalDistanceKm.toFixed(1)} km total`);
      if (totalElevationM >= 10) parts.push(`${Math.round(totalElevationM)}m elevation gain`);
      observations.push({
        content: `Strava this week: ${parts.join(', ')}`,
        contentType: 'daily_summary',
      });
    }

    // ── Training load: average distance per activity type (last 10) ──────────
    try {
      const last10 = activities.slice(0, 10);
      const distByType = {};
      const countByType = {};
      for (const act of last10) {
        const type = sanitizeExternal(act.type || act.sport_type || 'Unknown', 30);
        if (!type) continue;
        const distKm = (act.distance || 0) / 1000;
        if (distKm > 0) {
          distByType[type] = (distByType[type] || 0) + distKm;
          countByType[type] = (countByType[type] || 0) + 1;
        }
      }
      const avgParts = Object.entries(distByType)
        .filter(([, total]) => total > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([type, total]) => {
          const count = countByType[type] || 1;
          return `averages ${(total / count).toFixed(1)}km per ${type.toLowerCase()}`;
        });
      if (avgParts.length > 0) {
        observations.push({
          content: `Strava training load: ${avgParts.join('; ')} (based on last ${last10.length} activities)`,
          contentType: 'weekly_summary',
        });
      }
    } catch (e) {
      console.warn('[ObservationIngestion] Strava training load error:', e.message);
    }

    // ── Activity streak: ≥5 active days in last 7 ───────────────────────────
    try {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const recentDates = new Set(
        activities
          .filter(a => a.start_date && new Date(a.start_date).getTime() > sevenDaysAgo)
          .map(a => new Date(a.start_date).toISOString().slice(0, 10))
      );
      if (recentDates.size >= 5) {
        observations.push({
          content: `Strava active streak: ${recentDates.size} out of the last 7 days had a recorded workout`,
          contentType: 'weekly_summary',
        });
      }
    } catch (e) {
      console.warn('[ObservationIngestion] Strava streak error:', e.message);
    }

    // ── Intensity distribution from average heart rate ────────────────────
    try {
      const last10 = activities.slice(0, 10);
      const activitiesWithHR = last10.filter(a => a.average_heartrate && a.average_heartrate > 0);
      if (activitiesWithHR.length >= 3) {
        let easy = 0, moderate = 0, hard = 0;
        for (const act of activitiesWithHR) {
          const hr = act.average_heartrate;
          if (hr < 140) easy++;
          else if (hr < 165) moderate++;
          else hard++;
        }
        const total = activitiesWithHR.length;
        const easyPct = Math.round((easy / total) * 100);
        const modPct = Math.round((moderate / total) * 100);
        const hardPct = Math.round((hard / total) * 100);
        observations.push({
          content: `Strava recent training intensity: ${easyPct}% easy, ${modPct}% moderate, ${hardPct}% hard (based on avg HR across ${total} activities)`,
          contentType: 'weekly_summary',
        });
      }
    } catch (e) {
      console.warn('[ObservationIngestion] Strava intensity distribution error:', e.message);
    }

    // ── Personal records ──────────────────────────────────────────────────
    try {
      const recentPRActivities = activities
        .slice(0, 10)
        .filter(a => (a.pr_count ?? 0) > 0);
      if (recentPRActivities.length > 0) {
        const prTypes = [...new Set(
          recentPRActivities.map(a => sanitizeExternal(a.type || a.sport_type || 'activity', 30))
        )].filter(Boolean);
        const typeStr = prTypes.slice(0, 3).join(', ');
        const totalPRs = recentPRActivities.reduce((sum, a) => sum + (a.pr_count || 0), 0);
        observations.push({
          content: `Set ${totalPRs} personal record${totalPRs !== 1 ? 's' : ''} in recent Strava ${typeStr} activities`,
          contentType: 'weekly_summary',
        });
      }
    } catch (e) {
      console.warn('[ObservationIngestion] Strava personal records error:', e.message);
    }

    // ── Gear insight: dominant gear per activity type ──────────────────────
    try {
      const last10 = activities.slice(0, 10);
      const gearByType = {};
      for (const act of last10) {
        const type = sanitizeExternal(act.type || act.sport_type || 'Unknown', 30);
        const gearId = act.gear_id || null;
        if (!type || !gearId) continue;
        if (!gearByType[type]) gearByType[type] = {};
        gearByType[type][gearId] = (gearByType[type][gearId] || 0) + 1;
      }
      const gearInsights = [];
      for (const [type, gearCounts] of Object.entries(gearByType)) {
        const entries = Object.entries(gearCounts).sort((a, b) => b[1] - a[1]);
        const [topGearId, topCount] = entries[0];
        const totalForType = Object.values(gearCounts).reduce((a, b) => a + b, 0);
        if (topCount >= 3 && topCount === totalForType) {
          gearInsights.push(`${type.toLowerCase()} (always same gear)`);
        } else if (totalForType >= 4 && topCount / totalForType >= 0.75) {
          gearInsights.push(`${type.toLowerCase()} (primarily one piece of gear)`);
        }
      }
      if (gearInsights.length > 0) {
        observations.push({
          content: `Strava gear: primarily uses one piece of gear for ${gearInsights.join(' and ')}`,
          contentType: 'weekly_summary',
        });
      }
    } catch (e) {
      console.warn('[ObservationIngestion] Strava gear insight error:', e.message);
    }
  }

  // ── 3. Heart rate zones if available ────────────────────────────────────
  try {
    const zonesResult = await nangoService.strava.getZones(userId);
    if (zonesResult.success && zonesResult.data?.heart_rate?.zones) {
      const zones = zonesResult.data.heart_rate.zones;
      // Find the zone with the most time spent
      const topZone = zones.reduce((best, z) => (z.time > (best?.time || 0) ? z : best), null);
      if (topZone && topZone.time > 0 && topZone.max !== -1) {
        const zoneName = sanitizeExternal(topZone.name || `Zone ${zones.indexOf(topZone) + 1}`, 30);
        const minutes = Math.round(topZone.time / 60);
        if (minutes > 0) {
          observations.push({
            content: `Spends most Strava training time in ${zoneName} heart rate zone (${minutes} min)`,
            contentType: 'weekly_summary',
          });
        }
      }
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Strava zones error:', e.message);
  }

  return observations;
}

// ====================================================================
// Garmin (Nango-managed)
// ====================================================================

/**
 * Fetch Garmin Connect daily health data as natural-language observations.
 *
 * Signals emitted:
 *  1. Daily summary: steps, active calories, stress score
 *  2. Sleep: duration and sleep score
 *  3. Recent activities: types and count
 */
async function fetchGarminObservations(userId) {
  const observations = [];

  const supabase = await getSupabase();
  if (!supabase) return observations;

  const isNangoManaged = await _hasNangoMapping(supabase, userId, 'garmin');
  if (!isNangoManaged) {
    console.warn('[ObservationIngestion] Garmin: no Nango connection for user', userId);
    return observations;
  }

  let nangoService;
  try {
    nangoService = await import('./nangoService.js');
  } catch (e) {
    console.warn('[ObservationIngestion] Garmin: nangoService import failed:', e.message);
    return observations;
  }

  // ── 1. Daily summary ──────────────────────────────────────────────────────
  try {
    const summaryResult = await nangoService.garmin.getDailySummary(userId);
    if (summaryResult.success && summaryResult.data) {
      // Garmin Wellness API may return an array or a single object
      const summary = Array.isArray(summaryResult.data)
        ? summaryResult.data[0]
        : summaryResult.data;

      if (summary) {
        const steps = summary.steps ?? summary.totalSteps ?? null;
        const activeCalories = summary.activeKilocalories ?? summary.activeCalories ?? null;
        const stressScore = summary.averageStressLevel ?? summary.stressLevel ?? null;

        const parts = [];
        if (steps !== null && steps > 0) parts.push(`${steps.toLocaleString()} steps`);
        if (activeCalories !== null && activeCalories > 0) parts.push(`${activeCalories} active calories`);
        if (stressScore !== null && stressScore > 0) {
          const stressLabel = stressScore < 26 ? 'low stress' : stressScore < 51 ? 'moderate stress' : stressScore < 76 ? 'high stress' : 'very high stress';
          parts.push(`stress level ${stressScore} (${stressLabel})`);
        }

        if (parts.length > 0) {
          observations.push({
            content: `Garmin daily summary: ${parts.join(', ')}`,
            contentType: 'daily_summary',
          });
        }
      }
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Garmin daily summary error:', e.message);
  }

  // ── 2. Sleep data ─────────────────────────────────────────────────────────
  try {
    const sleepResult = await nangoService.garmin.getSleepData(userId);
    if (sleepResult.success && sleepResult.data) {
      const sleepRecord = Array.isArray(sleepResult.data)
        ? sleepResult.data[0]
        : sleepResult.data;

      if (sleepRecord) {
        // Duration in seconds is common in Garmin responses
        const durationSec = sleepRecord.sleepTimeSeconds ?? sleepRecord.durationInSeconds ?? null;
        const sleepScore = sleepRecord.overallSleepScore ?? sleepRecord.sleepScore ?? null;

        if (durationSec !== null && durationSec > 0) {
          const hours = durationSec / 3600;
          const sleepLabel = hours >= 7.5 ? 'well-rested' : hours >= 6 ? 'moderate sleep' : 'under-slept';
          let obs = `Garmin sleep: ${hours.toFixed(1)} hours (${sleepLabel})`;
          if (sleepScore !== null && sleepScore > 0) obs += ` — sleep score ${sleepScore}`;
          observations.push({ content: obs, contentType: 'daily_summary' });
        }
      }
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Garmin sleep error:', e.message);
  }

  // ── 3. Recent activities ──────────────────────────────────────────────────
  try {
    const activitiesResult = await nangoService.garmin.getActivities(userId);
    if (activitiesResult.success) {
      const activities = Array.isArray(activitiesResult.data)
        ? activitiesResult.data
        : (activitiesResult.data?.activityList || []);

      if (activities.length > 0) {
        const typeCounts = {};
        for (const act of activities.slice(0, 10)) {
          const type = sanitizeExternal(act.activityType?.typeKey || act.activityTypePK || act.activityType || 'unknown', 30);
          const normalType = type.replace(/_/g, ' ').toLowerCase();
          if (normalType) typeCounts[normalType] = (typeCounts[normalType] || 0) + 1;
        }
        const typeEntries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
        if (typeEntries.length > 0) {
          const typeStr = typeEntries.map(([t, c]) => `${c}x ${t}`).join(', ');
          observations.push({
            content: `Recent Garmin activities: ${typeStr}`,
            contentType: 'weekly_summary',
          });
        }
      }
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Garmin activities error:', e.message);
  }

  return observations;
}

// ====================================================================
// Fitbit (Nango-managed)
// ====================================================================

/**
 * Fetch Fitbit daily health data as natural-language observations.
 *
 * Signals emitted:
 *  1. Today's activity summary: steps, calories, distance, active minutes
 *  2. Sleep: duration and efficiency score
 *  3. Resting heart rate
 */
async function fetchFitbitObservations(userId) {
  const observations = [];

  const supabase = await getSupabase();
  if (!supabase) return observations;

  const isNangoManaged = await _hasNangoMapping(supabase, userId, 'fitbit');
  if (!isNangoManaged) {
    console.warn('[ObservationIngestion] Fitbit: no Nango connection for user', userId);
    return observations;
  }

  let nangoService;
  try {
    nangoService = await import('./nangoService.js');
  } catch (e) {
    console.warn('[ObservationIngestion] Fitbit: nangoService import failed:', e.message);
    return observations;
  }

  // ── 1. Today's activity summary ───────────────────────────────────────────
  try {
    const activityResult = await nangoService.fitbit.getActivities(userId, 'today');
    if (activityResult.success && activityResult.data?.summary) {
      const summary = activityResult.data.summary;
      const steps = summary.steps ?? null;
      const calories = summary.caloriesOut ?? null;
      const distanceKm = summary.distances?.find(d => d.activity === 'total')?.distance ?? null;
      const activeMins = (summary.fairlyActiveMinutes ?? 0) + (summary.veryActiveMinutes ?? 0);

      const parts = [];
      if (steps !== null && steps > 0) parts.push(`${steps.toLocaleString()} steps`);
      if (calories !== null && calories > 0) parts.push(`${calories} calories burned`);
      if (distanceKm !== null && distanceKm > 0) parts.push(`${distanceKm.toFixed(2)} km`);
      if (activeMins > 0) parts.push(`${activeMins} active minutes`);

      if (parts.length > 0) {
        observations.push({
          content: `Fitbit today: ${parts.join(', ')}`,
          contentType: 'daily_summary',
        });
      }
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Fitbit activity error:', e.message);
  }

  // ── 2. Sleep ──────────────────────────────────────────────────────────────
  try {
    const sleepResult = await nangoService.fitbit.getSleep(userId, 'today');
    if (sleepResult.success && sleepResult.data?.summary) {
      const summary = sleepResult.data.summary;
      const totalMinutes = summary.totalMinutesAsleep ?? null;
      const efficiency = sleepResult.data?.sleep?.[0]?.efficiency ?? null;

      if (totalMinutes !== null && totalMinutes > 0) {
        const hours = totalMinutes / 60;
        const sleepLabel = hours >= 7.5 ? 'well-rested' : hours >= 6 ? 'moderate sleep' : 'under-slept';
        let obs = `Fitbit sleep: ${hours.toFixed(1)} hours (${sleepLabel})`;
        if (efficiency !== null && efficiency > 0) obs += ` — efficiency ${efficiency}%`;
        observations.push({ content: obs, contentType: 'daily_summary' });
      }
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Fitbit sleep error:', e.message);
  }

  // ── 3. Resting heart rate ─────────────────────────────────────────────────
  try {
    const hrResult = await nangoService.fitbit.getHeartRate(userId, 'today');
    if (hrResult.success && hrResult.data) {
      // Fitbit heart rate response: activities-heart[0].value.restingHeartRate
      const hrData = hrResult.data['activities-heart'];
      const restingHR = Array.isArray(hrData)
        ? hrData[0]?.value?.restingHeartRate ?? null
        : null;

      if (restingHR !== null && restingHR > 0) {
        const hrLabel = restingHR < 60 ? 'athlete-level' : restingHR < 70 ? 'excellent' : restingHR < 80 ? 'good' : restingHR < 90 ? 'average' : 'elevated';
        observations.push({
          content: `Fitbit resting heart rate: ${restingHR} bpm (${hrLabel})`,
          contentType: 'daily_summary',
        });
      }
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Fitbit heart rate error:', e.message);
  }

  return observations;
}

/**
 * Fetch Twitch data and return natural-language observations.
 * Extracts followed channel categories to reveal gaming/streaming interests.
 */
async function fetchTwitchObservations(userId) {
  const observations = [];

  const supabase = await getSupabase();
  if (!supabase) return observations;

  const hasConnection = await _hasNangoMapping(supabase, userId, 'twitch');
  if (!hasConnection) {
    console.warn('[ObservationIngestion] Twitch: no Nango connection for user', userId);
    return observations;
  }

  let nangoService;
  try {
    nangoService = await import('./nangoService.js');
  } catch (e) {
    console.warn('[ObservationIngestion] Twitch: failed to load nangoService:', e.message);
    return observations;
  }

  // ── 1. Get Twitch user ID (required by followed-channels endpoint) ──────────
  let twitchUserId = null;
  try {
    const userResult = await nangoService.twitch.getUser(userId);
    const userData = userResult.success ? userResult.data?.data?.[0] : null;
    twitchUserId = userData?.id || null;

    const broadcastType = userData?.broadcaster_type;
    const isStreamer = broadcastType === 'affiliate' || broadcastType === 'partner';
    if (isStreamer) {
      const login = sanitizeExternal(userData?.login || '', 40);
      const views = userData?.view_count;
      observations.push({
        content: `Active Twitch streamer (${login}) with ${views?.toLocaleString() || 'unknown'} lifetime views`,
        contentType: 'weekly_summary',
      });
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Twitch getUser error:', e.message);
    return observations;
  }

  if (!twitchUserId) return observations;

  // ── 2. Followed channels → content interest fingerprint ──────────────────
  try {
    const followResult = await nangoService.twitch.getFollowedChannels(userId, twitchUserId);
    const channels = followResult.success ? (followResult.data?.data || []) : [];

    if (channels.length > 0) {
      observations.push({
        content: `Follows ${channels.length} Twitch channels`,
        contentType: 'weekly_summary',
      });

      // Categorize by game/content name
      const names = channels
        .map(c => sanitizeExternal(c.game_name || c.broadcaster_name || '', 60))
        .filter(Boolean);

      const categoryPatterns = {
        'FPS/shooters':       /\b(valorant|counter.?strike|cs2|apex|call.of.duty|warzone|overwatch|rainbow.?six|halo|battlefield|fortnite|pubg)\b/i,
        'RPG/adventure':      /\b(elden.ring|dark.souls|diablo|baldur|final.fantasy|zelda|pokemon|cyberpunk|witcher|skyrim|wow|world.of.warcraft|genshin|ffxiv)\b/i,
        'strategy/MOBA':      /\b(league.of.legends|lol|dota|hearthstone|starcraft|age.of.empires|civilization|teamfight.tactics|tft)\b/i,
        'sports/racing':      /\b(fifa|nba|nfl|madden|rocket.league|f1|formula|nascar|ufc)\b/i,
        'sandbox/survival':   /\b(minecraft|roblox|terraria|stardew|rust|ark|valheim|palworld)\b/i,
        'IRL/just chatting':  /\b(just.chatting|irl|podcast|talk|creative|art|music)\b/i,
        'horror':             /\b(dead.by.daylight|phasmophobia|resident.evil|amnesia|outlast)\b/i,
        'variety/retro':      /\b(speed.?run|variety|retro|classic|indie)\b/i,
      };

      const hits = {};
      for (const name of names) {
        for (const [cat, pat] of Object.entries(categoryPatterns)) {
          if (pat.test(name)) hits[cat] = (hits[cat] || 0) + 1;
        }
      }

      const topCats = Object.entries(hits)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([cat]) => cat);

      if (topCats.length > 0) {
        observations.push({
          content: `Twitch viewing interests: ${topCats.join(', ')}`,
          contentType: 'weekly_summary',
        });
      }

      // Top 3 streamers by name
      const topNames = channels.slice(0, 3)
        .map(c => sanitizeExternal(c.broadcaster_name || c.broadcaster_login || '', 40))
        .filter(Boolean);
      if (topNames.length > 0) {
        observations.push({
          content: `Top followed Twitch channels include: ${topNames.join(', ')}`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Twitch getFollowedChannels error:', e.message);
  }

  return observations;
}

async function fetchOuraObservations(userId) {
  const observations = [];

  const supabase = await getSupabase();
  if (!supabase) return observations;

  const hasConnection = await _hasNangoMapping(supabase, userId, 'oura');
  if (!hasConnection) {
    console.warn('[ObservationIngestion] Oura: no Nango connection for user', userId);
    return observations;
  }

  let nangoService;
  try {
    nangoService = await import('./nangoService.js');
  } catch (e) {
    console.warn('[ObservationIngestion] Oura: failed to load nangoService:', e.message);
    return observations;
  }

  // Date range: last 14 days
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // ── 1. Daily readiness → readiness score trend ───────────────────────────
  try {
    const readinessResult = await nangoService.oura.getDailyReadiness(userId, startDate, endDate);
    const entries = readinessResult.success ? (readinessResult.data?.data || []) : [];
    if (entries.length >= 3) {
      const scores = entries.map(e => e.score).filter(s => typeof s === 'number');
      if (scores.length > 0) {
        const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        const trend = scores.length >= 5
          ? (scores.slice(-3).reduce((a, b) => a + b, 0) / 3 > scores.slice(0, 3).reduce((a, b) => a + b, 0) / 3 ? 'improving' : 'declining')
          : 'stable';
        observations.push({
          content: `Oura readiness score averages ${avg}/100 over the past 2 weeks (${trend} trend)`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Oura readiness error:', e.message);
  }

  // ── 2. Daily stress → stress pattern / chronotype signals ────────────────
  try {
    const stressResult = await nangoService.oura.getDailyStress(userId, startDate, endDate);
    const entries = stressResult.success ? (stressResult.data?.data || []) : [];
    if (entries.length >= 3) {
      const labels = entries.map(e => e.stress_high).filter(s => typeof s === 'string');
      const counts = labels.reduce((acc, l) => { acc[l] = (acc[l] || 0) + 1; return acc; }, {});
      const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (dominant) {
        const labelMap = { restored: 'low-stress / well-recovered', normal: 'moderate-stress', stressful: 'high-stress' };
        observations.push({
          content: `Oura stress pattern shows mostly ${labelMap[dominant[0]] || dominant[0]} days recently`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Oura stress error:', e.message);
  }

  // ── 3. Daily resilience → long-term trend ────────────────────────────────
  try {
    const resilResult = await nangoService.oura.getDailyResilience(userId, startDate, endDate);
    const entries = resilResult.success ? (resilResult.data?.data || []) : [];
    if (entries.length >= 3) {
      const levels = entries.map(e => e.level).filter(Boolean);
      const levelOrder = { exceptional: 5, strong: 4, adequate: 3, limited: 2, poor: 1 };
      const avgLevel = levels.reduce((a, l) => a + (levelOrder[l] || 3), 0) / levels.length;
      const label = avgLevel >= 4.5 ? 'exceptional' : avgLevel >= 3.5 ? 'strong' : avgLevel >= 2.5 ? 'adequate' : 'limited';
      observations.push({
        content: `Oura resilience level is ${label} — reflects ability to recover from physical and mental stress`,
        contentType: 'weekly_summary',
      });
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Oura resilience error:', e.message);
  }

  // ── 4. Sleep time → chronotype (bedtime/wake midpoint) ───────────────────
  try {
    const sleepTimeResult = await nangoService.oura.getSleepTime(userId, startDate, endDate);
    const entries = sleepTimeResult.success ? (sleepTimeResult.data?.data || []) : [];
    if (entries.length >= 3) {
      // sleep_time has optimal_bedtime: { start, end } in seconds past midnight
      const bedtimes = entries
        .map(e => e.optimal_bedtime?.start)
        .filter(s => typeof s === 'number');
      if (bedtimes.length > 0) {
        const avgSecs = bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length;
        // Seconds can be negative (before midnight) - normalize to 0-86400
        const normalizedSecs = ((avgSecs % 86400) + 86400) % 86400;
        const hour = Math.floor(normalizedSecs / 3600);
        const chronotype = hour >= 22 || hour < 1 ? 'evening type (10pm–1am)' : hour >= 19 ? 'moderate evening type (7–10pm)' : hour < 5 ? 'night owl (after 1am)' : 'morning type';
        observations.push({
          content: `Oura chronotype: ${chronotype} — natural sleep window centers around ${hour}:00`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Oura sleep time error:', e.message);
  }

  // ── 5. Workouts → type + time-of-day preference ──────────────────────────
  try {
    const workoutResult = await nangoService.oura.getWorkouts(userId, startDate, endDate);
    const workouts = workoutResult.success ? (workoutResult.data?.data || []) : [];
    if (workouts.length > 0) {
      // Count workout types
      const typeCounts = workouts.reduce((acc, w) => {
        const t = sanitizeExternal(w.activity || 'unknown', 40);
        acc[t] = (acc[t] || 0) + 1;
        return acc;
      }, {});
      const topTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);

      // Time-of-day from workout start time
      const hours = workouts
        .map(w => w.start_datetime ? new Date(w.start_datetime).getUTCHours() : null)
        .filter(h => h !== null);
      const amCount = hours.filter(h => h >= 5 && h < 12).length;
      const pmCount = hours.filter(h => h >= 12 && h < 20).length;
      const timeLabel = amCount > pmCount ? 'morning' : pmCount > amCount ? 'afternoon/evening' : 'mixed timing';

      observations.push({
        content: `Oura tracked ${workouts.length} workout(s) in the past 2 weeks: ${topTypes.join(', ')} — mostly ${timeLabel}`,
        contentType: 'weekly_summary',
      });
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Oura workouts error:', e.message);
  }

  // ── 6. Enhanced tags → user self-annotations ─────────────────────────────
  try {
    const tagsResult = await nangoService.oura.getEnhancedTags(userId, startDate, endDate);
    const tags = tagsResult.success ? (tagsResult.data?.data || []) : [];
    if (tags.length > 0) {
      const tagNames = tags
        .map(t => sanitizeExternal(t.tag_type_code || t.custom_name || '', 40))
        .filter(Boolean);
      const counts = tagNames.reduce((acc, t) => { acc[t] = (acc[t] || 0) + 1; return acc; }, {});
      const topTags = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t);
      observations.push({
        content: `Oura self-tagged events recently: ${topTags.join(', ')} — reflects intentional lifestyle tracking`,
        contentType: 'weekly_summary',
      });
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Oura enhanced tags error:', e.message);
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
    .eq('status', 'active')
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
  let recoveryHistory = [];
  let sleepData = [];
  let workoutData = [];
  let directHeaders = null;

  if (isNangoManaged) {
    try {
      const nangoService = await import('./nangoService.js');
      const [recoveryResult, sleepResult] = await Promise.all([
        nangoService.whoop.getRecovery(userId, 3),
        nangoService.whoop.getSleep(userId, 3),
      ]);
      recoveryHistory = recoveryResult.success ? (recoveryResult.data?.records || []) : [];
      recoveryData = recoveryHistory[0] || null;
      sleepData = sleepResult.success ? (sleepResult.data?.records || []) : [];
    } catch (e) {
      console.warn('[ObservationIngestion] Whoop Nango fetch error:', e.message);
      return observations;
    }

    // ── Workout data (Nango) ────────────────────────────────────────────────
    try {
      const nangoService = await import('./nangoService.js');
      if (typeof nangoService.whoop?.getWorkout === 'function') {
        const workoutResult = await nangoService.whoop.getWorkout(userId, 5);
        workoutData = workoutResult.success ? (workoutResult.data?.records || []) : [];
      }
    } catch (e) {
      console.warn('[ObservationIngestion] Whoop workout fetch error:', e.message);
    }
  } else {
    const tokenResult = await getValidAccessToken(userId, 'whoop');
    if (!tokenResult.success || !tokenResult.accessToken) {
      console.warn('[ObservationIngestion] Whoop: no valid token for user', userId);
      return observations;
    }
    directHeaders = { Authorization: `Bearer ${tokenResult.accessToken}` };
    try {
      const [recoveryRes, sleepRes] = await Promise.all([
        axios.get('https://api.prod.whoop.com/developer/v2/recovery?limit=3', { headers: directHeaders, timeout: 10000 }),
        axios.get('https://api.prod.whoop.com/developer/v2/activity/sleep?limit=3', { headers: directHeaders, timeout: 10000 }),
      ]);
      recoveryHistory = recoveryRes.data?.records || [];
      recoveryData = recoveryHistory[0] || null;
      sleepData = sleepRes.data?.records || [];
    } catch (e) {
      console.warn('[ObservationIngestion] Whoop direct API error:', e.message);
      return observations;
    }

    // ── Workout data (direct) ───────────────────────────────────────────────
    try {
      const workoutRes = await axios.get(
        'https://api.prod.whoop.com/developer/v2/activity/workout?limit=5',
        { headers: directHeaders, timeout: 10000 }
      );
      workoutData = workoutRes.data?.records || [];
    } catch (e) {
      console.warn('[ObservationIngestion] Whoop workout direct API error:', e.message);
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

  // ── 3-day low recovery streak ─────────────────────────────────────────────
  try {
    if (recoveryHistory.length >= 3) {
      const last3Scores = recoveryHistory.slice(0, 3)
        .map(r => r?.score?.recovery_score ?? null)
        .filter(s => s !== null);
      if (last3Scores.length === 3 && last3Scores.every(s => s < 50)) {
        observations.push({
          content: `3-day low recovery streak on Whoop (scores: ${last3Scores.join('%, ')}%) — likely overtraining or poor sleep`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Whoop recovery streak error:', e.message);
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

  // ── Sleep consistency: compare last 3 bedtimes ────────────────────────────
  try {
    if (sleepData.length >= 3) {
      const startMinutes = sleepData.slice(0, 3).map(s => {
        if (!s.start) return null;
        const d = new Date(s.start);
        // Minutes past midnight; shift post-noon values negative so 11pm and 1am cluster
        let mins = d.getUTCHours() * 60 + d.getUTCMinutes();
        if (mins > 12 * 60) mins -= 24 * 60;
        return mins;
      }).filter(m => m !== null);

      if (startMinutes.length >= 3) {
        const maxDiff = Math.max(...startMinutes) - Math.min(...startMinutes);
        if (maxDiff <= 30) {
          observations.push({
            content: 'Consistent sleep schedule — bedtime varies by less than 30 minutes over the last 3 nights',
            contentType: 'weekly_summary',
          });
        } else if (maxDiff > 120) {
          observations.push({
            content: `Irregular sleep timing — bedtime varies by over ${Math.round(maxDiff / 60)} hours across the last 3 nights`,
            contentType: 'weekly_summary',
          });
        }
      }
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Whoop sleep consistency error:', e.message);
  }

  // ── Workout data: type, strain, HR zone breakdown ─────────────────────────
  try {
    if (workoutData.length > 0) {
      const latestWorkout = workoutData[0];
      const sportId = latestWorkout.sport_id ?? null;
      const strain = latestWorkout.score?.strain ?? null;
      const avgHR = latestWorkout.score?.average_heart_rate ?? null;
      const maxHR = latestWorkout.score?.max_heart_rate ?? null;
      const calsBurned = latestWorkout.score?.kilojoule != null
        ? Math.round(latestWorkout.score.kilojoule * 0.239006)
        : null;

      const WHOOP_SPORTS = {
        0: 'Activity', 1: 'Running', 2: 'Cycling', 3: 'Baseball', 4: 'Basketball',
        5: 'Rowing', 6: 'Fencing', 7: 'Field Hockey', 8: 'Football', 9: 'Golf',
        10: 'Ice Hockey', 11: 'Lacrosse', 12: 'Rugby', 13: 'Skiing', 14: 'Soccer',
        15: 'Softball', 16: 'Squash', 17: 'Swimming', 18: 'Tennis', 19: 'Track',
        20: 'Volleyball', 21: 'Water Polo', 22: 'Wrestling', 23: 'Boxing',
        24: 'Dance', 25: 'Pilates', 26: 'Yoga', 27: 'Weightlifting', 28: 'CrossFit',
        29: 'Functional Fitness', 30: 'Duathlon', 31: 'Gymnastics', 32: 'Hiking',
        33: 'Horseback Riding', 34: 'Kayaking', 35: 'Martial Arts', 36: 'Mountain Biking',
        37: 'Powerlifting', 38: 'Rock Climbing', 39: 'Paddleboarding', 40: 'Triathlon',
        41: 'Walking', 42: 'Surfing', 43: 'Elliptical', 44: 'Stairmaster',
      };
      const sportName = sanitizeExternal(
        sportId !== null ? (WHOOP_SPORTS[sportId] || `Sport ${sportId}`) : 'workout',
        40
      );

      if (strain !== null) {
        const strainLabel = strain >= 18 ? 'all-out effort' : strain >= 14 ? 'hard day' : strain >= 10 ? 'moderate' : 'recovery day';
        const parts = [`Latest Whoop workout: ${sportName} — strain ${strain.toFixed(1)}/21 (${strainLabel})`];
        if (avgHR) parts.push(`avg HR ${avgHR}bpm`);
        if (maxHR) parts.push(`max HR ${maxHR}bpm`);
        if (calsBurned) parts.push(`~${calsBurned} kcal`);
        observations.push({ content: parts.join(', '), contentType: 'daily_summary' });
      }

      // HR zone breakdown across recent workouts
      const zoneKeys = ['zone_zero_milli', 'zone_one_milli', 'zone_two_milli', 'zone_three_milli', 'zone_four_milli', 'zone_five_milli'];
      const zoneTotals = new Array(6).fill(0);
      let hasZoneData = false;
      for (const w of workoutData) {
        for (let i = 0; i < zoneKeys.length; i++) {
          const v = w.score?.[zoneKeys[i]] ?? 0;
          if (v > 0) { hasZoneData = true; zoneTotals[i] += v; }
        }
      }
      if (hasZoneData) {
        const totalMs = zoneTotals.reduce((a, b) => a + b, 0);
        if (totalMs > 0) {
          const easyPct = Math.round(((zoneTotals[0] + zoneTotals[1] + zoneTotals[2]) / totalMs) * 100);
          const moderatePct = Math.round((zoneTotals[3] / totalMs) * 100);
          const hardPct = Math.round(((zoneTotals[4] + zoneTotals[5]) / totalMs) * 100);
          if (easyPct + moderatePct + hardPct > 0) {
            observations.push({
              content: `Whoop HR zone breakdown (last ${workoutData.length} workout${workoutData.length !== 1 ? 's' : ''}): ${easyPct}% easy, ${moderatePct}% moderate, ${hardPct}% hard`,
              contentType: 'weekly_summary',
            });
          }
        }
      }
    }
  } catch (e) {
    console.warn('[ObservationIngestion] Whoop workout observation error:', e.message);
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
// B2: GitHub (OAuth or PAT fallback)
// ====================================================================

/**
 * Classify a list of repo names/topics into broad project type categories.
 * Returns the dominant category label or null if none match.
 */
function detectGitHubProjectType(repoNames) {
  const patterns = {
    'web development':   /\b(web|frontend|backend|api|server|client|react|vue|angular|next|express|fastapi|django|rails|node)\b/i,
    'mobile':            /\b(mobile|android|ios|react.native|flutter|swift|kotlin|expo)\b/i,
    'data science / ML': /\b(ml|ai|data|model|notebook|pytorch|tensorflow|sklearn|pandas|kaggle|analysis|predict)\b/i,
    'DevOps / infra':    /\b(docker|k8s|kubernetes|terraform|ansible|infra|deploy|ci|cd|helm|aws|gcp|azure|ops)\b/i,
    'CLI / tooling':     /\b(cli|tool|script|util|helper|gen|generator|automation|bot|plugin)\b/i,
    'game dev':          /\b(game|unity|godot|unreal|engine|shader|rpg|fps)\b/i,
    'open source libs':  /\b(lib|library|sdk|framework|package|npm|pypi|crate|gem)\b/i,
  };
  const counts = {};
  for (const name of repoNames) {
    for (const [label, re] of Object.entries(patterns)) {
      if (re.test(name)) counts[label] = (counts[label] || 0) + 1;
    }
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted.length > 0 ? sorted[0][0] : null;
}

/**
 * Mark a GitHub connection as needing re-authentication in platform_connections.
 * Mirrors the same pattern used in cron-platform-polling.js lines 168-182.
 */
async function _markGitHubNeedsReauth(supabase, userId) {
  const { error } = await supabase
    .from('platform_connections')
    .update({
      status: 'error',
      last_sync_status: 'auth_error',
      last_sync_error: 'Authentication failed - please reconnect GitHub',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('platform', 'github');
  if (error) {
    console.warn('[GitHub] Failed to mark needs_reauth:', error.message);
  }
}

/**
 * Fetch recent GitHub activity and convert to NL observations.
 *
 * Auth priority:
 *  1. OAuth token via getValidAccessToken(userId, 'github')  — standard platform flow
 *  2. PAT from user_github_config table                      — legacy / power-user path
 *
 * Username resolution order:
 *  1. platform_connections.platform_user_id  (set during OAuth callback)
 *  2. GET /user with the token               (live API call)
 *  3. user_github_config.github_username     (PAT config fallback)
 *
 * @param {string} userId
 * @returns {Promise<Array<string|{content:string,contentType:string}>>} NL observation array
 */
async function fetchGitHubObservations(userId) {
  const supabase = await getSupabase();
  if (!supabase) return [];

  const observations = [];

  // ── 1. Resolve access token (OAuth-first, PAT fallback) ───────────────────
  let accessToken = null;
  let githubUsername = null;

  // Try OAuth connection first
  const tokenResult = await getValidAccessToken(userId, 'github');
  if (tokenResult.success && tokenResult.accessToken) {
    accessToken = tokenResult.accessToken;

    // Try to get username from platform_connections metadata (set during OAuth)
    const { data: conn } = await supabase
      .from('platform_connections')
      .select('platform_user_id, metadata')
      .eq('user_id', userId)
      .eq('platform', 'github')
      .single();
    githubUsername = conn?.platform_user_id || conn?.metadata?.login || conn?.metadata?.username || null;
  } else {
    // Fall back to PAT from user_github_config
    const { data: patConfig } = await supabase
      .from('user_github_config')
      .select('github_username, access_token')
      .eq('user_id', userId)
      .single();

    if (patConfig?.access_token) {
      accessToken = patConfig.access_token;
      githubUsername = patConfig.github_username || null;
    }
  }

  if (!accessToken) {
    console.warn('[GitHub] No valid token (OAuth or PAT) for user', userId);
    return observations;
  }

  const headers = {
    Authorization: `token ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'TwinMe/1.0',
  };

  // ── 2. Resolve username if still unknown ──────────────────────────────────
  if (!githubUsername) {
    try {
      const userRes = await axios.get('https://api.github.com/user', { headers, timeout: 10000 });
      githubUsername = userRes.data?.login || null;
    } catch (err) {
      if (err.response?.status === 401) {
        await _markGitHubNeedsReauth(supabase, userId);
        console.warn('[GitHub] 401 fetching /user — marked needs_reauth for user', userId);
        return observations;
      }
      console.warn('[GitHub] Could not resolve username:', err.message);
    }
  }

  if (!githubUsername) {
    console.warn('[GitHub] Username could not be determined for user', userId);
    return observations;
  }

  // ── 3. Fetch events (last 100) ────────────────────────────────────────────
  let events = [];
  try {
    const eventsRes = await axios.get(
      `https://api.github.com/users/${githubUsername}/events?per_page=100`,
      { headers, timeout: 10000 }
    );
    events = eventsRes.data || [];
  } catch (err) {
    if (err.response?.status === 401) {
      await _markGitHubNeedsReauth(supabase, userId);
      console.warn('[GitHub] 401 on events — marked needs_reauth for user', userId);
      return observations;
    }
    console.warn('[GitHub] Events fetch error:', err.message);
  }

  // ── 4. Fetch repos (most recently updated, up to 30) ─────────────────────
  let repos = [];
  try {
    const reposRes = await axios.get(
      'https://api.github.com/user/repos?sort=updated&per_page=30',
      { headers, timeout: 10000 }
    );
    repos = reposRes.data || [];
  } catch (err) {
    if (err.response?.status === 401) {
      await _markGitHubNeedsReauth(supabase, userId);
      console.warn('[GitHub] 401 on repos — marked needs_reauth for user', userId);
      return observations;
    }
    console.warn('[GitHub] Repos fetch error (non-fatal):', err.message);
  }

  // ── 5. Build event-based observations ────────────────────────────────────
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const pushByRepo = new Map();   // repo → [commit messages]
  const pushByRepo30d = new Map(); // repo → commitCount (last 30 days, for streak)
  const prsSeen = new Set();
  const activeDays = new Set();   // YYYY-MM-DD strings for commit streak

  for (const event of events) {
    const eventTime = new Date(event.created_at).getTime();
    const repo = sanitizeExternal(event.repo?.name || '', 80).replace(/^[^/]+\//, ''); // strip "owner/"

    // Track active commit days over last 30 days for streak
    if (event.type === 'PushEvent' && eventTime > thirtyDaysAgo) {
      const day = event.created_at.slice(0, 10);
      activeDays.add(day);
      const commitCount = (event.payload?.commits || []).length;
      pushByRepo30d.set(repo, (pushByRepo30d.get(repo) || 0) + commitCount);
    }

    // Only generate per-event observations for last 24h
    if (eventTime < oneDayAgo) continue;

    switch (event.type) {
      case 'PushEvent': {
        const commits = event.payload?.commits || [];
        if (commits.length === 0) break;
        const branch = sanitizeExternal(event.payload?.ref?.replace('refs/heads/', '') || '', 60);
        if (!pushByRepo.has(repo)) pushByRepo.set(repo, { branch, messages: [] });
        for (const c of commits.slice(0, 3)) {
          const msg = sanitizeExternal(c.message?.split('\n')[0] || '', 80);
          if (msg) pushByRepo.get(repo).messages.push(msg);
        }
        break;
      }
      case 'PullRequestEvent': {
        const pr = event.payload?.pull_request;
        if (!pr || prsSeen.has(pr.number)) break;
        prsSeen.add(pr.number);
        const action = event.payload?.action;
        if (!['opened', 'closed'].includes(action)) break;
        const isMerged = action === 'closed' && pr.merged;
        const verb = isMerged ? 'Merged' : action === 'opened' ? 'Opened' : 'Closed';
        const title = sanitizeExternal(pr.title || '', 80);
        observations.push(`${verb} PR in ${repo}: "${title}"`);
        break;
      }
      case 'IssuesEvent': {
        const issue = event.payload?.issue;
        const action = event.payload?.action;
        if (!issue || action !== 'opened') break;
        const title = sanitizeExternal(issue.title || '', 80);
        observations.push(`Opened GitHub issue in ${repo}: "${title}"`);
        break;
      }
      case 'CreateEvent': {
        const refType = event.payload?.ref_type;
        if (refType === 'repository') {
          observations.push(`Created new GitHub repository: ${repo}`);
        } else if (refType === 'branch') {
          const branch = sanitizeExternal(event.payload?.ref || '', 60);
          if (branch) observations.push(`Created branch "${branch}" in ${repo}`);
        }
        break;
      }
      case 'WatchEvent': {
        if (event.payload?.action === 'started') {
          observations.push(`Starred GitHub repository: ${repo}`);
        }
        break;
      }
      case 'ForkEvent': {
        observations.push(`Forked GitHub repository: ${repo}`);
        break;
      }
    }
  }

  // Summarize pushes per repo (last 24h)
  for (const [repo, { branch, messages }] of pushByRepo) {
    const count = messages.length;
    const msgPreview = messages.slice(0, 2).map(m => `"${m}"`).join(', ');
    const branchPart = branch ? ` on ${branch}` : '';
    observations.push(`Pushed ${count} commit${count !== 1 ? 's' : ''} to ${repo}${branchPart} — ${msgPreview}`);
  }

  // ── 6. Weekly coding summary ──────────────────────────────────────────────
  const weekEvents = events.filter(e => e.type === 'PushEvent' && new Date(e.created_at).getTime() > sevenDaysAgo);
  const weekCommits = weekEvents.reduce((sum, e) => sum + (e.payload?.commits?.length || 0), 0);
  const weekRepos = new Set(weekEvents.map(e => e.repo?.name)).size;
  if (weekCommits > 0) {
    observations.push({
      content: `Made ${weekCommits} commit${weekCommits !== 1 ? 's' : ''} across ${weekRepos} repo${weekRepos !== 1 ? 's' : ''} on GitHub this week`,
      contentType: 'weekly_summary',
    });
  }

  // ── 7. Commit streak / frequency (last 30 days) ───────────────────────────
  const activeDayCount = activeDays.size;
  if (activeDayCount > 0) {
    observations.push({
      content: `Committed code on ${activeDayCount} day${activeDayCount !== 1 ? 's' : ''} in the last 30 days on GitHub`,
      contentType: 'weekly_summary',
    });
  }

  // ── 8. Activity pattern — busiest day of week ─────────────────────────────
  if (events.length >= 5) {
    const dayCounts = [0, 0, 0, 0, 0, 0, 0]; // Sun–Sat
    for (const event of events) {
      if (new Date(event.created_at).getTime() > thirtyDaysAgo) {
        dayCounts[new Date(event.created_at).getDay()]++;
      }
    }
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const busiestIdx = dayCounts.indexOf(Math.max(...dayCounts));
    if (dayCounts[busiestIdx] >= 3) {
      observations.push({
        content: `Most active on GitHub on ${dayNames[busiestIdx]}s based on recent activity patterns`,
        contentType: 'weekly_summary',
      });
    }
  }

  // ── 9. Repo-based observations ────────────────────────────────────────────
  if (repos.length > 0) {
    // Primary tech stack from repo languages
    const languageCounts = {};
    for (const repo of repos) {
      if (repo.language) {
        languageCounts[repo.language] = (languageCounts[repo.language] || 0) + 1;
      }
    }
    const topLanguages = Object.entries(languageCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([lang]) => lang);
    if (topLanguages.length > 0) {
      observations.push({
        content: `Primary GitHub tech stack: ${topLanguages.join(', ')} based on recent repositories`,
        contentType: 'weekly_summary',
      });
    }

    // Project type classification
    const repoNamesAndDescriptions = repos.map(r =>
      `${r.name || ''} ${r.description || ''}`
    );
    const projectType = detectGitHubProjectType(repoNamesAndDescriptions);
    const publicCount = repos.filter(r => !r.private).length;
    const privateCount = repos.filter(r => r.private).length;

    if (projectType) {
      const pubPart = publicCount > 0 ? `${publicCount} public` : '';
      const privPart = privateCount > 0 ? `${privateCount} private` : '';
      const repoParts = [pubPart, privPart].filter(Boolean).join(', ');
      observations.push({
        content: `Working on ${repoParts} GitHub repos, primarily focused on ${projectType}`,
        contentType: 'weekly_summary',
      });
    } else if (publicCount + privateCount > 0) {
      const pubPart = publicCount > 0 ? `${publicCount} public` : '';
      const privPart = privateCount > 0 ? `${privateCount} private` : '';
      const repoParts = [pubPart, privPart].filter(Boolean).join(', ');
      observations.push({
        content: `Active on GitHub with ${repoParts} repositories`,
        contentType: 'weekly_summary',
      });
    }
  }

  console.log(`[GitHub] Generated ${observations.length} observations for ${githubUsername} (user ${userId})`);

  // Update last_synced_at in user_github_config if row exists (non-blocking)
  supabase
    .from('user_github_config')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('user_id', userId)
    .then(() => {})
    .catch(() => {});

  return observations;
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
              case 'reddit':
                observations = await fetchRedditObservations(userId);
                break;
              case 'whoop':
                observations = await fetchWhoopObservations(userId);
                break;
              case 'github':
                observations = await fetchGitHubObservations(userId);
                break;
              case 'google_gmail':
                observations = await fetchGmailObservations(userId);
                break;
              case 'outlook':
                observations = await fetchOutlookObservations(userId);
                break;
              case 'strava':
                observations = await fetchStravaObservations(userId);
                break;
              case 'garmin':
                observations = await fetchGarminObservations(userId);
                break;
              case 'fitbit':
                observations = await fetchFitbitObservations(userId);
                break;
              case 'twitch':
                observations = await fetchTwitchObservations(userId);
                break;
              case 'oura':
                observations = await fetchOuraObservations(userId);
                break;
            }

            // Batch de-duplication: pre-fetch recent memories once per platform
            // instead of one DB query per observation (N+1 fix).
            // Use a 24-hour window for the pre-fetch (covers current_state and daily_summary).
            // weekly_summary observations fall back to isDuplicate() per-call below.
            const batchWindowMs = DEDUP_WINDOWS_MS.daily_summary; // 24 hours
            const batchCutoff = new Date(Date.now() - batchWindowMs).toISOString();
            const dedupSupabase = await getSupabase();
            const existingHashes = new Set();
            if (dedupSupabase) {
              const { data: recentMems } = await dedupSupabase
                .from('user_memories')
                .select('content')
                .eq('user_id', userId)
                .eq('memory_type', 'platform_data')
                .gte('created_at', batchCutoff)
                .limit(1000);
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

              // For weekly_summary observations the 24h batch window above is too short —
              // fall back to a targeted DB check using the full 7-day window.
              if (contentType === 'weekly_summary') {
                const dup = await isDuplicate(userId, platform, content, contentType);
                if (dup) continue;
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
          case 'discord':
            observations = await fetchDiscordObservations(userId);
            break;
          case 'linkedin':
            observations = await fetchLinkedInObservations(userId);
            break;
          case 'reddit':
            observations = await fetchRedditObservations(userId);
            break;
          case 'google_gmail':
            observations = await fetchGmailObservations(userId);
            break;
          case 'outlook':
            observations = await fetchOutlookObservations(userId);
            break;
          case 'strava':
            observations = await fetchStravaObservations(userId);
            break;
          case 'garmin':
            observations = await fetchGarminObservations(userId);
            break;
          case 'fitbit':
            observations = await fetchFitbitObservations(userId);
            break;
          case 'twitch':
            observations = await fetchTwitchObservations(userId);
            break;
          case 'oura':
            observations = await fetchOuraObservations(userId);
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
  fetchRedditObservations,
  fetchGitHubObservations,
  fetchGmailObservations,
  fetchOutlookObservations,
  fetchStravaObservations,
  fetchGarminObservations,
  fetchFitbitObservations,
  fetchTwitchObservations,
  fetchOuraObservations,
  runPostOnboardingIngestion,
};
