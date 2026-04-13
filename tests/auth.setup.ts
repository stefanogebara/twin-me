/**
 * Authentication Setup for Playwright Tests
 *
 * Injects a pre-minted JWT for the test user into localStorage.
 * The app uses Google OAuth — we bypass it with a known-good token.
 */

import { test as setup } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authFile = path.join(__dirname, '../playwright/.auth/user.json');

// Use TEST_AUTH_TOKEN env var (set in .env.test or CI) — NEVER hardcode JWTs in source
// To generate: node -e "const jwt=require('jsonwebtoken');console.log(jwt.sign({id:'167c27b5-a40b-49fb-8d00-deb1b1c57f4d',email:'stefanogebara@gmail.com'},process.env.JWT_SECRET,{expiresIn:'30d'}))"
const TEST_TOKEN = process.env.TEST_AUTH_TOKEN || (() => {
  throw new Error('TEST_AUTH_TOKEN env var is required. Generate a fresh JWT and set it in .env.test');
})();

setup('authenticate', async ({ page }) => {
  console.log('🔐 Setting up authentication with pre-minted JWT...');

  // Navigate to app to initialize localStorage
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  // Inject the auth token
  await page.evaluate((token) => {
    localStorage.setItem('auth_token', token);
  }, TEST_TOKEN);

  console.log('💾 Auth token stored in localStorage');

  // Verify auth works by navigating to a protected page
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const currentUrl = page.url();
  if (currentUrl.includes('/dashboard')) {
    console.log('✅ Auth verified — dashboard loaded');
  } else {
    console.log('⚠️ Redirected to:', currentUrl);
  }

  // Save signed-in state
  await page.context().storageState({ path: authFile });
  console.log('💾 Authentication state saved to:', authFile);
});
