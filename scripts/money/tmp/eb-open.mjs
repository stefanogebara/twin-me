import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const context = browser.contexts()[0];
const page = await context.newPage();
const link = process.argv[2];
await page.goto(link, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(7000);
console.log('after link:', page.url());
if (!/\/cp/.test(page.url())) { await page.goto('https://enablebanking.com/cp/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(5000); console.log('cp:', page.url()); }
const text = (await page.locator('body').innerText()).trim();
console.log(text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 70).join('\n').slice(0, 3000));
const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => `${a.innerText.trim().slice(0, 40)} -> ${a.getAttribute('href')}`).filter((s) => /cp\//.test(s)).slice(0, 30));
console.log('--- cp links:\n' + [...new Set(links)].join('\n'));
await page.close(); await browser.close();
