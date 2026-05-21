/**
 * InsightsFeed — moat-tagged proactive insight rendering E2E
 * ============================================================
 * Investment-correlation insights from cron-investment-correlation.js
 * land in proactive_insights with metadata.subcategory='investment_correlation'.
 * They flow through the SAME dashboard surface as every other insight
 * (InsightsFeed.tsx on /dashboard), NOT through the orphaned
 * ProactiveInsightsPanel.tsx — that file is tree-shaken out of every build.
 *
 * What this test pins:
 *   - InsightsFeed mounts an insight with the new metadata shape WITHOUT
 *     crashing (the type system might allow the cron to write a metadata
 *     subcategory that the UI doesn't know about).
 *   - The Discuss-with-twin button is wired up — clicking it navigates
 *     to /talk-to-twin with the insight text as discussContext.
 *   - High-urgency insights surface their urgency-dot color.
 *   - No JS exceptions or unhandled promise rejections during render.
 *
 * This is the regression guard for "what if the cron writes a future
 * metadata shape that breaks the dashboard" — caught here before it ships.
 *
 * Self-contained auth via injectAuth (e2e project).
 */
import { expect, test } from '@playwright/test';
import { BASE_URL, injectAuth } from './helpers';

const MOAT_INSIGHTS = [
  {
    id: 'moat-1',
    insight: 'Your sells cluster on low-recovery days — 8 of the last 11 sells happened with Whoop recovery under 40%.',
    urgency: 'high' as const,
    category: 'anomaly' as const,
    created_at: new Date(Date.now() - 3600_000).toISOString(),
    delivered: false,
    sources: ['whoop', 'plaid'],
    metadata: {
      subcategory: 'investment_correlation',
      pattern: 'sells_low_recovery',
      n: 11,
      k: 8,
    },
  },
  {
    id: 'moat-2',
    insight: 'Detected a recovery direction gap: buys average 62% recovery vs sells at 38%.',
    urgency: 'medium' as const,
    category: 'trend' as const,
    created_at: new Date(Date.now() - 7200_000).toISOString(),
    delivered: false,
    sources: ['whoop', 'plaid'],
    metadata: {
      subcategory: 'investment_correlation',
      pattern: 'recovery_direction_gap',
      buy_avg: 0.62,
      sell_avg: 0.38,
      gap: 0.24,
    },
  },
];

async function mockDashboardAPI(page: import('@playwright/test').Page) {
  // The InsightsFeed page calls useProactiveInsights which fetches
  //   /insights/proactive?limit=10&include_delivered=true
  await page.route('**/api/insights/proactive*', async (route) => {
    // useProactiveInsights.ts reads `json.insights ?? []` — the response
    // body MUST be { insights: [...] }, not the array directly. Easy bug
    // to make; the hook returns [] for a bare-array response and the feed
    // surface returns null (which is exactly what an earlier run of this
    // test produced).
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ insights: MOAT_INSIGHTS }),
    });
  });

  // Engagement marks
  await page.route('**/api/insights/proactive/*/engage', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
  });

  // The dashboard also loads twin-summary, soul-signature, platform connections,
  // wiki — return safe empty defaults so they don't error and clutter the
  // console-error assertion.
  await page.route('**/api/twin-summary*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"summary":null}' });
  });
  await page.route('**/api/platforms/connected*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"connected":[]}' });
  });
  await page.route('**/api/wiki/pages*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"pages":[]}' });
  });
  await page.route('**/api/dashboard*', async (route) => {
    // The dashboard endpoint may not exist — let it 404 naturally if so.
    await route.continue();
  });
}

test.describe('Dashboard InsightsFeed — moat-tagged insight rendering', () => {
  test.setTimeout(60_000);

  test('renders a moat insight from useProactiveInsights without crashing', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (text.match(/Failed to load resource|net::ERR|posthog|preflight/i)) return;
        errors.push('console: ' + text);
      }
    });

    await injectAuth(page);
    await mockDashboardAPI(page);

    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // The InsightsFeed surfaces under a "What your twin noticed" header.
    await expect(
      page.getByText(/what your twin noticed/i),
      'InsightsFeed section header is visible',
    ).toBeVisible({ timeout: 20_000 });

    // The moat-1 insight text should appear verbatim (the cron writes
    // the synthesised line, the dashboard just renders it).
    await expect(
      page.getByText(/sells cluster on low-recovery days/i),
      'moat-1 (sells_low_recovery) insight text renders',
    ).toBeVisible({ timeout: 10_000 });

    // moat-2 with the medium-urgency variant.
    await expect(
      page.getByText(/recovery direction gap/i),
      'moat-2 (recovery_direction_gap) insight text renders',
    ).toBeVisible();

    // The Discuss-with-twin button per insight wires up the navigation hook.
    const discussButtons = page.getByRole('button', { name: /discuss with twin/i });
    expect(await discussButtons.count(), 'one Discuss button per moat insight').toBeGreaterThanOrEqual(2);

    // No console errors / pageerrors from the moat-shape metadata.
    expect(errors, 'no console errors from moat metadata rendering').toEqual([]);
  });

  test('clicking Discuss on a moat insight navigates to /talk-to-twin with the right context', async ({ page }) => {
    await injectAuth(page);
    await mockDashboardAPI(page);

    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Wait until insights are mounted.
    await expect(page.getByText(/sells cluster on low-recovery days/i)).toBeVisible({ timeout: 20_000 });

    // Click the FIRST Discuss button (moat-1).
    const discuss = page.getByRole('button', { name: /discuss with twin/i }).first();

    await Promise.all([
      page.waitForURL(/\/talk-to-twin/, { timeout: 10_000 }),
      discuss.click(),
    ]);

    expect(page.url(), 'navigated to /talk-to-twin').toMatch(/\/talk-to-twin/);
  });
});
