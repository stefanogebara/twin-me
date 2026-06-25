/**
 * Dynamic-state accessibility sweep (color-contrast focus).
 *
 * The base accessibility-sweep.spec.ts only scans each route's INITIAL render,
 * so muted text that appears only in dynamic states was never audited. This
 * spec drives routes INTO those states before scanning:
 *   - insights error states (forced via API interception → 500)
 *   - the Instagram connect modal (opened from /connect)
 *
 * Scope is the follow-up's remit: muted TEXT contrast (white rgba(<0.5),
 * #57534E). The states asserted here contain only muted text — no saturated
 * CTA buttons, brand-accent numbers, or colored category chips, which are a
 * separate (pre-existing) design concern tracked outside this sweep. We assert
 * zero color-contrast violations and log offending nodes so any miss is
 * locatable.
 *
 * Opt-in via TWINME_RUN_A11Y_AUDIT=true (same gate as the base sweep).
 */

import { test, expect, type Page } from '@playwright/test';
// @ts-expect-error — types ship with the package but @axe-core has no tsconfig path
import AxeBuilder from '@axe-core/playwright';
import { BASE_URL, injectAuth } from './helpers';

test.skip(
  process.env.TWINME_RUN_A11Y_AUDIT !== 'true',
  'A11y sweep is heavy. Set TWINME_RUN_A11Y_AUDIT=true to opt in.',
);

interface ContrastNode {
  html: string;
  target: string[];
  fg?: string;
  bg?: string;
  ratio?: number;
}

async function colorContrast(page: Page): Promise<ContrastNode[]> {
  const results = await new AxeBuilder({ page })
    .withRules(['color-contrast'])
    .exclude('iframe')
    .analyze();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const violations = results.violations as any[];
  return violations.flatMap((v) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    v.nodes.map((n: any) => {
      const data = n.any?.[0]?.data ?? {};
      return {
        html: (n.html ?? '').slice(0, 200),
        target: n.target ?? [],
        fg: data.fgColor,
        bg: data.bgColor,
        ratio: data.contrastRatio,
      };
    }),
  );
}

function report(label: string, nodes: ContrastNode[]): void {
  console.log(`\n[a11y-dynamic] ${label}: ${nodes.length} color-contrast node(s)`);
  nodes.forEach((n) =>
    console.log(`   - ${n.ratio}:1 fg=${n.fg} bg=${n.bg} ${n.target.join(' ')} :: ${n.html}`),
  );
}

test.describe('Dynamic-state color-contrast', () => {
  test.setTimeout(120_000);

  // Error states that render ONLY muted text (no CTA/chart/badge colors):
  // Spotify error + WebBrowsing error (WebBrowsingErrorState).
  for (const platform of ['spotify', 'web-browsing'] as const) {
    test(`insights/${platform} error state has AA muted-text contrast`, async ({ page }) => {
      await injectAuth(page);
      // A non-ok GET makes usePlatformInsights setError(...) → the page's error branch.
      await page.route(`**/api/insights/${platform}`, (route) =>
        route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"forced"}' }),
      );
      await page.goto(`${BASE_URL}/insights/${platform}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1500);
      const nodes = await colorContrast(page);
      report(`insights/${platform} [error]`, nodes);
      expect(nodes, `color-contrast in /insights/${platform} error state`).toEqual([]);
    });
  }

  // Instagram connect modal — disclaimers + placeholder.
  test('Instagram connect modal has AA contrast', async ({ page }) => {
    await injectAuth(page);
    await page.goto(`${BASE_URL}/connect`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2500);

    // The Instagram PlatformTile's "Connect" button opens InstagramConnectModal
    // (usePlatformConnect → setInstagramModalOpen). Scope the click to the tile
    // that contains the "Instagram" name so we hit the right Connect button.
    const tile = page
      .locator('div.gap-4.items-center')
      .filter({ hasText: 'Instagram' });
    await tile.getByRole('button', { name: 'Connect' }).first().click({ timeout: 10000 });

    await page.getByText('Connect Instagram', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(500);

    const nodes = await colorContrast(page);
    report('Instagram modal', nodes);
    expect(nodes, 'color-contrast in Instagram connect modal').toEqual([]);
  });
});
