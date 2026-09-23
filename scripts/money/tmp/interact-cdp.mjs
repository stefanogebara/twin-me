/* Use the pages as a person would, inside the owner's signed-in Chrome: dismiss the sheet, open
   a ledger day, tap a term week, ask the chat one question, and read what comes back. */
import { chromium } from 'playwright';
const B = 'https://www.twinme.me';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const context = browser.contexts()[0];
const page = context.pages().find((p) => p.url().includes('twinme.me')) || await context.newPage();
const errors = []; page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });
const bad = new Set(); page.on('response', (r) => { if (r.status() >= 400) bad.add(`${r.status()} ${r.url().replace(B, '')}`); });
const say = (label, v) => console.log(`\n== ${label}\n${v}`);

await page.goto(`${B}/money`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000);
const notNow = page.locator('main [role="dialog"] button', { hasText: 'Not now' });
if (await notNow.count()) { await notNow.click(); await page.waitForTimeout(800); }
say('Today after Not now: sheets, words', `${await page.locator('main [role="dialog"]').count()} sheets, ${(await page.locator('main').innerText()).trim().split(/\s+/).length} words`);
await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
say('Today after reload: sheets', String(await page.locator('main [role="dialog"]').count()));

await page.goto(`${B}/money/month`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000);
const sept = page.locator('#ledger button, #ledger [role="button"]', { hasText: 'September 2026' }).first();
if (await sept.count()) { await sept.click(); await page.waitForTimeout(2500); }
const rows = page.locator('#ledger .mv-item');
say('Month ledger after opening September: rows', String(await rows.count()));
const firstRow = rows.nth(1); if (await firstRow.count()) { await firstRow.click().catch(() => {}); await page.waitForTimeout(2000); }
say('Ledger first row text', ((await page.locator('#ledger').innerText()).split('\n').slice(0, 24).join(' | ')).slice(0, 700));

await page.goto(`${B}/money/plan`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000);
const week = page.locator('main button', { hasText: '21 Sept' }).first();
if (await week.count()) { await week.click(); await page.waitForTimeout(2500); say('Plan after tapping the week of 21 Sept', (await page.locator('main').innerText()).split('The term.')[1]?.slice(0, 900) || '(no term section)'); } else say('Plan', 'no week button found');

await page.goto(`${B}/money/chat`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
const box = page.locator('main textarea, main input[type="text"]').last();
await box.fill('quanto gastei ontem no total?'); await box.press('Enter');
const before = (await page.locator('main').innerText()).length;
for (let i = 0; i < 40; i++) { await page.waitForTimeout(1000); const t = await page.locator('main').innerText(); if (t.length > before + 40 && !/What it is doing|thinking|pensando/i.test(t.slice(-200))) break; }
await page.waitForTimeout(4000);
const chat = (await page.locator('main').innerText()).trim().split('\n').filter(Boolean);
say('Ask, last exchange', chat.slice(-8).join('\n'));

say('failed requests', [...bad].join('\n') || 'none'); say('console errors', errors.join('\n') || 'none');
await browser.close();
