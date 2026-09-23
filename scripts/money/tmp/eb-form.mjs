import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const context = browser.contexts()[0];
const page = await context.newPage();
await page.goto('https://enablebanking.com/cp/billing', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(5000);
const fields = await page.evaluate(() => [...document.querySelectorAll('input, select, textarea, button[type=submit]')].map((el) => {
  const label = el.labels && el.labels[0] ? el.labels[0].innerText.trim().slice(0, 60) : (el.getAttribute('aria-label') || el.getAttribute('placeholder') || '');
  return `${el.tagName.toLowerCase()} type=${el.type || ''} name=${el.name || ''} id=${el.id || ''} label="${label}" value="${(el.value || '').slice(0, 30)}"`;
}));
console.log(fields.join('\n'));
const text = (await page.locator('body').innerText()).trim().split('\n').map((l) => l.trim()).filter(Boolean);
const i = text.findIndex((l) => /Effective Date/.test(l));
console.log('--- after section 4:\n' + text.slice(i, i + 40).join('\n'));
await page.close(); await browser.close();
