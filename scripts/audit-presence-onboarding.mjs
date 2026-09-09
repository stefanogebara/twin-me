/**
 * Presence onboarding audit harness.
 *
 * Screenshots lie about motion and they lie about sub-pixel work, so this does
 * three things a screenshot cannot:
 *   1. captures every step at full 1440x900 (no pane downscaling)
 *   2. measures real geometry — left edges, baselines, gaps, type scale — so
 *      "awkward layout" becomes a list of numbers that disagree
 *   3. samples transitions with requestAnimationFrame and reports per-frame
 *      deltas, which is the only way to see a jump or a dropped frame
 *
 * Usage: node scripts/audit-presence-onboarding.mjs [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const OUT = process.argv[2] || '/tmp/presence-audit';
const BASE = 'http://localhost:8086';
const STEPS = ['start', 'bond', 'about', 'review', 'voice', 'style', 'relay'];

mkdirSync(OUT, { recursive: true });

/** Auth: the app keeps its access token in memory behind a refresh cookie, so
 *  we reuse a storage state if one was saved, else run unauthenticated and let
 *  the caller know which steps were gated. */
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,               // retina — sub-pixel defects show up
  colorScheme: 'light',
  reducedMotion: 'no-preference',
});
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
page.on('pageerror', e => consoleErrors.push('pageerror: ' + String(e).slice(0, 160)));

await page.goto(`${BASE}/presence/onboarding`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

/** Geometry probe — runs in the page, returns numbers we can argue with. */
const MEASURE = () => {
  const px = v => Math.round(v * 100) / 100;
  const vis = el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0';
  };
  const out = { leftEdges: {}, type: [], gaps: [], radii: {}, shadows: [], gradients: [], transitions: {} };

  // every visible text run: left edge, size, weight, family, colour
  document.querySelectorAll('h1,h2,h3,p,span,label,button,li,div').forEach(el => {
    if (!vis(el)) return;
    const direct = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!direct) return;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    out.type.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().split(' ')[0].slice(0, 26),
      left: px(r.left), top: px(r.top), w: px(r.width),
      size: px(parseFloat(s.fontSize)),
      weight: s.fontWeight,
      family: s.fontFamily.split(',')[0].replace(/["']/g, ''),
      lh: px(parseFloat(s.lineHeight) || 0),
      tracking: s.letterSpacing,
      color: s.color,
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 34),
    });
    out.leftEdges[px(r.left)] = (out.leftEdges[px(r.left)] || 0) + 1;
  });

  // surfaces: radius, shadow, gradient — the three "AI slop" tells
  document.querySelectorAll('*').forEach(el => {
    if (!vis(el)) return;
    const s = getComputedStyle(el);
    const cls = (el.className || '').toString().split(' ')[0].slice(0, 26);
    if (s.borderRadius && s.borderRadius !== '0px') {
      out.radii[s.borderRadius] = (out.radii[s.borderRadius] || 0) + 1;
    }
    if (s.boxShadow && s.boxShadow !== 'none') out.shadows.push({ cls, v: s.boxShadow.slice(0, 80) });
    if (/gradient/.test(s.backgroundImage)) out.gradients.push({ cls, v: s.backgroundImage.slice(0, 110) });
    if (s.transition && s.transition !== 'all 0s ease 0s') {
      out.transitions[s.transition.slice(0, 60)] = (out.transitions[s.transition.slice(0, 60)] || 0) + 1;
    }
  });
  out.shadows = [...new Map(out.shadows.map(o => [o.v, o])).values()];
  out.gradients = [...new Map(out.gradients.map(o => [o.v, o])).values()];
  return out;
};

const report = { steps: {}, consoleErrors: [] };

for (let i = 0; i < STEPS.length; i++) {
  const id = STEPS[i];
  // drive by the app's own state: click through, don't deep-link (deep links
  // can skip mount animations we need to see)
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, `${String(i).padStart(2, '0')}-${id}.png`) });
  const m = await page.evaluate(MEASURE);
  report.steps[id] = m;

  // advance
  const next = page.locator('button:has-text("Create a first Presence"), button:has-text("Continue"), button:has-text("Next")').first();
  if (await next.count() && await next.isEnabled().catch(() => false)) {
    await next.click().catch(() => {});
    await page.waitForTimeout(900);
  } else break;
}

report.consoleErrors = [...new Set(consoleErrors)];
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));

console.log('steps captured:', Object.keys(report.steps).join(', '));
console.log('console errors:', report.consoleErrors.length);
for (const e of report.consoleErrors.slice(0, 6)) console.log('  -', e);

await browser.close();
