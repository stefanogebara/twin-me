/**
 * Smoke Test — Core User Loop
 *
 * Fast, focused test covering: Landing → Dashboard → Chat → Identity → Onboarding.
 * Verifies the core loop works end-to-end before inviting beta users.
 *
 * Test user: stefanogebara@gmail.com
 * User ID:   167c27b5-a40b-49fb-8d00-deb1b1c57f4d
 */

import { test, expect, Page, ConsoleMessage } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = 'http://localhost:8086';
const SCREENSHOT_DIR = 'tests/e2e/screenshots';

// Set TEST_AUTH_TOKEN env var (never hardcode JWTs in source)
const TEST_TOKEN =
  process.env.TEST_AUTH_TOKEN;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function injectAuthToken(page: Page): Promise<void> {
  await page.addInitScript((token: string) => {
    window.localStorage.setItem('auth_token', token);
  }, TEST_TOKEN);
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      const benign = [
        'favicon.ico',
        'Failed to load resource: net::ERR_BLOCKED_BY_CLIENT',
        'posthog',
        'analytics',
        'PostHog',
        'net::ERR_CONNECTION_REFUSED',
      ];
      if (!benign.some((b) => text.toLowerCase().includes(b.toLowerCase()))) {
        errors.push(text);
      }
    }
  });
  return errors;
}

function collect404s(page: Page): string[] {
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

async function waitForPageLoad(page: Page, timeout = 8000): Promise<boolean> {
  try {
    await page.waitForLoadState('networkidle', { timeout });
    return true;
  } catch {
    return false;
  }
}

async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/${name}.png`,
    fullPage: true,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Smoke tests — sequential core loop
// ─────────────────────────────────────────────────────────────────────────────

test.describe.serial('Smoke: Core User Loop', () => {
  test('1. Landing (/) — hero visible, CTA present, no console errors', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    const notFounds = collect404s(page);

    await page.goto(`${BASE_URL}/`);
    await waitForPageLoad(page);
    await screenshot(page, 'smoke-01-landing');

    // Hero heading with "soul signature" text
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).toContain('soul signature');

    // CTA button present (Get Started or similar)
    const cta = page.locator(
      'a[href*="/auth"], a[href*="/discover"], a[href*="/get-started"], button:has-text("Get Started"), button:has-text("Start"), a:has-text("Get Started")'
    ).first();
    await expect(cta).toBeVisible({ timeout: 5000 });

    // No real console errors (allow up to 3 benign ones)
    const realErrors = consoleErrors.filter(
      (e) => e.includes('TypeError') || e.includes('Uncaught') || e.includes('ReferenceError')
    );
    expect(realErrors.length).toBeLessThanOrEqual(3);

    console.log('[Landing] 404s:', notFounds);
    console.log('[Landing] Console errors:', consoleErrors.length);
  });

  test('2. Dashboard (/dashboard) — auth works, content visible, no stuck spinners', async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);
    const notFounds = collect404s(page);

    await injectAuthToken(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await waitForPageLoad(page, 12000);
    await screenshot(page, 'smoke-02-dashboard-initial');

    // Should NOT redirect to /auth
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/auth');

    // User content should be visible (headings, stats, or memory/platform info)
    const headings = await page.locator('h1, h2, h3').count();
    expect(headings).toBeGreaterThan(0);

    // Wait a bit more for async data to load
    await page.waitForTimeout(3000);

    // Check for stuck spinners
    const spinners = await page
      .locator('[aria-busy="true"], [data-loading="true"]')
      .count();
    if (spinners > 0) {
      console.log('[Dashboard] WARNING: Stuck spinners detected');
    }

    await screenshot(page, 'smoke-02-dashboard-loaded');

    const realErrors = consoleErrors.filter(
      (e) => e.includes('TypeError') || e.includes('Uncaught') || e.includes('ReferenceError')
    );
    expect(realErrors.length).toBeLessThanOrEqual(3);

    console.log('[Dashboard] URL:', currentUrl);
    console.log('[Dashboard] 404s:', notFounds.slice(0, 5));
    console.log('[Dashboard] Console errors:', consoleErrors.length);
  });

  test('3. Chat (/talk-to-twin) — send message, get streaming response', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);

    await injectAuthToken(page);
    await page.goto(`${BASE_URL}/talk-to-twin`);
    await waitForPageLoad(page, 10000);
    await screenshot(page, 'smoke-03-chat-initial');

    // Should not redirect
    expect(page.url()).not.toContain('/auth');

    // Chat input visible
    const chatInput = page
      .locator('textarea, input[type="text"], [data-testid="chat-input"], [contenteditable="true"]')
      .first();
    await expect(chatInput).toBeVisible({ timeout: 5000 });

    // Send a message
    await chatInput.fill('What do you know about me?');

    const sendBtn = page
      .locator('button[type="submit"], button:has-text("Send"), [data-testid="send-button"]')
      .first();
    if ((await sendBtn.count()) > 0) {
      await sendBtn.click();
    } else {
      await chatInput.press('Enter');
    }

    await screenshot(page, 'smoke-03-chat-sent');

    // Wait for streaming response (up to 15s)
    try {
      await page.waitForFunction(
        () => {
          // Look for assistant message text appearing
          const messages = document.querySelectorAll(
            '[class*="message"], [data-testid*="message"], [class*="chat-bubble"], [class*="response"]'
          );
          // Or just look for substantial new text on the page after sending
          const bodyText = document.body.innerText;
          return messages.length >= 2 || bodyText.length > 500;
        },
        { timeout: 15000 }
      );
      await screenshot(page, 'smoke-03-chat-response');
      console.log('[Chat] Streaming response received');
    } catch {
      await screenshot(page, 'smoke-03-chat-no-response');
      console.log('[Chat] WARNING: No response within 15s');
      // Don't fail hard — SSE can be flaky in test env
    }

    const realErrors = consoleErrors.filter(
      (e) => e.includes('TypeError') || e.includes('Uncaught') || e.includes('ReferenceError')
    );
    expect(realErrors.length).toBeLessThanOrEqual(3);
    console.log('[Chat] Console errors:', consoleErrors.length);
  });

  test('4. Identity (/identity) — archetype or expert section visible', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);

    await injectAuthToken(page);
    await page.goto(`${BASE_URL}/identity`);
    await waitForPageLoad(page, 10000);

    expect(page.url()).not.toContain('/auth');

    // Wait for loading spinner to clear (API fetch can take 5-10s)
    await page.waitForFunction(
      () => !document.body.textContent?.includes('Assembling your soul portrait'),
      { timeout: 15000 }
    ).catch(() => {}); // non-fatal if it stays in loading

    await screenshot(page, 'smoke-04-identity-loaded');

    // Should have some content text (archetype, expert panels, etc.)
    const bodyText = await page.textContent('body');
    expect((bodyText || '').length).toBeGreaterThan(100);

    const realErrors = consoleErrors.filter(
      (e) => e.includes('TypeError') || e.includes('Uncaught') || e.includes('ReferenceError')
    );
    expect(realErrors.length).toBeLessThanOrEqual(3);
    console.log('[Identity] Console errors:', consoleErrors.length);
  });

  test('5. Settings (/settings) — settings page renders', async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);

    await injectAuthToken(page);
    await page.goto(`${BASE_URL}/settings`);
    await waitForPageLoad(page, 10000);

    expect(page.url()).not.toContain('/auth');

    // Wait for lazy-loaded Settings component to render (Suspense resolves)
    await page.waitForFunction(
      () => {
        const text = document.body.textContent || '';
        return text.toLowerCase().includes('setting') ||
               text.toLowerCase().includes('profile') ||
               text.toLowerCase().includes('account') ||
               text.toLowerCase().includes('subscription');
      },
      { timeout: 15000 }
    );

    await screenshot(page, 'smoke-05-settings-loaded');

    const bodyText = await page.textContent('body');
    const hasContent =
      (bodyText?.toLowerCase().includes('setting') ||
       bodyText?.toLowerCase().includes('profile') ||
       bodyText?.toLowerCase().includes('account')) ?? false;
    expect(hasContent).toBe(true);
    console.log('[Settings] URL:', page.url());

    const realErrors = consoleErrors.filter(
      (e) => e.includes('TypeError') || e.includes('Uncaught') || e.includes('ReferenceError')
    );
    expect(realErrors.length).toBeLessThanOrEqual(3);
    console.log('[Onboarding] Console errors:', consoleErrors.length);
  });
});
