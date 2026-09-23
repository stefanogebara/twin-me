/* Fills Enable Banking's quote form in the owner's Chrome and leaves the tab open. Never submits: the owner adds the phone and presses Submit. */
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const context = browser.contexts()[0];
const page = await context.newPage();
await page.goto('https://enablebanking.com/cp/billing', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(5000);
await page.locator('#needsAIS').check(); await page.waitForTimeout(800);
for (const el of await page.locator('input[type="number"], input[inputmode="numeric"]').all()) {
  const label = await el.evaluate((e) => (e.labels && e.labels[0] ? e.labels[0].innerText : e.placeholder || e.getAttribute('aria-label') || ''));
  console.log('number field:', label.slice(0, 60));
  if (/account|ais|volume/i.test(label)) await el.fill('100');
}
await page.locator('#country-ES').check();
await page.locator('#reg-your').check();
await page.locator('textarea').first().fill('TwinMe Money (twinme.me) is a spending ledger for students in Spain. With the person\'s consent we read their own accounts (AIS only, no payments) to reconcile bank transactions with phone notifications, receipt emails and statements, and forecast their month. Today one consent runs in production in restricted mode (the founder\'s own Santander accounts) on application "TwinMe". We want to open the same flow to ten invited students this quarter, up to one hundred by the end of 2026, Spain only, each account read up to four times a day. No credit decisions, no payments initiated. Terms: twinme.me/terms. Privacy: twinme.me/privacy. Data protection contact: privacy@twinme.me.');
const texts = await page.locator('input[type="text"]').all();
const byPlaceholder = async (re) => { for (const el of texts) { const ph = await el.getAttribute('placeholder'); if (ph && re.test(ph)) return el; } return null; };
await (await byPlaceholder(/dd\.mm\.yyyy/)).fill('01.10.2026');
await (await byPlaceholder(/Finland/)).fill('Brazil');
const rest = []; for (const el of texts) { const ph = await el.getAttribute('placeholder'); if (!ph) rest.push(el); }
console.log('unlabeled text inputs:', rest.length);
if (rest.length >= 3) { await rest[0].fill('Stefano Chap Chap Gebara (MEI, sole entrepreneur)'); await rest[1].fill('CNPJ 65.087.663/0001-30'); await rest[2].fill('Stefano Gebara'); }
await (await byPlaceholder(/CEO|CTO|Product/)).fill('Founder');
const summary = await page.evaluate(() => [...document.querySelectorAll('input[type=text], input[type=email], input[type=number], textarea')].map((e) => `${(e.labels && e.labels[0] ? e.labels[0].innerText : e.placeholder || '').slice(0, 30)} = ${(e.value || '').slice(0, 50)}`));
console.log('--- filled (phone and the confirmation box left for the owner):\n' + summary.join('\n'));
await page.bringToFront();
await browser.close();
