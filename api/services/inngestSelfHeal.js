/**
 * Inngest Self-Heal
 * =================
 * The ingestion cron fans out one Inngest event per eligible user. If the app's
 * Inngest registration is stale or rejected (recurring after deploys, and the
 * cause of the 3-week 2026-06 outage), those events "send" successfully but no
 * function runs — ingestion silently falls back to the bounded starvation path.
 *
 * When the cron DETECTS starvation (the exact signature of a non-consuming
 * registration), it calls selfHealInngestRegistration(): a best-effort,
 * rate-limited PUT to this app's own /api/inngest serve endpoint, which makes
 * the Inngest SDK re-register its functions with Inngest Cloud. Best-effort:
 * never throws, and capped to once per RESYNC_MIN_INTERVAL_MS so a genuinely-
 * down Inngest isn't hammered every 30-minute tick.
 *
 * Note this is a safety net, NOT the primary fix — the lowered starvation
 * threshold + reliable inline fallback is what actually guarantees a
 * freshly-connected user's data flows even when Inngest never recovers.
 */
import { createLogger } from './logger.js';

const log = createLogger('InngestSelfHeal');

export const RESYNC_MIN_INTERVAL_MS = 30 * 60 * 1000; // at most once per 30 min

// Generous timeout: the serve endpoint took ~6.6s for a bare GET in prod (cold
// Vercel start), and the PUT re-registration round-trips to Inngest Cloud on
// top. The old 8s abort routinely killed the handshake mid-flight, leaving a
// half-applied registration — the app showed "synced / 12 functions" while
// events arrived and ZERO functions ran (the 2026-07 outage). 30s gives cold
// starts real headroom while staying under the cron's 60s maxDuration (this
// runs in Promise.all with the bounded inline fallback). Exported so the budget
// is an explicit, testable contract.
export const RESYNC_TIMEOUT_MS = 30_000;

// Module-level so the rate-limit persists across invocations that reuse a warm
// serverless instance (Vercel Fluid). Resets on cold start — acceptable: the
// worst case is one extra resync per cold start when starvation is present.
let lastResyncAttemptMs = 0;

/**
 * Pure rate-limit decision — exported for deterministic testing.
 * @param {number} lastAttemptMs  epoch ms of the previous attempt (0 = never)
 * @param {number} nowMs          current epoch ms
 * @param {number} [minIntervalMs]
 * @returns {boolean}
 */
export function shouldAttemptResync(lastAttemptMs, nowMs, minIntervalMs = RESYNC_MIN_INTERVAL_MS) {
  if (!lastAttemptMs) return true;
  return nowMs - lastAttemptMs >= minIntervalMs;
}

/**
 * Canonical base URL for self-directed requests. Uses an explicit env override,
 * else the known production host — never the request Host header (that is
 * attacker-controlled; see the getAppUrl open-redirect fix, task #141) and
 * never VERCEL_URL (that is the per-deploy preview host, but Inngest must call
 * the stable production serve endpoint).
 */
export function getSelfBaseUrl() {
  const raw = process.env.PUBLIC_APP_URL || process.env.VITE_APP_URL || process.env.APP_URL || 'https://www.twinme.me';
  return String(raw).replace(/\/+$/, '');
}

/**
 * Best-effort, rate-limited re-registration of Inngest functions.
 * @param {{ now?: number, fetchImpl?: typeof fetch }} [deps] injectable for tests
 * @returns {Promise<{attempted: boolean, reason?: string, status?: number, error?: string}>}
 */
export async function selfHealInngestRegistration({ now = Date.now(), fetchImpl = fetch } = {}) {
  if (!shouldAttemptResync(lastResyncAttemptMs, now)) {
    return { attempted: false, reason: 'rate_limited' };
  }
  lastResyncAttemptMs = now;

  const url = `${getSelfBaseUrl()}/api/inngest`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESYNC_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    log.info('Inngest self-heal resync attempted', { url, status: res?.status });
    return { attempted: true, status: res?.status };
  } catch (err) {
    log.warn('Inngest self-heal resync failed (non-fatal)', { url, error: err?.message });
    return { attempted: true, error: err?.message };
  } finally {
    clearTimeout(timer);
  }
}

/** Test-only: reset the in-memory rate-limit clock. */
export function __resetResyncStateForTests() {
  lastResyncAttemptMs = 0;
}
