/**
 * Discord Live Collector
 * ======================
 * Captures Discord activity WHILE the user is on discord.com, mirroring
 * the Instagram collector pattern. Fills the gap left by Discord's OAuth
 * scope, which only exposes identity + a guild *name list* — no message
 * history, no per-server engagement, no time-in-channel.
 *
 * Signals captured:
 *   - channel_visit:  navigation to /channels/<server>/<channel> or
 *                     /channels/@me/<dm_id>. Server + channel ID extracted
 *                     from the URL. SPA route change tracked via
 *                     history.pushState / popstate / URL polling.
 *   - channel_dwell:  time spent in a single channel before navigating
 *                     away (in seconds). Shipped on URL change + visibility
 *                     change + 5-min flush timer.
 *   - message_sent:   intercepted via window.fetch — Discord POSTs every
 *                     message to /api/v9/channels/<channel>/messages. We
 *                     only count the POST (channel id + timestamp), never
 *                     read the request body. Content is NOT inspected.
 *   - server_sidebar: snapshot of server names currently listed in the
 *                     sidebar — useful when the OAuth guilds endpoint
 *                     returns stale data or the user has DM-only servers.
 *
 * PRIVACY contract: message content is NEVER read or shipped. Only
 * counts, channel/server IDs, and timestamps. Sensitive DM identifiers
 * (the @me/<dm_id>) are kept as opaque IDs.
 *
 * Ship cadence: events accumulate in a per-page batch and ship every
 * 30s via SEND_PLATFORM_DATA (same channel Instagram uses).
 */

console.log('[Soul Signature] Discord collector loaded');

const DISCORD_BATCH = [];
const SHIP_INTERVAL_MS = 30_000;
const FLUSH_DWELL_INTERVAL_MS = 5 * 60_000;

let currentLocation = null;
let currentEnteredAt = null;
let isAuthenticated = false;

// ---------------------------------------------------------------------------
// Auth handshake — same gating Instagram uses.
// ---------------------------------------------------------------------------

chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' }, (response) => {
  if (chrome.runtime.lastError) return;
  if (response?.authenticated) {
    isAuthenticated = true;
    console.log('[Soul Signature] Discord collector authenticated');
    onLocationChanged();
  } else {
    console.log('[Soul Signature] Discord collector waiting for auth');
  }
});

// ---------------------------------------------------------------------------
// URL parser — extract { kind, server_id, channel_id } from a Discord path.
// kind: 'guild_channel' | 'dm' | 'group_dm' | 'home' | 'discovery' | 'other'
// ---------------------------------------------------------------------------

function parseDiscordLocation(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length === 0 || parts[0] !== 'channels') {
      return { kind: 'other', url };
    }
    const a = parts[1];
    const b = parts[2];
    if (a === '@me') {
      // Direct messages — server_id is "@me", channel_id is the dm id
      if (!b) return { kind: 'home', server_id: '@me', channel_id: null, url };
      return { kind: 'dm', server_id: '@me', channel_id: b, url };
    }
    if (a && /^\d+$/.test(a)) {
      return { kind: 'guild_channel', server_id: a, channel_id: b ?? null, url };
    }
    return { kind: 'other', url };
  } catch {
    return { kind: 'other', url };
  }
}

// ---------------------------------------------------------------------------
// Server-sidebar snapshot — Discord's left rail has <a> wrapping each guild
// icon. The aria-label is the server name (localized but always present).
// ---------------------------------------------------------------------------

function snapshotServerSidebar() {
  try {
    const guildAnchors = document.querySelectorAll(
      'nav[aria-label] a[data-list-item-id^="guildsnav___"], nav a[href^="/channels/"][role="link"]'
    );
    const seen = new Set();
    const items = [];
    for (const el of guildAnchors) {
      const href = el.getAttribute('href') || '';
      const m = href.match(/^\/channels\/(\d+)/);
      if (!m) continue;
      const guildId = m[1];
      if (seen.has(guildId)) continue;
      seen.add(guildId);
      const name = el.getAttribute('aria-label') || el.getAttribute('data-dnd-name') || null;
      items.push({ guild_id: guildId, name: name?.trim() || null });
      if (items.length >= 50) break;
    }
    return items;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Dwell tracking + event push.
// ---------------------------------------------------------------------------

function pushEvent(event) {
  DISCORD_BATCH.push(event);
}

function flushDwell(reason) {
  if (!currentLocation || !currentEnteredAt) return;
  const seconds = Math.round((Date.now() - currentEnteredAt) / 1000);
  if (seconds < 2) return; // ignore quick flashes
  pushEvent({
    eventType: 'channel_dwell',
    platform: 'discord',
    timestamp: new Date(currentEnteredAt).toISOString(),
    data: {
      kind: currentLocation.kind,
      server_id: currentLocation.server_id ?? null,
      channel_id: currentLocation.channel_id ?? null,
      duration_seconds: seconds,
      ended_at: new Date().toISOString(),
      reason,
      title: discordEventTitle(currentLocation, seconds),
      url: currentLocation.url,
      type: 'channel_dwell',
    },
  });
  currentEnteredAt = null;
}

function discordEventTitle(loc, seconds) {
  const minutes = Math.round((seconds / 60) * 10) / 10;
  if (loc.kind === 'guild_channel') {
    return `Spent ${minutes}m in Discord channel ${loc.channel_id ?? '?'} (server ${loc.server_id})`;
  }
  if (loc.kind === 'dm') return `Spent ${minutes}m in a Discord DM`;
  if (loc.kind === 'group_dm') return `Spent ${minutes}m in a Discord group DM`;
  return `Spent ${minutes}m on Discord`;
}

function onLocationChanged() {
  if (!isAuthenticated) return;
  const next = parseDiscordLocation(location.href);
  // Flush dwell from previous location if any
  flushDwell('navigation');

  if (next.kind === 'guild_channel' || next.kind === 'dm' || next.kind === 'group_dm') {
    currentLocation = next;
    currentEnteredAt = Date.now();
    pushEvent({
      eventType: 'channel_visit',
      platform: 'discord',
      timestamp: new Date().toISOString(),
      data: {
        kind: next.kind,
        server_id: next.server_id ?? null,
        channel_id: next.channel_id ?? null,
        url: next.url,
        title:
          next.kind === 'guild_channel'
            ? `Opened Discord channel ${next.channel_id ?? '?'} in server ${next.server_id}`
            : next.kind === 'dm'
              ? 'Opened a Discord DM'
              : 'Opened a Discord group DM',
        type: 'channel_visit',
      },
    });
  } else {
    currentLocation = null;
  }
}

// ---------------------------------------------------------------------------
// SPA route tracking — Discord uses client-side routing. Patch
// pushState/replaceState + listen for popstate. Poll URL as a belt-and-
// suspenders fallback (some flows skip history events).
// ---------------------------------------------------------------------------

const _pushState = history.pushState;
history.pushState = function (...args) {
  const ret = _pushState.apply(this, args);
  queueMicrotask(onLocationChanged);
  return ret;
};
const _replaceState = history.replaceState;
history.replaceState = function (...args) {
  const ret = _replaceState.apply(this, args);
  queueMicrotask(onLocationChanged);
  return ret;
};
window.addEventListener('popstate', onLocationChanged);

let lastSeenUrl = location.href;
setInterval(() => {
  if (location.href !== lastSeenUrl) {
    lastSeenUrl = location.href;
    onLocationChanged();
  }
}, 1000);

// ---------------------------------------------------------------------------
// message_sent detection via fetch interception.
// Discord posts to /api/v9/channels/<id>/messages on every send. Body is
// NEVER inspected — we only stamp { channel_id, sent_at }.
// ---------------------------------------------------------------------------

const MESSAGE_POST_RX = /\/api\/v\d+\/channels\/(\d+)\/messages(?:\?|$)/;

const _origFetch = window.fetch;
window.fetch = function (...args) {
  try {
    const req = args[0];
    const init = args[1] || {};
    const url = typeof req === 'string' ? req : req?.url || '';
    const method = (typeof req !== 'string' && req?.method) || init?.method || 'GET';
    if (method.toUpperCase() === 'POST') {
      const m = MESSAGE_POST_RX.exec(url);
      if (m && isAuthenticated) {
        const channelId = m[1];
        const loc = parseDiscordLocation(location.href);
        pushEvent({
          eventType: 'message_sent',
          platform: 'discord',
          timestamp: new Date().toISOString(),
          data: {
            channel_id: channelId,
            server_id: loc.kind === 'guild_channel' ? loc.server_id : '@me',
            kind: loc.kind,
            url: location.href,
            title:
              loc.kind === 'guild_channel'
                ? `Sent a message in Discord channel ${channelId} (server ${loc.server_id})`
                : 'Sent a Discord DM',
            type: 'message_sent',
          },
        });
      }
    }
  } catch {
    // never let the interceptor break the page
  }
  return _origFetch.apply(this, args);
};

// ---------------------------------------------------------------------------
// Periodic server-sidebar snapshot — once per 10 min while page open.
// ---------------------------------------------------------------------------

function shipSidebarSnapshot() {
  if (!isAuthenticated) return;
  const items = snapshotServerSidebar();
  if (items.length === 0) return;
  pushEvent({
    eventType: 'server_sidebar',
    platform: 'discord',
    timestamp: new Date().toISOString(),
    data: {
      servers: items,
      count: items.length,
      url: location.href,
      title: `Discord sidebar snapshot — ${items.length} servers visible`,
      type: 'server_sidebar',
    },
  });
}

// First snapshot after sidebar settles
setTimeout(shipSidebarSnapshot, 8000);
setInterval(shipSidebarSnapshot, 10 * 60_000);

// ---------------------------------------------------------------------------
// Visibility + unload — flush dwell so we don't lose the last segment.
// ---------------------------------------------------------------------------

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    flushDwell('visibility_hidden');
  } else if (currentLocation && !currentEnteredAt) {
    currentEnteredAt = Date.now();
  }
});

window.addEventListener('beforeunload', () => flushDwell('unload'));

// Flush at intervals so a tab open all day still records its time.
setInterval(() => {
  flushDwell('interval_flush');
  if (currentLocation && !currentEnteredAt) currentEnteredAt = Date.now();
}, FLUSH_DWELL_INTERVAL_MS);

// ---------------------------------------------------------------------------
// Ship batch every 30s.
// ---------------------------------------------------------------------------

setInterval(() => {
  if (DISCORD_BATCH.length === 0) return;
  const events = DISCORD_BATCH.splice(0, DISCORD_BATCH.length);
  try {
    chrome.runtime.sendMessage(
      { type: 'SEND_PLATFORM_DATA', platform: 'discord', events },
      () => {
        void chrome.runtime.lastError;
      }
    );
    console.log(`[Soul Signature] shipped ${events.length} Discord events`);
  } catch (e) {
    console.warn('[Soul Signature] Discord ship error:', e);
  }
}, SHIP_INTERVAL_MS);

console.log('[Soul Signature] Discord collector installed');
