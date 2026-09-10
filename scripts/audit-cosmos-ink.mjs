/**
 * Cosmos ink audit — is a colour token readable everywhere it actually paints?
 *
 * Sibling of scripts/audit-presence-home.mjs, which measures ONE screen. This
 * one takes a token and walks every surface that loads presence-cosmos.css,
 * because a shared token's problem is never confined to the screen you noticed
 * it on: --c-ink-3 was patched locally in presence-home.css at 2.8:1 while the
 * same token was painting 112 runs across nine other surfaces at 2.67:1.
 *
 * Two things it does differently from the home script, both because twelve
 * surfaces have twelve different grounds:
 *
 *  1. Runs are attributed to the token by SENTINEL. The token is redefined as
 *     rgb(1,2,3) on .presence-cosmos, so anything still computing to that
 *     colour is painted by the shared token, and anything sitting under a local
 *     override (.dsh, .pc-pt-cine, .pc-pt-glasscard) drops out on its own.
 *     No grepping, no guessing which selector inherits from where.
 *
 *  2. The ground under a run is SAMPLED FROM THE RENDERED RASTER, not modelled.
 *     The home script reproduces its own page's composite in JS — paper, still,
 *     saturate, veil ramp — which is exact but only for the one page whose
 *     parameters are hardcoded. Here the page is screenshot once with every
 *     glyph made transparent and the PNG handed back into the page, so the
 *     photograph, the veil, panel alpha and backdrop-filter blur are already
 *     baked in. That also removes the home script's blurred-panel/plain-element
 *     split: with blur already applied, the darkest pixel is the true worst case
 *     everywhere.
 *
 * Ground is read under the GLYPH LINE BOXES (Range rects over the direct text
 * nodes), not the element box — .obx-plate-foot holds a 5px status dot whose
 * own fill would otherwise be reported as the ground behind the type. Both the
 * darkest pixel and the 5th percentile are reported: a hairline crossing a line
 * box should not condemn a run, and the gap between the two numbers is where
 * judgement belongs.
 *
 * WCAG floors: 4.5:1 for text under 24px (or under 18.66px bold), 3:1 for
 * larger text and for icons and control borders (1.4.11).
 *
 * Sign-in: the gated routes need a session. Same recipe as the home script and
 * .claude/plans/2026-09-03-nocturne-state-verification/README.md —
 *
 *   RESEND_API_KEY= NODE_ENV=development PORT=3097 APP_URL=http://127.0.0.1:8092 \
 *     node api/server.js > /tmp/api.log 2>&1 &
 *   VITE_API_URL=http://127.0.0.1:3097/api VITE_APP_URL=http://127.0.0.1:8092 \
 *     npx vite --port 8092 --strictPort &
 *   curl -s -X POST http://127.0.0.1:3097/api/auth/magic-link/request \
 *     -H 'Content-Type: application/json' -d '{"email":"<owner email>"}'
 *   grep -oE "verify\?token=[A-Za-z0-9]+" /tmp/api.log | tail -1
 *
 * Open the verify URL on the API origin (:3097): vite's /api proxy is hardcoded
 * to :3004 and would burn the single-use token against the wrong server. The
 * first request after boot times out on a cold Supabase connection — call it
 * twice. Pass `none` instead of a URL for a signed-out pass over public routes.
 *
 * Usage:
 *   node scripts/audit-cosmos-ink.mjs <verifyUrl|none> <origin> [outDir]
 * Env:
 *   TOKEN=--c-ink-3          the custom property to audit
 *   ROUTES=/a,/b             override the route list
 *   BAND_FROM=0 BAND_TO=1    measure only some 900px bands of a long page
 *   SCOPE=.pc-demo-stage     audit a scoped override instead of the shared token
 *   WAIT_FOR=.dsh-plate      wait for real content before measuring
 *   ALL=1                    judge every text run, not only one token's
 *   CLICK=<selector>         click a tab or control first, to measure that state
 *   VIEWPORT=1280x800        another screen shape (default 1440x900)
 *   MAX_BANDS=16             how many viewport bands a long page may run to (default 8)
 *   PLAYWRIGHT_MODULE=...    a different playwright install, when the repo's
 *                            pinned version has no browser build downloaded
 */
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const VERIFY = process.argv[2];
const ORIGIN = process.argv[3];
const OUT = process.argv[4] || '/tmp/cosmos-ink-audit';
const TOKEN = process.env.TOKEN || '--c-ink-3';
/* SCOPE: where the sentinel goes. The default measures the shared token; a
   scoped override (.dsh, .pc-demo-stage) is audited by naming its element. */
const SCOPE = process.env.SCOPE || '.presence-cosmos';
/* WAIT_FOR: content that must exist before measuring. /presence/home renders
   its root long before its plate, and a walk that starts early measures an
   empty room and reports zero runs. */
const WAIT_FOR = process.env.WAIT_FOR || '';
/* ALL=1 judges every text run on the page against its rendered colour, not
   only the runs one token paints. CLICK=<selector> clicks one element (a tab,
   a scene) after the page settles, so a state behind a control is measured. */
const ALL = process.env.ALL === '1';
const CLICK = process.env.CLICK || '';
/* VIEWPORT=1280x800 measures another screen shape. Fixed photographs crop
   differently at each aspect ratio, so a fix that holds at 1440x900 has to be
   checked at a second shape before it is trusted. */
const [VW, VHT] = (process.env.VIEWPORT || '1440x900').split('x').map(Number);
/* A long page (/cosmos/system is eight bands) can outlive the renderer on a
   machine short of memory. BAND_FROM/BAND_TO measure a slice of it, so the
   page can be split across several short runs instead of dropped. */
const BAND_FROM = Number(process.env.BAND_FROM ?? 0);
const BAND_TO = Number(process.env.BAND_TO ?? 99);
/* MAX_BANDS: how many viewport bands a page may run to. A phone-width page
   stacks its sections and runs far past eight screens. */
const MAX_BANDS = Number(process.env.MAX_BANDS ?? 8);
if (!VERIFY || !ORIGIN) {
  console.error('usage: node scripts/audit-cosmos-ink.mjs <verifyUrl|none> <origin> [outDir]');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

/* Public routes first so a signed-out pass covers something; /auth and
   /waitlist only render their Cosmos frame when signed OUT, and /portrait,
   /presence/home and /presence/onboarding only when signed IN. Run it both
   ways to cover all of them. */
const ROUTES = (process.env.ROUTES || [
  '/presence', '/presence/login', '/auth', '/waitlist',
  '/cosmos/system', '/cosmos/demos', '/cosmos/landing',
  '/portrait', '/demo', '/presence/home', '/presence/onboarding',
].join(',')).split(',');

const SENTINEL = 'rgb(1, 2, 3)';
const SENTINEL_CSS = ALL ? '' : `${SCOPE} { ${TOKEN}: rgb(1,2,3) !important; }`;
/* text-fill-color as well as color, because -webkit-text-fill-color wins over
   color; .pc-shimmer paints its glyphs with a background gradient through
   background-clip:text, so its gradient has to go too. */
const ERASE_CSS = `
  *, *::before, *::after {
    color: transparent !important;
    -webkit-text-fill-color: transparent !important;
    text-shadow: none !important;
    text-decoration-color: transparent !important;
    caret-color: transparent !important;
  }
  svg { visibility: hidden !important; }
  .pc-shimmer { background-image: none !important; }
`;

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: VW, height: VHT }, deviceScaleFactor: 2,
  colorScheme: 'light', reducedMotion: 'reduce',
});
let firstPage = await ctx.newPage();
let page = firstPage;
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });

if (VERIFY !== 'none') {
  await page.goto(VERIFY, { waitUntil: 'commit', timeout: 60000 });
  await page.waitForTimeout(8000);
  console.log('signed in, landed at', page.url());
} else {
  console.log('signed-out pass');
}

const results = [];
const routeReports = [];

/* One page per route, closed afterwards. Decoding a viewport raster per band
   leaves enough behind that a walk of seven or more routes reliably took the
   renderer down partway through — and a dead browser reports the remaining
   routes as zero runs, which reads exactly like a pass. Recycling the page
   bounds it. If the browser dies anyway the route is recorded as an error, so
   a crashed walk can never be mistaken for a clean one. */
for (const route of ROUTES) {
  if (page !== firstPage || routeReports.length) {
    try { await page.close(); } catch {}
    page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
  }
  try {
    await page.goto(ORIGIN + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (e) { routeReports.push({ route, error: 'nav: ' + String(e).slice(0, 90) }); continue; }
  await page.waitForTimeout(3500);

  /* A hard navigation drops the in-memory access token. The refresh cookie
     re-hydrates it, but not before the route guard runs, and a guard that is
     still deciding renders NOTHING — so a fixed sleep reports zero runs on a
     gated route, which reads like a pass. Wait for the root to actually
     appear, and reload once in case the guard bounced to the login wall. */
  let rooted = false;
  for (let tries = 0; tries < 3 && !rooted; tries++) {
    try {
      await page.waitForSelector('.presence-cosmos', { timeout: 12000 });
      rooted = true;
    } catch {
      await page.waitForTimeout(2000);
      await page.goto(ORIGIN + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(2500);
    }
  }
  const landed = new URL(page.url()).pathname;
  if (landed !== route) routeReports.push({ route, note: `redirected to ${landed}` });
  if (!rooted) {
    routeReports.push({ route, error: `no .presence-cosmos root (at ${landed})` });
    continue;
  }
  if (WAIT_FOR) {
    let ready = false;
    for (let tries = 0; tries < 3 && !ready; tries++) {
      try { await page.waitForSelector(WAIT_FOR, { timeout: 20000 }); ready = true; }
      catch { await page.goto(ORIGIN + route, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}); }
    }
    if (!ready) { routeReports.push({ route, error: `${WAIT_FOR} never appeared` }); continue; }
  }
  /* WAIT FOR THE GROUND TO SETTLE, and prove it settled rather than assuming.
     The room is a CSS background-image: until it decodes, the ground under
     every run is near-paper, and an audit that measures too early reports a
     ground ~45/255 lighter than the real one and passes ink that fails. Fonts
     matter too — a fallback face has different line boxes. So: wait for fonts
     and for every background-image on the page to decode, then sample a
     reference strip twice and require it to stop moving. */
  const settleOnce = async () => {
    await page.evaluate(async () => {
      await document.fonts.ready;
      const urls = new Set();
      for (const el of document.querySelectorAll('*')) {
        const bg = getComputedStyle(el).backgroundImage;
        for (const m of bg.matchAll(/url\(["']?(.*?)["']?\)/g)) urls.add(m[1]);
      }
      await Promise.all([...urls].map(u => new Promise(res => {
        const i = new Image(); i.onload = i.onerror = res; setTimeout(res, 15000); i.src = u;
      })));
      /* Lazy images below the fold never start loading, so decode() on them never
         settles. That hung every run of /cosmos/system and /cosmos/landing until
         the kill timer, and a killed run reports nothing. Make them eager (the
         audit measures every band, so it needs them anyway) and cap each wait,
         background images included, so one stuck resource cannot cost a route. */
      for (const i of document.images) if (i.loading === 'lazy') i.loading = 'eager';
      await Promise.all([...document.images].map(i => i.complete ? null :
        Promise.race([i.decode().catch(() => {}), new Promise(r => setTimeout(r, 15000))])));
    });
    /* Then prove it settled, by pixels rather than by a timer: grab the viewport
       twice and require the mean to stop moving. A background still decoding, or
       a panel still fading in, shows up here as drift. The WHOLE viewport, not a
       strip: the panels fade in over their own part of the page, and a strip that
       misses them settles while a plate is still half transparent — which reads
       the room THROUGH the panel and reports a ground ~45/255 too dark. */
    const strip = { x: 0, y: 0, width: VW, height: VHT };
    const meanOf = async () => {
      /* scale:'css' halves each axis: this only needs a mean, and a full
         device-pixel capture here made the settle loop cost more than the
         measurement it guards. */
      const buf = await page.screenshot({ clip: strip, type: 'png', scale: 'css' });
      return page.evaluate(async b64 => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
        const d = cx.getImageData(0, 0, cv.width, cv.height).data;
        let t = 0, n = 0;
        for (let i = 0; i < d.length; i += 4 * 7) { t += d[i] + d[i + 1] + d[i + 2]; n += 3; }
        cv.width = cv.height = 0;
        return t / n;
      }, buf.toString('base64'));
    };
    let prev = await meanOf(), settled = false;
    for (let i = 0; i < 12 && !settled; i++) {
      await page.waitForTimeout(1000);
      const now = await meanOf();
      if (Math.abs(now - prev) < 0.4) settled = true;
      prev = now;
    }
    return settled;
  };
  /* A page can reload itself mid-load — /cosmos/landing did, twice in a row —
     and that destroys the context the script is holding. The page is fine;
     wait for it to come back and settle again, instead of crashing the walk. */
  let settledOk = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { settledOk = await settleOnce(); break; }
    catch (e) {
      if (!/context was destroyed|navigat|Target closed/i.test(String(e))) throw e;
      routeReports.push({ route, note: 'page reloaded while settling — retried' });
      await page.waitForLoadState('load').catch(() => {});
      await page.waitForSelector('.presence-cosmos', { timeout: 15000 }).catch(() => {});
    }
  }
  if (!settledOk) routeReports.push({ route, note: 'ground never settled — treat this route as suspect' });

  /* Anything that kills the page from here on is recorded against this route
     and the walk moves on, so every run still writes a report. A crashed
     process used to leave nothing behind, which read like a clean pass. */
  try {
    /* The value that ships, read on THIS route before the sentinel replaces it.
       Reading it once from /cosmos/system (as this script first did) scores a
       scoped token like --dsh-ink-on-room — defined only inside .dsh — against
       an empty string, i.e. against black, and every run "passes". */
    if (CLICK) {
      const target = await page.$(CLICK);
      if (!target) { routeReports.push({ route, error: `CLICK target ${CLICK} not found` }); continue; }
      await target.click();
      await page.waitForTimeout(1800);   // a scene cross-fades out, then the next one rises in
    }
    const routeValue = await page.evaluate(([t, sc]) => {
      const el = document.querySelector(sc);
      return el ? getComputedStyle(el).getPropertyValue(t).trim() : '';
    }, [TOKEN, SCOPE]);

    /* The page makes the sentinel tag itself, with an id, so the measuring pass
       can take it out and put it back by that id. Handing the page a Playwright
       handle to the tag instead left it unremovable: every ink still read as the
       sentinel. ALL=1 has no sentinel at all. */
    if (SENTINEL_CSS) await page.evaluate(css => {
      const t = document.createElement('style'); t.id = '__ink_sentinel'; t.textContent = css; document.head.appendChild(t);
    }, SENTINEL_CSS);
    await page.waitForTimeout(250);

    const pageH = await page.evaluate(() => document.documentElement.scrollHeight);
    const VH = VHT;
    let found = 0;
    /* Viewport-sized bands rather than one fullPage screenshot: the room is
       position:fixed, and Chromium repositions fixed elements in a fullPage
       capture, which would corrupt every ground under it. */
    for (let y = 0, band = 0; y < Math.min(pageH, VH * MAX_BANDS); y += VH, band++) {
      if (band < BAND_FROM || band > BAND_TO) continue;
      await page.evaluate(sy => window.scrollTo(0, sy), y);
      await page.waitForTimeout(700);

      const eraser = await page.addStyleTag({ content: ERASE_CSS });
      await page.waitForTimeout(350);
      /* scale:'css' rather than the context's deviceScaleFactor 2. A 2880x1800
         capture is a 20MB ImageData once decoded in the page, and doing that once
         per band killed the renderer partway through a multi-route walk — a dead
         browser looks exactly like a route with no runs. CSS pixels are plenty:
         the glyphs are erased, so this samples flat ground, not type edges. */
      const shot = (await page.screenshot({ type: 'png', scale: 'css' })).toString('base64');
      await page.evaluate(el => el.remove(), eraser);
      await page.waitForTimeout(200);

      const runs = await page.evaluate(async ({ b64, SENTINEL, ALL, TOKEN }) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0);
        const data = cx.getImageData(0, 0, cv.width, cv.height).data;
        const SX = cv.width / innerWidth, SY = cv.height / innerHeight;

        const srgb = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
        const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);

        /* Every ground pixel under the run, as rendered (glyphs erased). */
        const groundIn = r => {
          const x0 = Math.max(0, Math.floor(r.left * SX)), x1 = Math.min(cv.width, Math.ceil(r.right * SX));
          const y0 = Math.max(0, Math.floor(r.top * SY)), y1 = Math.min(cv.height, Math.ceil(r.bottom * SY));
          const px = [];
          for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
            const i = (y * cv.width + x) * 4;
            px.push([data[i], data[i + 1], data[i + 2]]);
          }
          return px;
        };
        const parseRGBA = v => { const m = (v || '').match(/[\d.]+/g); return m && m.length >= 3 ? [+m[0], +m[1], +m[2], m.length > 3 ? +m[3] : 1] : null; };
        const contrast = (x, y) => { const lx = lum(x), ly = lum(y); return (Math.max(lx, ly) + 0.05) / (Math.min(lx, ly) + 0.05); };
        const opacityOf = el => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; };

        /* Pass 1 — which runs to judge: the ones the token paints (found by the
           sentinel), or with ALL every run that has text of its own. */
        const picked = [];
        for (const el of document.querySelectorAll('.presence-cosmos *')) {
          const st = getComputedStyle(el);
          const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
          let kind = null, side = null;
          if (ALL) {
            if (!text) continue;
            kind = 'text';
          } else {
            const isTextInk = st.color === SENTINEL;
            /* A side counts only if it is drawn. Every element HAS a border colour —
               it defaults to currentColor — so without the width check a borderless
               container whose text is the token (the Portrait's .liquid-glass nav
               capsule, border: none) was reported as a failing border at 1.40:1. */
            side = ['Top', 'Right', 'Bottom', 'Left'].find(sd =>
              st[`border${sd}Color`] === SENTINEL && parseFloat(st[`border${sd}Width`]) > 0 && st[`border${sd}Style`] !== 'none') || null;
            const isBg = st.backgroundColor === SENTINEL;
            if (!isTextInk && !side && !isBg) continue;
            const isSvg = el.tagName.toLowerCase() === 'svg' || el.closest('svg');
            if (isBg && !text) kind = 'bg';
            else if (side && !text) kind = 'border';
            else if (isSvg) kind = 'icon';
            else if (!text) continue;                          // inherits it, paints no glyph
            else kind = 'text';
          }
          if (st.visibility === 'hidden') continue;
          if (el.classList.contains('sr-only') || el.closest('.sr-only')) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;
          if (r.top < 0 || r.bottom > innerHeight) continue;   // covered by another band
          /* Glyph line boxes, not the element box: a sibling dot or rule inside
             the element is foreground, not ground. */
          let boxes = [r];
          if (kind === 'text') {
            boxes = [];
            for (const n of el.childNodes) {
              if (n.nodeType !== 3 || !n.textContent.trim()) continue;
              const rg = document.createRange(); rg.selectNodeContents(n);
              for (const bx of rg.getClientRects()) if (bx.width > 1 && bx.height > 1) boxes.push(bx);
            }
            if (!boxes.length) boxes = [r];
          }
          picked.push({ el, kind, side, boxes, text, size: parseFloat(st.fontSize), weight: st.fontWeight });
        }

        /* Pass 2 — the ink as it actually renders: sentinel off, the element's
           own alpha and every ancestor's opacity included, blended over EACH
           ground pixel and scored there. The darkest pixel is the worst case
           only for dark ink; white text on dark glass is at its worst over the
           LIGHTEST pixel, and a translucent ink changes with every pixel under
           it. Scoring pixel by pixel covers all three with one rule. */
        /* Out of the document, not merely "disabled": the first version looked the
           tag up by its text, found nothing, and scored every run against the
           sentinel itself — rgb(1,2,3), 19:1 on paper — so everything passed. */
        /* Transitions off BEFORE the sentinel comes out. Removing it changes every
           run's colour, which starts a colour transition (even the 0.01ms one the
           reduced-motion rule leaves), and a read in the same task returns the
           transition's START value: the sentinel. The custom property itself does
           not animate, which is why the token resolved correctly while the ink did not. */
        const still = document.createElement('style');
        still.textContent = '*, *::before, *::after { transition: none !important; }';
        document.head.appendChild(still);
        getComputedStyle(document.documentElement).color;   // flush: no transition can start now
        const sentinelTag = document.getElementById('__ink_sentinel');
        if (sentinelTag) sentinelTag.remove();
        /* If the token still resolves to the sentinel, say why, so a leak is diagnosable. */
        const leakDiag = () => `${[...document.querySelectorAll('style')].filter(t => t.textContent.includes('rgb(1,2,3)')).length} sentinel tag(s) still in the page; ` +
          `${TOKEN} resolves to ${picked[0] ? getComputedStyle(picked[0].el).getPropertyValue(TOKEN).trim() : '(no runs)'}`;
        const out = [];
        for (const p of picked) {
          const sel = (p.el.className || p.el.tagName).toString().split(' ').slice(0, 2).join('.').slice(0, 34);
          const text = p.text.replace(/\s+/g, ' ').slice(0, 40);
          if (p.kind === 'bg') { out.push({ sel, kind: 'bg', size: Math.round(p.size), floor: 0, text }); continue; }
          const st = getComputedStyle(p.el);
          const inkStr = p.kind === 'border' ? st[`border${p.side}Color`] : (st.webkitTextFillColor || st.color);
          const rgba = parseRGBA(inkStr);
          if (!rgba) continue;
          const alpha = rgba[3] * opacityOf(p.el);
          if (alpha < 0.05) continue;                          // invisible or gradient-clipped: not a readable run
          const pairs = [];
          for (const bx of p.boxes) {
            if (bx.top < 0 || bx.bottom > innerHeight) continue;
            for (const g of groundIn(bx)) {
              const seen = [0, 1, 2].map(k => rgba[k] * alpha + g[k] * (1 - alpha));
              pairs.push([contrast(seen, g), g]);
            }
          }
          if (!pairs.length) continue;
          pairs.sort((x, y) => x[0] - y[0]);
          const lo = pairs[0], q05 = pairs[Math.floor(pairs.length * 0.05)];
          const mean = [0, 1, 2].map(k => Math.round(pairs.reduce((t, q) => t + q[1][k], 0) / pairs.length));
          const bold = Number(p.weight) >= 700;
          const floor = p.kind === 'text' ? (p.size >= 24 || (bold && p.size >= 18.66) ? 3 : 4.5) : 3;
          out.push({
            sel, kind: p.kind, size: Math.round(p.size), weight: p.weight, floor,
            ink: inkStr, alpha: Math.round(alpha * 1000) / 1000,
            ratioP05: Math.round(q05[0] * 100) / 100, ratioMin: Math.round(lo[0] * 100) / 100,
            worstGround: `rgb(${lo[1].join(',')})`, worstL: lum(lo[1]),
            p05Ground: `rgb(${q05[1].join(',')})`, p05L: lum(q05[1]),
            meanGround: `rgb(${mean.join(',')})`,
            sentinelLeak: inkStr.replace(/\s/g, '') === SENTINEL.replace(/\s/g, ''),
            leakDiag: inkStr.replace(/\s/g, '') === SENTINEL.replace(/\s/g, '') ? leakDiag() : undefined,
            ariaHidden: !!p.el.closest('[aria-hidden="true"]'),
            inactive: !!p.el.closest('[disabled], [aria-disabled="true"]'),
            text,
          });
        }
        if (sentinelTag) document.head.appendChild(sentinelTag);
        getComputedStyle(document.documentElement).color;   // settle the restore while transitions are still off
        still.remove();
        cv.width = cv.height = 0;   // release the raster before the next band
        return out;
      }, { b64: shot, SENTINEL, ALL, TOKEN });

      if (runs.some(r => r.sentinelLeak)) {
        routeReports.push({ route, error: `ink read while the sentinel was still applied (${runs.find(r => r.sentinelLeak).leakDiag}) — scores would be against rgb(1,2,3)` });
        for (const r of runs) if (r.sentinelLeak) { r.ratioP05 = null; r.ratioMin = null; }
      }
      for (const r of runs) { r.route = route; r.scrollY = y; r.tokenValue = routeValue; results.push(r); found++; }
    }
    routeReports.push({ route, runs: found, height: pageH });
    console.log(`  ${route.padEnd(22)} ${found} runs`);
  } catch (e) {
    routeReports.push({ route, error: 'lost the page mid-walk: ' + String(e).split('\n')[0].slice(0, 120) });
    console.log(`  ${route.padEnd(22)} ERROR ${String(e).split('\n')[0].slice(0, 80)}`);
  }
}

const hex = h => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const parseColor = v => {
  if (!v) return null;
  if (v.startsWith('#')) return hex(v);
  const m = v.match(/[\d.]+/g);
  return m && m.length >= 3 ? m.slice(0, 3).map(Number) : null;   // alpha ignored: scoped rgba inks are not scored here
};
const srgb = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const rat = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

const unscored = new Set();
const scored = results.filter(r => r.kind !== 'bg').map(r => {
  if (typeof r.ratioP05 === 'number') return r;   // scored in the page, against the ink as rendered
  const c = parseColor(r.tokenValue);
  if (!c) { unscored.add(`${r.route} (${TOKEN} = "${r.tokenValue}")`); return { ...r, ratioP05: null, ratioMin: null }; }
  const L = lum(c);
  return { ...r, ratioP05: Math.round(rat(L, r.p05L) * 100) / 100, ratioMin: Math.round(rat(L, r.worstL) * 100) / 100 };
});
const inkStr = ALL ? 'each run\'s rendered colour' : ([...new Set(results.map(r => r.tokenValue))].join(', ') || '(no runs)');
if (unscored.size) console.log('COULD NOT SCORE (token unresolved):', [...unscored].join('; '));

const fails = scored.filter(r => r.ratioP05 !== null && r.ratioP05 < r.floor);
const tight = scored.filter(r => r.ratioP05 !== null && r.ratioP05 >= r.floor && r.ratioMin < r.floor);

writeFileSync(join(OUT, 'report.json'), JSON.stringify({ token: TOKEN, value: inkStr, routeReports, results: scored, consoleErrors: [...new Set(consoleErrors)] }, null, 1));
console.log(`\n${TOKEN} = ${inkStr}: ${scored.length} runs measured, ${fails.length} below their WCAG floor`);
for (const c of fails.sort((a, b) => a.ratioP05 - b.ratioP05))
  console.log(`  FAIL ${c.ratioP05.toFixed(2)} (needs ${c.floor})  ${c.route} ${c.sel} ${c.size}px ${c.kind}  on ${c.p05Ground}  "${c.text}"`);
if (tight.length) {
  console.log(`\n${tight.length} pass on the 5th-percentile ground but not on their single darkest pixel:`);
  for (const c of tight) console.log(`  ${c.ratioP05.toFixed(2)} / ${c.ratioMin.toFixed(2)}  ${c.route} ${c.sel} ${c.size}px  "${c.text}"`);
}
const worst = scored.filter(r => r.ratioP05 !== null).sort((a, b) => a.ratioP05 - b.ratioP05)[0];
if (worst) console.log(`\ntightest run overall: ${worst.ratioP05} (floor ${worst.floor})  ${worst.route} ${worst.sel}`);
console.log('console errors:', consoleErrors.length);
await browser.close();
