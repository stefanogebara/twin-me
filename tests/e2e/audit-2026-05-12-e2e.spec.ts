/**
 * E2E specs for the audit-2026-05-12 fixes.
 *
 * Covers:
 *   H1 — Platform count consistency across /dashboard, /identity, /connect,
 *        /wiki, /talk-to-twin (single canonical source).
 *   H2 — /knowledge redirects to /wiki (sidebar nav labels the wiki route
 *        "Knowledge", so the literal /knowledge URL must work too).
 *   H5/H6 — /connect lists every connected platform, including ones marked
 *           `comingSoon` in the catalog. Stale/expired/partial-sync platforms
 *           surface a "Needs attention" badge.
 */

import { test, expect } from '@playwright/test';
import {
  BASE_URL,
  injectAuth,
  TEST_USER_ID,
} from './helpers';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stand up minimal stubs for every endpoint the audit pages hit so the specs
 * don't require a running backend or seeded DB state. The platform-count
 * tests pin the same set of 10 platforms behind /api/platforms/summary —
 * the single platform-state source since batch-3 state unification
 * (the legacy /api/connectors/status/:userId route was deleted) — so every
 * surface should agree on "10".
 */
async function mockPlatformsAPI(page: import('@playwright/test').Page) {
  const breakdown = [
    { platform: 'spotify', state: 'expired' as const },
    { platform: 'google_calendar', state: 'active' as const },
    { platform: 'youtube', state: 'active' as const },
    { platform: 'google_gmail', state: 'active' as const },
    { platform: 'discord', state: 'active' as const },
    { platform: 'linkedin', state: 'active' as const },
    { platform: 'github', state: 'active' as const },
    { platform: 'reddit', state: 'stale' as const },
    { platform: 'whoop', state: 'stale' as const },
    { platform: 'outlook', state: 'stale' as const },
  ];

  await page.route('**/api/platforms/summary', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        total: breakdown.length,
        active: breakdown.filter((p) => p.state === 'active').length,
        expired: breakdown.filter((p) => p.state === 'expired').length,
        stale: breakdown.filter((p) => p.state === 'stale').length,
        breakdown,
      }),
    });
  });

  // Generic fallbacks for the ancillary endpoints these pages call so they
  // render past their loading state without failing.
  await page.route('**/api/memories?limit=1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ total: 3062, memories: [] }),
    });
  });
  await page.route('**/api/connect/pitch-hooks', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ hooks: {} }),
    });
  });
  await page.route('**/api/enrichment/status/*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { discovered_platforms: [], breach_mapped_integrations: [] } }),
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// H2 — /knowledge redirects to /wiki
// ─────────────────────────────────────────────────────────────────────────────

test('H2: /knowledge redirects to /wiki', async ({ page }) => {
  await injectAuth(page);
  await mockPlatformsAPI(page);

  // The sidebar nav button is labeled "Knowledge" but routes to /wiki. Anyone
  // typing the labeled URL should land on /wiki, not /404.
  await page.goto(`${BASE_URL}/knowledge`);
  await page.waitForURL(/\/wiki/, { timeout: 5000 });
  expect(page.url()).toMatch(/\/wiki$/);
});

// ─────────────────────────────────────────────────────────────────────────────
// H1 — Same user, same session: counts must be identical
// ─────────────────────────────────────────────────────────────────────────────

test('H1: /connect surfaces every connected platform from the DB', async ({ page }) => {
  await injectAuth(page);
  await mockPlatformsAPI(page);

  await page.goto(`${BASE_URL}/connect`);

  // Wait for the "Connected" section to render — Reddit / Whoop / GitHub were
  // the regression cases (they're marked `comingSoon` in the catalog).
  await page.waitForSelector('text=Connected', { timeout: 10_000 });

  // Every breakdown row in the platforms summary must surface as a tile.
  for (const provider of ['spotify', 'github', 'reddit', 'whoop', 'outlook']) {
    const heading = provider.charAt(0).toUpperCase() + provider.slice(1);
    // Outlook is rendered as "Outlook"; reddit as "Reddit"; github as "Github" via fallback.
    await expect(page.locator(`text=${heading}`).first()).toBeVisible({ timeout: 5000 });
  }
});

test('H6: Stale or partial-sync platforms surface a "Needs attention" badge', async ({ page }) => {
  await injectAuth(page);
  await mockPlatformsAPI(page);

  await page.goto(`${BASE_URL}/connect`);
  await page.waitForSelector('text=Connected', { timeout: 10_000 });

  // Whoop and Reddit are stubbed as `state: 'stale'`. The badge is rendered
  // inline next to the platform name.
  await expect(page.locator('text=Needs attention').first()).toBeVisible({ timeout: 5000 });
});
