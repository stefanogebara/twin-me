import { chromium } from 'playwright'; import fs from 'node:fs';
const BASE = process.argv[2]; const token = fs.readFileSync(process.argv[3], 'utf8').trim();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext(); await context.addInitScript((t) => { try { sessionStorage.setItem('oauth_bootstrap_token', t); } catch {} }, token);
const page = await context.newPage(); await page.goto(`${BASE}/money`, { waitUntil: 'domcontentloaded' });
await page.locator('.mv-day-figure, .mv-hero h1').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(2500);
const text = (await page.locator('main').innerText()).trim();
console.log('words', text.split(/\s+/).length); console.log(text);
await browser.close();
