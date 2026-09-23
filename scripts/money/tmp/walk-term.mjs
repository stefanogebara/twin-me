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
const rr = await fetch(`${API}/api/auth/refresh`, { method: 'POST', headers: { cookie } });
const body = await rr.text();
let accessToken = null;
try { accessToken = JSON.parse(body).accessToken; } catch {}
if (!accessToken) { console.log('NO TOKEN', r.status, cookie.slice(0, 30), rr.status, body.slice(0, 200)); process.exit(1); }
/* What the plan read actually returns for the term, before any drawing. */
const plan = await (await fetch(`${API}/api/money/plan`, { headers: { Authorization: `Bearer ${accessToken}` } })).json();
console.log('term from production:', JSON.stringify(plan?.data?.term));
const browser = await chromium.launch({ channel: 'chrome' });
for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 402, height: 874 }]]) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript((t) => { try { sessionStorage.setItem('oauth_bootstrap_token', t); for (const k of ['money.skip.phone','money.skip.banks','money.skip.places']) localStorage.setItem(k, '1'); } catch {} }, accessToken);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });
  for (const path of ['/money/plan', '/money/account']) {
    await page.goto(`${API}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(11000);
    await page.screenshot({ path: `${OUT}/prod-${label}${path.replace(/\//g, '_')}.png`, fullPage: true });
    const out = await page.evaluate(() => ({
      term: Boolean(document.querySelector('.mv-term')),
      bars: [...document.querySelectorAll('.mv-term-week > i')].map((i) => Math.round(i.getBoundingClientRect().height)),
      gave: [...document.querySelectorAll('.mv-gave .mv-item-title, .mv-gave .mv-item-sub, .mv-gave .mv-item-end')].map((n) => n.textContent.trim()).slice(0, 12),
      sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
      words: (document.querySelector('main')?.innerText || '').trim().split(/\s+/).length,
    }));
    console.log(label, path, JSON.stringify(out));
  }
  if (errors.length) console.log(label, 'console errors:', errors.slice(0, 5));
  await ctx.close();
}
await browser.close();
process.exit(0);
