import { chromium } from 'playwright'; import fs from 'node:fs';
const BASE = process.argv[2]; const token = fs.readFileSync(process.argv[3], 'utf8').trim();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript((t) => { try { sessionStorage.setItem('oauth_bootstrap_token', t); } catch {} }, token);
const page = await context.newPage();
const errors = []; page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
for (const path of ['/money', '/money/month', '/money/plan', '/money/you', '/money/account', '/money/chat']) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  const text = (await page.locator('main').innerText()).trim();
  console.log(`\n===== ${path}  (${text.split(/\s+/).length} words)`); console.log(text);
}
console.log('\n===== console errors'); console.log(errors.join('\n') || 'none');
await browser.close();
