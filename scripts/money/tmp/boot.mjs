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
const browser = await chromium.launch({ channel: 'chrome' });
for (const round of [1, 2]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((t) => { try { sessionStorage.setItem('oauth_bootstrap_token', t); } catch {} }, accessToken);
  const page = await ctx.newPage();
  const t0 = Date.now(); const rows = [];
  page.on('request', (q) => { q.__t = Date.now() - t0; });
  page.on('response', async (res) => { const q = res.request(); const u = res.url(); if (!u.startsWith(API)) return; let size = 0; try { size = (await res.body()).length; } catch {} rows.push({ start: q.__t, end: Date.now() - t0, status: res.status(), size, path: u.slice(API.length).split('?')[0].slice(0, 60) + (u.includes('view=') ? '?view' : '') }); });
  await page.goto(`${API}/money`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.mv-hero') !== null, null, { timeout: 60000 }).catch(() => null);
  const painted = Date.now() - t0;
  const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), ttfb: Math.round(n.responseStart) }; });
  console.log(`round ${round}: hero at ${painted} ms; ttfb ${nav.ttfb} dcl ${nav.dcl} load ${nav.load}`);
  for (const x of rows.sort((a, b) => a.start - b.start)) console.log(`   ${String(x.start).padStart(5)}-${String(x.end).padStart(5)} ${x.status} ${String(x.size).padStart(7)}B ${x.path}`);
  await ctx.close();
}
await browser.close();
