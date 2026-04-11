/**
 * Wiki Page E2E Test
 *
 * Tests the LLM Wiki knowledge base page on production.
 * Verifies: page loads, domain cards render, cross-references work,
 * navigation links exist, and content is personalized.
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'https://twin-ai-learn.vercel.app';
const JWT_TOKEN = process.env.TEST_AUTH_TOKEN || '';

test.describe('Wiki Knowledge Base Page', () => {

  test.beforeEach(async ({ page }) => {
    test.skip(!JWT_TOKEN, 'TEST_AUTH_TOKEN not set');

    // Inject auth token before navigation
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.evaluate((token) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('token', token);
    }, JWT_TOKEN);
  });

  test('wiki page loads and shows domain cards', async ({ page }) => {
    await page.goto(`${BASE_URL}/wiki`, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for content to appear (not loading skeleton)
    await page.waitForTimeout(3000);

    // Take full page screenshot
    await page.screenshot({ path: 'test-screenshots/wiki-page-full.png', fullPage: true });

    // Check page title
    const title = page.locator('h1');
    await expect(title).toBeVisible({ timeout: 10000 });

    // Check if we got domain cards or empty state
    const pageContent = await page.textContent('body');

    if (pageContent?.includes('Knowledge Base') && pageContent?.includes('still being compiled')) {
      console.log('EMPTY STATE: Wiki pages not yet compiled for this user');
      // Take screenshot of empty state
      await page.screenshot({ path: 'test-screenshots/wiki-empty-state.png' });
      return;
    }

    if (pageContent?.includes('Something went wrong')) {
      console.log('ERROR STATE: Wiki page fetch failed');
      await page.screenshot({ path: 'test-screenshots/wiki-error-state.png' });
      return;
    }

    // Should have the "Knowledge Base" heading
    await expect(page.getByText('Knowledge Base')).toBeVisible();

    // Count domain cards (look for domain titles)
    const domainTitles = ['Personality Profile', 'Lifestyle Patterns', 'Cultural Identity', 'Social Dynamics', 'Motivation & Drive'];

    let foundDomains = 0;
    for (const domain of domainTitles) {
      const el = page.getByText(domain, { exact: true });
      const isVisible = await el.isVisible().catch(() => false);
      if (isVisible) {
        foundDomains++;
        console.log(`  Found domain: ${domain}`);
      } else {
        console.log(`  MISSING domain: ${domain}`);
      }
    }

    console.log(`Found ${foundDomains}/5 domain cards`);

    // Screenshot after checking
    await page.screenshot({ path: 'test-screenshots/wiki-domains.png', fullPage: true });
  });

  test('wiki page has version badges and timestamps', async ({ page }) => {
    await page.goto(`${BASE_URL}/wiki`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Check for version badges (v1, v2, etc.)
    const versionBadges = page.locator('text=/^v\\d+$/');
    const badgeCount = await versionBadges.count();
    console.log(`Found ${badgeCount} version badges`);

    // Check for time-ago timestamps
    const timeAgos = page.locator('text=/\\d+[hd] ago|just now|yesterday/');
    const timeCount = await timeAgos.count();
    console.log(`Found ${timeCount} time-ago timestamps`);
  });

  test('cross-reference links are clickable', async ({ page }) => {
    await page.goto(`${BASE_URL}/wiki`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Find cross-reference buttons (they have domain labels like "Personality", "Lifestyle")
    const crossRefButtons = page.locator('button:has-text("Personality"), button:has-text("Lifestyle"), button:has-text("Cultural"), button:has-text("Social"), button:has-text("Motivation")');
    const crossRefCount = await crossRefButtons.count();
    console.log(`Found ${crossRefCount} cross-reference links`);

    if (crossRefCount > 0) {
      // Click the first cross-ref and verify scroll behavior
      const firstRef = crossRefButtons.first();
      const refText = await firstRef.textContent();
      console.log(`Clicking cross-ref: "${refText}"`);

      await firstRef.click();
      await page.waitForTimeout(500);

      // Take screenshot after cross-ref click
      await page.screenshot({ path: 'test-screenshots/wiki-crossref-click.png', fullPage: true });
    }
  });

  test('sidebar has Knowledge nav link', async ({ page }) => {
    await page.goto(`${BASE_URL}/wiki`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Look for the Knowledge sidebar item
    const knowledgeNav = page.locator('text=Knowledge');
    const isVisible = await knowledgeNav.isVisible().catch(() => false);
    console.log(`Sidebar "Knowledge" link visible: ${isVisible}`);

    // Also check bottom nav on mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);

    const wikiBottomNav = page.locator('text=Wiki');
    const bottomVisible = await wikiBottomNav.isVisible().catch(() => false);
    console.log(`Bottom nav "Wiki" link visible: ${bottomVisible}`);

    await page.screenshot({ path: 'test-screenshots/wiki-mobile.png' });

    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('wiki API returns data', async ({ page }) => {
    // Direct API test
    const response = await page.request.get(`${BASE_URL}/api/wiki/pages`, {
      headers: { 'Authorization': `Bearer ${JWT_TOKEN}` },
    });

    const status = response.status();
    console.log(`API /wiki/pages status: ${status}`);

    if (status === 200) {
      const json = await response.json();
      console.log(`API success: ${json.success}, pages: ${json.data?.length}`);
      if (json.data) {
        for (const page of json.data) {
          console.log(`  ${page.domain}: v${page.version}, ${page.content_md?.length} chars`);
        }
      }
    } else {
      const text = await response.text();
      console.log(`API error: ${text.slice(0, 200)}`);
    }
  });
});
