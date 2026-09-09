/**
 * Presence home audit.
 *
 * Same idea as audit-presence-onboarding.mjs: a screenshot cannot tell you
 * whether the left edges agree or whether the type scale has eight sizes in it,
 * so this measures. It signs in with a magic-link token passed on argv (the
 * dev console fallback prints one; see .claude/plans/.../README.md).
 *
 * Usage: node scripts/audit-presence-home.mjs <verifyUrl> [outDir]
 */
// PLAYWRIGHT_MODULE lets you point at a different playwright install when the
// repo's pinned version has no matching browser build downloaded.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const VERIFY = process.argv[2];
const OUT = process.argv[3] || '/tmp/presence-home-audit';
if (!VERIFY) { console.error('need a magic-link verify URL'); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: 'light',
  reducedMotion: 'no-preference',
});
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
page.on('pageerror', e => consoleErrors.push('pageerror: ' + String(e).slice(0, 200)));

/* The access token lives in memory, so do NOT re-navigate after verifying —
   a fresh document load drops it. The verify link carries redirect=/presence/home
   and the SPA lands there itself. */
await page.goto(VERIFY, { waitUntil: 'commit', timeout: 60000 });
try {
  await page.waitForSelector('.dsh-plate-name', { timeout: 60000 });
} catch {
  console.error('never reached the dashboard. at:', page.url());
  console.error((await page.evaluate(() => document.body.innerText)).slice(0, 400));
  await page.screenshot({ path: join(OUT, 'stuck.png') });
  await browser.close();
  process.exit(2);
}
await page.waitForTimeout(1500);

const MEASURE = () => {
  const px = v => Math.round(v * 100) / 100;
  const vis = el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0';
  };
  const out = { leftEdges: {}, sizes: {}, families: {}, radii: {}, shadows: [], gradients: [], type: [] };
  document.querySelectorAll('h1,h2,h3,p,span,label,button,li,dt,dd,a,div').forEach(el => {
    if (!vis(el)) return;
    if (el.closest('.sr-only') || el.classList.contains('sr-only')) return;
    const direct = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!direct) return;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const size = px(parseFloat(s.fontSize));
    const fam = s.fontFamily.split(',')[0].replace(/["']/g, '');
    out.type.push({
      cls: (el.className || '').toString().split(' ').slice(0, 2).join('.').slice(0, 30),
      left: px(r.left), top: px(r.top), size, weight: s.fontWeight, family: fam,
      color: s.color, text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
    });
    out.leftEdges[px(r.left)] = (out.leftEdges[px(r.left)] || 0) + 1;
    out.sizes[size] = (out.sizes[size] || 0) + 1;
    out.families[fam] = (out.families[fam] || 0) + 1;
  });
  document.querySelectorAll('*').forEach(el => {
    if (!vis(el)) return;
    const s = getComputedStyle(el);
    const cls = (el.className || '').toString().split(' ')[0].slice(0, 26);
    if (s.borderRadius && s.borderRadius !== '0px') out.radii[s.borderRadius] = (out.radii[s.borderRadius] || 0) + 1;
    if (s.boxShadow && s.boxShadow !== 'none') out.shadows.push({ cls, v: s.boxShadow.slice(0, 70) });
    if (/gradient/.test(s.backgroundImage)) out.gradients.push({ cls, v: s.backgroundImage.slice(0, 100) });
  });
  out.shadows = [...new Map(out.shadows.map(o => [o.v, o])).values()];
  out.gradients = [...new Map(out.gradients.map(o => [o.v, o])).values()];
  return out;
};

/* Contrast on the PHOTOGRAPH, computed rather than eyeballed.
   A screenshot cannot be sampled here without a PNG decoder, but the composite
   is fully determined: paper, then the still at opacity O through
   filter: saturate(S), then the veil ramp. So reproduce it exactly in-page and
   take the DARKEST resulting pixel under each text run — the worst case for
   dark ink. This is the check that caught the onboarding lead at 3.91:1. */
const CONTRAST = async () => {
  const cs = getComputedStyle(document.querySelector('.dsh'));
  const PAPER = [247, 245, 243];
  const OPACITY = 0.62, SAT = 0.74, POS_Y = 0.44;
  const STOPS = [[0, 0.32], [0.30, 0.62], [0.62, 0.85], [1, 0.93]];

  const img = new Image();
  img.src = '/images/presence/cosmos-02-window.jpg';
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  const data = cx.getImageData(0, 0, cv.width, cv.height).data;

  // background-size: cover, background-position: 50% POS_Y, on the viewport
  const VW = innerWidth, VH = innerHeight;
  const scale = Math.max(VW / cv.width, VH / cv.height);
  const dw = cv.width * scale, dh = cv.height * scale;
  const ox = (VW - dw) * 0.5, oy = (VH - dh) * POS_Y;

  const sat = (r, g, b) => {
    const s = SAT;
    return [
      (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b,
      (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b,
      (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b,
    ];
  };
  const veilAt = y => {
    const t = Math.min(1, Math.max(0, y / VH));
    for (let i = 1; i < STOPS.length; i++) {
      if (t <= STOPS[i][0]) {
        const [t0, a0] = STOPS[i - 1], [t1, a1] = STOPS[i];
        return a0 + (a1 - a0) * ((t - t0) / (t1 - t0 || 1));
      }
    }
    return STOPS[STOPS.length - 1][1];
  };
  const lum = ([r, g, b]) => {
    const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const parse = c => c.match(/[\d.]+/g).slice(0, 3).map(Number);

  /** worst-case (darkest) composited ground inside a viewport rect */
  const groundIn = (rect, mean) => {
    let worst = null, worstL = 2;
    let sum = [0, 0, 0], n = 0;
    for (let y = Math.max(0, rect.top); y < Math.min(VH, rect.bottom); y += 2) {
      for (let x = Math.max(0, rect.left); x < Math.min(VW, rect.right); x += 2) {
        const sx = Math.floor((x - ox) / scale), sy = Math.floor((y - oy) / scale);
        let px = PAPER;
        if (sx >= 0 && sy >= 0 && sx < cv.width && sy < cv.height) {
          const i = (sy * cv.width + sx) * 4;
          const f = sat(data[i], data[i + 1], data[i + 2]);
          px = f.map((v, k) => v * OPACITY + PAPER[k] * (1 - OPACITY));
        }
        const a = veilAt(y);
        const out = px.map((v, k) => PAPER[k] * a + v * (1 - a));
        sum = [sum[0] + out[0], sum[1] + out[1], sum[2] + out[2]]; n++;
        const L = lum(out);
        if (L < worstL) { worstL = L; worst = out.map(v => Math.round(v)); }
      }
    }
    if (!n) return { rgb: PAPER, L: lum(PAPER) };
    if (mean) { const m = sum.map(v => Math.round(v / n)); return { rgb: m, L: lum(m) }; }
    return { rgb: worst, L: worstL };
  };

  /* .dsh-sub only renders when there are asks to explain, so plant one in the
     real place it is allowed to live — inside a panel — rather than calling an
     unrendered path verified. The general walker below covers everything that
     actually rendered. */
  const probes = [];
  const host = document.querySelector('.dsh-card');
  if (host) {
    const probe = document.createElement('p');
    probe.className = 'dsh-sub';
    probe.textContent = 'synthetic probe for the unrendered asks lead';
    host.prepend(probe);
    const panelRect = host.getBoundingClientRect();
    const g = groundIn(panelRect, true);
    let pg = g.rgb;
    for (let n = probe; n && n !== document.body; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor.match(/[\d.]+/g);
      if (!c) continue;
      const a = c.length > 3 ? Number(c[3]) : 1;
      if (a > 0) pg = pg.map((v, k) => Number(c[k]) * a + v * (1 - a));
    }
    const st = getComputedStyle(probe);
    const ink = st.color.match(/[\d.]+/g).slice(0, 3).map(Number);
    const li = lum(ink), lg = lum(pg);
    probes.push({
      sel: '.dsh-sub (synthetic)', floor: 4.5, size: Math.round(parseFloat(st.fontSize)),
      ink: `rgb(${ink.join(',')})`, worstGround: `rgb(${pg.map(v => Math.round(v)).join(',')})`,
      onChip: true,
      ratio: Math.round(((Math.max(li, lg) + 0.05) / (Math.min(li, lg) + 0.05)) * 100) / 100,
      text: 'synthetic probe',
    });
    probe.remove();
  }

  /* Judge EVERY visible text run, not a hand-picked list. Each one is
     composited through its own ancestor chain of translucent panels over the
     room, because a hand-picked list is exactly how the caption on /auth
     shipped at 3.44:1.

     Two ground models, and the choice matters:
       - a plain element sits on the raw still, so the worst case is the
         DARKEST pixel under it
       - a frosted panel has backdrop-filter: blur, which averages the room
         locally, so its ground is the MEAN of the still over that panel
     Using the darkest pixel under a blurred panel invents failures; using the
     mean under an unblurred one hides real ones. */
  const results = [...probes];
  const seen = new Set();
  for (const el of document.querySelectorAll('.dsh *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.top > VH || r.bottom < 0) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.opacity === '0') continue;
    if (el.classList.contains('sr-only') || el.closest('.sr-only')) continue;
    const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    if (!text) continue;

    // ancestor chain, outermost first, and whether anything blurs the room
    const chain = [];
    let blurred = null;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const ns = getComputedStyle(n);
      const c = ns.backgroundColor.match(/[\d.]+/g);
      if (c) {
        const a = c.length > 3 ? Number(c[3]) : 1;
        if (a > 0) chain.unshift([c.slice(0, 3).map(Number), a]);
      }
      const bd = ns.backdropFilter || ns.webkitBackdropFilter || '';
      if (/blur/.test(bd) && !blurred) blurred = n.getBoundingClientRect();
    }

    const g = blurred ? groundIn(blurred, true) : groundIn(r, false);
    let ground = g.rgb;
    for (const [c, a] of chain) ground = ground.map((v, k) => c[k] * a + v * (1 - a));

    const ink = st.color.match(/[\d.]+/g).slice(0, 3).map(Number);
    const li = lum(ink), lg = lum(ground);
    const ratio = (Math.max(li, lg) + 0.05) / (Math.min(li, lg) + 0.05);
    const size = parseFloat(st.fontSize);
    const bold = Number(st.fontWeight) >= 700;
    // WCAG large text: >=24px, or >=18.66px bold
    const floor = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    const key = `${el.className}|${Math.round(size)}|${st.color}|${blurred ? 'p' : 'r'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      sel: (el.className || el.tagName).toString().split(' ').slice(0, 2).join('.').slice(0, 28),
      size: Math.round(size), floor,
      ink: `rgb(${ink.join(',')})`,
      worstGround: `rgb(${ground.map(v => Math.round(v)).join(',')})`,
      onChip: chain.length > 0,
      ratio: Math.round(ratio * 100) / 100,
      text: text.replace(/\s+/g, ' ').slice(0, 32),
    });
  }
  return results;
};

const m = await page.evaluate(MEASURE);
const contrast = await page.evaluate(CONTRAST);
await page.screenshot({ path: join(OUT, 'home-viewport.png') });
await page.screenshot({ path: join(OUT, 'home-full.png'), fullPage: true });
writeFileSync(join(OUT, 'report.json'), JSON.stringify({ ...m, contrast, consoleErrors: [...new Set(consoleErrors)] }, null, 1));

const edges = Object.entries(m.leftEdges).sort((a, b) => b[1] - a[1]);
console.log('left edges (count):', edges.map(([k, v]) => `${k}x${v}`).join('  '));
console.log('type sizes:', Object.entries(m.sizes).sort((a, b) => b[0] - a[0]).map(([k, v]) => `${k}px x${v}`).join('  '));
console.log('families:', Object.entries(m.families).map(([k, v]) => `${k} x${v}`).join('  '));
console.log('radii:', Object.entries(m.radii).map(([k, v]) => `${k} x${v}`).join('  '));
console.log('shadows:', m.shadows.length, 'gradients:', m.gradients.length);
const fails = contrast.filter(c => c.ratio < (c.floor || 4.5));
console.log(`contrast: ${contrast.length} text runs measured, ${fails.length} below their WCAG floor`);
for (const c of fails) {
  console.log(`  FAIL ${c.ratio.toFixed(2)} (needs ${c.floor})  ${c.sel} ${c.size}px  ink ${c.ink} on ${c.worstGround}${c.onChip ? ' [through panel]' : ' [on the room]'}  "${c.text}"`);
}
console.log('console errors:', consoleErrors.length);
for (const e of [...new Set(consoleErrors)].slice(0, 6)) console.log('  -', e);
await browser.close();
