import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const context = browser.contexts()[0];
const page = await context.newPage();
const mask = (s) => s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>').replace(/AIza[0-9A-Za-z_-]{20,}/g, '<key>');
for (const path of process.argv.slice(2)) {
  await page.goto(`https://enablebanking.com${path}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(5000);
  const text = (await page.locator('main, body').first().innerText()).trim();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const start = Math.max(0, lines.findIndex((l) => /Logout/.test(l)) + 1);
  const end = lines.findIndex((l, i) => i > start && /Enable Banking Oy/.test(l));
  console.log(`===== ${path} (${page.url().replace('https://enablebanking.com', '')})`);
  console.log(mask(lines.slice(start, end > 0 ? end : undefined).join('\n')).slice(0, 2600));
  const links = await page.evaluate(() => [...document.querySelectorAll('a[href], button')].map((a) => `${(a.innerText || '').trim().slice(0, 50)} -> ${a.getAttribute('href') || 'button'}`).filter((s) => /cp\/|quote|contract|link|restrict|edit|view|activate|request/i.test(s)).slice(0, 25));
  console.log('--- links/buttons:\n' + mask([...new Set(links)].join('\n')));
}
await page.close(); await browser.close();
