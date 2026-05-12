/* eslint-disable */
// Playwright-based prod inspection: drive https://www.twinme.me on every
// surface that has a full-bleed background and capture both:
//   1. Full-viewport screenshot at native DPR=2
//   2. 600×400 100% crop sampled from the background area
//   3. Network log of which @2x.webp / .webp / .jpg was actually fetched
//
// Output: tasks/audit-2026-05-08/bg-inspection/{surface}.png  (full)
//         tasks/audit-2026-05-08/bg-inspection/{surface}-crop.png (100%)
//         tasks/audit-2026-05-08/bg-inspection/results.json

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/stefa/twin-ai-learn/.claude/worktrees/money-fixes-pass1';
const OUT_DIR = path.join(ROOT, 'tasks/audit-2026-05-08/bg-inspection');
fs.mkdirSync(OUT_DIR, { recursive: true });

// Surfaces to test
const SURFACES = [
  { name: 'landing-stage1',  url: 'https://www.twinme.me/',           scrollY: 0,    note: 'CosmicHero stage 1 (aux-starry-clouds)' },
  { name: 'landing-stage2',  url: 'https://www.twinme.me/',           scrollY: 900,  note: 'CosmicHero stage 2 (01-space-earth)' },
  { name: 'landing-stage3',  url: 'https://www.twinme.me/',           scrollY: 1800, note: 'CosmicHero stage 3 (stage3-arrival)' },
  { name: 'landing-stage4',  url: 'https://www.twinme.me/',           scrollY: 2700, note: 'CosmicHero stage 4 (04-aurora)' },
  { name: 'landing-stage5',  url: 'https://www.twinme.me/',           scrollY: 3600, note: 'CosmicHero stage 5 (stage5-horizon)' },
  { name: 'landing-chapter-landscape', url: 'https://www.twinme.me/', scrollY: 4600, note: '.chapter-landscape (section6-landscape)' },
  { name: 'landing-chapter-meadow',    url: 'https://www.twinme.me/', scrollY: 5800, note: '.chapter-meadow (section8-meadow)' },
  { name: 'landing-chapter-twin',      url: 'https://www.twinme.me/', scrollY: 8000, note: '.chapter-twin (section11-twin-meeting)' },
  { name: 'auth-signin',     url: 'https://www.twinme.me/auth?mode=signin', scrollY: 0, note: 'CustomAuth right panel (stage3-arrival)' },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const results = [];

  for (const s of SURFACES) {
    const page = await ctx.newPage();
    const fetched = [];
    page.on('response', (res) => {
      const url = res.url();
      if (/\.(jpg|webp|png)$/i.test(url) && url.includes('twinme.me') && /\/images\//i.test(url)) {
        const ct = res.headers()['content-type'] || '';
        const size = res.headers()['content-length'] || '?';
        fetched.push({ url: url.replace('https://www.twinme.me', ''), ct, size });
      }
    });

    try {
      await page.goto(s.url, { waitUntil: 'load', timeout: 45000 });
      await page.waitForLoadState('domcontentloaded');
      // Give react + image-set + LCP a chance to paint
      await page.waitForTimeout(2500);
      if (s.scrollY) {
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), s.scrollY);
        await page.waitForTimeout(800); // give parallax stages time to settle
      }
      const fullPath = path.join(OUT_DIR, `${s.name}.png`);
      await page.screenshot({ path: fullPath, fullPage: false });
      const buf = fs.readFileSync(fullPath);
      const dim = `${buf.readUInt32BE(16)}×${buf.readUInt32BE(20)}`;

      // 100% native-pixel crop from the center of the viewport (where the bg is most visible)
      const cropPath = path.join(OUT_DIR, `${s.name}-crop.png`);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollTop)); // settle
      await page.screenshot({ path: cropPath, clip: { x: 480, y: 200, width: 480, height: 320 } });
      const cropBuf = fs.readFileSync(cropPath);

      results.push({
        surface: s.name,
        note: s.note,
        scrollY: s.scrollY,
        fullScreenshot: { dim, sizeKB: Math.round(buf.length / 1024) },
        cropEntropy: cropBuf.length, // PNG size is a proxy for high-frequency content
        fetched: fetched.filter(f => /cosmic/.test(f.url)).slice(0, 5),
      });
      console.log(`  ${s.name.padEnd(32)} ${dim} full=${Math.round(buf.length / 1024)}KB crop=${Math.round(cropBuf.length / 1024)}KB  (${fetched.filter(f => /cosmic/.test(f.url)).length} bg fetches)`);
    } catch (e) {
      console.log(`  ${s.name} FAILED: ${e.message}`);
      results.push({ surface: s.name, error: e.message });
    }
    await page.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`\nSaved screenshots + crops to ${OUT_DIR}`);
  console.log(`\nCrop-PNG entropy comparison (>100KB = high detail, <50KB = flat):`);
  results.forEach((r) => {
    if (r.cropEntropy) {
      const kb = Math.round(r.cropEntropy / 1024);
      const verdict = kb > 100 ? 'DETAIL' : kb > 50 ? 'medium' : 'FLAT';
      console.log(`  ${r.surface.padEnd(32)} ${kb}KB  ${verdict}`);
    }
  });
})().catch((e) => { console.error(e); process.exit(1); });
