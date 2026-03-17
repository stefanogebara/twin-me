/**
 * Shared E2E Test Helpers
 *
 * Constants, auth injection, console error collection, and screenshot utilities
 * used across all E2E test specs.
 *
 * Auth pattern: JWT injected into localStorage via page.addInitScript() before
 * any navigation, matching the proven pattern from smoke-core-loop.spec.ts.
 */

import { Page, ConsoleMessage } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const BASE_URL = 'http://localhost:8086';
export const API_URL = 'http://127.0.0.1:3004/api';
export const TEST_USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
export const TEST_USER_EMAIL = 'stefanogebara@gmail.com';
export const SCREENSHOT_DIR = 'tests/e2e/screenshots';

// Set TEST_AUTH_TOKEN env var (never hardcode JWTs in source)
const TEST_TOKEN =
  process.env.TEST_AUTH_TOKEN;

// ─────────────────────────────────────────────────────────────────────────────
// Auth Injection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inject auth token + cached user into localStorage before any page navigation.
 * Must be called BEFORE page.goto().
 *
 * We inject both auth_token AND auth_user because the AuthContext verifies
 * the token against the backend on mount. If the backend is down, it falls
 * back to the cached user. Without auth_user, a network error clears auth
 * and redirects to /auth.
 */
export async function injectAuth(page: Page): Promise<void> {
  const authData = JSON.stringify({
    token: TEST_TOKEN,
    user: JSON.stringify({
      id: TEST_USER_ID,
      email: TEST_USER_EMAIL,
      name: 'Test User',
    }),
  });
  await page.addInitScript((data: string) => {
    const { token, user } = JSON.parse(data);
    window.localStorage.setItem('auth_token', token);
    window.localStorage.setItem('auth_user', user);
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
