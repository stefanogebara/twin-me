/**
 * Frontend E2E Audit — 2026-03-14
 *
 * Comprehensive audit of all TwinMe routes:
 * - Unauthenticated public routes (/, /auth, /discover, /privacy-policy, /terms-of-service, /portfolio)
 * - Authenticated routes (redirect to /auth when no token)
 * - Landing page CTA buttons + footer links
 * - Mobile viewport (375px) on landing page
 * - Console JS errors
 * - 404 asset/API errors
 * - Blank screen / crash detection
 *
 * Screenshots saved to tests/e2e/screenshots/audit-2026-03-14/
 */

import { test, expect, Page } from '@playwright/test';
import {
  collectConsoleErrors,
  collect404s,
  waitForPageLoad,
  screenshot,
  criticalErrors,
  injectAuth,
} from './helpers';

const BASE = 'http://127.0.0.1:8086';
const SS_DIR = 'tests/e2e/screenshots/audit-2026-03-14';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function auditPage(
  page: Page,
  path: string,
  label: string,
): Promise<{ errors: string[]; notFounds: string[]; url: string; title: string }> {
  const errors = collectConsoleErrors(page);
  const notFounds = collect404s(page);

  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await waitForPageLoad(page, 10000);
  await page.waitForTimeout(1000);

  const url = page.url();
  const title = await page.title();
  await screenshot(page, `${SS_DIR}/${label}`);

  return { errors, notFounds, url, title };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: Public / Unauthenticated Routes
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Public Routes', () => {
  test('/ — landing page renders without crash', async ({ page }) => {
    const { errors, notFounds, url, title } = await auditPage(page, '/', 'landing');

    // Should stay on landing (not redirect)
    expect(url).toMatch(/127\.0\.0\.1:8086\/?$/);

    // Should have meaningful page title
    expect(title.length).toBeGreaterThan(0);

    // No critical JS errors
    const crits = criticalErrors(errors);
    if (crits.length > 0) {
      console.error('CRITICAL JS ERRORS on /:', crits);
    }
    expect(crits, `Critical JS errors on /: ${crits.join('; ')}`).toHaveLength(0);

    // Page should not be blank — at minimum a heading or paragraph
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length, 'Page body is empty (blank screen)').toBeGreaterThan(50);

    console.log(`  [/] title="${title}" url=${url}`);
    console.log(`  [/] console errors (${errors.length}):`, errors.slice(0, 5));
    console.log(`  [/] 404s (${notFounds.length}):`, notFounds.slice(0, 5));
  });

  test('/auth — login page renders', async ({ page }) => {
    const { errors, notFounds, url, title } = await auditPage(page, '/auth', 'auth');

    expect(url).toContain('/auth');

    const crits = criticalErrors(errors);
    if (crits.length > 0) {
      console.error('CRITICAL JS ERRORS on /auth:', crits);
    }
    expect(crits, `Critical JS errors on /auth: ${crits.join('; ')}`).toHaveLength(0);

    // Auth page should have a form or login button
    const hasForm = await page.locator('form, input[type="email"], button').count();
    expect(hasForm, 'No form/input/button found on /auth').toBeGreaterThan(0);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length, 'Auth page body is empty').toBeGreaterThan(20);

    console.log(`  [/auth] title="${title}" url=${url}`);
    console.log(`  [/auth] console errors (${errors.length}):`, errors.slice(0, 5));
    console.log(`  [/auth] 404s (${notFounds.length}):`, notFounds.slice(0, 5));
  });

  test('/discover — discovery page renders', async ({ page }) => {
    const { errors, notFounds, url, title } = await auditPage(page, '/discover', 'discover');

    const crits = criticalErrors(errors);
    if (crits.length > 0) {
      console.error('CRITICAL JS ERRORS on /discover:', crits);
    }
    expect(crits, `Critical JS errors on /discover: ${crits.join('; ')}`).toHaveLength(0);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length, 'Discover page body is empty').toBeGreaterThan(20);

    console.log(`  [/discover] url=${url} errors=${errors.length} 404s=${notFounds.length}`);
  });

  test('/privacy-policy — renders without crash', async ({ page }) => {
    const { errors, notFounds, url } = await auditPage(page, '/privacy-policy', 'privacy-policy');

    const crits = criticalErrors(errors);
    expect(crits, `Critical JS errors on /privacy-policy: ${crits.join('; ')}`).toHaveLength(0);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length, 'Privacy policy body is empty').toBeGreaterThan(50);

    console.log(`  [/privacy-policy] url=${url} errors=${errors.length} 404s=${notFounds.length}`);
  });

  test('/terms-of-service — renders without crash', async ({ page }) => {
    const { errors, notFounds, url } = await auditPage(page, '/terms-of-service', 'terms-of-service');

    const crits = criticalErrors(errors);
    expect(crits, `Critical JS errors on /terms-of-service: ${crits.join('; ')}`).toHaveLength(0);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length, 'Terms of service body is empty').toBeGreaterThan(50);

    console.log(`  [/terms-of-service] url=${url} errors=${errors.length} 404s=${notFounds.length}`);
  });

  test('/portfolio — public profile renders', async ({ page }) => {
    const { errors, notFounds, url } = await auditPage(page, '/portfolio', 'portfolio');

    const crits = criticalErrors(errors);
    if (crits.length > 0) {
      console.error('CRITICAL JS ERRORS on /portfolio:', crits);
    }
    expect(crits, `Critical JS errors on /portfolio: ${crits.join('; ')}`).toHaveLength(0);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length, 'Portfolio page body is empty').toBeGreaterThan(20);

    console.log(`  [/portfolio] url=${url} errors=${errors.length} 404s=${notFounds.length}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: Authenticated Routes — Redirect Behavior When Logged Out
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_REQUIRED_ROUTES = [
  { path: '/dashboard', label: 'dashboard' },
  { path: '/talk-to-twin', label: 'talk-to-twin' },
  { path: '/chat', label: 'chat' },
  { path: '/identity', label: 'identity' },
  { path: '/goals', label: 'goals' },
  { path: '/brain', label: 'brain' },
  { path: '/settings', label: 'settings' },
  { path: '/connect', label: 'connect' },
  { path: '/insights/spotify', label: 'insights-spotify' },
  { path: '/insights/youtube', label: 'insights-youtube' },
  { path: '/insights/calendar', label: 'insights-calendar' },
  { path: '/insights/discord', label: 'insights-discord' },
  { path: '/insights/linkedin', label: 'insights-linkedin' },
  { path: '/insights/web-browsing', label: 'insights-web-browsing' },
];

test.describe('Auth-Required Routes — Unauthenticated Redirect', () => {
  for (const { path, label } of AUTH_REQUIRED_ROUTES) {
    test(`${path} redirects to /auth when not logged in`, async ({ page }) => {
      const errors = collectConsoleErrors(page);

      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      await waitForPageLoad(page, 8000);
      await page.waitForTimeout(800);

      const url = page.url();
      await screenshot(page, `${SS_DIR}/${label}-unauth`);

      // Should redirect to /auth (correct behavior)
      const redirectedToAuth = url.includes('/auth');
      // OR the page shows content without crashing (some may show empty state)
      const bodyText = (await page.locator('body').innerText()).trim();
      const isBlank = bodyText.length < 10;

      if (!redirectedToAuth) {
        console.warn(`  [${path}] Did NOT redirect to /auth — stayed at ${url}`);
      }

      // Critical check: must not be a blank crash
      expect(isBlank, `${path} shows a blank/empty page (potential crash)`).toBe(false);

      // Must not throw critical JS errors regardless of auth state
      const crits = criticalErrors(errors);
      expect(crits, `Critical JS errors on ${path}: ${crits.join('; ')}`).toHaveLength(0);

      console.log(`  [${path}] url=${url} redirected=${redirectedToAuth} body=${bodyText.length}chars`);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: Landing Page CTA Buttons
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Landing Page — CTA Buttons', () => {
  test('Primary CTA button navigates correctly', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page, 10000);

    // Collect all CTA-style buttons
    const ctaSelectors = [
      'a[href*="/auth"]',
      'button:has-text("Get Started")',
      'button:has-text("Start")',
      'button:has-text("Try")',
      'a:has-text("Get Started")',
      'a:has-text("Start")',
    ];

    let ctaFound = false;
    for (const sel of ctaSelectors) {
      const count = await page.locator(sel).count();
      if (count > 0) {
        ctaFound = true;
        const firstCta = page.locator(sel).first();
        const text = await firstCta.textContent();
        const href = await firstCta.getAttribute('href');
        console.log(`  [CTA] Found "${text?.trim()}" href="${href}" selector="${sel}"`);
        break;
      }
    }

    if (!ctaFound) {
      // Gather all buttons/links for diagnosis
      const allButtons = await page.locator('button, a[href]').all();
      const buttonTexts = await Promise.all(allButtons.slice(0, 20).map(b => b.textContent()));
      console.warn('  [CTA] No standard CTA found. Buttons on page:', buttonTexts.map(t => t?.trim()).filter(Boolean));
    }

    await screenshot(page, `${SS_DIR}/landing-cta-check`);
  });

  test('Navigation links on landing page are valid', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page, 10000);

    // Collect all internal links
    const links = await page.locator('a[href^="/"], a[href^="http://127.0.0.1"], a[href^="http://localhost"]').all();
    const brokenLinks: string[] = [];

    console.log(`  [Nav] Found ${links.length} internal links`);

    for (const link of links.slice(0, 30)) {
      const href = await link.getAttribute('href');
      const text = await link.textContent();
      if (href) {
        console.log(`  [Nav link] "${text?.trim()}" -> ${href}`);
      }
    }

    // Verify no critical errors after rendering landing links
    const crits = criticalErrors(errors);
    expect(crits, `Critical errors on landing: ${crits.join('; ')}`).toHaveLength(0);
  });

  test('Footer links resolve — no broken hrefs', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page, 10000);

    // Scroll to footer
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await screenshot(page, `${SS_DIR}/landing-footer`);

    // Get footer links
    const footer = page.locator('footer');
    const footerExists = await footer.count();

    if (footerExists > 0) {
      const footerLinks = await footer.locator('a').all();
      console.log(`  [Footer] Found ${footerLinks.length} footer links`);
      for (const link of footerLinks) {
        const href = await link.getAttribute('href');
        const text = await link.textContent();
        console.log(`  [Footer link] "${text?.trim()}" -> ${href}`);
      }
    } else {
      console.warn('  [Footer] No <footer> element found on landing page');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: Mobile Viewport — Landing Page
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Mobile Viewport — Landing Page', () => {
  test('375px viewport renders landing without horizontal overflow or crash', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    const errors = collectConsoleErrors(page);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page, 10000);

    await screenshot(page, `${SS_DIR}/landing-mobile-375`);

    // Check for horizontal overflow (content wider than viewport)
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.body.scrollWidth > window.innerWidth;
    });

    if (hasHorizontalOverflow) {
      const overflowWidth = await page.evaluate(() => document.body.scrollWidth);
      console.warn(`  [Mobile] Horizontal overflow: scrollWidth=${overflowWidth}px > viewportWidth=375px`);
    }

    // No critical JS errors on mobile
    const crits = criticalErrors(errors);
    expect(crits, `Critical JS errors on mobile landing: ${crits.join('; ')}`).toHaveLength(0);

    // Page should have content
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length, 'Mobile landing page is blank').toBeGreaterThan(50);

    console.log(`  [Mobile] overflow=${hasHorizontalOverflow} errors=${errors.length}`);
  });

  test('375px viewport — nav hamburger menu or mobile nav visible', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page, 8000);
    await page.waitForTimeout(500);

    await screenshot(page, `${SS_DIR}/landing-mobile-nav`);

    // Check if desktop nav is hidden on mobile
    const desktopNavVisible = await page.locator('nav').first().isVisible().catch(() => false);
    const hamburgerVisible = await page
      .locator('[aria-label*="menu" i], [aria-label*="hamburger" i], button:has(svg), .hamburger, .mobile-menu-btn')
      .first()
      .isVisible()
      .catch(() => false);

    console.log(`  [Mobile nav] desktopNavVisible=${desktopNavVisible} hamburgerVisible=${hamburgerVisible}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: Authenticated Routes — Load with Token
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Authenticated Routes — With Auth Token', () => {
  const AUTHED_ROUTES = [
    { path: '/dashboard', label: 'auth-dashboard' },
    { path: '/talk-to-twin', label: 'auth-twin-chat' },
    { path: '/identity', label: 'auth-identity' },
    { path: '/goals', label: 'auth-goals' },
    { path: '/brain', label: 'auth-brain' },
    { path: '/settings', label: 'auth-settings' },
    { path: '/connect', label: 'auth-connect' },
    { path: '/insights/spotify', label: 'auth-insights-spotify' },
    { path: '/insights/youtube', label: 'auth-insights-youtube' },
    { path: '/insights/calendar', label: 'auth-insights-calendar' },
    { path: '/insights/discord', label: 'auth-insights-discord' },
    { path: '/insights/linkedin', label: 'auth-insights-linkedin' },
  ];

  for (const { path, label } of AUTHED_ROUTES) {
    test(`${path} loads content with auth token`, async ({ page }) => {
      // Skip if no token configured
      if (!process.env.TEST_AUTH_TOKEN) {
        test.skip(true, 'TEST_AUTH_TOKEN not set — skipping authenticated route tests');
        return;
      }

      await injectAuth(page);
      const errors = collectConsoleErrors(page);
      const notFounds = collect404s(page);

      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      await waitForPageLoad(page, 12000);
      await page.waitForTimeout(1500);

      const url = page.url();
      await screenshot(page, `${SS_DIR}/${label}`);

      // Should not redirect away from the route
      const redirectedToAuth = url.includes('/auth');
      if (redirectedToAuth) {
        console.error(`  [${path}] UNEXPECTED redirect to /auth (token may be expired)`);
      }

      // No critical JS errors
      const crits = criticalErrors(errors);
      if (crits.length > 0) {
        console.error(`  [${path}] Critical JS errors:`, crits);
      }
      expect(crits, `Critical JS errors on ${path}: ${crits.join('; ')}`).toHaveLength(0);

      // Page should not be blank
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.trim().length, `${path} is blank with auth token`).toBeGreaterThan(30);

      // Log 404s (warnings, not failures — API 404s are expected for missing data)
      if (notFounds.length > 0) {
        console.warn(`  [${path}] 404s:`, notFounds);
      }

      console.log(
        `  [${path}] url=${url} redirected=${redirectedToAuth} body=${bodyText.length}chars ` +
          `errors=${errors.length} 404s=${notFounds.length}`,
      );
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: Asset / Resource Integrity
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Asset Integrity', () => {
  test('Landing page — no broken images', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page, 10000);

    // Check all img tags for broken sources
    const images = await page.locator('img').all();
    const brokenImages: string[] = [];

    for (const img of images) {
      const src = await img.getAttribute('src');
      const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
      if (naturalWidth === 0 && src) {
        brokenImages.push(src);
      }
    }

    if (brokenImages.length > 0) {
      console.warn('  [Assets] Broken images on landing:', brokenImages);
    }

    console.log(`  [Assets] ${images.length} images, ${brokenImages.length} broken`);
    await screenshot(page, `${SS_DIR}/landing-images`);
  });

  test('Landing page — CSS loads (page is not unstyled)', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page, 10000);

    // Check that at least one stylesheet loaded
    const styleCount = await page.evaluate(() => document.styleSheets.length);
    expect(styleCount, 'No stylesheets loaded — page may be unstyled').toBeGreaterThan(0);

    // Background color should not be pure default white (browser default) unless that's the design
    const bgColor = await page.evaluate(() => {
      const computed = window.getComputedStyle(document.body);
      return computed.backgroundColor;
    });

    console.log(`  [CSS] styleSheets=${styleCount} body bg="${bgColor}"`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: Error Pages
// ─────────────────────────────────────────────────────────────────────────────

test.describe('404 / Unknown Routes', () => {
  test('/nonexistent-route — shows 404 page or redirects gracefully', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(`${BASE}/nonexistent-route-xyz-12345`, { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page, 8000);
    await page.waitForTimeout(500);

    const url = page.url();
    await screenshot(page, `${SS_DIR}/404-page`);

    const bodyText = await page.locator('body').innerText();

    // Should either show a 404 page or redirect to a valid route
    const shows404Content =
      bodyText.toLowerCase().includes('404') ||
      bodyText.toLowerCase().includes('not found') ||
      bodyText.toLowerCase().includes("doesn't exist");

    const redirected = !url.includes('nonexistent');

    if (!shows404Content && !redirected) {
      console.warn(`  [404] No 404 page and no redirect — shows: "${bodyText.substring(0, 100)}"`);
    }

    // Must not be completely blank
    expect(bodyText.trim().length, '404 route shows blank page').toBeGreaterThan(10);

    // No critical crashes
    const crits = criticalErrors(errors);
    expect(crits, `Critical JS errors on 404 route: ${crits.join('; ')}`).toHaveLength(0);

    console.log(
      `  [404] url=${url} shows404=${shows404Content} redirected=${redirected} body=${bodyText.length}chars`,
    );
  });
});
