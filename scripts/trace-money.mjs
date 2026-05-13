#!/usr/bin/env node
/**
 * One-shot Playwright trace for the hung /money render.
 *
 * Loads /money with the same auth injection the diagnostic uses, dumps
 * every network request + response + console message + pageerror for 30s,
 * then exits. Tells us what's hanging.
 */

import { chromium } from 'playwright';
import jwt from 'jsonwebtoken';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: '.env' });

const TEST_USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const TEST_USER_EMAIL = 'stefanogebara@gmail.com';
const TEST_USER = { id: TEST_USER_ID, email: TEST_USER_EMAIL, name: 'Test', first_name: 'Stefano', email_verified: true };

function mintToken() {
  return jwt.sign({ id: TEST_USER_ID, email: TEST_USER_EMAIL }, process.env.JWT_SECRET, { expiresIn: '30m' });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

await page.route('**/api/auth/refresh', async (route) => {
  await route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, accessToken: mintToken(), user: TEST_USER }),
  });
});

const token = mintToken();
await page.addInitScript((data) => {
  const { t, u } = JSON.parse(data);
  window.localStorage.setItem('auth_token', t);
  window.localStorage.setItem('auth_user', u);
}, JSON.stringify({ t: token, u: JSON.stringify(TEST_USER) }));

const pending = new Map();
const failed = [];

page.on('request', (req) => {
  pending.set(req.url(), Date.now());
});
page.on('response', (resp) => {
  pending.delete(resp.url());
});
page.on('requestfailed', (req) => {
  failed.push({ url: req.url(), failure: req.failure()?.errorText });
  pending.delete(req.url());
});
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('[console.error]', msg.text().slice(0, 200));
});
page.on('pageerror', (err) => {
  console.log('[pageerror]', err.message.slice(0, 200));
});

console.log('[trace] Navigating to /money...');
const t0 = Date.now();
await page.goto('http://localhost:8086/money', { waitUntil: 'commit' }).catch((e) => console.log('[goto err]', e.message));
console.log(`[trace] commit at +${Date.now() - t0}ms`);

// Wait 25s for things to settle (or hang)
await page.waitForTimeout(25000);

console.log(`[trace] After 25s: ${pending.size} requests still pending:`);
for (const [url, started] of pending) {
  console.log(`  pending ${Date.now() - started}ms ago: ${url.slice(0, 150)}`);
}
console.log(`[trace] ${failed.length} failed requests:`);
for (const f of failed.slice(0, 10)) {
  console.log(`  ${f.failure}: ${f.url.slice(0, 150)}`);
}

// What's actually on the page?
const visible = await page.evaluate(() => {
  return {
    h1Texts: Array.from(document.querySelectorAll('h1')).map((h) => h.textContent?.trim().slice(0, 60)),
    loadingVisible: !!document.querySelector('[role="status"], [aria-label*="oading" i], img[alt*="oading" i]'),
    bodyTextLen: (document.body.innerText || '').length,
    bodyPreview: (document.body.innerText || '').slice(0, 200),
  };
});
console.log('[trace] page state:', visible);

await browser.close();
