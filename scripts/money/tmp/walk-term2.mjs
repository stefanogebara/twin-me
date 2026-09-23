/* The term strip inside the real Plan page. The diary's day counts are not written yet
   (the morning cron does that), so the plan read is answered with a term built from
   plausible counts: layout only, nothing written anywhere. */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import dotenv from 'dotenv'; dotenv.config({ path: '.env', quiet: true });
const API = 'https://twin-ai-learn.vercel.app'; const OUT = process.env.OUT;
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const raw = crypto.randomBytes(32).toString('hex');
await sb.from('magic_link_tokens').insert({ token_hash: crypto.createHash('sha256').update(raw).digest('hex'), email: 'stefanogebara@gmail.com', expires_at: new Date(Date.now() + 600000).toISOString() });
const r = await fetch(`${API}/api/auth/magic-link/verify?token=${raw}`, { redirect: 'manual' });
const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
const { accessToken } = await (await fetch(`${API}/api/auth/refresh`, { method: 'POST', headers: { cookie } })).json();
const counts = [null, 3, 11, 14, 15, 9, 12, 4, 1];
const weeks = counts.map((n, i) => {
  const start = new Date(Date.UTC(2026, 7, 17) + i * 7 * 86400000).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(2026, 7, 23) + i * 7 * 86400000).toISOString().slice(0, 10);
  return { start, end, offset: i - 5, current: i === 5, past: i < 5, known: n !== null, events: n };
});
const term = { weeks, busiest: weeks[4], quietest: weeks[8], this_week: weeks[5], next_week: weeks[6], read_from: '2026-06-24', read_to: '2026-10-23' };
const browser = await chromium.launch({ channel: 'chrome' });
for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 402, height: 874 }]]) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript((t) => { try { sessionStorage.setItem('oauth_bootstrap_token', t); for (const k of ['money.skip.phone','money.skip.banks','money.skip.places']) localStorage.setItem(k, '1'); } catch {} }, accessToken);
  const page = await ctx.newPage();
  await page.goto(`${API}/money/plan`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(20000);
  await page.screenshot({ path: `${OUT}/prod-real-${label}.png`, fullPage: true });
  const out = await page.evaluate(() => {
    const strip = document.querySelector('.mv-term');
    const sec = document.getElementById('term');
    const next = sec?.nextElementSibling;
    return {
      bars: [...document.querySelectorAll('.mv-term-week > i')].map((i) => Math.round(i.getBoundingClientRect().height)),
      labels: [...document.querySelectorAll('.mv-term-week em')].map((n) => n.innerText.trim()),
      head: sec?.querySelector('h2')?.textContent, sub: sec?.querySelector('.mv-sub')?.textContent,
      foot: sec?.querySelector('.mv-term-foot')?.textContent,
      gapBelow: next ? Math.round(next.getBoundingClientRect().top - sec.getBoundingClientRect().bottom) : null,
      nextHead: next?.querySelector('h2')?.textContent || null,
      stripWidth: strip ? Math.round(strip.getBoundingClientRect().width) : null,
      sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
  console.log(label, JSON.stringify(out, null, 1));
  if (await page.locator('.mv-term-week').count()) {
    await page.locator('.mv-term-week').nth(6).click();
    await page.waitForTimeout(400);
    console.log(label, 'tapped:', await page.locator('.mv-term-foot').innerText());
  }
  console.log(label, 'class-day section present:', await page.locator('#classdays').count());
  const diary = await page.evaluate(() => [...document.querySelectorAll('.mv-item-sub')].map((n) => n.textContent).filter((t) => /follow|custar|costar|agenda|diary/i.test(t)));
  console.log(label, 'diary item words:', JSON.stringify(diary.slice(0, 5)));
  await ctx.close();
}
await browser.close();
process.exit(0);
