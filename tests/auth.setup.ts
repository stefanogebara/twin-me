/**
 * Authentication Setup for Playwright Tests
 * Creates an authenticated session that can be reused across tests
 */

import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authFile = path.join(__dirname, '../playwright/.auth/user.json');

setup('authenticate', async ({ page, request }) => {
  console.log('🔐 Setting up authentication for tests...');

  // Use a timestamp-based email to avoid conflicts
  const testEmail = `test${Date.now()}@twinme.com`;
  const testPassword = 'testpassword123';

  console.log(`🔨 Creating test user: ${testEmail}`);

  // Create a test user via API
  const signupResponse = await request.post('http://localhost:3001/api/auth/signup', {
    data: {
      email: testEmail,
      password: testPassword,
      firstName: 'Test',
      lastName: 'User'
    }
  });

  if (signupResponse.ok()) {
    console.log('✅ Test user created successfully');
  } else {
    const signupData = await signupResponse.json().catch(() => ({}));
    console.log('⚠️ Signup failed:', signupData.message || signupData.error);
    // This is a problem - if we can't create a user, tests will fail
  }

  // Now sign in with the test user
  console.log('📧 Attempting to sign in via API...');

  const loginResponse = await request.post('http://localhost:3001/api/auth/signin', {
    data: {
      email: testEmail,
      password: testPassword
    }
  });

  if (loginResponse.ok()) {
    const loginData = await loginResponse.json();
    console.log('✅ Successfully authenticated via API');
    console.log('🔑 Token:', loginData.token ? 'Present' : 'Missing');

    // Store the auth token in localStorage by navigating to the app
    await page.goto('/');

    // Set the auth token in localStorage
    if (loginData.token) {
      await page.evaluate((token) => {
        localStorage.setItem('auth_token', token);
      }, loginData.token);

      // Also set user data if available
      if (loginData.user) {
        await page.evaluate((user) => {
          localStorage.setItem('user', JSON.stringify(user));
        }, loginData.user);
      }

      console.log('💾 Auth token stored in localStorage');
    }

    // Navigate to a protected page to verify auth works
    await page.goto('/get-started');
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    console.log('🔄 Current URL after auth:', currentUrl);

    if (currentUrl.includes('/get-started') || currentUrl.includes('/soul-signature')) {
      console.log('✅ Successfully navigated to protected page');
    } else {
      console.log('⚠️ Still on auth page, authentication may have failed');
    }
  } else {
    console.error('❌ Login failed');
    const loginData = await loginResponse.json().catch(() => ({}));
    console.error('Error:', loginData.message || loginData.error);
  }

  // Save signed-in state
  await page.context().storageState({ path: authFile });
  console.log('💾 Authentication state saved to:', authFile);
});
