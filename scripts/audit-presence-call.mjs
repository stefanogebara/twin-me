/**
 * Presence call-page audit.
 *
 * /call/:token is her screen. It cannot be reached without minting a real call
 * token against the production Presence record, so this stubs the two GET
 * endpoints at the network layer instead: the real React component, the real
 * stylesheets, the real states — and nothing written to anyone's data.
 *
 * The `live` state needs an ElevenLabs WebRTC session, which cannot be faked.
 * Its markup is injected into the mounted page so the CSS is exercised; that is
 * a CSS check, not a check of the live call, and the report says so.
 *
 * Usage: node scripts/audit-presence-call.mjs [outDir]
 */
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const OUT = process.argv[2] || '/tmp/presence-call-audit';
mkdirSync(OUT, { recursive: true });

const CONFIG = {
  agent_id: 'agent_test', prompt: 'x', first_message: 'Oi.', language: 'pt',
  cared_for_name: 'Sofia', caller_name: 'Ana', voice_id: null,
};
const HOME = {
  waiting_notes: 2,
  conversations: [
    { id: '1', started_at: new Date(Date.now() - 3600e3).toISOString(),
      recap: 'Falamos do bolo de fubá da sua mãe e de como a chuva atrapalhou a horta.' },
    { id: '2', started_at: new Date(Date.now() - 26 * 3600e3).toISOString(),
      recap: 'Você contou a história do trem para Petrópolis, e riu do chapéu do seu pai.' },
  ],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, colorScheme: 'light' });
await ctx.route('**/presence-call/**', route => {
  const u = route.request().url();
  if (u.endsWith('/home')) return route.fulfill({ json: { home: HOME } });
  if (/presence-call\/[^/]+$/.test(u)) return route.fulfill({ json: { call: CONFIG } });
  return route.fulfill({ json: { ok: true } });
});
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
page.on('pageerror', e => errs.push('pageerror: ' + String(e).slice(0, 160)));

await page.goto('http://localhost:8086/call/demo-token', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.pc-call-cta', { timeout: 30000 });
await page.waitForTimeout(900);

/* Contrast: this page is flat paper, so the ground is each element's own
   ancestor background over --c-paper. No photograph to sample. */
const CHECK = () => {
  const lum = ([r, g, b]) => {
    const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const PAPER = [247, 245, 243];
  const out = { contrast: [], sizes: {}, families: {}, radii: {}, shadows: [], gradients: [], hairlines: [] };
  const seen = new Set();
  document.querySelectorAll('.pc-call *').forEach(el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (r.width < 2 || r.height < 2 || s.visibility === 'hidden' || s.opacity === '0') return;
    if (s.borderRadius !== '0px') out.radii[s.borderRadius] = (out.radii[s.borderRadius] || 0) + 1;
    if (s.boxShadow !== 'none') out.shadows.push(s.boxShadow.slice(0, 70));
    if (/gradient/.test(s.backgroundImage)) out.gradients.push(((el.className||'')+'').split(' ')[0] + ': ' + s.backgroundImage.slice(0, 60));
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const w = parseFloat(s['border' + side + 'Width']);
      if (w > 0 && w < 1) out.hairlines.push(`${((el.className||'')+'').split(' ')[0]} border-${side.toLowerCase()}: ${w}px`);
    }
    const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    if (!text) return;
    const size = parseFloat(s.fontSize);
    out.sizes[Math.round(size * 100) / 100] = (out.sizes[Math.round(size * 100) / 100] || 0) + 1;
    out.families[s.fontFamily.split(',')[0].replace(/["']/g, '')] = 1;
    let ground = PAPER;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor.match(/[\d.]+/g);
      if (!c) continue;
      const a = c.length > 3 ? Number(c[3]) : 1;
      if (a > 0) { ground = ground.map((v, k) => Number(c[k]) * a + v * (1 - a)); break; }
    }
    const ink = s.color.match(/[\d.]+/g).slice(0, 3).map(Number);
    const li = lum(ink), lg = lum(ground);
    const ratio = (Math.max(li, lg) + 0.05) / (Math.min(li, lg) + 0.05);
    const bold = Number(s.fontWeight) >= 700;
    const floor = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    const key = `${el.className}|${Math.round(size)}|${s.color}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.contrast.push({
      sel: ((el.className || el.tagName) + '').split(' ').slice(0, 2).join('.').slice(0, 30),
      size: Math.round(size), floor, ratio: Math.round(ratio * 100) / 100,
      ink: `rgb(${ink.join(',')})`, ground: `rgb(${ground.map(v => Math.round(v)).join(',')})`,
      text: text.replace(/\s+/g, ' ').slice(0, 30),
    });
  });
  out.shadows = [...new Set(out.shadows)];
  out.gradients = [...new Set(out.gradients)];
  out.hairlines = [...new Set(out.hairlines)];
  return out;
};

const report = {};
report.ready = await page.evaluate(CHECK);
await page.screenshot({ path: join(OUT, 'call-ready.png'), fullPage: true });

// the explain card
await page.getByRole('button', { name: 'Quem está falando?' }).click();
await page.waitForTimeout(400);
report.explain = await page.evaluate(CHECK);
await page.screenshot({ path: join(OUT, 'call-explain.png'), fullPage: true });

/* CSS-only check of the live state: the real markup, injected. */
await page.evaluate(() => {
  const stage = document.querySelector('.pc-call-stage');
  stage.classList.add('is-live');
  stage.innerHTML = `
    <div class="pc-orb is-speaking"></div>
    <p class="pc-call-status">Falando com você…</p>
    <div class="pc-transcript">
      <div class="pc-transcript-row"><span>Presença de Ana</span><p>Oi, Sofia. Como foi o seu dia hoje?</p></div>
      <div class="pc-transcript-row is-user"><span>Sofia</span><p>Foi bom. Fui na feira de manhã, comprei mamão.</p></div>
      <div class="pc-transcript-row"><span>Presença de Ana</span><p>Que bom. A feira estava cheia?</p></div>
    </div>
    <div class="pc-call-actions"><button class="pc-call-cta pc-call-cta--ghost">Terminar a conversa</button></div>`;
});
await page.waitForTimeout(500);
report.live = await page.evaluate(CHECK);
/* The orb's cloud is a gradient on a pseudo-element. Read it back per state:
   a mistyped colour function drops the whole declaration silently, and the
   result looks like a design choice rather than a bug. */
report.orb = await page.evaluate(async () => {
  const orb = document.querySelector('.pc-orb');
  const out = {};
  for (const cls of ['', 'is-listening', 'is-speaking']) {
    orb.className = 'pc-orb' + (cls ? ' ' + cls : '');
    // the cloud transitions over 340ms; reading immediately reports the
    // previous state mid-flight, which is a lie about the resting value
    await new Promise(r => setTimeout(r, 500));
    const s = getComputedStyle(orb, '::before');
    out[cls || 'idle'] = {
      background: s.backgroundImage.slice(0, 90),
      transform: s.transform,
      animation: s.animationName,
    };
  }
  const own = getComputedStyle(orb);
  out.ring = { border: own.borderTopWidth + ' ' + own.borderTopColor, shadow: own.boxShadow, bg: own.backgroundImage };
  return out;
});
await page.screenshot({ path: join(OUT, 'call-live.png'), fullPage: true });

report.consoleErrors = [...new Set(errs)];
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));

for (const state of ['ready', 'explain', 'live']) {
  const r = report[state];
  const fails = r.contrast.filter(c => c.ratio < c.floor);
  console.log(`\n[${state}]${state === 'live' ? '  (injected markup — CSS only, not a live call)' : ''}`);
  console.log('  sizes:', Object.entries(r.sizes).sort((a,b)=>b[0]-a[0]).map(([k,v])=>`${k}x${v}`).join(' '));
  console.log('  families:', Object.keys(r.families).join(', '));
  console.log('  radii:', Object.entries(r.radii).map(([k,v])=>`${k}x${v}`).join(' '));
  console.log('  shadows:', r.shadows.length, ' gradients:', r.gradients.length, r.gradients.slice(0,3));
  console.log('  sub-1px borders:', r.hairlines.length, r.hairlines.slice(0, 4));
  console.log(`  contrast: ${r.contrast.length} runs, ${fails.length} below floor`);
  for (const f of fails) console.log(`    FAIL ${f.ratio} (needs ${f.floor}) ${f.sel} ${f.size}px ${f.ink} on ${f.ground} "${f.text}"`);
}
console.log('\norb (gradient must resolve, not drop):');
for (const [k, v] of Object.entries(report.orb)) console.log(' ', k, JSON.stringify(v));
console.log('\nconsole errors:', report.consoleErrors.length, report.consoleErrors.slice(0, 4));
await browser.close();
