/**
 * Extraction telemetry (consolidation Phase 0, 2026-06-08)
 *
 * Emits ONE greppable event per extraction run so production logs reveal which
 * path(s) actually fire per platform. The codebase has three historical
 * extraction paths (see tasks/extraction-consolidation-2026-06-08/) and most
 * platforms are implemented in 2-3 of them. Before retiring the duplicates in
 * later phases we need evidence of what really runs in prod — this is that
 * evidence base.
 *
 * Pure logging. No behavior change: callers fire-and-forget.
 */
import { createLogger } from './logger.js';

const log = createLogger('ExtractionTelemetry');

/** Stable event name — grep prod logs for this to aggregate by path/platform. */
export const EXTRACTION_RUN_EVENT = 'extraction_run';

/**
 * Canonical extraction-path identifiers. Each maps to one of the three
 * historical extraction paths so a `group by ingestion_source, platform`
 * over the logs shows exactly which paths a platform flows through.
 */
export const INGESTION_SOURCE = Object.freeze({
  BACKGROUND: 'background', // P1 cron (observationIngestion.runObservationIngestion)
  POST_ONBOARDING: 'post_onboarding', // P1 immediately after onboarding
  ON_DEMAND: 'on_demand', // P2 extractionOrchestrator (user-triggered)
  OAUTH_CALLBACK: 'oauth_callback', // P3 dataExtractionService (on connect / queue)
});

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
 * Emit a single extraction-run telemetry event. Safe to call from any path;
 * never throws and never alters control flow.
 * @param {{ source?: string, platform?: string, userId?: string }} [params]
 */
export function logExtractionRun(params) {
  try {
    log.info(EXTRACTION_RUN_EVENT, buildExtractionRunEvent(params));
  } catch {
    // Telemetry must never break extraction.
  }
}
