/**
 * Build a Discord activity snapshot for the chat dispatcher.
 *
 * Two data sources, merged:
 *   - user_platform_data: cached OAuth guild list + profile (refreshed
 *     periodically by the extractionOrchestrator). Discord's OAuth
 *     scope only exposes guild names + IDs — no message history —
 *     so this gives us "what communities does the user belong to".
 *   - user_memories: extension-sourced observations from the live
 *     collector — channel_dwell, message_sent, server_sidebar
 *     snapshots, channel_visit. These are the rich behavioral
 *     signals OAuth can't reach.
 *
 * Returns null if there's no data at all (user has neither connected
 * Discord nor installed the extension on it).
 */

import { supabaseAdmin } from '../../database.js';
import { createLogger } from '../../logger.js';

const log = createLogger('DiscordSnapshot');

const RECENT_DAYS = 14;
const MEMORY_LIMIT = 400;

/**
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function getDiscordSnapshot(userId) {
  if (!userId) return null;

  const [oauthPart, extensionPart] = await Promise.all([
    loadOAuthCachedData(userId),
    loadExtensionDerivedData(userId),
  ]);

  // If we have nothing at all, return null so the dispatcher skips.
  const hasOauth = oauthPart && (oauthPart.guilds.length > 0 || oauthPart.username);
  const hasExtension = extensionPart && extensionPart.totals.messages_sent + extensionPart.totals.channel_visits + extensionPart.totals.dwell_seconds > 0;
  if (!hasOauth && !hasExtension) return null;

  return {
    identity: oauthPart?.identity ?? null,
    guilds: oauthPart?.guilds ?? [],
    extension: extensionPart ?? null,
    window_days: RECENT_DAYS,
  };
}

async function loadOAuthCachedData(userId) {
  try {
    const { data: profileRow } = await supabaseAdmin
      .from('user_platform_data')
      .select('raw_data, extracted_at')
      .eq('user_id', userId)
      .eq('platform', 'discord')
      .eq('data_type', 'profile')
      .order('extracted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: guildsRow } = await supabaseAdmin
      .from('user_platform_data')
      .select('raw_data, extracted_at')
      .eq('user_id', userId)
      .eq('platform', 'discord')
      .eq('data_type', 'guilds')
      .order('extracted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const profile = profileRow?.raw_data ?? null;
    const items = guildsRow?.raw_data?.items ?? [];

    return {
      identity: profile ? { username: profile.username, has_nitro: profile.has_nitro } : null,
      username: profile?.username ?? null,
      guilds: items.map((g) => ({
        guild_id: g.id,
        name: g.name,
        owner: Boolean(g.owner),
      })),
      last_synced_at: guildsRow?.extracted_at ?? profileRow?.extracted_at ?? null,
    };
  } catch (err) {
    log.warn('loadOAuthCachedData failed', { error: err?.message ?? String(err) });
    return null;
  }
}

async function loadExtensionDerivedData(userId) {
  try {
    const sinceIso = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows } = await supabaseAdmin
      .from('user_platform_data')
      .select('data_type, raw_data, extracted_at')
      .eq('user_id', userId)
      .eq('platform', 'discord')
      .gte('extracted_at', sinceIso)
      .order('extracted_at', { ascending: false })
      .limit(MEMORY_LIMIT);

    if (!rows || rows.length === 0) {
      return { totals: { messages_sent: 0, channel_visits: 0, dwell_seconds: 0 }, top_servers: [] };
    }

    let messagesSent = 0;
    let channelVisits = 0;
    let totalDwellSec = 0;
    const dwellByServer = {}; // server_id -> seconds
    const sentByServer = {}; // server_id -> count
    const serverNames = {}; // server_id -> last-known name (from server_sidebar snapshots)

    for (const r of rows) {
      const inner = r.raw_data?.data ?? r.raw_data ?? {};
      const eventType = inner.type ?? r.raw_data?.eventType ?? null;
      const serverId = inner.server_id ?? null;

      if (eventType === 'message_sent') {
        messagesSent += 1;
        if (serverId) sentByServer[serverId] = (sentByServer[serverId] ?? 0) + 1;
      } else if (eventType === 'channel_visit') {
        channelVisits += 1;
      } else if (eventType === 'channel_dwell') {
        const sec = Number(inner.duration_seconds) || 0;
        totalDwellSec += sec;
        if (serverId) dwellByServer[serverId] = (dwellByServer[serverId] ?? 0) + sec;
      } else if (eventType === 'server_sidebar') {
        const servers = inner.servers ?? [];
        for (const s of servers) {
          if (s.guild_id && s.name) serverNames[s.guild_id] = s.name;
        }
      }
    }

    // Build top servers by combined-activity score: 1 dwell minute = 1 point,
    // 1 message sent = 5 points (sending is much higher signal than passive).
    const allServerIds = new Set([
      ...Object.keys(dwellByServer),
      ...Object.keys(sentByServer),
    ]);
    const scored = [];
    for (const id of allServerIds) {
      const dwellMin = (dwellByServer[id] ?? 0) / 60;
      const sent = sentByServer[id] ?? 0;
      const score = dwellMin + sent * 5;
      if (score < 1) continue;
      scored.push({
        server_id: id,
        name: serverNames[id] ?? null,
        dwell_minutes: Math.round(dwellMin),
        messages_sent: sent,
        score,
      });
    }
    scored.sort((a, b) => b.score - a.score);
    const topServers = scored.slice(0, 5);

    return {
      totals: {
        messages_sent: messagesSent,
        channel_visits: channelVisits,
        dwell_seconds: totalDwellSec,
      },
      top_servers: topServers,
    };
  } catch (err) {
    log.warn('loadExtensionDerivedData failed', { error: err?.message ?? String(err) });
    return { totals: { messages_sent: 0, channel_visits: 0, dwell_seconds: 0 }, top_servers: [] };
  }
}
