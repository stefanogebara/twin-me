/**
 * Authentication Setup for Playwright Tests
 *
 * Mints a fresh JWT for the test user, intercepts /api/auth/refresh so
 * the React AuthContext rehydrates cleanly, and saves the resulting page
 * state for tests that consume `storageState`.
 *
 * Why the intercept is necessary: AuthContext's currentAccessToken is held
 * in-memory only (XSS protection — never persisted to localStorage). On
 * page load it calls /api/auth/refresh to rehydrate that variable from
 * the httpOnly refresh cookie. The test runner can't set that cookie, so
 * without the intercept every page load redirects to /auth?error=session_expired
 * before any assertion runs.
 */

import { test as setup } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authFile = path.join(__dirname, '../playwright/.auth/user.json');

const TEST_USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const TEST_USER_EMAIL = 'stefanogebara@gmail.com';

const TEST_USER = Object.freeze({
  id: TEST_USER_ID,
  email: TEST_USER_EMAIL,
  name: 'Test User',
  first_name: 'Stefano',
  email_verified: true,
});

function mintToken(expiresIn = '30m'): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required. playwright.config.ts must load .env before tests run.');
  }
  return jwt.sign({ id: TEST_USER_ID, email: TEST_USER_EMAIL }, secret, { expiresIn });
}

setup('authenticate', async ({ page }) => {
  // Vite's first-cold-compile of /dashboard pulls many lazy chunks; the
  // default 30s setup timeout flakes here when the dev cache is empty.
  // 90s is plenty for cold and irrelevant for warm runs.
  setup.setTimeout(90_000);
  console.log('🔐 Setting up authentication with freshly-minted JWT...');

  // Intercept the refresh call BEFORE any navigation so AuthContext's
  // initAuth() succeeds on first load.
  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        accessToken: mintToken(),
        user: TEST_USER,
      }),
    });
  });

  // Seed localStorage with token + cached user so AuthContext's brief
  // pre-verify render uses the right values.
  const token = mintToken();
  await page.addInitScript(
    ({ t, u }: { t: string; u: string }) => {
      window.localStorage.setItem('auth_token', t);
      window.localStorage.setItem('auth_user', u);
    },
    { t: token, u: JSON.stringify(TEST_USER) },
  );

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  // Give the AuthContext mount effect time to run /auth/refresh + /auth/verify.
  await page.waitForTimeout(2000);

  const currentUrl = page.url();
  if (currentUrl.includes('/dashboard')) {
    console.log('✅ Auth verified — dashboard loaded');
  } else {
    console.log('⚠️ Redirected to:', currentUrl);
  }

  await page.context().storageState({ path: authFile });
  console.log('💾 Authentication state saved to:', authFile);
});
