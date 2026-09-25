/* Today's paint on production, measured the way the canary does it: a real sign-in, then
   Playwright's own element wait rather than a polling loop. Polling with innerText forces a
   style and layout flush on every tick, which inflates the very number it is reading
   (2026-09-25: a 50 ms poll made the figure look ~3 s later than it was).
     node --env-file=.env scripts/money/tmp/measure-prod.mjs https://www.twinme.me 4          */
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const BASE = process.argv[2] || 'https://www.twinme.me';
const RUNS = Number(process.argv[3] || 4);
const EMAIL = 'stefanogebara@gmail.com';
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const raw = crypto.randomBytes(32).toString('hex');
await sb.from('magic_link_tokens').insert({
  token_hash: crypto.createHash('sha256').update(raw).digest('hex'),
  email: EMAIL, expires_at: new Date(Date.now() + 900000).toISOString(),
});

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

/* Sign in as the owner the way a person does: the link sets the refresh cookie. */
await page.goto(`${BASE}/api/auth/magic-link/verify?token=${raw}`, { waitUntil: 'domcontentloaded' });
await page.waitForURL(/oauth\/callback|\/money/, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(3000);

const rows = [];
for (let i = 0; i < RUNS; i += 1) {
  const calls = [];
  const t0 = Date.now();
  const onReq = (r) => { if (r.url().includes('/api/') && r.method() !== 'OPTIONS') calls.push({ u: r.url().replace(/^.*\/api/, '').split('?')[0], start: Date.now() - t0 }); };
  const onRes = (r) => { const c = calls.find((x) => r.url().includes(x.u) && x.end === undefined); if (c) { c.end = Date.now() - t0; c.status = r.status(); } };
  page.on('request', onReq); page.on('response', onRes);

  await page.goto(`${BASE}/money`, { waitUntil: 'commit' });
  /* The day's own figure, not merely "some text": that is what a person is waiting for. */
  await page.locator('.mv-day-figure').first().waitFor({ state: 'visible', timeout: 40000 });
  const painted = Date.now() - t0;
  const figure = (await page.locator('.mv-day-figure').first().innerText()).replace(/\s+/g, ' ').trim();

  await page.waitForTimeout(1200);
  page.off('request', onReq); page.off('response', onRes);
  rows.push({ run: i + 1, painted, figure, calls: calls.filter((c) => c.end !== undefined) });
}

for (const r of rows) {
  console.log(`\nrun ${r.run}: figure painted at ${r.painted} ms  "${r.figure.slice(0, 30)}"`);
  for (const c of r.calls.sort((a, b) => a.start - b.start)) {
    console.log(`   ${String(c.start).padStart(5)} -> ${String(c.end).padStart(5)} ms  (${String(c.end - c.start).padStart(5)} ms) ${c.status} ${c.u}`);
  }
}
const warm = rows.slice(1).map((r) => r.painted).sort((a, b) => a - b);
console.log(`\nfirst run ${rows[0].painted} ms; warm runs ${rows.slice(1).map((r) => r.painted).join(', ')} ms; warm median ${warm[Math.floor(warm.length / 2)]} ms`);
await browser.close();
process.exit(0);
