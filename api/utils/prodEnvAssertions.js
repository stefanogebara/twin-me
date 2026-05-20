/**
 * Pure startup-time assertions for production-only env-var pitfalls.
 *
 * These are NOT throw-and-die checks. Production deploys must not crash
 * over an env-var typo — but they MUST log loudly so the misconfiguration
 * shows up in the next log scan instead of festering until the next paying
 * user clicks "Upgrade" and hits a redirect to localhost.
 *
 * Each assertion is a pure function: takes a snapshot of the relevant env
 * vars + a logger, returns a structured result, and writes a log line on
 * misconfiguration. Pure shape makes them trivially unit-testable without
 * spawning a child process to capture stdout.
 */

/**
 * Audit L2 (2026-05-15): in production, billing.js falls back to
 * `http://localhost:8086` for APP_URL if VITE_APP_URL is unset, which
 * silently breaks every Stripe Checkout success/cancel redirect — the
 * user finishes a $20 payment and gets bounced to localhost. The bug
 * also leaks "this is a Stripe TEST" to the user because their browser
 * never resolves the URL.
 *
 * @param {Object} env - process.env snapshot. Pass an object with NODE_ENV
 *   and VITE_APP_URL so the test can drive every branch deterministically.
 * @param {{ error: (msg: string) => void }} logger - logger to write the
 *   warning into. Only .error is used.
 * @returns {{ ok: boolean, reason?: string }}
 *   ok=true means production is happy (or we're in dev, which doesn't need
 *   a real URL). ok=false means the logger.error was fired.
 */
export function assertProdAppUrl(env, logger) {
  const nodeEnv = env?.NODE_ENV;
  const appUrl = env?.VITE_APP_URL;

  // In dev/test we deliberately don't care — localhost is correct there.
  if (nodeEnv !== 'production') {
    return { ok: true, reason: 'not_production' };
  }

  // Production with no env var at all is the original bug.
  if (!appUrl) {
    logger.error(
      'VITE_APP_URL not set in production — Stripe redirects will point at localhost. Set it in Vercel env vars.',
    );
    return { ok: false, reason: 'missing' };
  }

  // Even if the env var is set, an accidental localhost value (e.g.
  // someone copied .env.development) still breaks redirects.
  if (appUrl.includes('localhost') || appUrl.includes('127.0.0.1')) {
    logger.error(
      `VITE_APP_URL is set to "${appUrl}" in production — Stripe redirects will fail. Set it to the public hostname in Vercel env vars.`,
    );
    return { ok: false, reason: 'localhost' };
  }

  return { ok: true };
}
