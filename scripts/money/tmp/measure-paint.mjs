/* Today's first paint on a production build against a local API, as the canary measures it:
   a known person (bootstrap token), cold then warm, with the order of the requests. */
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = process.argv[2]; const token = fs.readFileSync(process.argv[3], 'utf8').trim();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext();
await context.addInitScript((t) => { try { sessionStorage.setItem('oauth_bootstrap_token', t); } catch {} }, token);
const page = await context.newPage();
async function paint(label) {
  const seen = []; const t0 = Date.now();
  const onReq = (r) => { if (r.url().includes('/api/') && r.method() !== 'OPTIONS') seen.push([Date.now() - t0, r.url().replace(/^.*\/api/, '')]); };
  page.on('request', onReq);
  await page.goto(`${BASE}/money`, { waitUntil: 'domcontentloaded' });
  await page.locator('.mv-day-figure, .mv-hero h1').first().waitFor({ timeout: 30000 });
  const painted = Date.now() - t0;
  await page.waitForTimeout(1500);
  page.off('request', onReq);
  const words = (await page.locator('main').innerText()).trim().split(/\s+/).length;
  console.log(`${label.padEnd(6)} painted ${String(painted).padStart(5)} ms  words ${words}  requests: ${seen.map(([ms, u]) => `${u}@${ms}`).join('  ')}`);
}
await paint('cold'); await paint('warm'); await paint('warm2');
await browser.close();
