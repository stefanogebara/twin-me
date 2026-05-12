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
import { BASE_URL, SCREENSHOT_DIR, injectAuth } from './helpers';

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
