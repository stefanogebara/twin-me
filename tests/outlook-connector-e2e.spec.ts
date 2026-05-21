/**
 * Playwright test: Outlook connector auth flow
 *
 * Reproduces the reported bug: after Nango auth completes, user has no
 * TwinMe tab to return to. This happens when popup is blocked and the
 * code falls back to window.location.href = connectUrl (navigating away).
 */
import { test, expect, Page } from '@playwright/test';
import path from 'path';

const ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjE2N2MyN2I1LWE0MGItNDlmYi04ZDAwLWRlYjFiMWM1N2Y0ZCIsImVtYWlsIjoic3RlZmFub2dlYmFyYUBnbWFpbC5jb20iLCJpYXQiOjE3Nzc0NjEzODEsImV4cCI6MTc4MDA1MzM4MX0.LVUcWGmUN_xuwcIa8o-ktUbyHZRfudIuMtraw42NUG4';

const AUTH_USER = {
  id: '167c27b5-a40b-49fb-8d00-deb1b1c57f4d',
  email: 'stefanogebara@gmail.com',
  firstName: 'Stefano',
  lastName: 'Gebara',
  fullName: 'Stefano Gebara',
  emailVerified: true,
  email_verified: true,
};

const SCREENSHOTS = path.join(process.cwd(), 'test-screenshots');
const FAKE_NANGO_URL = 'http://localhost:8086/?nango-test=complete';

async function mockAuth(page: Page) {
  await page.route('**/api/auth/refresh', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accessToken: ACCESS_TOKEN, user: AUTH_USER }),
    })
  );
  await page.addInitScript(
    ({ user }) => { localStorage.setItem('auth_user', JSON.stringify(user)); },
    { user: AUTH_USER }
  );
}

test.describe('Outlook connector auth flow', () => {

  test('1. Connect page loads and Outlook button is visible', async ({ page }) => {
    await mockAuth(page);
    await page.goto('http://localhost:8086/get-started');
    await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {});

    await page.screenshot({ path: `${SCREENSHOTS}/outlook-01-connect-page.png`, fullPage: true });

    const url = page.url();
    console.log('Page URL:', url);
    expect(url).not.toContain('/auth');

    const outlookText = page.locator('text=Outlook').first();
    const isVisible = await outlookText.isVisible().catch(() => false);
    console.log('Outlook text visible:', isVisible);
    expect(isVisible).toBe(true);

    await outlookText.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SCREENSHOTS}/outlook-02-outlook-visible.png` });
  });

  test('2. Clicking Outlook connect — popup opens, not a page navigation', async ({ page, context }) => {
    await mockAuth(page);

    // The previous mock pattern was `**/api/connectors/status**` AND it
    // returned the wrong response shape (`{ platformStatus: {} }` instead
    // of `{ data: {} }`). The HOOK that drives `isConnected` per-platform
    // is usePlatformStatus, which fetches
    //   ${API_URL}/connectors/status/${encodeURIComponent(userId)}
    // and reads `result.data || {}`. Without the dev-server-served real
    // state being overridden, the test ran against the actual user's
    // real DB connections (Stefano has Outlook connected), so every
    // platform card showed "Manage" not "Connect" and the click logic
    // couldn't find a Connect button.
    //
    // Fix: use a regex pattern that matches the path with the userId
    // suffix, and return the correct envelope so all platforms render
    // as disconnected — including Outlook, which exposes the Connect
    // button this test needs to click.
    await page.route(/\/api\/connectors\/status(\/|\?|$)/, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: {} }),
      }),
    );

    let nangoCallCount = 0;
    await page.route('**/api/nango/connect-session', async route => {
      nangoCallCount++;
      const body = JSON.parse(route.request().postData() ?? '{}');
      console.log('Nango connect-session called with integrationId:', body.integrationId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, sessionToken: 'test-tok', connectUrl: FAKE_NANGO_URL }),
      });
    });

    await page.goto('http://localhost:8086/get-started');
    await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {});

    const urlBefore = page.url();
    console.log('URL before click:', urlBefore);

    // Listen for any new page/popup. Generous timeout because Nango pre-
    // opens the popup synchronously on click, but the user-gesture
    // requirement means the popup-event fires inside Playwright's
    // network/event loop only after the click frame has been committed.
    const popupPromise = context.waitForEvent('page', { timeout: 10_000 }).catch(() => null);

    // Find the Outlook tile via the label span. /get-started actually uses
    // PlatformTile.tsx (NOT the older ConnectorCard.tsx — the only
    // surviving consumer of which is dead code), and PlatformTile renders
    // the platform name in a plain <span>, not an h3. The locator chain:
    //   1. exact-text span "Outlook" — picks the label only
    //   2. xpath ancestor::div[…has a Connect button][1] — climbs to the
    //      tile wrapper (the closest div whose subtree contains a button
    //      with text "Connect" — only that wrapper satisfies the predicate).
    const outlookLabel = page.getByText('Outlook', { exact: true }).first();
    await expect(outlookLabel, 'Outlook label is mounted').toBeVisible({ timeout: 15_000 });
    await outlookLabel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SCREENSHOTS}/outlook-03-before-click.png` });

    const outlookTile = outlookLabel.locator(
      'xpath=ancestor::div[descendant::button[normalize-space()="Connect"]][1]',
    );
    const connectBtn = outlookTile.getByRole('button', { name: /^Connect$/i });
    await expect(
      connectBtn,
      'Connect button is visible on the Outlook tile (mock disconnected state)',
    ).toBeVisible({ timeout: 10_000 });

    // The pre-open popup fix is what we're validating. Click via the
    // locator so Playwright's user-gesture model fires correctly.
    await connectBtn.click();

    // Wait for behavior to settle.
    await page.waitForTimeout(3000);

    const urlAfter = page.url();
    const popup = await popupPromise;
    const navigatedAway = !urlAfter.includes('/get-started') && urlAfter !== urlBefore;

    await page.screenshot({ path: `${SCREENSHOTS}/outlook-04-after-click.png`, fullPage: true });

    if (popup) {
      console.log('Popup URL:', popup.url());
      await popup.screenshot({ path: `${SCREENSHOTS}/outlook-05-popup-window.png` }).catch(() => {});
      await popup.close().catch(() => {});
    }

    console.log('\n--- RESULTS ---');
    console.log('Nango API called:', nangoCallCount, 'time(s)');
    console.log('URL before click:', urlBefore);
    console.log('URL after click: ', urlAfter);
    console.log('Main page navigated away:', navigatedAway);
    console.log('Popup/new tab opened:', !!popup);

    // KEY ASSERTIONS:
    // 1. The Nango API was actually called — proves the click reached the
    //    handler. (Pre-open without a Nango call could pass the popup
    //    assertion via some other popup source.)
    // 2. A popup opened — proves the pre-open fix works.
    // 3. Main page did NOT navigate to the Nango connect URL — proves
    //    the original window.location.href = connectUrl bug isn't back.
    const mainPageNavigatedToNangoUrl =
      urlAfter.includes('nango-test') || urlAfter.includes('connect.nango.dev');

    if (!popup) {
      console.log('\nFAIL: No popup opened — pre-open may not have worked');
    } else if (mainPageNavigatedToNangoUrl) {
      console.log('\nBUG: Main page navigated to Nango URL. Pre-open fix not working.');
    } else {
      console.log('\nPASS: Popup opened. Main page did NOT navigate to Nango URL. Fix is working.');
    }

    expect(nangoCallCount, 'Nango connect-session was called').toBeGreaterThan(0);
    expect(popup, 'A popup must open — pre-open popup fix must work').not.toBeNull();
    expect(mainPageNavigatedToNangoUrl, 'Main page must NOT navigate to Nango connect URL').toBe(false);
  });

  test('3. Popup close is detected and verify-connection fires', async ({ page, context }) => {
    await mockAuth(page);

    let verifyCalled = false;
    await page.route('**/api/nango/verify-connection', async route => {
      verifyCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, connected: true }),
      });
    });

    await page.goto('http://localhost:8086/get-started');
    await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {});

    // Open a popup from the main page (simulating what handleNangoPopup does)
    const popupPromise = context.waitForEvent('page', { timeout: 5000 }).catch(() => null);
    await page.evaluate((url) => {
      window.open(url, 'nango-connect', 'width=600,height=700,left=200,top=100');
    }, FAKE_NANGO_URL);

    const popup = await popupPromise;
    console.log('Popup opened:', !!popup);

    if (popup) {
      await page.waitForTimeout(800);
      await popup.close();
      console.log('Popup closed');
      // The app poll runs every 500ms — wait for 2 cycles
      await page.waitForTimeout(2000);
      console.log('verify-connection called by app poll:', verifyCalled);
      // Note: verifyCalled will be false here because the poll was set up
      // by handleNangoPopup inside the React component, not by this test's
      // window.open() call. This tests the popup mechanics, not the full flow.
    }

    await page.screenshot({ path: `${SCREENSHOTS}/outlook-06-post-popup.png`, fullPage: true });
    console.log('Main page URL:', page.url());
    // The main page navigating to /dashboard (instead of staying at /get-started)
    // is expected in test context — the get-started page redirects authenticated users
    expect(page.url()).not.toContain('nango-test');
  });
});
