import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const context = browser.contexts()[0];
const page = context.pages().find((p) => p.url().includes('/cp/billing'));
if (!page) { console.log('billing tab not open'); process.exit(0); }
const caps = await page.evaluate(() => [...document.querySelectorAll('input[type=number]')].map((e) => {
  const row = e.closest('div, label, fieldset');
  const near = (row ? row.innerText : '').replace(/\s+/g, ' ').trim().slice(0, 140);
  const before = e.previousElementSibling ? e.previousElementSibling.innerText.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  return `placeholder=${e.placeholder} | near="${near}" | before="${before}"`;
}));
console.log(caps.join('\n'));
const nums = await page.locator('input[type="number"]').all();
const volumes = ['10', '100', '500'];
let i = 0;
for (const el of nums) { const ph = await el.getAttribute('placeholder'); if (/^e\.g\., \d/.test(ph || '')) { await el.fill(volumes[Math.min(i, 2)]); i += 1; } }
const filled = await page.evaluate(() => [...document.querySelectorAll('input[type=number]')].map((e) => `${e.placeholder} = ${e.value}`));
console.log('--- volumes now:\n' + filled.join('\n'));
await browser.close();
