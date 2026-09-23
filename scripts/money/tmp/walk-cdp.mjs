/* Walk the money pages inside the owner's own signed-in Chrome, over its debugging port. */
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const context = browser.contexts()[0];
const page = context.pages().find((p) => p.url().includes('twinme.me') || p.url().includes('accounts.google')) || await context.newPage();
const errors = []; page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });
const bad = new Set(); page.on('response', (r) => { if (r.status() >= 400) bad.add(`${r.status()} ${r.url().replace('https://www.twinme.me', '')}`); });
for (const path of ['/money', '/money/month', '/money/plan', '/money/you', '/money/account', '/money/chat']) {
  const t0 = Date.now();
  await page.goto(`https://www.twinme.me${path}`, { waitUntil: 'domcontentloaded' });
  await page.locator('main h1, .mv-day-figure').first().waitFor({ timeout: 30000 }).catch(() => {});
  const painted = Date.now() - t0;
  await page.waitForTimeout(5000);
  const text = (await page.locator('main').innerText()).trim();
  const sheet = await page.locator('main [role="dialog"]').count();
  console.log(`\n===== ${path}  painted ${painted} ms, ${text.split(/\s+/).length} words, ${sheet} sheet(s)`); console.log(text.slice(0, 1400));
}
console.log('\n===== failed requests'); console.log([...bad].join('\n') || 'none');
console.log('===== console errors'); console.log(errors.join('\n') || 'none');
await browser.close();
