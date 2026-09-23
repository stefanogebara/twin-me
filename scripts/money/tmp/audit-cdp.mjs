/* The platform as the owner sees it: every page at two widths, a screenshot and measurements
   of what the register asks for (words, ink, type, cards, targets, overflow, errors, paint). */
import { chromium } from 'playwright'; import fs from 'node:fs';
const B = 'https://www.twinme.me'; const OUT = process.argv[2];
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const context = browser.contexts()[0];
const page = await context.newPage();
const errors = []; page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 100)); });
const report = [];
for (const [w, h, tag] of [[1440, 900, 'desktop'], [402, 874, 'phone']]) {
  await page.setViewportSize({ width: w, height: h });
  for (const path of ['/money', '/money/month', '/money/plan', '/money/you', '/money/account', '/money/chat']) {
    errors.length = 0; const t0 = Date.now();
    await page.goto(`${B}${path}`, { waitUntil: 'domcontentloaded' });
    await page.locator('main h1, .mv-day-figure').first().waitFor({ timeout: 30000 }).catch(() => {});
    const painted = Date.now() - t0; await page.waitForTimeout(4500);
    const m = await page.evaluate(() => {
      const main = document.querySelector('main'); const all = [...document.querySelectorAll('main *')];
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const cs = (e) => getComputedStyle(e);
      const words = main.innerText.trim().split(/\s+/).length;
      const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;
      const fonts = new Set(all.filter(vis).map((e) => cs(e).fontFamily.split(',')[0].replace(/"/g, '').trim()));
      const shadows = all.filter((e) => vis(e) && cs(e).boxShadow !== 'none').length;
      const gradients = all.filter((e) => vis(e) && /gradient/.test(cs(e).backgroundImage)).length;
      const upper = all.filter((e) => vis(e) && cs(e).textTransform === 'uppercase' && e.innerText.trim().length > 1).length;
      const radii = new Set(all.filter((e) => vis(e) && cs(e).borderRadius !== '0px' && (cs(e).backgroundColor !== 'rgba(0, 0, 0, 0)' || cs(e).borderStyle !== 'none')).map((e) => cs(e).borderRadius));
      const small = [...document.querySelectorAll('main button, main a, main [role=button], main input, main select')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.width < 24 || r.height < 24); }).map((e) => `${e.tagName.toLowerCase()} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)} "${(e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 24)}"`);
      const colors = {}; for (const e of all) { if (!vis(e) || !e.innerText?.trim() || e.children.length) continue; const c = cs(e).color; colors[c] = (colors[c] || 0) + 1; }
      const sizes = {}; for (const e of all) { if (!vis(e) || !e.innerText?.trim() || e.children.length) continue; const s = cs(e).fontSize; sizes[s] = (sizes[s] || 0) + 1; }
      const weights = {}; for (const e of all) { if (!vis(e) || !e.innerText?.trim() || e.children.length) continue; const wgt = cs(e).fontWeight; weights[wgt] = (weights[wgt] || 0) + 1; }
      const h1 = main.querySelector('h1'); const primaries = [...main.querySelectorAll('button')].filter((b) => vis(b) && cs(b).backgroundColor === 'rgb(37, 31, 33)').length;
      return { words, overflow, fonts: [...fonts], shadows, gradients, upper, radii: [...radii], small, colors, sizes, weights, h1: h1 ? { size: cs(h1).fontSize, weight: cs(h1).fontWeight } : null, primaries, sheets: document.querySelectorAll('main [role=dialog]').length, height: document.documentElement.scrollHeight };
    });
    const file = `${OUT}/${tag}${path.replace(/\//g, '_')}.png`;
    await page.screenshot({ path: file, fullPage: true });
    report.push({ tag, path, painted, errors: [...errors], ...m });
    console.log(`${tag.padEnd(7)} ${path.padEnd(15)} paint ${String(painted).padStart(5)} words ${String(m.words).padStart(3)} h ${m.height} overflow ${m.overflow} fonts ${m.fonts.join('/')} shadows ${m.shadows} grad ${m.gradients} upper ${m.upper} primaries ${m.primaries} small ${m.small.length} sheets ${m.sheets} errors ${errors.length}`);
  }
}
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
await page.close(); await browser.close();
