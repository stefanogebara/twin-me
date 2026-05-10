/**
 * Shared E2E Test Helpers
 *
 * Constants, auth injection, console error collection, and screenshot utilities
 * used across all E2E test specs.
 *
 * Auth pattern: JWT minted fresh each run + injected into localStorage AND
 * surfaced via an intercepted /api/auth/refresh response. The intercept is
 * critical: AuthContext's in-memory currentAccessToken is null on every page
 * load (XSS protection — the real value lives in an httpOnly refresh cookie),
 * so the first thing AuthContext does on mount is POST /api/auth/refresh to
 * rehydrate. Without the cookie that the test runner can't set, that call
 * returns 400 and AuthContext redirects to /auth?error=session_expired —
 * which is exactly what the pre-fix Playwright suite kept failing on.
 *
 * We mint here (not from .env.test) so tokens never go stale between runs.
 */

import { Page, ConsoleMessage } from '@playwright/test';
import jwt from 'jsonwebtoken';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8086';
export const API_URL = process.env.TEST_API_URL || 'http://127.0.0.1:3004/api';
export const TEST_USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
export const TEST_USER_EMAIL = 'stefanogebara@gmail.com';
export const SCREENSHOT_DIR = 'tests/e2e/screenshots';

const TEST_USER = Object.freeze({
  id: TEST_USER_ID,
  email: TEST_USER_EMAIL,
  name: 'Test User',
  first_name: 'Stefano',
  email_verified: true,
});

// ─────────────────────────────────────────────────────────────────────────────
// Auth Injection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mint a fresh JWT against the live JWT_SECRET. Used to seed both the
 * localStorage token AND the intercepted /auth/refresh response so the
 * frontend's rehydrate path succeeds without a real httpOnly cookie.
 *
 * @throws if JWT_SECRET is not in the environment — the test config loads
 *         .env so this should always be present during a Playwright run.
 */
export function mintTestToken(expiresIn: string = '30m'): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'JWT_SECRET is required to mint a test token. Make sure playwright.config.ts loads .env before tests run.',
    );
  }
  return jwt.sign({ id: TEST_USER_ID, email: TEST_USER_EMAIL }, secret, { expiresIn });
}

/**
 * Inject auth state into the page before any navigation. Must be called
 * BEFORE page.goto().
 *
 * Does three things:
 *   1. Intercepts POST /api/auth/refresh to return a freshly-minted JWT
 *      and the cached user. This lets AuthContext's initAuth() rehydrate
 *      the in-memory access token even though the test runner can't set
 *      the real httpOnly refresh cookie.
 *   2. Seeds auth_token + auth_user in localStorage so the AuthContext's
 *      cached-user fallback works during the brief window before the
 *      verify call returns.
 *   3. Both writes happen as addInitScript so they survive same-origin
 *      navigations within the test.
 */
export async function injectAuth(page: Page): Promise<void> {
  const token = mintTestToken();

  // (1) Intercept the refresh endpoint. AuthContext's currentAccessToken
  // is null on every page load (XSS protection — not persisted to
  // localStorage). It calls /auth/refresh first thing on mount; if that
  // fails it wipes auth and redirects to /auth?error=session_expired.
  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        accessToken: mintTestToken(),
        user: TEST_USER,
      }),
    });
  });

  // (2) Seed localStorage. auth_user lets AuthContext show cached state
  // during the brief verify-in-flight window without flashing /auth.
  const authData = JSON.stringify({ token, user: JSON.stringify(TEST_USER) });
  await page.addInitScript((data: string) => {
    const { token: t, user: u } = JSON.parse(data);
    window.localStorage.setItem('auth_token', t);
    window.localStorage.setItem('auth_user', u);
  }, authData);
}

// ─────────────────────────────────────────────────────────────────────────────
// Console Error Collection
// ─────────────────────────────────────────────────────────────────────────────

/** Benign error patterns to ignore in console error assertions. */
const BENIGN_PATTERNS = [
  'favicon.ico',
  'Failed to load resource: net::ERR_BLOCKED_BY_CLIENT',
  'posthog',
  'analytics',
  'PostHog',
  'net::ERR_CONNECTION_REFUSED',
];

/**
 * Start collecting console errors from the page.
 * Returns a mutable array that fills as errors appear.
 * Must be called BEFORE page.goto().
 */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      const isBenign = BENIGN_PATTERNS.some((b) =>
        text.toLowerCase().includes(b.toLowerCase()),
      );
      if (!isBenign) {
        errors.push(text);
      }
    }
  });
  return errors;
}

/**
 * Start collecting 404 responses from the page.
 * Returns a mutable array that fills as 404s appear.
 */
export function collect404s(page: Page): string[] {
  const notFounds: string[] = [];
  page.on('response', (response) => {
    if (response.status() === 404) {
      const url = response.url();
      if (url.includes('/api/') || url.match(/\.(png|jpg|svg|ico|woff|woff2|js|css)$/)) {
        notFounds.push(`404: ${url}`);
      }
    }
  });
  return notFounds;
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wait for page to reach networkidle state.
 * Returns false (instead of throwing) if the timeout expires.
 */
export async function waitForPageLoad(page: Page, timeout = 15000): Promise<boolean> {
  try {
    await page.waitForLoadState('networkidle', { timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * Take a full-page screenshot.
 */
export async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/${name}.png`,
    fullPage: true,
  });
}

/**
 * Filter collected errors down to critical JS errors (TypeError, ReferenceError, Uncaught).
 */
export function criticalErrors(errors: string[]): string[] {
  return errors.filter(
    (e) =>
      e.includes('TypeError') ||
      e.includes('Uncaught') ||
      e.includes('ReferenceError'),
  );
}

/**
 * Check if the backend API is healthy (DB connected).
 * Returns true if /api/health returns status "ok", false if degraded/unreachable.
 * Use to skip DB-dependent tests gracefully during Supabase outages.
 */
export async function isBackendHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}
