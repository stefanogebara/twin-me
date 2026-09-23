import { chromium } from 'playwright'; import fs from 'node:fs';
const BASE = process.argv[2]; const token = fs.readFileSync(process.argv[3], 'utf8').trim();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext(); await context.addInitScript((t) => { try { sessionStorage.setItem('oauth_bootstrap_token', t); } catch {} }, token);
const page = await context.newPage(); const bad = new Set();
page.on('response', (r) => { if (r.status() >= 400) bad.add(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`); });
for (const path of ['/money', '/money/you', '/money/account', '/money/chat']) { await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(5000); }
console.log([...bad].join('\n') || 'no 4xx/5xx'); await browser.close();
