import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import dotenv from 'dotenv'; dotenv.config({ path: '.env', quiet: true });
const API = 'https://twin-ai-learn.vercel.app'; const OUT = process.env.OUT;
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const raw = crypto.randomBytes(32).toString('hex');
await sb.from('magic_link_tokens').insert({ token_hash: crypto.createHash('sha256').update(raw).digest('hex'), email: 'stefanogebara@gmail.com', expires_at: new Date(Date.now() + 600000).toISOString() });
const r = await fetch(`${API}/api/auth/magic-link/verify?token=${raw}`, { redirect: 'manual' });
const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
const { accessToken } = await (await fetch(`${API}/api/auth/refresh`, { method: 'POST', headers: { cookie } })).json();
if (!accessToken) { console.log('NO TOKEN'); process.exit(1); }
const browser = await chromium.launch({ channel: 'chrome' });
const findings = [];
for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 402, height: 874 }]]) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript((t) => { try { sessionStorage.setItem('oauth_bootstrap_token', t); for (const k of ['money.skip.phone','money.skip.banks','money.skip.places']) localStorage.setItem(k, '1'); } catch {} }, accessToken);
  const page = await ctx.newPage();
  for (const path of ['/money', '/money/month', '/money/plan', '/money/you', '/money/account', '/money/chat']) {
    await page.goto(`${API}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(11000);
    const name = `${label}${path.replace(/\//g, '_')}`;
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    const audit = await page.evaluate(() => {
      const main = document.querySelector('main') || document.body;
      const text = main.innerText.trim();
      const sections = [...main.querySelectorAll('section')].map((s) => {
        const h = s.querySelector('h1,h2');
        const t = s.innerText.trim();
        return { head: h ? h.textContent.trim().slice(0, 60) : '(no heading)', words: t.split(/\s+/).filter(Boolean).length, height: Math.round(s.getBoundingClientRect().height), empty: t.length < 3 };
      });
      /* rows that carry no number and no action: candidates for filler */
      const rows = [...main.querySelectorAll('.mv-item')].map((el) => ({ text: el.innerText.replace(/\s+/g, ' ').trim().slice(0, 110), hasNum: /\d/.test(el.innerText), act: Boolean(el.querySelector('button, a')) || el.tagName === 'BUTTON' || el.tagName === 'A' }));
      const longest = [...main.querySelectorAll('p, span.mv-item-sub')].map((e) => e.textContent.trim()).filter((s) => s.split(/\s+/).length > 18).slice(0, 8);
      const docHeight = Math.round(document.documentElement.scrollHeight);
      return { words: text.split(/\s+/).filter(Boolean).length, sections, rows, longest, docHeight, screens: Math.round((docHeight / window.innerHeight) * 10) / 10 };
    });
    fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(audit, null, 2));
    console.log(`\n### ${label} ${path}: ${audit.words} words, ${audit.screens} screens tall`);
    for (const s of audit.sections) console.log(`   [${String(s.words).padStart(4)}w ${String(s.height).padStart(5)}px] ${s.head}${s.empty ? '  <<< EMPTY' : ''}`);
    const dead = audit.rows.filter((x) => !x.hasNum && !x.act);
    if (dead.length) { console.log('   rows with no number and nothing to do:'); for (const d of dead.slice(0, 6)) console.log(`      "${d.text}"`); }
    if (audit.longest.length) { console.log('   sentences over 18 words:'); for (const l of audit.longest.slice(0, 4)) console.log(`      "${l.slice(0, 150)}"`); }
    findings.push({ label, path, ...audit });
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 2));
