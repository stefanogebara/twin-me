/**
 * /api/inngest inherited the 30s default and killed every step mid-flight.
 * ========================================================================
 * Production, 2026-08-26, immediately after the v4 signature fix made runs
 * possible at all:
 *
 *   POST /api/inngest?fnId=twinme-profile-enrichment&stepId=step 504
 *   durationMs: 30007   (retry: 30014)
 *
 * Inngest runs a step's entire body inside ONE HTTP request to the serve
 * endpoint. Profile enrichment fans out to Gravatar/GitHub/WMN, Brave, PDL
 * and two LLM passes — around 50s in production. `/api/inngest` had no entry
 * in the timeout table, so it took DEFAULT_TIMEOUT (30s) and our own
 * middleware returned 504 while the work was still going. The logs show it
 * reaching step 6 of 6 before being cut off; Inngest retried, hit the same
 * wall, and marked the run FAILED.
 *
 * The ingestion cron ran 50s successfully in the same logs, so this was our
 * budget, not the platform's.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveRequestTimeout,
  HARD_CAP_MS,
  DEFAULT_TIMEOUT_MS,
} from '../../api/config/requestTimeouts.js';

describe('request timeouts', () => {
  it('gives /api/inngest room for a whole step, not the 30s default', () => {
    const ms = resolveRequestTimeout('/api/inngest');
    expect(ms).toBeGreaterThan(DEFAULT_TIMEOUT_MS);
    expect(ms).toBe(HARD_CAP_MS);
  });

  it('covers the step-execution path Inngest actually posts to', () => {
    // The real request carries a query string, and Express strips it from
    // req.path — but pin the substring match either way.
    expect(resolveRequestTimeout('/api/inngest')).toBe(HARD_CAP_MS);
    expect(resolveRequestTimeout('/inngest')).toBe(HARD_CAP_MS);
  });

  it('never exceeds the platform cap, or our 504 can never fire', () => {
    // Vercel kills the container at 60s; a timeout above that is dead config.
    for (const p of [
      '/api/cron/ingest-observations',
      '/api/inngest',
      '/api/soul-signature/layers',
      '/api/onboarding/calibration',
      '/api/whatsapp-zapi/webhook',
      '/api/chat/message',
      '/api/anything-else',
    ]) {
      expect(resolveRequestTimeout(p), p).toBeLessThanOrEqual(HARD_CAP_MS);
    }
  });

  it('preserves the previous per-route budgets', () => {
    // Regression guard on the extraction from server.js's ternary chain.
    expect(resolveRequestTimeout('/api/cron/ingest-observations')).toBe(HARD_CAP_MS); // 115s clamped
    expect(resolveRequestTimeout('/api/chat/message')).toBe(60_000 > HARD_CAP_MS ? HARD_CAP_MS : 60_000);
    expect(resolveRequestTimeout('/api/discovery/scan')).toBe(55_000);
    expect(resolveRequestTimeout('/api/departments/heartbeat')).toBe(55_000);
    expect(resolveRequestTimeout('/api/templates/apply', { method: 'POST' })).toBe(45_000);
    expect(resolveRequestTimeout('/api/templates/apply', { method: 'GET' })).toBe(DEFAULT_TIMEOUT_MS);
  });

  it('falls back to the default for unlisted routes', () => {
    expect(resolveRequestTimeout('/api/user-rules')).toBe(DEFAULT_TIMEOUT_MS);
    expect(resolveRequestTimeout('')).toBe(DEFAULT_TIMEOUT_MS);
    expect(resolveRequestTimeout(undefined)).toBe(DEFAULT_TIMEOUT_MS);
  });

  it('honours the dev curl-fetch budget, still clamped', () => {
    expect(resolveRequestTimeout('/api/user-rules', { useCurlFetch: true })).toBe(HARD_CAP_MS);
  });
});
