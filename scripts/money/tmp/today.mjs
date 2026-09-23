import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import dotenv from 'dotenv'; dotenv.config({ path: '.env', quiet: true });
const API = 'https://twin-ai-learn.vercel.app';
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const raw = crypto.randomBytes(32).toString('hex');
await sb.from('magic_link_tokens').insert({ token_hash: crypto.createHash('sha256').update(raw).digest('hex'), email: 'stefanogebara@gmail.com', expires_at: new Date(Date.now() + 600000).toISOString() });
const r = await fetch(`${API}/api/auth/magic-link/verify?token=${raw}`, { redirect: 'manual' });
const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
const { accessToken } = await (await fetch(`${API}/api/auth/refresh`, { method: 'POST', headers: { cookie } })).json();
for (const k of [1, 2, 3]) { const t0 = Date.now(); const p = await fetch(`${API}/api/money/page?view=today`, { headers: { authorization: `Bearer ${accessToken}` } }); const j = await p.json().catch(() => ({})); console.log(`page?view=today ${k}: ${p.status} ${Date.now() - t0}ms failed=${JSON.stringify(j.data?.failed ?? j.failed ?? 'n/a')}`); }
const browser = await chromium.launch({ channel: 'chrome' });
for (const round of [1, 2]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((t) => { try { sessionStorage.setItem('oauth_bootstrap_token', t); for (const s of ['language','banks','places','phone']) localStorage.setItem(`mv-start-skip:${s}`, '1'); } catch {} }, accessToken);
  const page = await ctx.newPage();
  const t0 = Date.now(); const api = [];
  page.on('response', (res) => { const u = res.url(); if (u.includes('/api/')) api.push(`${Date.now() - t0}ms ${res.status()} ${u.split('/api/')[1].split('?')[0]}${u.includes('view=') ? '?view=' + u.split('view=')[1].slice(0, 6) : ''}`); });
  await page.goto(`${API}/money`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const h = document.querySelector('.mv-hero h1'); return h && /\d/.test(h.textContent); }, null, { timeout: 45000 }).catch(() => console.log(`round ${round}: NUMBER NEVER PAINTED in 45 s`));
  console.log(`round ${round}: number at ${Date.now() - t0} ms`);
  for (const a of api) console.log('   ', a);
  if (round === 2) await page.screenshot({ path: process.env.OUT + '/today-painted.png', fullPage: true });
  await ctx.close();
}
await browser.close();
