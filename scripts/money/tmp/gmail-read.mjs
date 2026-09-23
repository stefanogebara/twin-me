import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const context = browser.contexts()[0];
const page = await context.newPage();
for (const q of process.argv.slice(2)) {
  await page.goto(`https://mail.google.com/mail/u/0/#search/${encodeURIComponent(q)}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(7000);
  const row = page.locator('tr.zA').first();
  if (!(await row.count())) { console.log(`=== ${q}: no thread`); continue; }
  await row.click(); await page.waitForTimeout(6000);
  const bodies = await page.evaluate(() => [...document.querySelectorAll('div.a3s')].map((b) => b.innerText.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()));
  const heads = await page.evaluate(() => [...document.querySelectorAll('.gE .gD, .g2')].map((e) => (e.getAttribute('email') || e.innerText || '').trim()).filter(Boolean));
  console.log(`=== ${q}\nfrom/to seen: ${[...new Set(heads)].join(', ')}\n`);
  bodies.forEach((b, i) => console.log(`--- message ${i + 1} ---\n${b.slice(0, 2600)}\n`));
}
await page.close(); await browser.close();
