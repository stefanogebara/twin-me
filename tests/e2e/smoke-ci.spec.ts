/**
 * CI Smoke Test — frontend boot + render (no backend, no DB, no auth)
 *
 * Runs in CI against the PRODUCTION BUILD served by `vite preview`. Its job is
 * to catch the class of regression that `vite build` + vitest cannot: the app
 * builds fine but throws at runtime, the landing page renders blank, a lazy
 * chunk 404s, or a top-level component crashes in a real browser.
 *
 * Deliberately backend-free so it is deterministic in CI: no API server, no
 * Supabase, no auth. Anything that needs a logged-in session or live data lives
 * in smoke-core-loop.spec.ts (the local full-loop smoke), not here.
 *
 * Started NON-BLOCKING in CI (see .github/workflows/ci.yml) so a transient can't
 * wedge the PR pipeline; promote to a required check once it proves stable.
 */

import { test, expect, Page, ConsoleMessage } from '@playwright/test';

// Errors that are expected with no backend running and are not app bugs.
const BENIGN = [
  'favicon.ico',
  'net::ERR_CONNECTION_REFUSED', // API calls to a backend that isn't up in CI
  'net::ERR_BLOCKED_BY_CLIENT',
  'posthog',
  'analytics',
  'supabase',
  'Failed to fetch',
];

// Only these signal a genuine JS fault in our own code.
const REAL_ERROR_MARKERS = ['TypeError', 'ReferenceError', 'Uncaught', 'is not a function'];

function collectRealConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (BENIGN.some((b) => text.toLowerCase().includes(b.toLowerCase()))) return;
    if (REAL_ERROR_MARKERS.some((m) => text.includes(m))) errors.push(text);
  });
  return errors;
}

function collectPageCrashes(page: Page): string[] {
  const crashes: string[] = [];
  page.on('pageerror', (err) => crashes.push(String(err)));
  return crashes;
}

function collectAssetFourOhFours(page: Page): string[] {
  const notFounds: string[] = [];
  page.on('response', (r) => {
    if (r.status() !== 404) return;
    // A missing built asset (js/css/font/image) is a real breakage; a 404 from
    // an /api call is expected here (no backend) and ignored.
    if (r.url().match(/\.(js|css|woff2?|png|jpg|svg)(\?|$)/)) notFounds.push(r.url());
  });
  return notFounds;
}

test.describe('CI smoke: frontend boots and renders', () => {
  test('landing (/) renders the hero, a CTA, and throws no JS errors', async ({ page }) => {
    const consoleErrors = collectRealConsoleErrors(page);
    const crashes = collectPageCrashes(page);
    const assetFourOhFours = collectAssetFourOhFours(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Hero copy is present -> the app mounted and rendered, not a blank shell.
    const bodyText = (await page.textContent('body')) ?? '';
    expect(bodyText.toLowerCase()).toContain('soul signature');

    // A primary CTA into the product exists.
    const cta = page
      .locator(
        'a[href*="/auth"], a[href*="/discover"], a[href*="/get-started"], button:has-text("Get Started"), a:has-text("Get Started")'
      )
      .first();
    await expect(cta).toBeVisible({ timeout: 5000 });

    expect(crashes, `uncaught page errors:\n${crashes.join('\n')}`).toHaveLength(0);
    expect(consoleErrors, `real console errors:\n${consoleErrors.join('\n')}`).toHaveLength(0);
    expect(assetFourOhFours, `missing built assets:\n${assetFourOhFours.join('\n')}`).toHaveLength(0);
  });

  test('a second public route (/auth) mounts without crashing', async ({ page }) => {
    const crashes = collectPageCrashes(page);
    const consoleErrors = collectRealConsoleErrors(page);

    await page.goto('/auth');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // SPA mounted content into the root, and did not redirect to a browser error.
    const rootHasContent = await page.evaluate(
      () => (document.getElementById('root')?.textContent?.trim().length ?? 0) > 0
    );
    expect(rootHasContent).toBe(true);

    expect(crashes, `uncaught page errors:\n${crashes.join('\n')}`).toHaveLength(0);
    expect(consoleErrors, `real console errors:\n${consoleErrors.join('\n')}`).toHaveLength(0);
  });
});
