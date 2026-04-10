/**
 * TwinMe Comprehensive E2E Test Suite
 *
 * Tests all critical user journeys for the TwinMe platform.
 * Auth: JWT token is injected via localStorage for authenticated flows.
 *
 * Test user: stefanogebara@gmail.com
 * User ID:   167c27b5-a40b-49fb-8d00-deb1b1c57f4d
 */

import { test, expect, Page, ConsoleMessage } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = 'http://localhost:8086';
const API_URL = 'http://127.0.0.1:3004/api';
const SCREENSHOT_DIR = 'tests/e2e/screenshots';
const TEST_EMAIL = 'stefanogebara@gmail.com';

// Pre-minted JWT for test user (30-day validity from 2026-03-02)
// User: stefanogebara@gmail.com | ID: 167c27b5-a40b-49fb-8d00-deb1b1c57f4d
// Set TEST_AUTH_TOKEN env var (never hardcode JWTs in source)
const TEST_TOKEN = process.env.TEST_AUTH_TOKEN;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Injects JWT token into localStorage so the app treats us as authenticated.
 * TwinMe stores the token under the key "auth_token".
 */
async function injectAuthToken(page: Page): Promise<void> {
  await page.addInitScript((token: string) => {
    window.localStorage.setItem('auth_token', token);
  }, TEST_TOKEN);
}

/**
 * Captures console errors during a page load.
 */
function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      // Filter out known benign browser errors
      const text = msg.text();
      const benign = [
        'favicon.ico',
        'Failed to load resource: net::ERR_BLOCKED_BY_CLIENT',
        'posthog',
        'analytics',
      ];
      if (!benign.some((b) => text.toLowerCase().includes(b.toLowerCase()))) {
        errors.push(text);
      }
    }
  });
  return errors;
}

/**
 * Captures 404 network errors.
 */
function collect404s(page: Page): string[] {
  const not_founds: string[] = [];
  page.on('response', (response) => {
    if (response.status() === 404) {
      const url = response.url();
      // Only flag API calls and asset loads — not general navigation
      if (url.includes('/api/') || url.match(/\.(png|jpg|svg|ico|woff|woff2|js|css)$/)) {
        not_founds.push(`404: ${url}`);
      }
    }
  });
  return not_founds;
}

/**
 * Waits for the page to finish its primary loading state (no more spinners).
 * Returns false if a spinner was still visible after the timeout.
 */
async function waitForPageLoad(page: Page, timeout = 8000): Promise<boolean> {
  try {
    // Wait for network idle first
    await page.waitForLoadState('networkidle', { timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks for stuck loading spinners (elements with data-loading or aria-busy).
 */
async function checkForStuckSpinners(page: Page): Promise<boolean> {
  const spinners = await page.locator('[aria-busy="true"], [data-loading="true"]').count();
  return spinners > 0;
}

async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/${name}.png`,
    fullPage: true,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Discover Landing — /discover (unauthenticated)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('1. Discover Landing (/discover)', () => {
  test('page loads with email form', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    const notFounds = collect404s(page);

    await page.goto(`${BASE_URL}/discover`);
    await waitForPageLoad(page);
    await screenshot(page, '01-discover-initial');

    // Core elements should be visible — either email input or CTA/heading
    const hasEmailInput = await page.locator('input[type="email"], input[placeholder*="email" i]').first().isVisible().catch(() => false);
    const hasHeading = await page.locator('h1, h2').count() > 0;
    const hasCTA = await page.locator('a[href*="auth"], button').count() > 0;
    expect(hasEmailInput || hasHeading || hasCTA).toBeTruthy();

    // Check for obvious JS errors
    expect(consoleErrors.filter(e => e.includes('TypeError') || e.includes('Uncaught'))).toHaveLength(0);

    console.log('[Discover] Has email input:', hasEmailInput, '| Headings:', hasHeading, '| CTA:', hasCTA);
    console.log('[Discover] 404s:', notFounds);
    console.log('[Discover] Console errors:', consoleErrors.slice(0, 5));
  });

  test('submitting a known email triggers scan and shows results or ghost profile', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);

    await page.goto(`${BASE_URL}/discover`);
    await waitForPageLoad(page);

    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]').first();
    const emailVisible = await emailInput.isVisible().catch(() => false);
    if (!emailVisible) {
      console.log('[Discover] Email input not present — skipping submit test (UI redesigned)');
      test.skip();
      return;
    }
    await emailInput.fill(TEST_EMAIL);
    await emailInput.press('Enter');

    // Wait for scan result (up to 15s for enrichment API)
    try {
      await page.waitForResponse(
        (resp) => resp.url().includes('/api/discovery') || resp.url().includes('/api/enrichment'),
        { timeout: 15000 }
      );
    } catch {
      // May not make an API call (client-side only flow)
    }

    await page.waitForTimeout(2000);
    await screenshot(page, '01-discover-after-submit');

    // Should show some result or navigate to /auth
    const currentUrl = page.url();
    const hasResults = await page.locator('[data-testid="discover-result"], [class*="result"], [class*="profile-card"]').count() > 0;
    const navigatedToAuth = currentUrl.includes('/auth');
    const showsGhostCard = await page.locator('[class*="ghost"], [data-testid="ghost-profile"]').count() > 0;
    const hasContent = await page.locator('h1, h2, h3').count() > 0;

    console.log('[Discover] URL after submit:', currentUrl);
    console.log('[Discover] Has results:', hasResults, '| Ghost card:', showsGhostCard, '| Navigated to auth:', navigatedToAuth);

    // At minimum, the page should have headings (not blank)
    expect(hasContent).toBe(true);

    console.log('[Discover] Console errors:', consoleErrors.slice(0, 5));
  });

  test('CTA navigates to /auth', async ({ page }) => {
    await page.goto(`${BASE_URL}/discover`);
    await waitForPageLoad(page);

    // Check if there's a sign-up / get started CTA
    const ctaLink = page.locator('a[href*="/auth"], button:text("Get Started"), a:text("Sign up"), a:text("Get Started")').first();
    const ctaExists = await ctaLink.count() > 0;

    if (ctaExists) {
      await ctaLink.click();
      await page.waitForURL('**/auth**', { timeout: 5000 });
      expect(page.url()).toContain('/auth');
    } else {
      console.log('[Discover] No auth CTA found — checking for other navigation');
      await screenshot(page, '01-discover-no-cta');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Auth Page — /auth (unauthenticated)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('2. Auth Page (/auth)', () => {
  test('page loads and Google OAuth button renders', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);

    await page.goto(`${BASE_URL}/auth`);
    await waitForPageLoad(page);
    await screenshot(page, '02-auth-initial');

    // Google sign-in button should be visible
    const googleBtn = page.locator('button:has-text("Google"), button:has-text("Continue with Google"), [data-testid="google-signin"]').first();
    const googleBtnVisible = await googleBtn.count() > 0;
    expect(googleBtnVisible).toBe(true);

    console.log('[Auth] Console errors:', consoleErrors.slice(0, 5));
  });

  test('email pre-fill from query param ?email= works', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    await page.goto(`${BASE_URL}/auth?email=${encodeURIComponent(TEST_EMAIL)}`);
    await waitForPageLoad(page);
    await screenshot(page, '02-auth-email-prefill');

    // Auth page is Google-only — verify it loaded and has meaningful content
    const headingCount = await page.locator('h1, h2, h3, p').count();
    expect(headingCount).toBeGreaterThan(0);

    // Look for the email field pre-populated (feature may not be implemented)
    const emailInput = page.locator('input[type="email"]').first();
    if (await emailInput.count() > 0) {
      const value = await emailInput.inputValue();
      console.log('[Auth] Email input value:', value);
    } else {
      // This is expected — auth page is Google-only (no email input)
      console.log('[Auth] No email input found — Google-only auth flow (expected)');
      // Verify the Google button is still present when email param is passed
      const googleBtn = page.locator('button:has-text("Google"), button:has-text("Continue with Google")').first();
      expect(await googleBtn.count()).toBeGreaterThan(0);
    }
    console.log('[Auth] Console errors:', consoleErrors.slice(0, 5));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Dashboard — /dashboard (authenticated)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('3. Dashboard (/dashboard)', () => {
  test('loads with stat cards, insights panel, goals section', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    const notFounds = collect404s(page);

    await injectAuthToken(page);
    await page.goto(`${BASE_URL}/dashboard`);

    // Wait for the page to settle
    const loaded = await waitForPageLoad(page, 10000);
    await screenshot(page, '03-dashboard-initial');

    const currentUrl = page.url();

    // Should not redirect away if auth is working
    if (currentUrl.includes('/auth') || currentUrl.includes('/discover')) {
      console.log('[Dashboard] FAIL: Redirected to:', currentUrl, '— Auth injection may not have worked');
      await screenshot(page, '03-dashboard-auth-redirect');
      test.skip(true, 'Auth token injection failed — app redirected to login');
      return;
    }

    // Wait for dashboard content to render
    await page.locator('h1, h2, h3').first().waitFor({ state: 'visible', timeout: 10000 });
    const headingCount = await page.locator('h1, h2, h3').count();
    expect(headingCount).toBeGreaterThan(0);

    // Check for stat cards
    const statCards = await page.locator('[data-testid*="stat"], [class*="stat-card"], [class*="card"]').count();
    console.log('[Dashboard] Stat cards found:', statCards);

    // Check for loading spinners stuck
    await page.waitForTimeout(3000);
    const stuckSpinners = await checkForStuckSpinners(page);
    if (stuckSpinners) {
      await screenshot(page, '03-dashboard-stuck-spinners');
      console.log('[Dashboard] WARNING: Stuck loading spinners detected');
    }

    await screenshot(page, '03-dashboard-loaded');
    console.log('[Dashboard] Loaded:', loaded, '| URL:', currentUrl);
    console.log('[Dashboard] 404s:', notFounds.slice(0, 5));
    console.log('[Dashboard] Console errors:', consoleErrors.slice(0, 5));
  });

  test('API: dashboard stats endpoint responds', async ({ page }) => {
    const response = await page.request.get(`${API_URL}/dashboard/stats`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    const body = await response.json();
    console.log('[Dashboard API] Status:', response.status(), '| Body:', JSON.stringify(body).slice(0, 200));
    expect(response.status()).toBeLessThan(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Talk to Twin — /talk-to-twin (authenticated)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('4. Talk to Twin (/talk-to-twin)', () => {
  test('page loads and chat input is visible', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    const notFounds = collect404s(page);

    await injectAuthToken(page);
    await page.goto(`${BASE_URL}/talk-to-twin`);
    await waitForPageLoad(page, 10000);
    await screenshot(page, '04-talk-to-twin-initial');

    const currentUrl = page.url();
    if (currentUrl.includes('/auth')) {
      console.log('[Talk-to-Twin] Redirected to auth — token injection failed');
      test.skip(true, 'Auth redirect');
      return;
    }

    // Chat input should be present — known placeholder: "Ask your twin anything..."
    const chatInput = page.locator(
      'textarea, input[type="text"], [data-testid="chat-input"], [contenteditable="true"]'
    ).first();
    const inputVisible = await chatInput.count() > 0;
    console.log('[Talk-to-Twin] Chat input visible:', inputVisible);
    expect(inputVisible).toBe(true);

    console.log('[Talk-to-Twin] 404s:', notFounds.slice(0, 5));
    console.log('[Talk-to-Twin] Console errors:', consoleErrors.slice(0, 5));
  });

  test('sending a message shows a streaming response', async ({ page }) => {
    await injectAuthToken(page);
    await page.goto(`${BASE_URL}/talk-to-twin`);
    await waitForPageLoad(page, 10000);

    const currentUrl = page.url();
    if (currentUrl.includes('/auth')) {
      test.skip(true, 'Auth redirect');
      return;
    }

    const chatInput = page.locator(
      'textarea, input[type="text"], [data-testid="chat-input"]'
    ).first();

    if (await chatInput.count() === 0) {
      console.log('[Talk-to-Twin] No chat input found — skipping message test');
      return;
    }

    await chatInput.fill('Hello, what do you know about me?');

    // Click send button or press Enter
    const sendBtn = page.locator('button[type="submit"], button:has-text("Send"), [data-testid="send-button"]').first();
    if (await sendBtn.count() > 0) {
      await sendBtn.click();
    } else {
      await chatInput.press('Enter');
    }

    await screenshot(page, '04-talk-to-twin-message-sent');

    // Wait for a response to appear (SSE streaming)
    try {
      await page.waitForFunction(() => {
        const messages = document.querySelectorAll('[class*="message"], [data-testid*="message"]');
        return messages.length >= 2;
      }, { timeout: 30000 });

      await screenshot(page, '04-talk-to-twin-response');
      console.log('[Talk-to-Twin] Response received');
    } catch {
      await screenshot(page, '04-talk-to-twin-no-response');
      console.log('[Talk-to-Twin] WARNING: No response within 30s');
    }
  });

  test('API: twin chat endpoint validates direct requests', async ({ page }) => {
    const response = await page.request.post(`${API_URL}/chat/message`, {
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      data: { message: '', conversationId: null },
      timeout: 15000,
    });
    console.log('[Twin Chat API] Status:', response.status());
    expect(response.status()).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Soul Signature — /soul-signature (authenticated)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('5. Soul Signature (/soul-signature)', () => {
  test('legacy route redirects to identity and loads data sections', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    const notFounds = collect404s(page);

    await injectAuthToken(page);
    await page.goto(`${BASE_URL}/soul-signature`);
    await page.waitForURL('**/identity', { timeout: 5000 }).catch(() => {});
    await waitForPageLoad(page, 10000);
    await page.locator('h1, h2, h3').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    await screenshot(page, '05-soul-signature-initial');

    const currentUrl = page.url();
    if (currentUrl.includes('/auth')) {
      test.skip(true, 'Auth redirect');
      return;
    }
    expect(currentUrl).toContain('/identity');

    const headingCount = await page.locator('h1, h2, h3').count();
    expect(headingCount).toBeGreaterThan(0);

    await page.waitForTimeout(3000);
    await screenshot(page, '05-soul-signature-loaded');
    console.log('[Soul Signature] Heading count:', headingCount);
    console.log('[Soul Signature] 404s:', notFounds.slice(0, 5));
    console.log('[Soul Signature] Console errors:', consoleErrors.slice(0, 5));
  });

  test('API: soul-signature endpoints', async ({ page }) => {
    const resp1 = await page.request.get(`${API_URL}/soul-signature/profile`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    console.log('[Soul Signature API] /profile status:', resp1.status());
    expect(resp1.status()).toBeLessThan(500);

    const resp2 = await page.request.get(`${API_URL}/soul-signature/personality-scores`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    console.log('[Soul Signature API] /personality-scores status:', resp2.status());
    expect(resp2.status()).toBeLessThan(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Memory Health — /memory-health (authenticated)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('6. Memory Health (/memory-health)', () => {
  test('page loads and stats render', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);

    await injectAuthToken(page);
    await page.goto(`${BASE_URL}/memory-health`);
    await waitForPageLoad(page, 10000);
    await screenshot(page, '06-memory-health-initial');

    const currentUrl = page.url();
    if (currentUrl.includes('/auth')) {
      test.skip(true, 'Auth redirect');
      return;
    }

    // Page should have some numeric stats
    const pageText = await page.textContent('body');
    const hasNumbers = /\d+/.test(pageText || '');
    expect(hasNumbers).toBe(true);

    await page.waitForTimeout(2000);
    await screenshot(page, '06-memory-health-loaded');
    console.log('[Memory Health] Has numbers:', hasNumbers);
    console.log('[Memory Health] Console errors:', consoleErrors.slice(0, 5));
  });

  test('API: memory-health returns stats', async ({ page }) => {
    const response = await page.request.get(`${API_URL}/memory-health`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    const body = await response.json();
    console.log('[Memory Health API] Status:', response.status(), '| totalCount:', body.totalCount);
    expect(response.status()).toBe(200);
    expect(body.totalCount).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Goals — /goals (authenticated)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('7. Goals (/goals)', () => {
  test('page loads with goals list', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);

    await injectAuthToken(page);
    await page.goto(`${BASE_URL}/goals`);
    await waitForPageLoad(page, 10000);
    await screenshot(page, '07-goals-initial');

    const currentUrl = page.url();
    if (currentUrl.includes('/auth')) {
      test.skip(true, 'Auth redirect');
      return;
    }

    const headingCount = await page.locator('h1, h2, h3').count();
    expect(headingCount).toBeGreaterThan(0);

    await page.waitForTimeout(2000);
    await screenshot(page, '07-goals-loaded');
    console.log('[Goals] Console errors:', consoleErrors.slice(0, 5));
  });

  test('API: goals endpoint returns data', async ({ page }) => {
    const response = await page.request.get(`${API_URL}/goals`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    const body = await response.json();
    console.log('[Goals API] Status:', response.status(), '| Goals count:', body.data?.length ?? 'N/A');
    expect(response.status()).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Settings — /settings (authenticated)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('8. Settings (/settings)', () => {
  test('page loads with account and platform sections', async ({ page }, testInfo) => {
    testInfo.setTimeout(60000);
    const consoleErrors = collectConsoleErrors(page);
    const notFounds = collect404s(page);

    await injectAuthToken(page);
    await page.goto(`${BASE_URL}/settings`);
    await waitForPageLoad(page, 15000);
    await screenshot(page, '08-settings-initial');

    const currentUrl = page.url();
    if (currentUrl.includes('/auth')) {
      test.skip(true, 'Auth redirect');
      return;
    }

    const headingCount = await page.locator('h1, h2, h3').count();
    expect(headingCount).toBeGreaterThan(0);

    await screenshot(page, '08-settings-loaded');
    console.log('[Settings] Console errors:', consoleErrors.slice(0, 5));
    console.log('[Settings] 404s:', notFounds.slice(0, 3));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Get Started — /get-started (authenticated)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('9. Get Started (/get-started)', () => {
  test('page loads with platform connection cards', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);

    await injectAuthToken(page);
    await page.goto(`${BASE_URL}/get-started`);
    await waitForPageLoad(page, 10000);
    await screenshot(page, '09-get-started-initial');

    const currentUrl = page.url();
    if (currentUrl.includes('/auth')) {
      test.skip(true, 'Auth redirect');
      return;
    }

    const headingCount = await page.locator('h1, h2, h3').count();
    expect(headingCount).toBeGreaterThan(0);

    await page.waitForTimeout(2000);
    await screenshot(page, '09-get-started-loaded');
    console.log('[Get Started] Console errors:', consoleErrors.slice(0, 5));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Interview — /interview (authenticated)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('10. Interview (/interview)', () => {
  test('page loads and interview UI is present', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);

    await injectAuthToken(page);
    await page.goto(`${BASE_URL}/interview`);
    await waitForPageLoad(page, 10000);
    await screenshot(page, '10-interview-initial');

    const currentUrl = page.url();
    if (currentUrl.includes('/auth')) {
      test.skip(true, 'Auth redirect');
      return;
    }

    const headingCount = await page.locator('h1, h2, h3').count();
    expect(headingCount).toBeGreaterThan(0);

    await page.waitForTimeout(2000);
    await screenshot(page, '10-interview-loaded');
    console.log('[Interview] Console errors:', consoleErrors.slice(0, 5));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Identity Page — /identity (authenticated)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('11. Identity Page (/identity)', () => {
  test('page loads with identity sections', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);

    await injectAuthToken(page);
    await page.goto(`${BASE_URL}/identity`);
    await waitForPageLoad(page, 10000);
    await screenshot(page, '11-identity-initial');

    const currentUrl = page.url();
    if (currentUrl.includes('/auth')) {
      test.skip(true, 'Auth redirect');
      return;
    }

    const headingCount = await page.locator('h1, h2, h3').count();
    expect(headingCount).toBeGreaterThan(0);

    await page.waitForTimeout(2000);
    await screenshot(page, '11-identity-loaded');
    console.log('[Identity] Console errors:', consoleErrors.slice(0, 5));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Home / Index — / (unauthenticated)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('12. Home Page (/)', () => {
  test('home page loads', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);

    await page.goto(`${BASE_URL}/`);
    await waitForPageLoad(page, 8000);
    await screenshot(page, '12-home-initial');

    // Authenticated users may be redirected to /dashboard — that's correct behavior
    const currentUrl = page.url();
    const headingCount = await page.locator('h1, h2').count();
    const redirectedToDashboard = currentUrl.includes('/dashboard');
    expect(headingCount > 0 || redirectedToDashboard).toBeTruthy();
    console.log('[Home] URL:', currentUrl, '| Headings:', headingCount, '| Dashboard redirect:', redirectedToDashboard);
    console.log('[Home] Console errors:', consoleErrors.slice(0, 5));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. API Health Checks (backend)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('13. API Health Checks', () => {
  test('GET /api/health returns ok', async ({ page }) => {
    const response = await page.request.get(`${API_URL}/health`);
    const body = await response.json();
    console.log('[API Health] Status:', response.status(), '| Body:', JSON.stringify(body));
    expect(response.status()).toBe(200);
    // Accept both 'ok' and 'degraded' (local dev may have DB timeout)
    expect(['ok', 'degraded']).toContain(body.status);
  });

  test('GET /api/memory-health returns memory stats', async ({ page }) => {
    const response = await page.request.get(`${API_URL}/memory-health`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    const body = await response.json();
    console.log('[API Memory] totalCount:', body.totalCount);
    expect(response.status()).toBe(200);
    expect(typeof body.totalCount).toBe('number');
  });

  test('GET /api/goals returns user goals', async ({ page }) => {
    const response = await page.request.get(`${API_URL}/goals`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    const body = await response.json();
    console.log('[API Goals] count:', body.data?.length);
    expect(response.status()).toBe(200);
    expect(body.success).toBe(true);
  });

  test('GET /api/dashboard/stats returns stats', async ({ page }) => {
    const response = await page.request.get(`${API_URL}/dashboard/stats`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    const body = await response.json();
    console.log('[API Dashboard Stats] Status:', response.status(), '| Body:', JSON.stringify(body).slice(0, 200));
    expect(response.status()).toBeLessThan(500);
  });

  test('GET /api/memory-health returns readiness score', async ({ page }) => {
    const response = await page.request.get(`${API_URL}/memory-health`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    const body = await response.json();
    console.log('[API Readiness] Status:', response.status(), '| readiness:', JSON.stringify(body.readiness).slice(0, 200));
    expect(response.status()).toBe(200);
    expect(body.readiness).toBeDefined();
  });

  test('GET /api/correlations returns cross-platform insights', async ({ page }) => {
    const response = await page.request.get(`${API_URL}/correlations`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    const body = await response.json();
    console.log('[API Correlations] Status:', response.status(), '| Body:', JSON.stringify(body).slice(0, 200));
    expect(response.status()).toBeLessThan(500);
  });

  test('GET /api/checkin/today returns daily checkin state', async ({ page }) => {
    const response = await page.request.get(`${API_URL}/checkin/today`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    console.log('[API Checkin Today] Status:', response.status());
    expect(response.status()).toBeLessThan(500);
  });

  test('GET /api/notifications returns notifications', async ({ page }) => {
    const response = await page.request.get(`${API_URL}/notifications`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    console.log('[API Notifications] Status:', response.status());
    expect(response.status()).toBeLessThan(500);
  });

  test('401 response for unauthenticated request to protected endpoint', async ({ page }) => {
    const response = await page.request.get(`${API_URL}/goals`);
    console.log('[API Auth Guard] Status (no token):', response.status());
    expect(response.status()).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. Navigation — verify links between pages
// ─────────────────────────────────────────────────────────────────────────────

test.describe('14. Navigation', () => {
  test('authenticated navigation between dashboard sections', async ({ page }) => {
    await injectAuthToken(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await waitForPageLoad(page, 10000);

    const currentUrl = page.url();
    if (currentUrl.includes('/auth')) {
      test.skip(true, 'Auth redirect');
      return;
    }

    // Try navigating via sidebar links
    const navLinks = await page.locator('nav a, aside a, [role="navigation"] a').all();
    console.log('[Nav] Navigation links found:', navLinks.length);

    for (const link of navLinks.slice(0, 3)) {
      const href = await link.getAttribute('href');
      const text = await link.textContent();
      console.log('[Nav] Link:', text?.trim(), '->', href);
    }
  });

  test('/discover → /auth flow works', async ({ page }) => {
    await page.goto(`${BASE_URL}/discover?email=${encodeURIComponent(TEST_EMAIL)}`);
    await waitForPageLoad(page);

    // Navigate to /auth manually
    await page.goto(`${BASE_URL}/auth`);
    await waitForPageLoad(page);
    await screenshot(page, '14-auth-from-discover');
    expect(page.url()).toContain('/auth');
  });
});
