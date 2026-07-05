/**
 * Timezone sync guard.
 *
 * audit-2026-07-03 route-sweep: AuthContext used to fire an unconditional
 * PATCH /api/account/timezone on every hard page load (plus StrictMode
 * noise) — one DB write per load per user, the same per-load-write class
 * the Vercel cost rules exist to prevent. The PATCH now only fires when the
 * freshly-detected IANA zone actually differs from what the backend already
 * has (or from what this device last delivered).
 *
 * Sources of truth, in order:
 *  1. `stored`  — the profile's timezone if the auth payload carries one.
 *     (/auth/verify does NOT return it today, so this is usually undefined;
 *     the comparison activates automatically if verify later includes it.)
 *  2. `lastSent` — the last value THIS device successfully PATCHed, cached
 *     in localStorage per user id (see helpers below).
 *
 * The cache is only written after a successful PATCH, so a failed sync is
 * retried on the next load rather than silently lost.
 */

export function shouldSyncTimezone(
  detected: string | null | undefined,
  stored: string | null | undefined,
  lastSent: string | null | undefined,
): boolean {
  if (!detected || typeof detected !== 'string' || !detected.trim()) return false;
  // Backend already has this exact zone — nothing to do.
  if (stored && stored === detected) return false;
  // This device already delivered this exact zone. Even if `stored` differs
  // (another device may have set a different zone more recently), re-asserting
  // on every load would just ping-pong writes between devices.
  if (lastSent && lastSent === detected) return false;
  return true;
}

const LAST_SYNCED_KEY = 'twinme_tz_last_synced_v1';

/**
 * Last timezone this browser successfully sent for `userId`, or null.
 * Scoped by user id so a shared browser / account switch never inherits the
 * previous account's "already sent" marker.
 */
export function getLastSyncedTimezone(userId: string | null | undefined): string | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(LAST_SYNCED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: unknown; timezone?: unknown };
    return parsed.userId === userId && typeof parsed.timezone === 'string'
      ? parsed.timezone
      : null;
  } catch {
    // Corrupt JSON or storage unavailable — treat as never-synced; worst case
    // is one redundant PATCH, which is the pre-fix behavior on every load.
    return null;
  }
}

/** Record a successful timezone PATCH so subsequent loads can skip it. */
export function markTimezoneSynced(userId: string | null | undefined, timezone: string): void {
  if (!userId || !timezone) return;
  try {
    localStorage.setItem(LAST_SYNCED_KEY, JSON.stringify({ userId, timezone }));
  } catch {
    // Storage unavailable (private mode, quota) — next load re-sends once.
  }
}
