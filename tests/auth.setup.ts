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

// Fresh JWT minted 2026-03-06 (30-day validity)
// User: stefanogebara@gmail.com | ID: 167c27b5-a40b-49fb-8d00-deb1b1c57f4d
const TEST_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjE2N2MyN2I1LWE0MGItNDlmYi04ZDAwLWRlYjFiMWM1N2Y0ZCIsImVtYWlsIjoic3RlZmFub2dlYmFyYUBnbWFpbC5jb20iLCJpYXQiOjE3NzI4MzE2NTYsImV4cCI6MTc3NTQyMzY1Nn0.moNmEwpAWk3fHHnG9CwXqwPuT2k0lbk7uoJIBNAaglQ';

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
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

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
