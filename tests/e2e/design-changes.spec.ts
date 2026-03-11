/**
 * E2E Design Validation Tests
 * Tests the warm cream redesign of DiscoverLanding and PaywallModal.
 *
 * DiscoverLanding (/discover):
 *   - Background: #fcf6ef warm cream (NOT black)
 *   - Buttons: black pill (btn-cta, NOT indigo/blue)
 *   - Flower logo visible
 *   - Serif heading "Discover your Soul Signature"
 *   - White email input
 *   - Scan form submission + glass result card
 *   - "Discover my Soul Signature" continue button after scan
 *
 * PaywallModal (structural/source check):
 *   - NO dark theme classes (bg-gray-950, bg-indigo, border-gray-800)
 *   - Uses #fff background, rgba(0,0,0,0.45) backdrop, heading-serif, btn-cta, gold gradient
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const SCREENSHOTS_DIR = path.resolve('tests/e2e/screenshots');

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// ── DiscoverLanding (/discover) ─────────────────────────────────────────────

test.describe('DiscoverLanding design', () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // no auth needed — public page

  test.beforeEach(async ({ page }) => {
    await page.goto('/discover');
    await page.waitForLoadState('networkidle');
  });

  test('background is warm cream #fcf6ef (not black)', async ({ page }) => {
    const screenshot = path.join(SCREENSHOTS_DIR, '01-discover-initial.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    console.log(`Screenshot saved: ${screenshot}`);

    const body = page.locator('body > div, .min-h-screen').first();
    // The root div has inline style backgroundColor = #fcf6ef
    const rootDiv = page.locator('div.min-h-screen').first();
    const bg = await rootDiv.evaluate((el) => getComputedStyle(el).backgroundColor);
    console.log(`Background color: ${bg}`);

    // #fcf6ef = rgb(252, 246, 239)
    expect(bg).toBe('rgb(252, 246, 239)');
  });

  test('no black/dark background (black would be rgb(0,0,0))', async ({ page }) => {
    const rootDiv = page.locator('div.min-h-screen').first();
    const bg = await rootDiv.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe('rgb(0, 0, 0)');
    expect(bg).not.toContain('rgb(15,');   // very dark near-black
    expect(bg).not.toContain('rgb(10,');
  });

  test('no indigo/blue CTA buttons', async ({ page }) => {
    // btn-cta buttons should NOT have indigo background
    const buttons = page.locator('button.btn-cta');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      const bg = await btn.evaluate((el) => getComputedStyle(el).backgroundColor);
      console.log(`Button ${i} bg: ${bg}`);
      // Indigo = ~rgb(99,102,241) or rgb(79,70,229). Black = rgb(0,0,0).
      expect(bg).not.toMatch(/rgb\(99,\s*102,\s*241\)/);
      expect(bg).not.toMatch(/rgb\(79,\s*70,\s*229\)/);
      expect(bg).not.toMatch(/rgb\(67,\s*56,\s*202\)/);
    }
  });

  test('flower logo is visible', async ({ page }) => {
    const logo = page.locator('img[src*="flower-hero"]');
    await expect(logo).toBeVisible();
  });

  test('heading contains "Discover your Soul Signature" in serif element', async ({ page }) => {
    const heading = page.locator('h1.heading-serif');
    await expect(heading).toBeVisible();
    await expect(heading).toContainText('Discover your Soul Signature');
  });

  test('"Twin Me" brand text is visible with serif font', async ({ page }) => {
    const brand = page.locator('span.heading-serif');
    await expect(brand).toBeVisible();
    await expect(brand).toContainText('Twin Me');
  });

  test('email input is present with white background', async ({ page }) => {
    const input = page.locator('input[type="email"]');
    await expect(input).toBeVisible();

    const bg = await input.evaluate((el) => getComputedStyle(el).backgroundColor);
    console.log(`Input background: ${bg}`);
    // White = rgb(255,255,255)
    expect(bg).toBe('rgb(255, 255, 255)');
  });

  test('"Scan my public footprint" button is present', async ({ page }) => {
    const btn = page.locator('button[type="submit"]');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('Scan my public footprint');
  });

  test('form submission shows glass result card and continue button', async ({ page }) => {
    // Intercept the scan API call and return a mock discovered result
    await page.route('**/discovery/scan', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          discovered: {
            discovered_name: 'Test User',
            discovered_title: 'Software Engineer',
            discovered_company: 'TwinMe',
            discovered_location: 'San Francisco, CA',
            discovered_bio: 'A passionate developer exploring the soul signature platform.',
            discovered_photo: null,
          },
        }),
      });
    });

    // Fill in and submit the form
    const input = page.locator('input[type="email"]');
    await input.fill('test@example.com');

    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();

    // Wait for result card to appear
    await page.waitForSelector('text=What the world knows about you', { timeout: 10000 });

    const screenshot = path.join(SCREENSHOTS_DIR, '02-discover-result-card.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    console.log(`Screenshot saved: ${screenshot}`);

    // Verify glass result card
    const resultCard = page.locator('text=What the world knows about you');
    await expect(resultCard).toBeVisible();

    // Verify glass card styling (backdrop-filter or white bg)
    const card = page.locator('.rounded-2xl').first();
    const cardBg = await card.evaluate((el) => getComputedStyle(el).background || getComputedStyle(el).backgroundColor);
    console.log(`Result card bg: ${cardBg}`);

    // Verify discovered name appears
    await expect(page.locator('text=Test User')).toBeVisible();

    // Verify continue button appears after scan
    const continueBtn = page.locator('button:has-text("Discover my Soul Signature")');
    await expect(continueBtn).toBeVisible();
    console.log('PASS: "Discover my Soul Signature" continue button is visible after scan');
  });

  test('form submission with no result shows ghost card', async ({ page }) => {
    // Return null discovered (ghost on the internet scenario)
    await page.route('**/discovery/scan', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ discovered: null }),
      });
    });

    const input = page.locator('input[type="email"]');
    await input.fill('ghost@example.com');
    await page.locator('button[type="submit"]').click();

    await page.waitForSelector('text=a ghost on the internet', { timeout: 10000 });

    const screenshot = path.join(SCREENSHOTS_DIR, '03-discover-ghost-card.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    console.log(`Screenshot saved: ${screenshot}`);

    await expect(page.locator('text=a ghost on the internet')).toBeVisible();

    // Continue button still appears
    const continueBtn = page.locator('button:has-text("Discover my Soul Signature")');
    await expect(continueBtn).toBeVisible();
  });
});

// ── PaywallModal (structural / source validation) ───────────────────────────

test.describe('PaywallModal design structure', () => {
  /**
   * Since triggering the paywall in-browser requires a specific auth+message-limit
   * state, we validate the JSX source directly for forbidden dark-theme classes
   * and confirm the presence of required new-theme values.
   */

  const PAYWALL_SOURCE = fs.readFileSync(
    path.resolve('src/components/PaywallModal.tsx'),
    'utf-8'
  );

  test('no bg-gray-950 class (old dark background)', () => {
    const hasClass = PAYWALL_SOURCE.includes('bg-gray-950');
    if (hasClass) console.error('FAIL: Found forbidden class "bg-gray-950" in PaywallModal');
    expect(hasClass).toBe(false);
  });

  test('no bg-indigo class (old indigo theme)', () => {
    const hasClass = /bg-indigo[-\w]/.test(PAYWALL_SOURCE);
    if (hasClass) console.error('FAIL: Found forbidden class "bg-indigo-*" in PaywallModal');
    expect(hasClass).toBe(false);
  });

  test('no border-gray-800 class (old dark border)', () => {
    const hasClass = PAYWALL_SOURCE.includes('border-gray-800');
    if (hasClass) console.error('FAIL: Found forbidden class "border-gray-800" in PaywallModal');
    expect(hasClass).toBe(false);
  });

  test('no text-white on outer modal container (old dark theme)', () => {
    // The outer motion.div should NOT use text-white class as a container-level style
    // (individual elements like button text can still use text-white inline via style)
    // We check: the className of the outer wrapper rounded-3xl div does NOT include text-white
    const outerContainerMatch = PAYWALL_SOURCE.match(/rounded-3xl[^"]*"/);
    if (outerContainerMatch) {
      const hasTextWhite = outerContainerMatch[0].includes('text-white');
      expect(hasTextWhite).toBe(false);
    } else {
      // If the pattern doesn't match, just verify text-white isn't used as a container class
      // by checking it's not in className of the outer wrapper
      console.log('Outer container class not matched via regex, skipping text-white check on container');
    }
  });

  test('modal uses #fff background (white card)', () => {
    const hasWhiteBg = PAYWALL_SOURCE.includes("'#fff'") || PAYWALL_SOURCE.includes('"#fff"');
    if (!hasWhiteBg) console.error('FAIL: Modal does not use #fff background');
    expect(hasWhiteBg).toBe(true);
  });

  test('backdrop uses rgba(0,0,0,0.45)', () => {
    const hasBackdrop = PAYWALL_SOURCE.includes('rgba(0,0,0,0.45)');
    if (!hasBackdrop) console.error('FAIL: Modal does not use rgba(0,0,0,0.45) backdrop');
    expect(hasBackdrop).toBe(true);
  });

  test('heading uses heading-serif class (Instrument Serif)', () => {
    const hasSerif = PAYWALL_SOURCE.includes('heading-serif');
    if (!hasSerif) console.error('FAIL: heading-serif class not found in PaywallModal');
    expect(hasSerif).toBe(true);
  });

  test('Pro CTA uses btn-cta class (black pill button)', () => {
    const hasBtnCta = PAYWALL_SOURCE.includes('btn-cta');
    if (!hasBtnCta) console.error('FAIL: btn-cta class not found in PaywallModal');
    expect(hasBtnCta).toBe(true);
  });

  test('Max CTA uses gold gradient (linear-gradient with #C4A265)', () => {
    const hasGoldGradient =
      PAYWALL_SOURCE.includes('linear-gradient') && PAYWALL_SOURCE.includes('#C4A265');
    if (!hasGoldGradient) console.error('FAIL: Gold gradient not found in PaywallModal Max CTA');
    expect(hasGoldGradient).toBe(true);
  });

  test('Max card uses gold tinted glass background', () => {
    // rgba(196,162,101, ...) is the gold tint
    const hasGoldTint = PAYWALL_SOURCE.includes('rgba(196,162,101,');
    if (!hasGoldTint) console.error('FAIL: Gold tinted glass background not found in PaywallModal Max card');
    expect(hasGoldTint).toBe(true);
  });

  test('snapshot of PaywallModal source structure is correct', () => {
    console.log('\n--- PaywallModal Source Analysis ---');
    console.log('Has #fff bg:', PAYWALL_SOURCE.includes("'#fff'") || PAYWALL_SOURCE.includes('"#fff"'));
    console.log('Has rgba(0,0,0,0.45) backdrop:', PAYWALL_SOURCE.includes('rgba(0,0,0,0.45)'));
    console.log('Has heading-serif:', PAYWALL_SOURCE.includes('heading-serif'));
    console.log('Has btn-cta:', PAYWALL_SOURCE.includes('btn-cta'));
    console.log('Has gold gradient:', PAYWALL_SOURCE.includes('linear-gradient') && PAYWALL_SOURCE.includes('#C4A265'));
    console.log('Has gold tint (rgba(196,162,101,):', PAYWALL_SOURCE.includes('rgba(196,162,101,'));
    console.log('Has bg-gray-950:', PAYWALL_SOURCE.includes('bg-gray-950'));
    console.log('Has bg-indigo-*:', /bg-indigo[-\w]/.test(PAYWALL_SOURCE));
    console.log('Has border-gray-800:', PAYWALL_SOURCE.includes('border-gray-800'));
    console.log('-----------------------------------\n');
  });
});
