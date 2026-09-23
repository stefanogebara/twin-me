/**
 * Every function under inngest/functions belongs to the legacy twin, which is parked
 * (decision D1, LEGACY_TWIN_ENABLED=false). Registering them through this wrapper rather
 * than through inngest.createFunction directly means a new one cannot forget the gate.
 *
 * The crons that emit these events are already gated, so this changes nothing today. It
 * covers the path that is not gated: anything else that sends one of these events - a
 * manual invoke from the Inngest dashboard, a restored cron, a new caller - would
 * otherwise run a twin handler with the twin parked. On 2026-09-22 that meant a daily
 * briefing still trying to reach a WhatsApp number whose 24-hour window had been shut
 * since August (29 failed sends before the gate reached production).
 */
import { inngest } from '../services/inngestClient.js';
import { legacyTwinParked } from '../middleware/legacyTwin.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('TwinFunction');

/** Same signature as inngest.createFunction; the handler does not run while the twin is parked. */
export function createTwinFunction(config, handler) {
  return inngest.createFunction(config, async (ctx) => {
    if (legacyTwinParked()) {
      log.info('legacy twin parked: function skipped', { id: config?.id });
      return { success: false, reason: 'legacy_twin_parked', message: 'LEGACY_TWIN_ENABLED=false' };
    }
    return handler(ctx);
  });
}
