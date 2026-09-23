import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const context = browser.contexts()[0];
const page = context.pages().find((p) => p.url().includes('twinme.me')) || await context.newPage();
if (!page.url().includes('twinme.me')) { await page.goto('https://www.twinme.me/money', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000); }
const out = await page.evaluate(async () => {
  const token = localStorage.getItem('access_token') || localStorage.getItem('auth_token') || sessionStorage.getItem('access_token');
  const r = await fetch('/api/money/capabilities', { credentials: 'include', headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: r.status, body: (await r.text()).slice(0, 300) };
});
console.log(JSON.stringify(out));
await browser.close();
