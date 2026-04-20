/**
 * Steam Data Extractor
 *
 * Uses the Steam Web API (no OAuth) with a server-side API key and a
 * user-provided 64-bit Steam ID (stored in platform_connections.metadata.steamId).
 *
 * Playtime is the single richest behavioral signal for gamers — nobody lies
 * about where they actually spent 300 hours.
 *
 * Private profiles return empty libraries. We surface a graceful observation
 * in that case and return cleanly (no error).
 *
 * API docs: https://steamcommunity.com/dev and https://partner.steamgames.com/doc/webapi
 */

import { supabaseAdmin } from '../database.js';
import { addPlatformObservation } from '../memoryStreamService.js';
import { createLogger } from '../logger.js';

const log = createLogger('SteamExtractor');

const STEAM_API_BASE = 'https://api.steampowered.com';

// Caps — keep well under Vercel 60s maxDuration
const MAX_GAMES = 500;
const TOP_GAMES_FOR_ACHIEVEMENTS = 5;
const TOP_GAMES_FOR_OBSERVATIONS = 10;

// Hardcoded genre map for the most-played Steam titles. Anything unmatched is
// reported as "unknown" and skipped for genre rollups.
const GAME_GENRES = {
  'counter-strike 2': 'shooter',
  'counter-strike: global offensive': 'shooter',
  'dota 2': 'moba',
  'team fortress 2': 'shooter',
  'pubg: battlegrounds': 'shooter',
  'apex legends': 'shooter',
  'rust': 'survival',
  'ark: survival evolved': 'survival',
  'valheim': 'survival',
  'terraria': 'sandbox',
  'minecraft': 'sandbox',
  'garry\'s mod': 'sandbox',
  'grand theft auto v': 'open-world',
  'red dead redemption 2': 'open-world',
  'the elder scrolls v: skyrim': 'rpg',
  'the elder scrolls v: skyrim special edition': 'rpg',
  'the witcher 3: wild hunt': 'rpg',
  'elden ring': 'souls-like',
  'dark souls iii': 'souls-like',
  'dark souls': 'souls-like',
  'baldur\'s gate 3': 'rpg',
  'cyberpunk 2077': 'rpg',
  'hades': 'roguelike',
  'slay the spire': 'roguelike',
  'hollow knight': 'metroidvania',
  'stardew valley': 'life-sim',
  'rimworld': 'colony-sim',
  'factorio': 'automation',
  'satisfactory': 'automation',
  'civilization vi': 'strategy',
  'sid meier\'s civilization vi': 'strategy',
  'crusader kings iii': 'grand-strategy',
  'europa universalis iv': 'grand-strategy',
  'football manager 2024': 'sports-sim',
  'rocket league': 'sports',
  'fifa 23': 'sports',
  'league of legends': 'moba',
  'warframe': 'looter-shooter',
  'destiny 2': 'looter-shooter',
};

async function steamFetch(path, params) {
  const qs = new URLSearchParams(params).toString();
  const url = `${STEAM_API_BASE}${path}?${qs}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Steam API ${path} returned ${res.status}`);
  }
  return res.json();
}

async function loadConnection(userId) {
  const { data, error } = await supabaseAdmin
    .from('platform_connections')
    .select('metadata')
    .eq('user_id', userId)
    .eq('platform', 'steam')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Steam is not connected');
  const steamId = data.metadata?.steamId;
  if (!steamId) throw new Error('Missing steamId on Steam connection metadata');
  return { steamId, metadata: data.metadata || {} };
}

async function storeObservation(userId, content, metadata) {
  try {
    const ok = await addPlatformObservation(userId, content, 'steam', {
      ingestion_source: 'on_demand',
      ingested_at: new Date().toISOString(),
      ...metadata,
    });
    return ok ? 1 : 0;
  } catch (e) {
    log.warn('Failed to store Steam observation', { error: e.message });
    return 0;
  }
}

function inferGenre(name) {
  if (!name) return null;
  return GAME_GENRES[name.toLowerCase()] || null;
}

function minutesToHours(mins) {
  return Math.round((mins || 0) / 60);
}

/**
 * Orchestrator-compatible entry point.
 */
export async function extractAll(userId, _connectorId) {
  const apiKey = process.env.STEAM_WEB_API_KEY;
  if (!apiKey) {
    log.warn('STEAM_WEB_API_KEY missing — skipping Steam extraction');
    return { success: false, itemsExtracted: 0, error: 'STEAM_WEB_API_KEY not configured' };
  }

  log.info('Starting Steam extraction', { userId });

  let stored = 0;

  try {
    const { steamId, metadata } = await loadConnection(userId);

    // 1. Profile summary
    let profile = null;
    try {
      const summaryJson = await steamFetch('/ISteamUser/GetPlayerSummaries/v2/', {
        key: apiKey,
        steamids: steamId,
      });
      profile = summaryJson?.response?.players?.[0] || null;
    } catch (e) {
      log.warn('Profile fetch failed', { error: e.message });
    }

    if (profile) {
      const parts = [];
      if (profile.personaname) parts.push(`Steam persona "${profile.personaname}"`);
      if (profile.loccountrycode) parts.push(`country ${profile.loccountrycode}`);
      if (profile.timecreated) {
        const years = Math.floor((Date.now() / 1000 - profile.timecreated) / (365 * 24 * 3600));
        if (years > 0) parts.push(`account ${years} years old`);
      }
      if (profile.gameextrainfo) parts.push(`currently playing "${profile.gameextrainfo}"`);
      if (parts.length > 0) {
        stored += await storeObservation(
          userId,
          `Steam profile: ${parts.join(', ')}.`,
          { observation_type: 'profile' }
        );
      }
    }

    // 2. Owned games
    let games = [];
    try {
      const ownedJson = await steamFetch('/IPlayerService/GetOwnedGames/v1/', {
        key: apiKey,
        steamid: steamId,
        include_appinfo: 'true',
        include_played_free_games: 'true',
      });
      games = ownedJson?.response?.games || [];
    } catch (e) {
      log.warn('Owned games fetch failed', { error: e.message });
    }

    if (games.length === 0) {
      stored += await storeObservation(
        userId,
        'Steam library is empty or the profile is private. To unlock gaming soul-signature insights, set your Steam profile and game details to public.',
        { observation_type: 'empty_library' }
      );
      return { success: true, itemsExtracted: stored };
    }

    // Sort by total playtime desc, cap to MAX_GAMES
    const sorted = games
      .slice()
      .sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0))
      .slice(0, MAX_GAMES);

    const totalMinutes = sorted.reduce((sum, g) => sum + (g.playtime_forever || 0), 0);
    const totalHours = minutesToHours(totalMinutes);
    const avgHours = sorted.length > 0 ? Math.round(totalHours / sorted.length) : 0;

    // Library rollup
    stored += await storeObservation(
      userId,
      `Your Steam library has ${sorted.length} games and ${totalHours} total hours played (avg ${avgHours}h per game).`,
      { observation_type: 'library_rollup', total_games: sorted.length, total_hours: totalHours }
    );

    // Top 10 most-played observations
    const topGames = sorted.slice(0, TOP_GAMES_FOR_OBSERVATIONS);
    for (const g of topGames) {
      const hours = minutesToHours(g.playtime_forever);
      if (hours < 1) continue;
      stored += await storeObservation(
        userId,
        `You've spent ${hours} hours in "${g.name}" on Steam.`,
        { observation_type: 'top_played', appid: g.appid, hours }
      );
    }

    // Genre mix inference from top 20
    const genreCounts = {};
    for (const g of sorted.slice(0, 20)) {
      const genre = inferGenre(g.name);
      if (!genre) continue;
      genreCounts[genre] = (genreCounts[genre] || 0) + (g.playtime_forever || 0);
    }
    const genreEntries = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]);
    if (genreEntries.length > 0) {
      const topGenres = genreEntries.slice(0, 3).map(([g]) => g).join(', ');
      stored += await storeObservation(
        userId,
        `Your Steam playtime skews toward ${topGenres} games.`,
        { observation_type: 'genre_mix', top_genres: genreEntries.slice(0, 3).map(([g]) => g) }
      );
    }

    // 3. Recently played (last 2 weeks)
    try {
      const recentJson = await steamFetch('/IPlayerService/GetRecentlyPlayedGames/v1/', {
        key: apiKey,
        steamid: steamId,
      });
      const recent = recentJson?.response?.games || [];
      for (const g of recent.slice(0, 5)) {
        const hours2w = minutesToHours(g.playtime_2weeks);
        if (hours2w < 1) continue;
        stored += await storeObservation(
          userId,
          `In the last 2 weeks you played "${g.name}" for ${hours2w}h on Steam.`,
          { observation_type: 'recent_play', appid: g.appid, hours_2w: hours2w }
        );
      }
    } catch (e) {
      log.warn('Recent games fetch failed', { error: e.message });
    }

    // 4. Achievements for top 5 most-played (best-effort, often private)
    const achievementTargets = sorted.slice(0, TOP_GAMES_FOR_ACHIEVEMENTS);
    for (const g of achievementTargets) {
      try {
        const achJson = await steamFetch('/ISteamUserStats/GetPlayerAchievements/v1/', {
          key: apiKey,
          steamid: steamId,
          appid: g.appid,
        });
        const achievements = achJson?.playerstats?.achievements;
        if (!Array.isArray(achievements) || achievements.length === 0) continue;
        const completed = achievements.filter(a => a.achieved === 1).length;
        const pct = Math.round((completed / achievements.length) * 100);
        stored += await storeObservation(
          userId,
          `You completed ${pct}% of achievements (${completed}/${achievements.length}) in "${g.name}" on Steam.`,
          { observation_type: 'achievement_progress', appid: g.appid, percent: pct }
        );
      } catch (e) {
        // Many games have private/unavailable achievements — silently skip
        log.debug?.('Achievement fetch skipped', { appid: g.appid, error: e.message });
      }
    }

    log.info('Steam extraction complete', { userId, stored });
    // Touch metadata-only field to keep the last-synced timestamp useful
    void metadata;
    return { success: true, itemsExtracted: stored };
  } catch (err) {
    log.error('Steam extraction error', { error: err.message });
    return { success: false, itemsExtracted: stored, error: err.message };
  }
}

export default { extractAll };
