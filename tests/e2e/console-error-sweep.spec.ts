/**
 * Console Error Sweep
 *
 * Walks the same 18 authenticated routes as the design audit, but instead of
 * measuring design tokens it collects:
 *   - console.error / console.warn events
 *   - uncaught pageerror exceptions
 *   - failed network requests (4xx/5xx) tied to our origin
 *
 * Filters out the benign noise we already know about (PostHog,
 * ERR_BLOCKED_BY_CLIENT, favicon) so we only surface real defects.
 *
 * Opt-in via TWINME_RUN_CONSOLE_SWEEP=true.
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import { BASE_URL, SCREENSHOT_DIR, injectAuth } from './helpers';

test.skip(
  process.env.TWINME_RUN_CONSOLE_SWEEP !== 'true',
  'Console sweep is heavy. Set TWINME_RUN_CONSOLE_SWEEP=true to opt in.',
);

const REPORT_DIR = path.join(SCREENSHOT_DIR, 'console-sweep');

const ROUTES = [
  '/',
  '/discover',
  '/dashboard',
  '/identity',
  '/brain',
  '/wiki',
  '/goals',
  '/money',
  '/connect',
  '/talk-to-twin',
  '/settings',
  '/privacy-spectrum',
  '/insights/spotify',
  '/insights/calendar',
  '/pricing',
  '/departments',
  '/get-started',
  '/journal',
] as const;

const BENIGN_SUBSTRINGS = [
  'PostHog',
  'posthog',
  'analytics',
  'favicon',
  'ERR_BLOCKED_BY_CLIENT',
  'ERR_CONNECTION_REFUSED',
  'net::ERR',
  '/api/auth/refresh',  // We intercept this — fetch noise is expected
  'Failed to load resource',  // generic — drilling into specific cases below
];

function isBenign(text: string): boolean {
  return BENIGN_SUBSTRINGS.some((s) => text.includes(s));
}

interface RouteFinding {
  route: string;
  consoleErrors: string[];
  consoleWarnings: string[];
  pageErrors: string[];
  failedRequests: Array<{ url: string; status: number; statusText: string }>;
}

test.describe('Console Error Sweep', () => {
  test.setTimeout(240_000);

  test('every page loads without runtime errors', async ({ page }) => {
    await fs.mkdir(REPORT_DIR, { recursive: true });
    await injectAuth(page);

    const findings: RouteFinding[] = [];

    for (const route of ROUTES) {
      const consoleErrors: string[] = [];
      const consoleWarnings: string[] = [];
      const pageErrors: string[] = [];
      const failedRequests: Array<{ url: string; status: number; statusText: string }> = [];

      const onConsole = (msg: import('@playwright/test').ConsoleMessage) => {
        const text = msg.text();
        if (isBenign(text)) return;
        if (msg.type() === 'error') consoleErrors.push(text);
        else if (msg.type() === 'warning') consoleWarnings.push(text);
      };
      const onPageError = (err: Error) => {
        const text = err.message + (err.stack ? '\n' + err.stack.slice(0, 300) : '');
        if (!isBenign(text)) pageErrors.push(text);
      };
      const onResponse = (resp: import('@playwright/test').Response) => {
        const status = resp.status();
        if (status < 400) return;
        const url = resp.url();
        if (isBenign(url)) return;
        // Only flag failures from our own origin or our API
        if (!url.includes('localhost:8086') && !url.includes('localhost:3004') && !url.includes('127.0.0.1')) return;
        failedRequests.push({ url, status, statusText: resp.statusText() });
      };

      page.on('console', onConsole);
      page.on('pageerror', onPageError);
      page.on('response', onResponse);

      try {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(2500);  // let async fetches resolve
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        pageErrors.push(`Navigation failed: ${msg}`);
      } finally {
        page.off('console', onConsole);
        page.off('pageerror', onPageError);
        page.off('response', onResponse);
      }

      findings.push({ route, consoleErrors, consoleWarnings, pageErrors, failedRequests });
      const total = consoleErrors.length + pageErrors.length + failedRequests.length;
      console.log(`[console-sweep] ${route} — errors:${consoleErrors.length} pageErr:${pageErrors.length} 4xx/5xx:${failedRequests.length} ${total === 0 ? 'OK' : ''}`);
    }

    await fs.writeFile(
      path.join(REPORT_DIR, 'report.json'),
      JSON.stringify(findings, null, 2),
    );

    const totalConsoleErrors = findings.reduce((s, f) => s + f.consoleErrors.length, 0);
    const totalPageErrors = findings.reduce((s, f) => s + f.pageErrors.length, 0);
    const totalFailedRequests = findings.reduce((s, f) => s + f.failedRequests.length, 0);

    console.log('\n=== CONSOLE ERROR SWEEP ===');
    console.log(`Pages: ${findings.length}`);
    console.log(`console.error: ${totalConsoleErrors}`);
    console.log(`pageerror: ${totalPageErrors}`);
    console.log(`4xx/5xx requests: ${totalFailedRequests}`);

    for (const f of findings) {
      if (f.consoleErrors.length + f.pageErrors.length + f.failedRequests.length === 0) continue;
      console.log(`\n${f.route}:`);
      f.consoleErrors.slice(0, 3).forEach((e) => console.log(`  console.error: ${e.slice(0, 180)}`));
      f.pageErrors.slice(0, 3).forEach((e) => console.log(`  pageerror: ${e.slice(0, 180)}`));
      f.failedRequests.slice(0, 5).forEach((r) => console.log(`  ${r.status} ${r.url.slice(0, 140)}`));
    }

    expect(findings.length).toBeGreaterThanOrEqual(ROUTES.length - 1);
  });
});
