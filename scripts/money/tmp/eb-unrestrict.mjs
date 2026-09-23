import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const context = browser.contexts()[0];
const page = await context.newPage();
await page.goto('https://enablebanking.com/cp/applications', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(5000);
const before = (await page.locator('body').innerText()).length;
await page.getByRole('button', { name: /Request unrestriction/i }).first().click();
await page.waitForTimeout(3000);
console.log('url:', page.url());
const text = (await page.locator('body').innerText()).trim().split('\n').map((l) => l.trim()).filter(Boolean);
const dialog = await page.locator('[role="dialog"], .modal, dialog').first().innerText().catch(() => '');
console.log('--- dialog:\n' + (dialog || '(none)').slice(0, 1500));
if (!dialog) { const i = text.findIndex((l) => /unrestrict/i.test(l)); console.log('--- around:\n' + text.slice(Math.max(0, i - 3), i + 25).join('\n')); }
const fields = await page.evaluate(() => [...document.querySelectorAll('[role=dialog] input, [role=dialog] textarea, [role=dialog] select, form input, form textarea')].map((el) => `${el.tagName.toLowerCase()} name=${el.name || ''} label="${el.labels && el.labels[0] ? el.labels[0].innerText.trim().slice(0, 60) : (el.placeholder || '')}"`).slice(0, 20));
console.log('--- fields:\n' + fields.join('\n'));
await page.close(); await browser.close();
