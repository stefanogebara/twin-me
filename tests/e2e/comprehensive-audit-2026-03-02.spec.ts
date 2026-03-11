/**
 * Comprehensive Platform Audit — 2026-03-02
 * Audits all 13 pages of TwinMe: screenshots (desktop + mobile), console errors, body text.
 */
import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjE2N2MyN2I1LWE0MGItNDlmYi04ZDAwLWRlYjFiMWM1N2Y0ZCIsImVtYWlsIjoic3RlZmFub2dlYmFyYUBnbWFpbC5jb20iLCJpYXQiOjE3NzIzNzM5MzYsImV4cCI6MTc3NDk2NTkzNn0.yuTHeAeRPaM0HEyxjBd5zfKtgSeBr9K-LSwRMRBqYxc';

const AUTH_USER = JSON.stringify({
  id: '167c27b5-a40b-49fb-8d00-deb1b1c57f4d',
  email: 'stefanogebara@gmail.com',
  firstName: 'Stefano',
});

const BASE = 'http://localhost:8086';
const SS_DIR = path.resolve('tests/e2e/screenshots/audit-2026-03-02');

const PAGES = [
  { num: '01', name: 'landing',        path: '/',               auth: false },
  { num: '02', name: 'auth',           path: '/auth',           auth: false },
  { num: '03', name: 'dashboard',      path: '/dashboard',      auth: true  },
  { num: '04', name: 'talk-to-twin',   path: '/talk-to-twin',   auth: true  },
  { num: '05', name: 'soul-signature', path: '/soul-signature', auth: true  },
  { num: '06', name: 'identity',       path: '/identity',       auth: true  },
  { num: '07', name: 'goals',          path: '/goals',          auth: true  },
  { num: '08', name: 'brain',          path: '/brain',          auth: true  },
  { num: '09', name: 'journal',        path: '/journal',        auth: true  },
  { num: '10', name: 'get-started',    path: '/get-started',    auth: true  },
  { num: '11', name: 'settings',       path: '/settings',       auth: true  },
  { num: '12', name: 'interview',      path: '/interview',      auth: true  },
  { num: '13', name: 'memory-health',  path: '/memory-health',  auth: true  },
];

async function injectAuth(page: Page): Promise<void> {
  await page.goto(BASE);
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(
    ({ token, user }) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', user);
    },
    { token: TOKEN, user: AUTH_USER }
  );
}

test.describe.serial('Comprehensive Platform Audit 2026-03-02', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(SS_DIR)) {
      fs.mkdirSync(SS_DIR, { recursive: true });
    }
  });

  for (const pg of PAGES) {
    test(`${pg.num} — ${pg.name} (${pg.path})`, async ({ page }) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      const networkErrors: string[] = [];

      // Collect console messages
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
        if (msg.type() === 'warning') warnings.push(msg.text());
      });

      // Collect network failures
      page.on('requestfailed', (req) => {
        networkErrors.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
      });

      // Inject auth if needed
      if (pg.auth) {
        await injectAuth(page);
      }

      // Navigate to page
      const response = await page.goto(`${BASE}${pg.path}`, { waitUntil: 'domcontentloaded' });
      const httpStatus = response?.status() ?? 0;

      // Wait for network to settle
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {
        console.log(`[WARN] networkidle timeout on ${pg.name}`);
      });

      // Extra wait for dynamic content
      await page.waitForTimeout(2000);

      // Desktop screenshot (full page)
      const ssName = `${pg.num}-${pg.name}`;
      await page.screenshot({
        path: path.join(SS_DIR, `${ssName}.png`),
        fullPage: true,
      });

      // Mobile screenshot
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(500);
      await page.screenshot({
        path: path.join(SS_DIR, `${ssName}-mobile.png`),
        fullPage: true,
      });

      // Reset to desktop
      await page.setViewportSize({ width: 1280, height: 720 });

      // Extract body text
      const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
      const currentUrl = page.url();

      // Build text report
      const report = [
        `=== ${pg.num} — ${pg.name} ===`,
        `URL: ${currentUrl}`,
        `HTTP Status: ${httpStatus}`,
        ``,
        `--- Console Errors (${errors.length}) ---`,
        ...errors.map((e) => `  ERROR: ${e}`),
        ``,
        `--- Console Warnings (${warnings.length}) ---`,
        ...warnings.slice(0, 10).map((w) => `  WARN: ${w}`),
        ``,
        `--- Network Failures (${networkErrors.length}) ---`,
        ...networkErrors.map((n) => `  NET: ${n}`),
        ``,
        `--- Body Text (first 4000 chars) ---`,
        bodyText.slice(0, 4000),
      ].join('\n');

      fs.writeFileSync(path.join(SS_DIR, `${ssName}.txt`), report, 'utf8');

      console.log(`[DONE] ${ssName} — ${bodyText.trim().length} chars, ${errors.length} errors`);

      // Basic sanity: page should load
      expect(httpStatus).toBeLessThan(500);
    });
  }

  // Special test: chat interaction on /talk-to-twin
  test('04-chat-interaction — send a message', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await injectAuth(page);
    await page.goto(`${BASE}/talk-to-twin`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Find input and send message
    const inputSelectors = [
      'textarea[placeholder*="message"]',
      'textarea[placeholder*="Message"]',
      'input[placeholder*="message"]',
      'input[placeholder*="Message"]',
      'textarea',
      'input[type="text"]',
    ];

    let inputFound = false;
    for (const sel of inputSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        await el.fill('What do you know about me?');
        // Try pressing Enter or clicking send button
        const sendBtn = page.locator('button[type="submit"], button:has-text("Send"), button[aria-label*="send"]').first();
        if (await sendBtn.isVisible().catch(() => false)) {
          await sendBtn.click();
        } else {
          await el.press('Enter');
        }
        inputFound = true;
        break;
      }
    }

    if (!inputFound) {
      console.log('[WARN] No message input found on chat page');
    }

    // Wait for response
    await page.waitForTimeout(8000);

    await page.screenshot({
      path: path.join(SS_DIR, '04-talk-to-twin-after-message.png'),
      fullPage: true,
    });

    const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
    fs.writeFileSync(
      path.join(SS_DIR, '04-talk-to-twin-chat-result.txt'),
      [
        '=== Chat Interaction Test ===',
        `Input found: ${inputFound}`,
        `Console errors: ${errors.length}`,
        ...errors.map((e) => `  ERROR: ${e}`),
        '',
        '--- Body text after message ---',
        bodyText.slice(0, 4000),
      ].join('\n'),
      'utf8'
    );

    console.log(`[DONE] chat interaction — ${errors.length} errors`);
  });
});
