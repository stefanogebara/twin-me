/**
 * Twitch observation fetcher.
 * Extracted from observationIngestion.js — do not change function signatures.
 */

import axios from 'axios';
import { getValidAccessToken } from '../tokenRefreshService.js';
import { createLogger } from '../logger.js';
import { sanitizeExternal, getSupabase, _hasNangoMapping } from '../observationUtils.js';

const log = createLogger('ObservationIngestion');

/**
 * Build observations from Twitch followed channels data.
 * Shared by both Nango and direct OAuth paths.
 */
function _buildTwitchChannelObservations(observations, channels) {
  if (!channels || channels.length === 0) return;

  observations.push({
    content: `Follows ${channels.length} Twitch channels`,
    contentType: 'weekly_summary',
  });

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

  const topNames = channels.slice(0, 3)
    .map(c => sanitizeExternal(c.broadcaster_name || c.broadcaster_login || '', 40))
    .filter(Boolean);
  if (topNames.length > 0) {
    observations.push({
      content: `Top followed Twitch channels include: ${topNames.join(', ')}`,
      contentType: 'weekly_summary',
    });
  }

  // Follow loyalty: parse followed_at timestamps
  const followDates = channels
    .map(c => ({ name: c.broadcaster_name || c.broadcaster_login, date: c.followed_at ? new Date(c.followed_at) : null }))
    .filter(f => f.date && !isNaN(f.date.getTime()))
    .sort((a, b) => a.date - b.date);

  if (followDates.length >= 3) {
    const now = Date.now();
    const avgMonths = Math.round(followDates.reduce((sum, f) => sum + (now - f.date.getTime()), 0) / followDates.length / (1000 * 60 * 60 * 24 * 30));
    const oldest = followDates[0];
    const oldestMonths = Math.round((now - oldest.date.getTime()) / (1000 * 60 * 60 * 24 * 30));

    // Recently followed (< 30 days)
    const recentFollows = followDates.filter(f => (now - f.date.getTime()) < 30 * 24 * 60 * 60 * 1000);
    const recentNames = recentFollows.map(f => sanitizeExternal(f.name, 40)).filter(Boolean).slice(0, 3);

    observations.push({
      content: `Twitch follow loyalty: following ${channels.length} channels for avg ${avgMonths} months, oldest follow ${sanitizeExternal(oldest.name, 40)} (${oldestMonths} months)${recentNames.length > 0 ? `, recently followed: ${recentNames.join(', ')}` : ''}`,
      contentType: 'weekly_summary',
    });
  }
}

/**
 * Store structured Twitch data in user_platform_data for the feature extractor.
 * The extractor (twitchExtractor.js) reads from user_platform_data with
 * data_types: followed_channels, streams, gaming_preferences, profile.
 */
async function _storeTwitchPlatformData(supabase, userId, profileData, channelsData) {
  if (!supabase || (!profileData && !channelsData)) return;
  try {
    const now = new Date().toISOString();
    const upserts = [];

    const today = new Date().toISOString().slice(0, 10);

    if (profileData?.id) {
      const broadcastType = profileData.broadcaster_type || '';
      upserts.push({
        user_id: userId,
        platform: 'twitch',
        data_type: 'profile',
        source_url: `twitch:profile:${today}`,
        raw_data: {
          id: profileData.id,
          login: profileData.login,
          display_name: profileData.display_name,
          broadcaster_type: broadcastType,
          is_streamer: broadcastType === 'affiliate' || broadcastType === 'partner',
          view_count: profileData.view_count || 0,
          created_at: profileData.created_at,
        },
        extracted_at: now,
      });
    }

    if (channelsData && channelsData.length > 0) {
      upserts.push({
        user_id: userId,
        platform: 'twitch',
        data_type: 'followed_channels',
        source_url: `twitch:followed_channels:${today}`,
        raw_data: {
          items: channelsData.map(c => ({
            broadcaster_id: c.broadcaster_id,
            broadcaster_name: c.broadcaster_name || c.broadcaster_login,
            broadcaster_login: c.broadcaster_login,
            followed_at: c.followed_at,
          })),
          total_count: channelsData.length,
        },
        extracted_at: now,
      });
    }

    if (upserts.length > 0) {
      const { error: upsertErr } = await supabase.from('user_platform_data').upsert(upserts, {
        onConflict: 'user_id,platform,data_type,source_url'
      });
      if (upsertErr) {
        log.warn('Twitch user_platform_data upsert error', { error: upsertErr.message });
      } else {
        log.info('Twitch structured data stored', { userId: userId.slice(0, 8), entries: upserts.length });
      }
    }
  } catch (e) {
    log.warn('Twitch structured data storage failed (non-fatal)', { error: e.message });
  }
}

/**
 * Fetch Twitch data and return natural-language observations.
 * Supports both Nango-managed and direct OAuth connections.
 */
async function fetchTwitchObservations(userId) {
  const observations = [];

  // Collected structured data for user_platform_data (consumed by twitchExtractor.js)
  let userProfileData = null;
  let followedChannelsData = null;

  const supabase = await getSupabase();
  if (!supabase) return observations;

  // Check if this is a Nango-managed Twitch connection or direct OAuth
  const { data: twitchConn } = await supabase
    .from('platform_connections')
    .select('access_token')
    .eq('user_id', userId)
    .eq('platform', 'twitch')
    .single();

  const isNangoManaged = twitchConn?.access_token === 'NANGO_MANAGED'
    || (!twitchConn && await _hasNangoMapping(supabase, userId, 'twitch'));

  let twitchUserId = null;
  let twitchHeaders = null;

  if (isNangoManaged) {
    // ── Nango path ──────────────────────────────────────────────────────────
    let nangoService;
    try {
      nangoService = await import('../nangoService.js');
    } catch (e) {
      log.warn('Twitch: failed to load nangoService', { error: e });
      return observations;
    }

    try {
      const userResult = await nangoService.twitch.getUser(userId);
      const userData = userResult.success ? userResult.data?.data?.[0] : null;
      userProfileData = userData;
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
      log.warn('Twitch Nango getUser error', { error: e });
      return observations;
    }

    if (!twitchUserId) return observations;

    try {
      const followResult = await nangoService.twitch.getFollowedChannels(userId, twitchUserId);
      const channels = followResult.success ? (followResult.data?.data || []) : [];
      followedChannelsData = channels;
      _buildTwitchChannelObservations(observations, channels);
    } catch (e) {
      log.warn('Twitch Nango getFollowedChannels error', { error: e });
    }

    await _storeTwitchPlatformData(supabase, userId, userProfileData, followedChannelsData);
    return observations;
  }

  // ── Direct OAuth path ─────────────────────────────────────────────────────
  const tokenResult = await getValidAccessToken(userId, 'twitch');
  if (!tokenResult.success || !tokenResult.accessToken) {
    log.warn('Twitch: no valid token', { userId });
    return observations;
  }

  // Twitch API requires both Authorization and Client-Id headers
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) {
    log.warn('Twitch: TWITCH_CLIENT_ID not set');
    return observations;
  }

  twitchHeaders = {
    'Authorization': `Bearer ${tokenResult.accessToken}`,
    'Client-Id': clientId,
  };

  // ── 1. Get Twitch user ID ────────────────────────────────────────────────
  try {
    const userRes = await axios.get('https://api.twitch.tv/helix/users', {
      headers: twitchHeaders, timeout: 10000,
    });
    const userData = userRes.data?.data?.[0];
    userProfileData = userData;
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
    log.warn('Twitch getUser error', { error: e });
    return observations;
  }

  if (!twitchUserId) return observations;

  // ── 2. Followed channels → content interest fingerprint ──────────────────
  try {
    const followRes = await axios.get(
      `https://api.twitch.tv/helix/channels/followed?user_id=${twitchUserId}&first=100`,
      { headers: twitchHeaders, timeout: 10000 }
    );
    const channels = followRes.data?.data || [];
    followedChannelsData = channels;
    _buildTwitchChannelObservations(observations, channels);
  } catch (e) {
    log.warn('Twitch getFollowedChannels error', { error: e });
  }

  await _storeTwitchPlatformData(supabase, userId, userProfileData, followedChannelsData);
  return observations;
}

export default fetchTwitchObservations;
export { fetchTwitchObservations };
