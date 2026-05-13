#!/usr/bin/env node
/**
 * Open Pluggy dashboard in a visible Playwright browser and auto-scrape
 * credentials once the user signs in. No terminal interaction — uses
 * URL polling instead of readline so the script can run from anywhere.
 *
 * Flow:
 *   1. Launch Chromium (visible) at https://dashboard.pluggy.ai
 *   2. Poll the URL every 2s. Wait for /overview, /applications, or
 *      similar — any dashboard route that means "user is signed in".
 *   3. Once detected, navigate the credential-bearing pages and scrape
 *      CLIENT_ID / CLIENT_SECRET.
 *   4. Write to .env. Close browser. Exit.
 *
 * Times out after 5 minutes of waiting at login.
 *
 * Run: node scripts/pluggy-open.mjs
 */

import { chromium } from 'playwright';
import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const ENV_PATH = join(ROOT, '.env');
const PROFILE_DIR = join(ROOT, '.playwright-user-data', 'pluggy');
const DEBUG_DIR = join(ROOT, '.playwright-user-data', 'debug');

const PLUGGY_DASHBOARD = 'https://dashboard.pluggy.ai';
const SIGNIN_TIMEOUT_MS = 5 * 60 * 1000;  // 5 min — plenty for OAuth dance
const POLL_INTERVAL_MS = 2000;
const SIGNED_IN_REGEX = /dashboard\.pluggy\.ai\/(overview|applications|api|settings|home|dashboard)/i;
const UUID_REGEX = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;

async function fileExists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function writeEnvKey(envText, key, value) {
  const lineRegex = new RegExp(`^${key}=.*$`, 'm');
  if (lineRegex.test(envText)) return envText.replace(lineRegex, `${key}=${value}`);
  const sectionMarker = '# --- Financial-Emotional Twin (bank integrations) ---';
  if (envText.includes(sectionMarker)) {
    return envText.replace(sectionMarker, `${sectionMarker}\n${key}=${value}`);
  }
  return envText.trimEnd() + `\n\n# Added by scripts/pluggy-open.mjs\n${key}=${value}\n`;
}

function maskSecret(s) {
  if (!s || s.length < 8) return '***';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

async function main() {
  console.log('[pluggy-open] Launching visible browser. Sign in with your Pluggy account.');
  console.log('[pluggy-open] Profile:', PROFILE_DIR);
  await mkdir(DEBUG_DIR, { recursive: true });

  let context;
  try {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      viewport: { width: 1280, height: 800 },
    });
  } catch (err) {
    console.error('[pluggy-open] Could not launch:', err.message);
    console.error('[pluggy-open] Close any browser window using this profile and retry.');
    process.exit(2);
  }

  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(PLUGGY_DASHBOARD, { waitUntil: 'domcontentloaded' }).catch(() => {});

  // ── Poll for sign-in
  const deadline = Date.now() + SIGNIN_TIMEOUT_MS;
  let signedIn = false;
  let lastLogged = '';
  while (Date.now() < deadline) {
    const url = page.url();
    if (url !== lastLogged) {
      console.log(`[pluggy-open] At: ${url}`);
      lastLogged = url;
    }
    if (SIGNED_IN_REGEX.test(url)) {
      signedIn = true;
      break;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  if (!signedIn) {
    console.error('[pluggy-open] Timed out waiting for sign-in. Exiting.');
    await context.close();
    process.exit(3);
  }

  console.log('[pluggy-open] ✓ Signed in detected. Searching credentials...');
  await page.waitForTimeout(2000);

  // ── Walk likely credential pages
  const candidates = ['/applications', '/api', '/api-keys', '/settings/api', '/credentials', '/settings'];
  let clientId = null;
  let clientSecret = null;

  for (const path of candidates) {
    const url = `${PLUGGY_DASHBOARD}${path}`;
    console.log(`[pluggy-open] → ${url}`);
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
    if (!resp) continue;
    await page.waitForTimeout(2500);

    // Click any reveal/show/copy buttons to surface masked secrets
    const revealBtns = await page.getByRole('button', { name: /reveal|show|copy|view/i }).all().catch(() => []);
    for (const btn of revealBtns.slice(0, 5)) {
      await btn.click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(400);
    }

    const safe = path.replace(/\//g, '_') || 'root';
    await page.screenshot({ path: join(DEBUG_DIR, `${safe}.png`), fullPage: true }).catch(() => {});
    const html = await page.content().catch(() => '');
    if (html) await writeFile(join(DEBUG_DIR, `${safe}.html`), html, 'utf8').catch(() => {});

    const pageData = await page.evaluate(() => {
      const text = document.body.innerText || '';
      const inputs = Array.from(document.querySelectorAll('input')).map((i) => ({
        value: i.value || '',
        placeholder: i.placeholder || '',
        aria: i.getAttribute('aria-label') || '',
      }));
      const codes = Array.from(document.querySelectorAll('code, pre, [class*="mono"], [class*="copy"]'))
        .map((c) => c.textContent || '');
      return { text, inputs, codes };
    }).catch(() => ({ text: '', inputs: [], codes: [] }));

    const haystack = [
      pageData.text,
      ...pageData.inputs.flatMap((i) => [i.value, i.placeholder, i.aria]),
      ...pageData.codes,
    ].filter(Boolean).join('\n');

    const uuids = (haystack.match(new RegExp(UUID_REGEX.source, 'gi')) || [])
      .filter((s, i, arr) => arr.indexOf(s) === i);

    if (!clientId && uuids.length > 0) {
      clientId = uuids[0];
      console.log(`[pluggy-open]   CLIENT_ID candidate: ${maskSecret(clientId)}`);
    }
    if (clientId && !clientSecret) {
      const second = uuids.find((u) => u !== clientId);
      if (second) {
        clientSecret = second;
        console.log(`[pluggy-open]   CLIENT_SECRET candidate: ${maskSecret(clientSecret)}`);
      }
    }
    if (!clientSecret) {
      const tokens = (haystack.match(/[A-Za-z0-9_\-]{32,}/g) || [])
        .filter((t) => t.length >= 32 && t !== clientId && !UUID_REGEX.test(t));
      if (tokens.length > 0) {
        clientSecret = tokens[0];
        console.log(`[pluggy-open]   CLIENT_SECRET candidate (non-uuid): ${maskSecret(clientSecret)}`);
      }
    }

    if (clientId && clientSecret) break;
  }

  await context.close();

  if (!clientId || !clientSecret) {
    console.error('[pluggy-open] Auto-detection incomplete.');
    console.error(`[pluggy-open]   CLIENT_ID:     ${clientId ? maskSecret(clientId) : '(not found)'}`);
    console.error(`[pluggy-open]   CLIENT_SECRET: ${clientSecret ? maskSecret(clientSecret) : '(not found)'}`);
    console.error('[pluggy-open] Debug dumps:', DEBUG_DIR);
    process.exit(1);
  }

  if (!(await fileExists(ENV_PATH))) {
    console.error('[pluggy-open] .env not found at', ENV_PATH);
    process.exit(2);
  }

  let env = await readFile(ENV_PATH, 'utf8');
  env = await writeEnvKey(env, 'PLUGGY_CLIENT_ID', clientId);
  env = await writeEnvKey(env, 'PLUGGY_CLIENT_SECRET', clientSecret);
  env = await writeEnvKey(env, 'PLUGGY_ENV', 'sandbox');
  await writeFile(ENV_PATH, env, 'utf8');

  console.log('[pluggy-open] ✓ Wrote PLUGGY_CLIENT_ID + PLUGGY_CLIENT_SECRET + PLUGGY_ENV=sandbox to .env');
}

main().catch((err) => {
  console.error('[pluggy-open] Crashed:', err);
  process.exit(1);
});
