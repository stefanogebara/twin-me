#!/usr/bin/env node
/**
 * Non-interactive Pluggy credential scraper.
 *
 * Reuses the persistent Playwright profile created by pluggy-setup.mjs.
 * Assumes the user is already signed in. Navigates the dashboard's
 * credential-bearing routes and writes CLIENT_ID + CLIENT_SECRET to .env.
 *
 * If Pluggy's URL structure differs from what we try, the script logs
 * the full page text from /applications and /overview so we can see
 * what the real route is.
 *
 * Run: node scripts/pluggy-scrape.mjs
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

async function fileExists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function writeEnvKey(envText, key, value) {
  const lineRegex = new RegExp(`^${key}=.*$`, 'm');
  if (lineRegex.test(envText)) return envText.replace(lineRegex, `${key}=${value}`);
  const sectionMarker = '# --- Financial-Emotional Twin (bank integrations) ---';
  if (envText.includes(sectionMarker)) {
    return envText.replace(sectionMarker, `${sectionMarker}\n${key}=${value}`);
  }
  return envText.trimEnd() + `\n\n# Added by scripts/pluggy-scrape.mjs\n${key}=${value}\n`;
}

function maskSecret(s) {
  if (!s || s.length < 8) return '***';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

async function main() {
  console.log('[pluggy-scrape] Using profile:', PROFILE_DIR);
  await mkdir(DEBUG_DIR, { recursive: true });

  let context;
  try {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,  // visible so user can see what's happening
      viewport: { width: 1280, height: 800 },
    });
  } catch (err) {
    console.error('[pluggy-scrape] Could not open profile:', err.message);
    console.error('[pluggy-scrape] If you have another browser window open using this profile,');
    console.error('[pluggy-scrape] close it (the one pluggy-setup opened) and re-run this script.');
    process.exit(2);
  }

  const page = context.pages()[0] ?? await context.newPage();

  // Try common credential pages in order
  const candidatePaths = [
    '/applications',
    '/overview',
    '/api',
    '/api-keys',
    '/settings/api',
    '/credentials',
    '/settings',
  ];

  const UUID_REGEX = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;
  let clientId = null;
  let clientSecret = null;

  for (const path of candidatePaths) {
    const url = `${PLUGGY_DASHBOARD}${path}`;
    console.log(`[pluggy-scrape] → ${url}`);
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2500);
      const status = resp?.status() ?? 0;

      // Bailed back to login? Skip — user isn't actually signed in.
      const currentUrl = page.url();
      if (/sign-?in|login|auth/i.test(currentUrl) && !currentUrl.includes('dashboard.pluggy.ai')) {
        console.log(`[pluggy-scrape]   Redirected to login — not signed in yet.`);
        break;
      }

      console.log(`[pluggy-scrape]   status ${status} | url: ${currentUrl}`);

      // Drop a screenshot + html dump for debugging
      const safeName = path.replace(/\//g, '_') || 'root';
      await page.screenshot({ path: join(DEBUG_DIR, `${safeName}.png`), fullPage: true }).catch(() => {});
      const html = await page.content();
      await writeFile(join(DEBUG_DIR, `${safeName}.html`), html, 'utf8').catch(() => {});

      // Strategy A: look for the API page's typical layout — "Client ID" label
      // next to a UUID-shaped value. Also look for buttons that reveal secrets.
      const revealButtons = await page.getByRole('button', { name: /reveal|show|copy|view/i }).all();
      for (const btn of revealButtons.slice(0, 5)) {
        await btn.click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(500);
      }

      // Strategy B: grab everything textual from the page
      const pageData = await page.evaluate(() => {
        const text = document.body.innerText || '';
        const inputs = Array.from(document.querySelectorAll('input')).map((i) => ({
          name: i.name || '',
          value: i.value || '',
          type: i.type || '',
          placeholder: i.placeholder || '',
          aria: i.getAttribute('aria-label') || '',
        }));
        const codes = Array.from(document.querySelectorAll('code, pre, [class*="mono"], [class*="copy"]')).map((c) => c.textContent || '');
        return { text, inputs, codes };
      });

      // Score candidates: UUID for CLIENT_ID, anything 32+ chars that ISN'T a UUID for SECRET
      const haystack = [
        pageData.text,
        ...pageData.inputs.flatMap((i) => [i.value, i.placeholder, i.aria]),
        ...pageData.codes,
      ].filter(Boolean).join('\n');

      const uuids = (haystack.match(new RegExp(UUID_REGEX.source, 'gi')) || [])
        .filter((s, i, arr) => arr.indexOf(s) === i);  // dedupe

      if (!clientId && uuids.length > 0) {
        clientId = uuids[0];
        console.log(`[pluggy-scrape]   Captured CLIENT_ID candidate: ${maskSecret(clientId)}`);
      }

      // Pluggy's CLIENT_SECRET is also UUID-shaped (separate from CLIENT_ID)
      if (clientId && !clientSecret) {
        const second = uuids.find((u) => u !== clientId);
        if (second) {
          clientSecret = second;
          console.log(`[pluggy-scrape]   Captured CLIENT_SECRET candidate: ${maskSecret(clientSecret)}`);
        }
      }

      // Also check for non-UUID secret-shaped strings (some APIs use opaque tokens)
      if (!clientSecret) {
        const tokens = (haystack.match(/[A-Za-z0-9_\-]{32,}/g) || [])
          .filter((t) => t.length >= 32 && t !== clientId && !UUID_REGEX.test(t));
        if (tokens.length > 0) {
          clientSecret = tokens[0];
          console.log(`[pluggy-scrape]   Captured CLIENT_SECRET candidate (non-uuid): ${maskSecret(clientSecret)}`);
        }
      }

      if (clientId && clientSecret) break;
    } catch (err) {
      console.log(`[pluggy-scrape]   Skipped: ${err.message}`);
    }
  }

  await context.close();

  if (!clientId || !clientSecret) {
    console.log('');
    console.log('[pluggy-scrape] Auto-detection incomplete.');
    console.log('[pluggy-scrape] CLIENT_ID:    ', clientId ? maskSecret(clientId) : '(not found)');
    console.log('[pluggy-scrape] CLIENT_SECRET:', clientSecret ? maskSecret(clientSecret) : '(not found)');
    console.log('[pluggy-scrape] Screenshots + HTML dumps written to:', DEBUG_DIR);
    console.log('[pluggy-scrape] Run npm run pluggy:setup for the interactive fallback.');
    process.exit(1);
  }

  if (!(await fileExists(ENV_PATH))) {
    console.error('[pluggy-scrape] .env not found at', ENV_PATH);
    process.exit(2);
  }

  let env = await readFile(ENV_PATH, 'utf8');
  env = await writeEnvKey(env, 'PLUGGY_CLIENT_ID', clientId);
  env = await writeEnvKey(env, 'PLUGGY_CLIENT_SECRET', clientSecret);
  env = await writeEnvKey(env, 'PLUGGY_ENV', 'sandbox');
  await writeFile(ENV_PATH, env, 'utf8');

  console.log('');
  console.log('[pluggy-scrape] ✓ Wrote PLUGGY_CLIENT_ID + PLUGGY_CLIENT_SECRET + PLUGGY_ENV=sandbox to .env');
  console.log('[pluggy-scrape] Restart your backend (npm run server:dev) and tell me to run the diagnostic.');
}

main().catch((err) => {
  console.error('[pluggy-scrape] Crashed:', err);
  process.exit(1);
});
