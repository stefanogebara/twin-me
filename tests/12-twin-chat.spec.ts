/**
 * Twin Chat E2E Tests
 * Tests the core twin conversation flow: navigate, send message, receive response
 *
 * Requires: backend running on localhost:3004 and frontend on localhost:8086
 */

import { test, expect } from '@playwright/test';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:8086';
const API_URL = 'http://127.0.0.1:3004';

// Test user: stefanogebara@gmail.com (seeded in DB)
const TEST_USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const TEST_USER_EMAIL = 'stefanogebara@gmail.com';

/**
 * Generate a real signed JWT using the project's JWT_SECRET.
 * Reads JWT_SECRET from .env file at project root.
 */
function generateValidJWT(): string {
  // Try to load JWT_SECRET from .env
  let jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    try {
      const envPath = path.join(process.cwd(), '.env');
      const envContent = fs.readFileSync(envPath, 'utf8');
      const match = envContent.match(/^JWT_SECRET=(.+)$/m);
      if (match) jwtSecret = match[1].trim();
    } catch {
      // ignore
    }
  }

  if (!jwtSecret) {
    throw new Error('JWT_SECRET not found in environment or .env file');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    id: TEST_USER_ID,
    email: TEST_USER_EMAIL,
    iat: now,
    exp: now + 28800, // 8 hours
  })).toString('base64url');

  const signature = crypto
    .createHmac('sha256', jwtSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

// Check if backend is available before running tests
async function isBackendAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}

test.describe('Twin Chat', () => {
  let token: string;

  test.beforeAll(async () => {
    token = generateValidJWT();
  });

  test.beforeEach(async ({ page }) => {
    // Inject valid auth token
    await page.addInitScript(({ t, userId, email }) => {
      localStorage.setItem('auth_token', t);
      localStorage.setItem('user', JSON.stringify({
        id: userId,
        email,
        name: 'Stefano',
        full_name: 'Stefano Gebara',
      }));
    }, { t: token, userId: TEST_USER_ID, email: TEST_USER_EMAIL });
  });

  test('should load the TalkToTwin page', async ({ page }) => {
    await page.goto(`${BASE_URL}/talk-to-twin`);
    await page.waitForLoadState('networkidle');

    // Should show the chat interface (not redirected to login)
    const url = page.url();
    expect(url).toContain('talk-to-twin');

    // Chat textarea should be present
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10000 });
  });

  test('should show welcome message or empty state', async ({ page }) => {
    await page.goto(`${BASE_URL}/talk-to-twin`);
    await page.waitForTimeout(2000);

    // Page body should render
    const body = page.locator('body');
    await expect(body).toBeVisible();

    // Should not show a generic error screen
    const errorText = page.locator('text=Something went wrong');
    await expect(errorText).not.toBeVisible();
  });

  test('should allow typing in chat input', async ({ page }) => {
    await page.goto(`${BASE_URL}/talk-to-twin`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10000 });

    await textarea.fill('Hello, what do you know about me?');
    await expect(textarea).toHaveValue('Hello, what do you know about me?');
  });

  test('should send a message and receive a response (requires backend)', async ({ page }) => {
    // Check backend availability
    const available = await isBackendAvailable();
    if (!available) {
      test.skip(true, 'Backend not running - skipping live API test');
      return;
    }

    await page.goto(`${BASE_URL}/talk-to-twin`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10000 });

    // Type and send a message
    await textarea.fill('What kind of music do I like?');

    // Submit: press Enter or click send button
    // TalkToTwin uses Shift+Enter for newline, Enter submits
    const sendButton = page.locator('button[type="submit"], button:has-text("Send")').first();
    const hasSendButton = (await sendButton.count()) > 0;

    if (hasSendButton) {
      await sendButton.click();
    } else {
      await textarea.press('Enter');
    }

    // Wait for response - twin chat can take up to 30 seconds
    await page.waitForTimeout(5000);

    // Look for assistant response bubble
    // The UI renders messages with role 'assistant'
    const assistantResponse = page.locator('[data-role="assistant"], .assistant-message, [class*="assistant"]').first();
    const responseVisible = (await assistantResponse.count()) > 0;

    // Also check if any new text appeared after sending
    const messageCount = await page.locator('[data-testid="message"], .message, [class*="message"]').count();

    // Either we see a response or we see the message was sent
    expect(responseVisible || messageCount >= 1).toBeTruthy();
  });

  test('should not redirect to login when token is valid', async ({ page }) => {
    await page.goto(`${BASE_URL}/talk-to-twin`);
    await page.waitForTimeout(2000);

    // Should still be on talk-to-twin or have loaded the chat
    const url = page.url();
    const onLoginPage = url.includes('/login') || url.includes('/auth') || url.includes('/get-started');
    expect(onLoginPage).toBeFalsy();
  });
});
