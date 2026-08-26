/**
 * Per-route request timeouts.
 * ===========================
 * Extracted from the inline ternary chain in server.js so the table is
 * testable: a route missing from it fails silently and expensively — the
 * request is killed mid-flight with a 504 that looks like a downstream
 * outage rather than a budget we set ourselves.
 *
 * That is exactly what happened to /api/inngest (2026-08-26). Inngest runs a
 * step's work inside ONE HTTP request to the serve endpoint. Profile
 * enrichment fans out to Gravatar/GitHub/WMN, Brave, PDL and two LLM passes —
 * ~50s in production. The endpoint was not in the table, so it inherited the
 * 30s default and every step died at 30,007ms with
 *
 *   POST /api/inngest?fnId=twinme-profile-enrichment&stepId=step 504
 *
 * Inngest retried, hit the same wall, and marked the run FAILED. The work was
 * genuinely running — the logs show it reaching step 6 of 6 — it was just
 * never allowed to finish.
 */

/** No timeout may exceed this: Vercel kills the container at 60s (vercel.json),
 *  and our graceful 504 has to fire before that. */
export const HARD_CAP_MS = 58_000;

/** Applied to any route with no explicit entry. */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** Dev with the Cloudflare curl workaround adds latency to every query. */
export const CURL_FETCH_TIMEOUT_MS = 120_000;

/**
 * Longest-running routes first is NOT required — matching is by substring and
 * the first hit wins, so order these the way you would read them.
 */
const ROUTE_TIMEOUTS = [
  ['/cron/', 115_000],
  // Inngest executes an entire step inside one request. The cap here is what
  // bounds a step's real work, so it gets the most the platform allows.
  ['/inngest', HARD_CAP_MS],
  ['/soul-signature/layers', 90_000],
  ['/onboarding/calibration', 90_000],
  ['/whatsapp-twin/webhook', 90_000],
  ['/whatsapp-zapi/webhook', 90_000],
  ['/whatsapp-evolution/webhook', 90_000],
  ['/telegram-webhook', 90_000],
  ['/chat/message', 60_000],
  ['/discovery/scan', 55_000],
  ['/departments/heartbeat', 55_000],
];

/**
 * Resolve the timeout for a request path, already clamped to the platform cap.
 *
 * @param {string} path        req.path
 * @param {object} [opts]
 * @param {string} [opts.method]        req.method — a few entries are method-specific
 * @param {boolean} [opts.useCurlFetch] process.env.USE_CURL_FETCH === 'true'
 * @returns {number} milliseconds, never above HARD_CAP_MS
 */
export function resolveRequestTimeout(path, { method = 'GET', useCurlFetch = false } = {}) {
  const p = typeof path === 'string' ? path : '';

  // Template apply does several DB writes; POST only.
  if (p.includes('/templates/') && method === 'POST') return Math.min(45_000, HARD_CAP_MS);

  for (const [fragment, ms] of ROUTE_TIMEOUTS) {
    if (p.includes(fragment)) return Math.min(ms, HARD_CAP_MS);
  }

  return Math.min(useCurlFetch ? CURL_FETCH_TIMEOUT_MS : DEFAULT_TIMEOUT_MS, HARD_CAP_MS);
}
