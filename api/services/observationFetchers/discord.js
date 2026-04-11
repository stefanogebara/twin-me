/**
 * Discord observation fetcher.
 * Extracted from observationIngestion.js — do not change function signatures.
 */

import axios from 'axios';
import { getValidAccessToken } from '../tokenRefreshService.js';
import { createLogger } from '../logger.js';
import { sanitizeExternal, getSupabase } from '../observationUtils.js';

const log = createLogger('ObservationIngestion');

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

  // Collected structured data for user_platform_data (consumed by discordExtractor.js)
  let guildsData = null;
  let profileData = null;
  let connectionsData = null;

  const tokenResult = await getValidAccessToken(userId, 'discord');
  if (!tokenResult.success || !tokenResult.accessToken) {
    log.warn('Discord: no valid token', { userId });
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
    guildsData = guilds;
    if (guilds.length > 0) {
      const names = guilds.map(g => sanitizeExternal(g.name, 60)).filter(Boolean);

      // Full server list observation
      const preview = names.slice(0, 8).join(', ');
      const suffix = names.length > 8 ? ` and ${names.length - 8} more` : '';
      observations.push({
        content: `Member of ${names.length} Discord communities: ${preview}${suffix}`,
        contentType: 'weekly_summary',
      });

      // Per-category observations with specific server names (richer signal)
      const categories = detectDiscordCategories(names);
      for (const cat of categories) {
        const patterns = {
          'gaming':    /\b(game|gaming|gamer|esport|clan|guild|pvp|mmo|fps|rpg|minecraft|valorant|league|fortnite|apex|steam|roblox|overwatch|wow|warcraft)\b/i,
          'tech/dev':  /\b(dev|code|coding|programming|software|tech|web|python|javascript|typescript|hackathon|open.?source|linux|cyber|ai|ml|data|cloud|backend|frontend)\b/i,
          'creative':  /\b(art|design|creative|writing|writer|photo|film|video|animation|3d|illustration|poetry|fiction|manga|draw|pixel|vfx|ux)\b/i,
          'learning':  /\b(study|learn|school|university|college|class|course|tutorial|math|science|language|book|research|exam|homework|knowledge)\b/i,
          'music':     /\b(music|spotify|playlist|dj|producer|beats|rap|hip.?hop|edm|rock|jazz|classical|band|sound|audio|synth|piano)\b/i,
          'finance':   /\b(finance|invest|trading|stock|forex|crypto|bitcoin|nft|defi|web3|money|wallet|portfolio|market|hedge)\b/i,
          'health':    /\b(health|fitness|gym|workout|nutrition|diet|mental.health|wellness|yoga|meditation|run|sport|body|lift|cardio)\b/i,
          'sports':    /\b(sport|football|soccer|basketball|baseball|tennis|golf|esport|nba|nfl|f1|racing|cricket|rugby|hockey)\b/i,
        };
        const matchingServers = names.filter(n => patterns[cat.label]?.test(n));
        const serverList = matchingServers.slice(0, 5).join(', ');
        observations.push({
          content: `Active in ${cat.count} ${cat.label} Discord communities: ${serverList}`,
          contentType: 'weekly_summary',
        });
      }

      // Notable servers (top 5 by name recognition — just list them)
      const notableServers = names.slice(0, 5);
      if (notableServers.length > 0) {
        observations.push({
          content: `Most active Discord servers include: ${notableServers.join(', ')}`,
          contentType: 'weekly_summary',
        });
      }

      // Community engagement depth: owner vs member ratio
      const ownedCount = guilds.filter(g => g.owner).length;
      if (ownedCount > 0) {
        observations.push({
          content: `Owns ${ownedCount} Discord server${ownedCount > 1 ? 's' : ''} — active community builder`,
          contentType: 'weekly_summary',
        });
      }

      // Server size distribution insight
      const largeServers = guilds.filter(g => g.approximate_member_count > 1000).length;
      const smallServers = guilds.filter(g => g.approximate_member_count && g.approximate_member_count <= 50).length;
      if (largeServers > 0 && smallServers > 0) {
        observations.push({
          content: `Mix of ${largeServers} large community servers and ${smallServers} tight-knit groups on Discord — comfortable in both public and private spaces`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    log.warn('Discord guilds error', { error: e });
  }

  // ── Connected accounts — cross-platform identity signal ───────────────────
  try {
    const connRes = await axios.get('https://discord.com/api/v10/users/@me/connections', { headers, timeout: 8000 });
    const connections = connRes.data || [];
    connectionsData = connections;
    if (connections.length > 0) {
      const platforms = connections.map(c => sanitizeExternal(c.type, 30)).filter(Boolean);
      observations.push({
        content: `Discord linked to: ${[...new Set(platforms)].join(', ')} — cross-platform digital identity`,
        contentType: 'weekly_summary',
      });
    }
  } catch (e) {
    log.warn('Discord connections error', { error: e.message });
  }

  // ── User profile — account age + Nitro status ────────────────────────────
  try {
    const profileRes = await axios.get('https://discord.com/api/v10/users/@me', { headers, timeout: 8000 });
    const profile = profileRes.data;
    profileData = profile;
    if (profile?.id) {
      // Extract account creation date from Discord Snowflake ID
      const snowflake = BigInt(profile.id);
      const discordEpoch = BigInt(1420070400000);
      const createdMs = Number((snowflake >> BigInt(22)) + discordEpoch);
      const years = Math.round((Date.now() - createdMs) / (365.25 * 24 * 60 * 60 * 1000) * 10) / 10;
      if (years > 0) {
        observations.push({
          content: `Discord account is ${years} years old — ${years > 5 ? 'early adopter' : years > 2 ? 'established user' : 'relatively new'}`,
          contentType: 'weekly_summary',
        });
      }
      if (profile.premium_type && profile.premium_type > 0) {
        observations.push({
          content: 'Has Discord Nitro subscription — invests in premium digital experiences',
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    log.warn('Discord profile error', { error: e.message });
  }

  // ── Store structured Discord data in user_platform_data ──
  // The feature extractor (discordExtractor.js) reads from user_platform_data
  // with data_types: guilds, guild_membership, profile.
  log.info('Discord upsert check', { userId: userId.slice(0, 8), hasGuilds: !!guildsData, hasProfile: !!profileData, hasConnections: !!connectionsData });
  try {
    const supabase = await getSupabase();
    if (supabase && (guildsData || profileData || connectionsData)) {
      const now = new Date().toISOString();
      const upserts = [];

      const today = new Date().toISOString().slice(0, 10);

      if (guildsData && guildsData.length > 0) {
        // Extract role-like signal: owner count
        const ownedServers = guildsData.filter(g => g.owner).map(g => ({ id: g.id, name: g.name }));
        upserts.push({
          user_id: userId,
          platform: 'discord',
          data_type: 'guilds',
          source_url: `discord:guilds:${today}`,
          raw_data: {
            items: guildsData.map(g => ({
              id: g.id,
              name: g.name,
              owner: g.owner || false,
              member_count: g.approximate_member_count || null,
              permissions: g.permissions || null,
            })),
            total_count: guildsData.length,
            owned_count: ownedServers.length,
          },
          extracted_at: now,
        });
      }

      if (profileData?.id) {
        const snowflake = BigInt(profileData.id);
        const discordEpoch = BigInt(1420070400000);
        const createdMs = Number((snowflake >> BigInt(22)) + discordEpoch);
        upserts.push({
          user_id: userId,
          platform: 'discord',
          data_type: 'profile',
          source_url: `discord:profile:${today}`,
          raw_data: {
            id: profileData.id,
            username: profileData.username,
            account_created_at: new Date(createdMs).toISOString(),
            premium_type: profileData.premium_type || 0,
            has_nitro: (profileData.premium_type || 0) > 0,
            connections: connectionsData ? connectionsData.map(c => c.type) : [],
          },
          extracted_at: now,
        });
      }

      if (upserts.length > 0) {
        const { error: upsertErr } = await supabase.from('user_platform_data').upsert(upserts, {
          onConflict: 'user_id,platform,data_type,source_url'
        });
        if (upsertErr) {
          log.warn('Discord user_platform_data upsert error', { error: upsertErr.message });
        } else {
          log.info('Discord structured data stored', { userId: userId.slice(0, 8), entries: upserts.length });
        }
      }
    }
  } catch (e) {
    log.warn('Discord structured data storage failed (non-fatal)', { error: e.message });
  }

  return observations;
}

export default fetchDiscordObservations;
export { fetchDiscordObservations };
