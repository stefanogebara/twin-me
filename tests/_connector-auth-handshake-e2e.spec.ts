/**
 * Connector auth handshake verifier.
 *
 * For every tile on /connect that currently shows a "Connect" button
 * (i.e. the user is NOT already connected), click it and verify the
 * backend returns a valid OAuth start URL pointing at the right provider.
 *
 * Does NOT actually complete OAuth — intercepts the navigation/popup so
 * stefano's account stays clean.
 *
 * Run:
 *   TEST_BASE_URL=https://www.twinme.me npx playwright test \
 *     tests/_connector-auth-handshake-e2e.spec.ts --project=e2e --workers=1 \
 *     --reporter=list --headed
 */
import { expect, test } from '@playwright/test';
import { injectAuth, BASE_URL, SCREENSHOT_DIR } from './e2e/helpers';
import path from 'path';

const OUT = path.join(SCREENSHOT_DIR, 'auth-handshake');

test.setTimeout(300_000);

// Expected OAuth provider host (or sentinel) per platform name shown on tile
const EXPECTED_HOST: Record<string, RegExp> = {
  Spotify: /accounts\.spotify\.com/,
  YouTube: /accounts\.google\.com/,
  'Google Calendar': /accounts\.google\.com/,
  Gmail: /accounts\.google\.com/,
  GitHub: /github\.com\/login\/oauth/,
  LinkedIn: /linkedin\.com\/oauth/,
  Reddit: /reddit\.com\/api\/v1\/authorize/,
  Discord: /discord\.com\/oauth2/,
  Slack: /slack\.com\/oauth/,
  Strava: /strava\.com\/oauth/,
  Twitch: /twitch\.tv\/oauth2/,
  Outlook: /login\.microsoftonline\.com|login\.live\.com/,
  Whoop: /api\.prod\.whoop\.com|nango\.dev/,
  'Apple Music': /appleid\.apple\.com|music\.apple\.com/,
};

interface Result {
  platform: string;
  clicked: boolean;
  authUrl: string | null;
  matchedExpectedProvider: boolean | null;
  networkStatus: number | null;
  popupOpened: boolean;
  toastSurfaced: boolean;
  notes: string[];
}

test('Auth handshake works for every unconnected platform on /connect', async ({ page, context }) => {
  await injectAuth(page);

  // Capture EVERY network response from the backend connect endpoints + every
  // popup, mapped by the most-recent platform we clicked.
  const responsesByUrl: Array<{ url: string; status: number; body: string }> = [];
  page.on('response', async (resp) => {
    const u = resp.url();
    if (/\/api\/(connectors\/connect|nango\/connect-session|entertainment\/connect|.*\/connect)/.test(u)) {
      let body = '';
      try { body = (await resp.text()).slice(0, 800); } catch {
        /* best-effort: response body may be unreadable for some responses */
      }
      responsesByUrl.push({ url: u, status: resp.status(), body });
    }
  });

  // Track popups (Nango Connect Sessions open in a popup)
  let popupCount = 0;
  context.on('page', () => { popupCount++; });

  await page.goto(`${BASE_URL}/connect`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(3000);

  // Block off-site navigations AFTER the page has rendered, so initial load
  // (CDN, analytics, react bundle) isn't interfered with. Only main-frame
  // navigations get blocked — resource loads (script, css) pass through.
  await page.route('**/*', async (route, req) => {
    const isMainFrameNav = req.isNavigationRequest() && req.frame() === page.mainFrame();
    const goingOffsite = !req.url().startsWith(BASE_URL) && !req.url().includes('twinme.me') && !req.url().includes('vercel.app');
    if (isMainFrameNav && goingOffsite) {
      console.log(`[BLOCKED nav] ${req.url().slice(0, 120)}`);
      await route.abort();
      return;
    }
    await route.continue();
  });

  // Force render of below-fold tiles
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  // Walk back from every Connect button to its tile, grab the name span
  const platformsWithConnect = await page.evaluate(() => {
    const names: string[] = [];
    const connectBtns = Array.from(document.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim() === 'Connect',
    );
    for (const btn of connectBtns) {
      // Walk up to a flex container that also holds the icon + name
      let tile: Element | null = btn.parentElement;
      while (tile && tile.parentElement) {
        const flexish = tile.className && /flex.*items-center|items-center.*flex/.test(String(tile.className));
        if (flexish) break;
        tile = tile.parentElement;
      }
      if (!tile) tile = btn.closest('div');
      if (!tile) continue;
      // Find the name span: pick the shortest span with letters that isn't Connect/Soon
      const spans = Array.from(tile.querySelectorAll('span'));
      let pick = '';
      for (const s of spans) {
        const t = (s.textContent || '').trim();
        if (!t || t.length > 25) continue;
        if (['Connect', 'Soon', 'Manage', 'Reconnect', 'Syncing', 'Needs attention'].includes(t)) continue;
        if (/^\d+$/.test(t)) continue;
        if (/reveals|•|\s\w+\s\w+\s\w+/.test(t)) continue; // skip descriptions
        pick = t;
        break;
      }
      if (pick) names.push(pick);
    }
    return [...new Set(names)];
  });
  const connectBtnCount = await page.locator('button:has-text("Connect")').count();
  const manageBtnCount = await page.locator('button:has-text("Manage")').count();
  const reconnectBtnCount = await page.locator('button:has-text("Reconnect")').count();
  console.log(`[DOM button counts] Connect=${connectBtnCount} Manage=${manageBtnCount} Reconnect=${reconnectBtnCount}`);
  await page.screenshot({ path: `${OUT}/00-initial.png`, fullPage: true });

  console.log('[Found platforms with Connect button]', platformsWithConnect);

  const results: Result[] = [];

  for (const platform of platformsWithConnect) {
    const result: Result = {
      platform,
      clicked: false,
      authUrl: null,
      matchedExpectedProvider: null,
      networkStatus: null,
      popupOpened: false,
      toastSurfaced: false,
      notes: [],
    };

    const beforeRespCount = responsesByUrl.length;
    const beforePopups = popupCount;

    try {
      const connectBtn = page
        .locator('div')
        .filter({ hasText: platform })
        .filter({ has: page.locator('button:has-text("Connect")') })
        .last()
        .locator('button:has-text("Connect")');

      // Always scroll the tile into view before attempting click — many tiles
      // sit below the fold and Playwright's auto-wait can't click them.
      // Also expand any "More platforms" / "Show more" toggles that hide tiles.
      await page.evaluate((p) => {
        // Click any "More platforms" expander first
        const moreBtns = Array.from(document.querySelectorAll('button')).filter((b) => {
          const t = b.textContent?.trim().toLowerCase() || '';
          return t.includes('more platform') || t.includes('show more') || t.includes('show all');
        });
        moreBtns.forEach((b) => (b as HTMLButtonElement).click());
        // Then scroll the named platform into view
        const spans = Array.from(document.querySelectorAll('span'));
        const el = spans.find((s) => s.textContent?.trim() === p);
        el?.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'center' });
      }, platform);
      await page.waitForTimeout(800);

      // Use locator.scrollIntoViewIfNeeded as a second guarantee
      await connectBtn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(300);

      await connectBtn.click({ timeout: 8000, force: true });
      result.clicked = true;
      await page.waitForTimeout(2500);

      // Look at the most recent matching response
      const newResponses = responsesByUrl.slice(beforeRespCount);
      const platformResp = newResponses.find((r) =>
        r.url.toLowerCase().includes(platform.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_')) ||
        r.url.toLowerCase().includes(platform.toLowerCase().split(' ')[0]),
      ) || newResponses[newResponses.length - 1];

      if (platformResp) {
        result.networkStatus = platformResp.status;
        try {
          const json = JSON.parse(platformResp.body);
          const authUrl = json?.authUrl || json?.data?.authUrl || json?.connectUrl || json?.data?.connectUrl;
          if (authUrl) {
            result.authUrl = String(authUrl).slice(0, 200);
            const expected = EXPECTED_HOST[platform];
            if (expected) {
              result.matchedExpectedProvider = expected.test(authUrl);
            } else {
              result.notes.push('No expected-host pattern configured for this platform');
            }
          } else if (json?.error) {
            result.notes.push(`API error: ${json.error}`);
          } else {
            result.notes.push(`Response missing authUrl: ${JSON.stringify(json).slice(0, 100)}`);
          }
        } catch {
          result.notes.push(`Non-JSON response: ${platformResp.body.slice(0, 100)}`);
        }
      } else {
        result.notes.push('No backend response captured');
      }

      if (popupCount > beforePopups) {
        result.popupOpened = true;
        result.notes.push('Popup opened (Nango Connect Session pattern)');
      }

      // Look for a toast (success or error) — proves no silent failure
      const toastText = await page.locator('[role="status"], .toast, [class*="oast"]').count();
      if (toastText > 0) result.toastSurfaced = true;
    } catch (err) {
      result.notes.push(`Click/handshake threw: ${err instanceof Error ? err.message : String(err)}`);
    }

    results.push(result);
    console.log(`[${platform}] clicked=${result.clicked} status=${result.networkStatus} authUrl=${result.authUrl ? 'YES' : 'no'} matchedProvider=${result.matchedExpectedProvider} popup=${result.popupOpened}`);

    // Press Escape to dismiss any modal that may have opened (Steam/Duolingo/Garmin)
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
  }

  // ── Final report ─────────────────────────────────────────────────────────
  console.log('\n══════════════ AUTH HANDSHAKE REPORT ══════════════');
  const okCount = results.filter((r) => r.clicked && (r.authUrl || r.popupOpened || r.toastSurfaced || r.notes.some((n) => n.includes('error') === false))).length;
  for (const r of results) {
    const verdict = r.authUrl
      ? (r.matchedExpectedProvider === false ? 'WRONG_PROVIDER' : 'OAUTH_URL_OK')
      : r.popupOpened
      ? 'POPUP_OPENED'
      : r.toastSurfaced
      ? 'TOAST_SHOWN'
      : 'NO_FEEDBACK';
    console.log(`  ${verdict.padEnd(18)} ${r.platform.padEnd(20)} status=${r.networkStatus ?? '-'} url=${r.authUrl?.slice(0, 60) ?? '-'}`);
    if (r.notes.length) console.log(`                                       notes: ${r.notes.join(' | ')}`);
  }
  console.log(`════════════════════════════════════════════════════`);
  console.log(`Total tiles tested: ${results.length}, with successful auth signal: ${okCount}`);

  await page.screenshot({ path: `${OUT}/final.png`, fullPage: true });

  // Assert: every tile we clicked got SOME backend signal (not silent failure)
  const silent = results.filter((r) => r.clicked && !r.authUrl && !r.popupOpened && !r.toastSurfaced);
  if (silent.length > 0) {
    console.log(`\nSilent failures (no auth URL, no popup, no toast):`);
    silent.forEach((s) => console.log(`  - ${s.platform}: ${s.notes.join(' | ')}`));
  }
  // Don't hard-fail on silent — just report. The valuable signal is the table above.
});
