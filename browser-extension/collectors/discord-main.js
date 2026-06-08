/**
 * Discord MAIN-world fetch interceptor.
 *
 * Content scripts run in an ISOLATED JavaScript world — their assignment
 * to `window.fetch` does NOT propagate to the page's main world. Discord's
 * own JS makes message POSTs from the main world, so an interceptor in
 * the isolated world never sees them.
 *
 * This script runs with manifest `world: "MAIN"` and patches the actual
 * page fetch. When a POST to /api/v\d+/channels/<id>/messages is detected,
 * it dispatches a CustomEvent that the isolated-world discord.js listens
 * for and forwards to the background batcher.
 *
 * Same world-split pattern as content/twinme-auth-main.js.
 */

(function () {
  'use strict';

  const MESSAGE_POST_RX = /\/api\/v\d+\/channels\/(\d+)\/messages(?:\?|$)/;
  const EVENT_NAME = 'twinme:discord:message_sent';

  function parseLocation() {
    try {
      const parts = location.pathname.split('/').filter(Boolean);
      if (parts.length === 0 || parts[0] !== 'channels') {
        return { kind: 'other' };
      }
      const a = parts[1];
      const b = parts[2];
      if (a === '@me') {
        if (!b) return { kind: 'home', server_id: '@me' };
        return { kind: 'dm', server_id: '@me', channel_id: b };
      }
      if (a && /^\d+$/.test(a)) {
        return { kind: 'guild_channel', server_id: a, channel_id: b ?? null };
      }
      return { kind: 'other' };
    } catch {
      return { kind: 'other' };
    }
  }

  const origFetch = window.fetch;
  window.fetch = function (...args) {
    try {
      const req = args[0];
      const init = args[1] || {};
      const url = typeof req === 'string' ? req : req?.url || '';
      const method = (typeof req !== 'string' && req?.method) || init?.method || 'GET';
      if (method.toUpperCase() === 'POST') {
        const m = MESSAGE_POST_RX.exec(url);
        if (m) {
          const channelId = m[1];
          const loc = parseLocation();
          window.dispatchEvent(new CustomEvent(EVENT_NAME, {
            detail: {
              channel_id: channelId,
              server_id: loc.kind === 'guild_channel' ? loc.server_id : '@me',
              kind: loc.kind,
              url: location.href,
            },
          }));
        }
      }
    } catch {
      // never let the interceptor break the page
    }
    return origFetch.apply(this, args);
  };

  console.log('[Soul Signature] Discord main-world fetch interceptor installed');
})();
