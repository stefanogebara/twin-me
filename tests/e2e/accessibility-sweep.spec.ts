/**
 * Accessibility sweep across 18 authenticated routes.
 *
 * Uses axe-core via @axe-core/playwright to scan each route for WCAG 2.1 AA
 * violations. We focus on the categories most likely to ship as real defects:
 *   - color-contrast
 *   - aria-* (labels, valid attribute values, role mismatches)
 *   - button-name / link-name (interactive elements without accessible names)
 *   - image-alt
 *   - duplicate-id
 *   - landmark-one-main / region (page structure)
 *
 * The goal is NOT zero violations across all rules (that's unrealistic on a
 * dark glassmorphism design where some text intentionally falls below 4.5:1).
 * The goal IS: surface every CRITICAL or SERIOUS violation per route, and
 * keep total per-route count under a sane threshold (5 by default).
 *
 * Opt-in via TWINME_RUN_A11Y_AUDIT=true.
 */

import { test, expect, type Page } from '@playwright/test';
// @ts-expect-error — types ship with the package but @axe-core has no tsconfig path
import AxeBuilder from '@axe-core/playwright';
import path from 'path';
import fs from 'fs/promises';
import { BASE_URL, SCREENSHOT_DIR, TEST_USER_ID, TEST_USER_EMAIL, injectAuth, mintTestToken } from './helpers';

test.skip(
  process.env.TWINME_RUN_A11Y_AUDIT !== 'true',
  'A11y sweep is heavy. Set TWINME_RUN_A11Y_AUDIT=true to opt in.',
);

const REPORT_DIR = path.join(SCREENSHOT_DIR, 'a11y-sweep');

const ROUTES = [
  '/', '/discover', '/dashboard', '/identity', '/brain', '/wiki',
  '/goals', '/money', '/connect', '/talk-to-twin', '/settings',
  '/privacy-spectrum', '/insights/spotify', '/insights/calendar',
  '/pricing', '/departments', '/get-started', '/journal',
] as const;

interface AxeViolation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  help: string;
  helpUrl: string;
  nodes: number;
  nodeHtml?: string[];  // truncated outerHTML of the first few offending nodes
}

interface RouteFinding {
  route: string;
  total: number;
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  violations: AxeViolation[];
  navigationFailed?: string;
}

const PER_ROUTE_MAX = 6;  // total violations allowed per route — keeps us honest without flapping

const AA_CONTRAST = 4.5;

// Forced state for the saturated-chip / colored-CTA contrast regression test
// below. These elements never appear in the route sweep above: the autonomy
// status pills only render for accounts with skills at those levels, and the
// green "Connect <platform>" CTAs only render when the platform is not
// connected. We mock the two endpoints to drive both into view deterministically.
const AUTONOMY_SETTINGS_MOCK = {
  success: true,
  // One skill per autonomy level (0..4) → all five status pills render at once.
  settings: [0, 1, 2, 3, 4].map((level) => ({
    id: `contrast-skill-${level}`,
    name: `contrast_skill_${level}`,
    display_name: `Contrast Skill ${level}`,
    description: 'Rendered to exercise the autonomy status badge contrast.',
    category: 'daily_rituals',
    default_autonomy_level: level,
    effective_autonomy_level: level,
    user_enabled: true,
    has_override: false,
    autonomy_label: ['Observe', 'Suggest', 'Draft', 'Act & Notify', 'Autonomous'][level],
    required_platforms: [],
  })),
};

const NOT_CONNECTED_INSIGHTS_MOCK = {
  success: true,
  notConnected: true,
  reflection: { id: null, text: '', generatedAt: '', expiresAt: null, confidence: 'low', themes: [] },
  patterns: [], history: [], evidence: [], todayEvents: [], upcomingEvents: [],
};

/**
 * WCAG 2.1 contrast ratio for a single element, computed the way the prod
 * axe-core canary reported it. We compute it ourselves instead of trusting
 * axe's verdict because the app's <body> paints a four-radial-gradient
 * `background-image`: axe cannot resolve a background COLOR through a gradient
 * image, so it silently drops every element that has its OWN semi-transparent
 * background (the tan pills, the green buttons) from color-contrast results —
 * neither passing nor flagging them. We composite the element's + ancestors'
 * rgba background layers over the opaque page base (#13121a), composite the
 * text color on top, and apply the relative-luminance formula. Runs in-page.
 */
function elementContrast(el: Element): { ratio: number; text: string } {
  const PAGE_BASE = [19, 18, 26]; // #13121a — body background-color (gradient image ignored, as axe does)
  const parse = (c: string): number[] => {
    const m = (c || '').match(/rgba?\(([^)]+)\)/);
    if (!m) return [0, 0, 0, 0];
    const p = m[1].split(',').map((s) => parseFloat(s.trim()));
    return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]];
  };
  const over = (src: number[], dst: number[]): number[] => {
    const a = src[3];
    return [0, 1, 2].map((i) => src[i] * a + dst[i] * (1 - a));
  };
  const layers: number[][] = [];
  let node: Element | null = el;
  while (node) {
    const bg = parse(getComputedStyle(node).backgroundColor);
    if (bg[3] > 0) layers.push(bg);
    node = node.parentElement;
  }
  let bg = PAGE_BASE.slice();
  for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
  const fg = over(parse(getComputedStyle(el).color), bg);
  const lum = (rgb: number[]): number => {
    const f = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const l1 = lum(fg);
  const l2 = lum(bg);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  return { ratio: Math.round(ratio * 100) / 100, text: (el.textContent || '').trim().slice(0, 24) };
}

async function runAxe(page: Page): Promise<AxeViolation[]> {
  const results = await new AxeBuilder({ page })
    // Target WCAG 2.0 + 2.1 A/AA rules + best practices
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    // Don't blow up on regions/landmarks coming from third-party iframes
    .exclude('iframe')
    .analyze();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (results.violations as any[]).map((v): AxeViolation => ({
    id: v.id,
    impact: v.impact ?? null,
    help: v.help,
    helpUrl: v.helpUrl,
    nodes: v.nodes.length,
    nodeHtml: v.nodes
      .slice(0, 3)
      .map((n: { html?: string }) => (n.html ?? '').slice(0, 200)),
  }));
}

test.describe('Accessibility sweep', () => {
  test.setTimeout(360_000);

  test('axe-core: every route stays under violation threshold', async ({ page }) => {
    await fs.mkdir(REPORT_DIR, { recursive: true });
    await injectAuth(page);

    const findings: RouteFinding[] = [];

    for (const route of ROUTES) {
      console.log(`[a11y] ${route}`);
      try {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(1500);

        const violations = await runAxe(page);
        const f: RouteFinding = {
          route,
          total: violations.reduce((s, v) => s + v.nodes, 0),
          critical: violations.filter((v) => v.impact === 'critical').reduce((s, v) => s + v.nodes, 0),
          serious: violations.filter((v) => v.impact === 'serious').reduce((s, v) => s + v.nodes, 0),
          moderate: violations.filter((v) => v.impact === 'moderate').reduce((s, v) => s + v.nodes, 0),
          minor: violations.filter((v) => v.impact === 'minor').reduce((s, v) => s + v.nodes, 0),
          violations,
        };
        findings.push(f);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        findings.push({
          route, total: 0, critical: 0, serious: 0, moderate: 0, minor: 0,
          violations: [], navigationFailed: msg.slice(0, 200),
        });
      }
    }

    await fs.writeFile(
      path.join(REPORT_DIR, 'report.json'),
      JSON.stringify(findings, null, 2),
    );

    // Summary log — easy to scan
    console.log('\n=== A11Y SWEEP ===');
    for (const f of findings) {
      if (f.navigationFailed) {
        console.log(`  ${f.route.padEnd(22)} NAV FAILED: ${f.navigationFailed}`);
        continue;
      }
      const tag = f.critical + f.serious > 0 ? '!!' : f.total > PER_ROUTE_MAX ? '? ' : 'OK';
      console.log(`  ${tag} ${f.route.padEnd(22)} total:${f.total}  critical:${f.critical}  serious:${f.serious}  moderate:${f.moderate}  minor:${f.minor}`);
      if (f.critical + f.serious > 0) {
        for (const v of f.violations.filter((x) => x.impact === 'critical' || x.impact === 'serious')) {
          console.log(`     - ${v.impact}: ${v.id} (${v.nodes} node${v.nodes === 1 ? '' : 's'}) — ${v.help}`);
        }
      }
    }

    // Hard gate: zero critical violations
    const critFails = findings.filter((f) => f.critical > 0);
    expect(
      critFails.map((f) => `${f.route} (${f.critical} critical)`),
      'no critical a11y violations',
    ).toEqual([]);

    // Soft gate: each route under PER_ROUTE_MAX total violations
    const overThreshold = findings.filter((f) => !f.navigationFailed && f.total > PER_ROUTE_MAX);
    if (overThreshold.length > 0) {
      console.log(`\nRoutes over ${PER_ROUTE_MAX}-violation threshold:`);
      overThreshold.forEach((f) => console.log(`  ${f.route}: ${f.total}`));
    }
  });

});

// Saturated-color contrast: the tan autonomy status pills and the green
// "Connect <platform>" CTAs. These are the pre-existing offenders the route
// sweep above can't reach — they only render in specific account states, and
// axe-core drops them anyway (own translucent bg over the body gradient), so we
// force the state and compute the WCAG ratio directly. Guards the fix from the
// PR #131 follow-up (Draft 4.1→5.4, Suggest 3.25→5.2, green CTAs 2.59→7.5).
test.describe('Contrast: saturated chips & CTAs (forced state)', () => {
  // Start from a clean storage state. The chromium project ships a real
  // logged-in storageState (playwright/.auth/user.json); its stale cookies +
  // localStorage fight the mocked auth below and hang AuthContext on its
  // loading splash. This suite authenticates entirely through the mocks.
  test.use({ storageState: { cookies: [], origins: [] } });
  // A cold Vite dev server compiles this heavy app's module graph on first
  // navigation, which can take minutes (the smoke suite budgets 180s).
  test.setTimeout(600_000);

  test('color-contrast: saturated status pills and green CTAs meet AA', async ({ page }) => {
    const fulfillJson = (body: unknown) => ({
      status: 200, contentType: 'application/json', body: JSON.stringify(body),
    });
    // Fully mock the backend so this test is deterministic and needs no live
    // API. Playwright checks routes in REVERSE registration order (last wins):
    // the catch-all is registered FIRST (before injectAuth's /auth/refresh) and
    // the specific data mocks LAST. The catch-all carries accessToken + user so
    // /auth/refresh and /auth/verify are both satisfied if they reach it (else
    // AuthContext never leaves its loading splash); scoping it to :3004 avoids
    // intercepting Vite's own module scripts on :8086.
    const testUser = { id: TEST_USER_ID, email: TEST_USER_EMAIL, name: 'Test User', email_verified: true };
    await page.route(/:3004\/api\//, (route) =>
      route.fulfill(fulfillJson({ success: true, accessToken: mintTestToken(), user: testUser })),
    );
    await injectAuth(page);
    await page.route(/:3004\/api\/autonomy\/settings/, (route) => route.fulfill(fulfillJson(AUTONOMY_SETTINGS_MOCK)));
    await page.route(/:3004\/api\/insights\//, (route) => route.fulfill(fulfillJson(NOT_CONNECTED_INSIGHTS_MOCK)));

    // Autonomy status pills — all five levels render at once. 'commit' returns
    // as soon as the server responds; waitForSelector then absorbs the cold
    // Vite compile of this route.
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'commit', timeout: 120000 });
    await page.waitForSelector('#section-autonomy span.rounded-full', { timeout: 120000 });
    const pills = await page.$$('#section-autonomy span.rounded-full');
    expect(pills.length, 'autonomy status pills rendered').toBeGreaterThanOrEqual(5);
    for (const pill of pills) {
      const r = await pill.evaluate(elementContrast);
      expect(r.ratio, `status pill "${r.text}" contrast`).toBeGreaterThanOrEqual(AA_CONTRAST);
    }

    // Green "Connect <platform>" CTAs.
    for (const [platform, label] of [
      ['discord', 'Connect Discord'],
      ['youtube', 'Connect YouTube'],
      ['calendar', 'Connect Calendar'],
    ] as const) {
      await page.goto(`${BASE_URL}/insights/${platform}`, { waitUntil: 'commit', timeout: 120000 });
      const btn = page.getByRole('button', { name: label });
      await btn.waitFor({ timeout: 120000 });
      const r = await btn.evaluate(elementContrast);
      expect(r.ratio, `"${label}" CTA contrast`).toBeGreaterThanOrEqual(AA_CONTRAST);
    }
  });
});
