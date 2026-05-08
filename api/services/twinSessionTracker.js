/**
 * Twin chat session tracker.
 *
 * After every assistant message, record the current timestamp keyed on
 * userId. If a previous timestamp exists and is >15 min old, the OLD
 * session ended — fire an Inngest SESSION_ENDED event so the
 * post-conversation reflection (facts, HUMAN block update, follow-ups)
 * runs once per session rather than per message.
 *
 * Storage: Redis (cross-instance) with global Map fallback for local dev.
 *
 * Extracted from twin-chat.js (audit ARCH-1).
 */

import { getRedisClient, isRedisAvailable } from './redisClient.js';
import { createLogger } from './logger.js';

const log = createLogger('TwinSessionTracker');

const SESSION_TTL_SECONDS = 30 * 60;
const SESSION_GAP_MS = 15 * 60 * 1000;

/**
 * Record a chat message timestamp for the user. If the previous
 * timestamp is more than 15 minutes old, treat that as a session
 * boundary and fire a SESSION_ENDED Inngest event for the OLD session
 * so the reflection job runs once.
 *
 * Non-blocking: errors are swallowed and logged at debug level — the
 * caller (chat handler) should never fail because session tracking
 * couldn't reach Redis or Inngest.
 *
 * @param {string} userId
 */
export async function trackChatMessage(userId) {
  if (!userId) return;
  try {
    let prevTimestamp = null;
    const sessionKey = `twin:lastMsg:${userId}`;
    const nowStr = Date.now().toString();

    const client = getRedisClient();
    if (client && isRedisAvailable()) {
      prevTimestamp = await client.get(sessionKey);
      await client.set(sessionKey, nowStr, 'EX', SESSION_TTL_SECONDS);
    } else {
      if (!global._twinSessionTracker) global._twinSessionTracker = new Map();
      prevTimestamp = global._twinSessionTracker.get(userId);
      global._twinSessionTracker.set(userId, nowStr);
    }

    if (!prevTimestamp) return;

    const gap = Date.now() - parseInt(prevTimestamp);
    if (gap > SESSION_GAP_MS) {
      log.info('Session gap detected, triggering reflection', {
        userId, gapMinutes: Math.round(gap / 60000),
      });
      // Fire Inngest event for session reflection (non-blocking).
      import('./inngestClient.js').then(({ inngest, EVENTS }) => {
        inngest.send({ name: EVENTS.SESSION_ENDED, data: { userId } })
          .catch(err => log.warn('Inngest session reflection trigger failed', { error: err }));
      });
    }
  } catch (sessionErr) {
    log.debug('Session tracking failed (non-fatal)', { error: sessionErr?.message });
  }
}
