/* A screenshot of the money pages on production, signed in, for the design critic. */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import dotenv from 'dotenv'; dotenv.config({ path: '.env', quiet: true });
const API = process.env.SHOT_API || 'https://twin-ai-learn.vercel.app'; const FRONT = process.env.SHOT_FRONT || API; const OUT = process.env.OUT; const TAG = process.env.TAG || 'v0';
const PATHS = (process.env.PATHS || '/money').split(',');
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const raw = crypto.randomBytes(32).toString('hex');
await sb.from('magic_link_tokens').insert({ token_hash: crypto.createHash('sha256').update(raw).digest('hex'), email: 'stefanogebara@gmail.com', expires_at: new Date(Date.now() + 600000).toISOString() });
const r = await fetch(`${API}/api/auth/magic-link/verify?token=${raw}`, { redirect: 'manual' });
const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
const { accessToken } = await (await fetch(`${API}/api/auth/refresh`, { method: 'POST', headers: { cookie } })).json();
if (!accessToken) { console.log('NO TOKEN'); process.exit(1); }
const browser = await chromium.launch({ channel: 'chrome' });
for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 402, height: 874 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  await ctx.addInitScript((t) => { try { sessionStorage.setItem('oauth_bootstrap_token', t); for (const k of ['money.skip.phone','money.skip.banks','money.skip.places']) localStorage.setItem(k, '1'); localStorage.setItem('twinme.locale', 'en'); } catch {} }, accessToken);
  const page = await ctx.newPage();
  for (const path of PATHS) {
    await page.goto(`${FRONT}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(12000);
    /* The phone-capture sheet, if it is up: a person taps Not now once; the critic judges the page. */
    const notNow = page.getByRole('button', { name: /not now|ahora no|agora n/i }).first();
    if (await notNow.isVisible().catch(() => false)) { await notNow.click(); await page.waitForTimeout(1500); }
    const name = `${TAG}-${label}${path.replace(/\//g, '_')}`;
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    const words = await page.evaluate(() => (document.querySelector('main')?.innerText || '').trim().split(/\s+/).length);
    /* The vertical rhythm: every section's top, and the air above it. */
    const gaps = await page.evaluate(() => {
      const blocks = [...document.querySelectorAll('main section, main .mv-foot')];
      let last = null; const out = [];
      for (const b of blocks) { const r = b.getBoundingClientRect(); if (r.height < 4) continue; out.push(`${(b.id || b.className.split(' ')[0]).slice(0, 14)}@${Math.round(r.top + window.scrollY)}${last === null ? '' : ' gap ' + Math.round(r.top - last)}`); last = r.bottom; }
      const eyebrow = document.querySelector('.mv-hero > .mv-eyebrow'); const value = document.querySelector('.mv-day-value');
      if (eyebrow && value) out.push(`month->figure ${Math.round(value.getBoundingClientRect().top - eyebrow.getBoundingClientRect().bottom)}px`);
      return out.join(' | ');
    });
    console.log(`${name}.png  words=${words}\n   ${gaps}`);
  }
  await ctx.close();
}
await browser.close(); process.exit(0);
