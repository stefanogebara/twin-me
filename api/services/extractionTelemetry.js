/**
 * Extraction telemetry (consolidation Phase 0, 2026-06-08; durable sink 2026-06-09)
 *
 * Emits ONE greppable event per extraction run so production reveals which
 * path(s) actually fire per platform. The codebase has three historical
 * extraction paths (see tasks/extraction-consolidation-2026-06-08/) and most
 * platforms are implemented in 2-3 of them. Before retiring the duplicates in
 * later phases we need evidence of what really runs in prod — this is that
 * evidence base.
 *
 * Two sinks:
 *   - log.info('extraction_run', ...) — always, for live tailing.
 *   - public.extraction_events table — for the user-triggered paths only
 *     (on_demand/oauth_callback/post_onboarding). The high-volume BACKGROUND
 *     path is NOT persisted here; it is already durably recorded in
 *     cron_executions.result_data. Vercel runtime logs have too-short retention
 *     for the multi-day Phase 4 census, hence the durable table.
 *
 * Logging is synchronous and never throws; DB persistence is fire-and-forget and
 * never blocks or breaks extraction.
 */
import { createLogger } from './logger.js';

const log = createLogger('ExtractionTelemetry');

/** Stable event name — grep prod logs for this to aggregate by path/platform. */
export const EXTRACTION_RUN_EVENT = 'extraction_run';

/**
 * Canonical extraction-path identifiers. Each maps to one of the three
 * historical extraction paths so a `group by ingestion_source, platform`
 * shows exactly which paths a platform flows through.
 */
export const INGESTION_SOURCE = Object.freeze({
  BACKGROUND: 'background', // P1 cron (observationIngestion.runObservationIngestion)
  POST_ONBOARDING: 'post_onboarding', // P1 immediately after onboarding
  ON_DEMAND: 'on_demand', // P2 extractionOrchestrator (user-triggered)
  OAUTH_CALLBACK: 'oauth_callback', // P3 dataExtractionService (on connect / queue)
});

/**
 * Sources persisted durably to the extraction_events table. BACKGROUND is
 * intentionally excluded — high-volume and already in cron_executions; adding a
 * DB insert per platform there would also slow the already-tight cron. The
 * remaining (user-triggered, low-volume) paths had no durable home.
 */
export const PERSISTED_SOURCES = Object.freeze([
  INGESTION_SOURCE.ON_DEMAND,
  INGESTION_SOURCE.OAUTH_CALLBACK,
  INGESTION_SOURCE.POST_ONBOARDING,
]);

/**
 * Build the structured payload for an extraction-run telemetry event.
 * Pure — no side effects. Exposed for testing.
 * @param {{ source?: string, platform?: string, userId?: string }} [params]
 * @returns {{ ingestion_source: string, platform: string, userId?: string }}
 */
export function buildExtractionRunEvent({ source, platform, userId } = {}) {
  const event = {
    ingestion_source: source || 'unknown',
    platform: platform || 'unknown',
  };
  if (userId) event.userId = userId;
  return event;
}

/**
 * Whether an extraction event for this source should be persisted to the DB.
 * Pure. background -> false (lives in cron_executions); unknown -> false.
 * @param {string} source
 * @returns {boolean}
 */
export function shouldPersist(source) {
  return PERSISTED_SOURCES.includes(source);
}

/**
 * Durably persist one extraction-run event to public.extraction_events.
 * Fire-and-forget: never throws, never blocks extraction (telemetry, not billing
 * — occasional loss on cold function freeze is acceptable). Lazy-imports the DB
 * client so this module stays cheap to import in pure/test contexts.
 * @param {{ ingestion_source: string, platform: string, userId?: string }} event
 */
export async function persistExtractionRun(event) {
  try {
    const { supabaseAdmin } = await import('./database.js');
    await supabaseAdmin.from('extraction_events').insert({
      ingestion_source: event.ingestion_source,
      platform: event.platform,
      user_id: event.userId || null,
    });
  } catch (err) {
    log.warn('extraction_run persist failed (non-blocking)', { error: err?.message });
  }
}

/**
 * Emit a single extraction-run telemetry event. Safe to call from any path;
 * never throws and never alters control flow. Logs synchronously; for the
 * user-triggered sources it ALSO persists durably (fire-and-forget).
 * @param {{ source?: string, platform?: string, userId?: string }} [params]
 */
export function logExtractionRun(params) {
  const event = buildExtractionRunEvent(params);
  try {
    log.info(EXTRACTION_RUN_EVENT, event);
  } catch {
    // Telemetry must never break extraction.
  }
  if (shouldPersist(event.ingestion_source)) {
    // Fire-and-forget: substantial async extraction work always follows this
    // call, so the insert completes well before the function returns.
    persistExtractionRun(event).catch(() => {});
  }
}
