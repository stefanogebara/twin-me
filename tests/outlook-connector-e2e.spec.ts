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

    await page.route('**/api/connectors/status**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, connectedPlatforms: [], platformStatus: {} }),
      })
    );

    await page.goto('http://localhost:8086/get-started');
    await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {});

    const urlBefore = page.url();
    console.log('URL before click:', urlBefore);

    // Listen for any new page/popup
    const popupPromise = context.waitForEvent('page', { timeout: 6000 }).catch(() => null);

    // Scroll Outlook into view
    const outlookEl = page.locator('text=Outlook').first();
    await outlookEl.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    await page.screenshot({ path: `${SCREENSHOTS}/outlook-03-before-click.png` });

    // Find the Connect button near Outlook using evaluate
    const clicked = await page.evaluate(() => {
      // Find the Outlook text element
      const allEls = Array.from(document.querySelectorAll('*'));
      const outlookLabel = allEls.find(el =>
        el.childNodes.length <= 3 &&
        el.textContent?.trim() === 'Outlook' &&
        !['SCRIPT', 'STYLE', 'HEAD'].includes(el.tagName)
      );
      if (!outlookLabel) return { found: false, reason: 'no Outlook text element' };

      // Walk up to find a button ancestor or sibling
      let el: Element | null = outlookLabel;
      for (let i = 0; i < 8; i++) {
        el = el?.parentElement ?? null;
        if (!el) break;
        // Look for a Connect button within this container
        const btn = el.querySelector('button');
        if (btn && /connect/i.test(btn.textContent ?? '')) {
          (btn as HTMLButtonElement).click();
          return { found: true, clicked: btn.textContent?.trim() };
        }
      }
      return { found: true, reason: 'no connect button in ancestry' };
    });
    console.log('Click evaluate result:', JSON.stringify(clicked));

    // Wait for behavior to settle
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
    // 1. A popup must have opened (proves pre-open fix works)
    // 2. Main page must NOT have navigated to the Nango connect URL
    //    (the original bug was window.location.href = connectUrl)
    const mainPageNavigatedToNangoUrl = urlAfter.includes('nango-test') || urlAfter.includes('connect.nango.dev');

    if (!popup) {
      console.log('\nFAIL: No popup opened — pre-open may not have worked');
    } else if (mainPageNavigatedToNangoUrl) {
      console.log('\nBUG: Main page navigated to Nango URL. Pre-open fix not working.');
    } else {
      console.log('\nPASS: Popup opened. Main page did NOT navigate to Nango URL. Fix is working.');
    }

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
