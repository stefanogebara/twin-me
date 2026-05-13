#!/usr/bin/env node
/**
 * Pluggy credential capture using REAL Chrome (not bundled Chromium).
 *
 * Why this exists: Google blocks OAuth sign-in from Playwright's default
 * Chromium with "signin/rejected" because it sets --enable-automation and
 * the User-Agent reveals HeadlessChrome traits. Launching the installed
 * Chrome binary AND stripping the automation flags is enough to pass
 * Google's heuristic in interactive (visible) mode.
 *
 * Flow: same as pluggy-open.mjs — open dashboard, poll URL for sign-in,
 * scrape API page, write to .env. Just with real Chrome + stealth flags.
 *
 * Run: node scripts/pluggy-chrome.mjs
 */

import { chromium } from 'playwright';
import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const ENV_PATH = join(ROOT, '.env');
const PROFILE_DIR = join(ROOT, '.playwright-user-data', 'pluggy-chrome');
const DEBUG_DIR = join(ROOT, '.playwright-user-data', 'debug');

const PLUGGY_DASHBOARD = 'https://dashboard.pluggy.ai';
const SIGNIN_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;
const SIGNED_IN_REGEX = /dashboard\.pluggy\.ai\/(overview|applications|api|settings|home|dashboard)/i;
const UUID_REGEX = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;

async function fileExists(p) { try { await access(p); return true; } catch { return false; } }

async function writeEnvKey(envText, key, value) {
  const lineRegex = new RegExp(`^${key}=.*$`, 'm');
  if (lineRegex.test(envText)) return envText.replace(lineRegex, `${key}=${value}`);
  const marker = '# --- Financial-Emotional Twin (bank integrations) ---';
  if (envText.includes(marker)) return envText.replace(marker, `${marker}\n${key}=${value}`);
  return envText.trimEnd() + `\n\n# Added by scripts/pluggy-chrome.mjs\n${key}=${value}\n`;
}

const maskSecret = (s) => (!s || s.length < 8) ? '***' : `${s.slice(0, 4)}…${s.slice(-4)}`;

async function main() {
  console.log('[pluggy-chrome] Launching real Chrome (not Chromium).');
  console.log('[pluggy-chrome] Sign in with your Google account in the window that opens.');
  await mkdir(DEBUG_DIR, { recursive: true });

  let context;
  try {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      channel: 'chrome',  // <- real Chrome binary, not bundled Chromium
      headless: false,
      viewport: { width: 1280, height: 800 },
      // Strip automation-detection flags Google uses to block OAuth.
      // --enable-automation in particular is what causes "signin/rejected".
      ignoreDefaultArgs: ['--enable-automation'],
      args: ['--disable-blink-features=AutomationControlled'],
    });
  } catch (err) {
    console.error('[pluggy-chrome] Could not launch Chrome:', err.message);
    console.error('[pluggy-chrome] Make sure Chrome is installed at the default location.');
    process.exit(2);
  }

  // Stealth: override navigator.webdriver which Playwright always sets to true
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(PLUGGY_DASHBOARD, { waitUntil: 'domcontentloaded' }).catch(() => {});

  const deadline = Date.now() + SIGNIN_TIMEOUT_MS;
  let signedIn = false;
  let lastUrl = '';
  while (Date.now() < deadline) {
    const url = page.url();
    if (url !== lastUrl) {
      console.log(`[pluggy-chrome] At: ${url.slice(0, 100)}`);
      lastUrl = url;
    }
    if (SIGNED_IN_REGEX.test(url)) {
      signedIn = true;
      break;
    }
    // Surface Google's rejection in logs early so we don't wait 5min for nothing
    if (/signin\/rejected/i.test(url)) {
      console.error('[pluggy-chrome] Google still rejected sign-in even with stealth flags.');
      console.error('[pluggy-chrome] Falling back: paste your credentials manually instead.');
      await context.close();
      process.exit(4);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  if (!signedIn) {
    console.error('[pluggy-chrome] Timed out waiting for sign-in.');
    await context.close();
    process.exit(3);
  }

  console.log('[pluggy-chrome] ✓ Signed in. Scraping API credentials...');
  await page.waitForTimeout(2000);

  const candidates = ['/applications', '/api', '/api-keys', '/settings/api', '/credentials', '/settings'];
  let clientId = null;
  let clientSecret = null;

  for (const path of candidates) {
    const url = `${PLUGGY_DASHBOARD}${path}`;
    console.log(`[pluggy-chrome] → ${url}`);
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
    if (!resp) continue;
    await page.waitForTimeout(2500);

    const revealBtns = await page.getByRole('button', { name: /reveal|show|copy|view/i }).all().catch(() => []);
    for (const btn of revealBtns.slice(0, 5)) {
      await btn.click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(400);
    }

    const safe = path.replace(/\//g, '_') || 'root';
    await page.screenshot({ path: join(DEBUG_DIR, `${safe}.png`), fullPage: true }).catch(() => {});
    const html = await page.content().catch(() => '');
    if (html) await writeFile(join(DEBUG_DIR, `${safe}.html`), html, 'utf8').catch(() => {});

    const data = await page.evaluate(() => {
      const text = document.body.innerText || '';
      const inputs = Array.from(document.querySelectorAll('input')).map((i) => ({
        value: i.value || '', placeholder: i.placeholder || '', aria: i.getAttribute('aria-label') || '',
      }));
      const codes = Array.from(document.querySelectorAll('code, pre, [class*="mono"], [class*="copy"]'))
        .map((c) => c.textContent || '');
      return { text, inputs, codes };
    }).catch(() => ({ text: '', inputs: [], codes: [] }));

    const haystack = [data.text, ...data.inputs.flatMap((i) => [i.value, i.placeholder, i.aria]), ...data.codes]
      .filter(Boolean).join('\n');

    const uuids = (haystack.match(new RegExp(UUID_REGEX.source, 'gi')) || [])
      .filter((s, i, arr) => arr.indexOf(s) === i);

    if (!clientId && uuids.length > 0) {
      clientId = uuids[0];
      console.log(`[pluggy-chrome]   CLIENT_ID candidate: ${maskSecret(clientId)}`);
    }
    if (clientId && !clientSecret) {
      const second = uuids.find((u) => u !== clientId);
      if (second) {
        clientSecret = second;
        console.log(`[pluggy-chrome]   CLIENT_SECRET candidate: ${maskSecret(clientSecret)}`);
      }
    }
    if (!clientSecret) {
      const tokens = (haystack.match(/[A-Za-z0-9_\-]{32,}/g) || [])
        .filter((t) => t.length >= 32 && t !== clientId && !UUID_REGEX.test(t));
      if (tokens.length > 0) {
        clientSecret = tokens[0];
        console.log(`[pluggy-chrome]   CLIENT_SECRET candidate (non-uuid): ${maskSecret(clientSecret)}`);
      }
    }
    if (clientId && clientSecret) break;
  }

  await context.close();

  if (!clientId || !clientSecret) {
    console.error('[pluggy-chrome] Auto-detection incomplete.');
    console.error(`  CLIENT_ID:     ${clientId ? maskSecret(clientId) : '(not found)'}`);
    console.error(`  CLIENT_SECRET: ${clientSecret ? maskSecret(clientSecret) : '(not found)'}`);
    console.error('  Debug dumps:', DEBUG_DIR);
    process.exit(1);
  }

  if (!(await fileExists(ENV_PATH))) {
    console.error('[pluggy-chrome] .env not found at', ENV_PATH);
    process.exit(2);
  }

  let env = await readFile(ENV_PATH, 'utf8');
  env = await writeEnvKey(env, 'PLUGGY_CLIENT_ID', clientId);
  env = await writeEnvKey(env, 'PLUGGY_CLIENT_SECRET', clientSecret);
  env = await writeEnvKey(env, 'PLUGGY_ENV', 'sandbox');
  await writeFile(ENV_PATH, env, 'utf8');

  console.log('[pluggy-chrome] ✓ Wrote PLUGGY_CLIENT_ID + PLUGGY_CLIENT_SECRET + PLUGGY_ENV=sandbox to .env');
}

main().catch((err) => { console.error('[pluggy-chrome] Crashed:', err); process.exit(1); });
