/**
 * The page eval: what a criterion can be measured by a machine.
 *
 * Walks every route a signed-in person can reach, in a real browser, and records what the
 * criteria in .claude/plans/2026-09-17-platform-review/CRITERIA.md ask for: how many words a
 * screen carries, how many distinct figures, how many grey lines stack under a heading, which
 * design era the page is built in, whether it has a loading, empty and error state, and what
 * it says to the console while it does.
 *
 * It measures; it does not judge. The judgement lives in the review beside it.
 *
 *   BASE=http://127.0.0.1:8087 TOKEN=<access token> node scripts/eval/page-eval.mjs [--only money]
 *
 * The token is an access token for the account being walked. There is no login here on
 * purpose: signing in is its own flow with its own review, and a walk that logs in measures
 * the login page nine times.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8087';
const TOKEN = process.env.TOKEN || '';
const OUT = process.env.OUT || '/tmp/page-eval';
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;

/** The routes a person can reach signed in, in the order the product presents them. */
export const ROUTES = [
  { path: '/money', name: 'money-today', group: 'money' },
  { path: '/money/month', name: 'money-month', group: 'money' },
  { path: '/money/plan', name: 'money-plan', group: 'money' },
  { path: '/money/you', name: 'money-you', group: 'money' },
  { path: '/money/chat', name: 'money-ask', group: 'money' },
  { path: '/money/setup', name: 'money-setup', group: 'money' },
  { path: '/money/insights', name: 'money-insights', group: 'money' },
  { path: '/', name: 'home', group: 'twin' },
  { path: '/today', name: 'today', group: 'twin' },
  { path: '/chat', name: 'chat', group: 'twin' },
  { path: '/you', name: 'you', group: 'twin' },
  { path: '/soul-signature', name: 'soul-signature', group: 'twin' },
  { path: '/connections', name: 'connections', group: 'twin' },
  { path: '/goals', name: 'goals', group: 'twin' },
  { path: '/memories', name: 'memories', group: 'twin' },
  { path: '/journal', name: 'journal', group: 'twin' },
  { path: '/wiki', name: 'wiki', group: 'twin' },
  { path: '/insights/spotify', name: 'insights-spotify', group: 'twin' },
  { path: '/settings', name: 'settings', group: 'settings' },
  { path: '/settings/privacy', name: 'settings-privacy', group: 'settings' },
  { path: '/privacy-spectrum', name: 'privacy-spectrum', group: 'settings' },
  { path: '/onboarding', name: 'onboarding', group: 'entry' },
  { path: '/pricing', name: 'pricing', group: 'entry' },
];

/** Which design era a page is built in, from what it actually renders. */
const ERA_SNIPPET = `(() => {
  const has = (sel) => Boolean(document.querySelector(sel));
  const root = document.querySelector('main') || document.body;
  const styles = [...document.querySelectorAll('*')].slice(0, 1200);
  const shadowed = styles.filter((el) => {
    const s = getComputedStyle(el);
    return (s.boxShadow && s.boxShadow !== 'none') || (s.backdropFilter && s.backdropFilter !== 'none') || /gradient/.test(s.backgroundImage || '');
  }).length;
  const uppercase = styles.filter((el) => {
    const s = getComputedStyle(el);
    return s.textTransform === 'uppercase' && parseFloat(s.letterSpacing || '0') > 0.5 && (el.textContent || '').trim().length > 1;
  }).length;
  const heavy = styles.filter((el) => Number(getComputedStyle(el).fontWeight) > 500 && (el.textContent || '').trim().length > 1).length;
  const serif = styles.filter((el) => /serif/i.test(getComputedStyle(el).fontFamily || '') && !/sans-serif/i.test(getComputedStyle(el).fontFamily || '')).length;
  const text = (root.innerText || '').trim();
  const primaries = document.querySelectorAll('.mv-pill:not(.mv-pill--ghost), .n-btn--primary, .rg-btn--primary').length;
  const subs = document.querySelectorAll('.mv-hero .mv-sub, .rs-sub').length;
  const sections = [...document.querySelectorAll('.mv-section, .rg-section')].map((el) => Math.round(parseFloat(getComputedStyle(el).marginTop)));
  return {
    era: has('.mv, [class*="rg-"]') ? 'register' : has('[class*="claura-"]') ? 'claura' : has('.n-page, [class*="n-btn"]') ? 'nocturne' : 'other',
    words: text ? text.split(/\\s+/).filter(Boolean).length : 0,
    figures: (text.match(/\\d[\\d.,]*\\s?(€|%)/g) || []).length,
    headings: document.querySelectorAll('main h1, main h2').length,
    buttons: document.querySelectorAll('main button, main a[role="button"]').length,
    inkPrimaries: primaries,
    greyLinesUnderHero: subs,
    sections,
    shadowed,
    uppercase,
    heavy,
    serif,
    spinnerStill: document.querySelectorAll('.mv-wait, [aria-busy="true"]').length,
    emptyWords: text.length < 40 ? text.slice(0, 80) : null,
  };
})()`;

async function walk() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  if (TOKEN) {
    await ctx.addInitScript((t) => {
      try { sessionStorage.setItem('oauth_bootstrap_token', t); } catch { /* seeded per page */ }
    }, TOKEN);
  }
  const page = await ctx.newPage();
  const report = { at: new Date().toISOString(), base: BASE, pages: {} };

  for (const route of ROUTES.filter((r) => !only || r.group === only)) {
    const errors = [];
    const failed = [];
    const onConsole = (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); };
    const onResponse = (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().split('/api/')[1] || r.url()}`.slice(0, 80)); };
    page.on('console', onConsole);
    page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 160)}`));
    page.on('response', onResponse);

    const t0 = Date.now();
    let measured = null;
    try {
      await page.goto(`${BASE}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1200);
      /* The onboarding drops a dialog over the product a few seconds in; Escape rests it. */
      for (let i = 0; i < 4 && (await page.locator('.la[role="dialog"]').count()); i += 1) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(350);
      }
      /* Wait for the page to have something to say rather than for a fixed time: two pages
         take four seconds to paint locally, and a short wait scored them as hanging when
         they were only slow (2026-09-17). */
      await page.waitForFunction(
        () => {
          const main = document.querySelector('main') || document.body;
          const text = (main.innerText || '').trim();
          return text.split(/\s+/).filter(Boolean).length > 25 && !document.querySelector('.mv-wait');
        },
        { timeout: 15000 },
      ).catch(() => { /* recorded as still waiting below */ });
      await page.waitForTimeout(800);
      measured = await page.evaluate(ERA_SNIPPET);
      await page.screenshot({ path: `${OUT}/${route.name}.png`, fullPage: true });
    } catch (error) {
      measured = { crashed: String(error).slice(0, 160) };
    }
    report.pages[route.name] = { ...route, ms: Date.now() - t0, ...measured, errors: errors.slice(0, 6), failedRequests: [...new Set(failed)].slice(0, 6) };
    page.off('console', onConsole);
    page.off('response', onResponse);
  }

  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  /* One line per page, so a person can read the sweep without opening the file. */
  for (const [name, p] of Object.entries(report.pages)) {
    if (p.crashed) { console.log(`${name.padEnd(18)} CRASHED ${p.crashed}`); continue; }
    console.log([
      name.padEnd(18),
      String(p.era).padEnd(9),
      `${String(p.words).padStart(4)}w`,
      `${String(p.figures).padStart(3)}fig`,
      `${p.inkPrimaries}pri`,
      `${p.greyLinesUnderHero}grey`,
      p.shadowed ? `${p.shadowed}shadow` : '       ',
      p.uppercase ? `${p.uppercase}caps` : '     ',
      p.serif ? `${p.serif}serif` : '      ',
      p.spinnerStill ? 'STILL-WAITING' : '',
      p.errors.length ? `${p.errors.length} console` : '',
      p.failedRequests.length ? `HTTP ${p.failedRequests[0]}` : '',
    ].join(' '));
  }
  await browser.close();
}

walk().catch((e) => { console.error(e); process.exit(1); });
