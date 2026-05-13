#!/usr/bin/env node
/**
 * Pluggy setup via Playwright.
 *
 * Opens https://dashboard.pluggy.ai in a visible browser. You sign up or
 * sign in. Once you're inside the dashboard, this script scrapes your
 * CLIENT_ID + CLIENT_SECRET from the API settings page and writes them
 * into .env automatically (under the section .env.example documents).
 *
 * No credentials are ever stored in the repo, in source, or in logs.
 * The .env file is gitignored.
 *
 * Run:
 *   node scripts/pluggy-setup.mjs
 *
 * If you already have the values, skip this and paste them into .env
 * manually — both paths produce the same result.
 */

import { chromium } from 'playwright';
import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const ENV_PATH = join(ROOT, '.env');
const PROFILE_DIR = join(ROOT, '.playwright-user-data', 'pluggy');

const PLUGGY_DASHBOARD = 'https://dashboard.pluggy.ai';

async function fileExists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function readEnv() {
  if (!(await fileExists(ENV_PATH))) {
    throw new Error(`.env not found at ${ENV_PATH}`);
  }
  return readFile(ENV_PATH, 'utf8');
}

async function writeEnvKey(envText, key, value) {
  const lineRegex = new RegExp(`^${key}=.*$`, 'm');
  if (lineRegex.test(envText)) {
    return envText.replace(lineRegex, `${key}=${value}`);
  }
  // Append in the bank-integration section if present, else at end
  const sectionMarker = '# --- Financial-Emotional Twin (bank integrations) ---';
  if (envText.includes(sectionMarker)) {
    return envText.replace(sectionMarker, `${sectionMarker}\n${key}=${value}`);
  }
  return envText.trimEnd() + `\n\n# Added by scripts/pluggy-setup.mjs\n${key}=${value}\n`;
}

async function persistCreds(clientId, clientSecret) {
  let env = await readEnv();
  env = await writeEnvKey(env, 'PLUGGY_CLIENT_ID', clientId);
  env = await writeEnvKey(env, 'PLUGGY_CLIENT_SECRET', clientSecret);
  env = await writeEnvKey(env, 'PLUGGY_ENV', 'sandbox');
  await writeFile(ENV_PATH, env, 'utf8');
}

function maskSecret(s) {
  if (!s || s.length < 8) return '***';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

async function main() {
  console.log('[pluggy-setup] Launching browser...');
  console.log('[pluggy-setup] Profile dir:', PROFILE_DIR);
  console.log('[pluggy-setup] If you have a Pluggy account, sign in.');
  console.log('[pluggy-setup] If not, click "Sign up" — free trial, ~30 seconds.');
  console.log('');

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
  });

  // Reuse first page if persistent context already has one
  const page = context.pages()[0] ?? await context.newPage();

  await page.goto(PLUGGY_DASHBOARD, { waitUntil: 'domcontentloaded' });

  console.log('[pluggy-setup] Browser is open at:', PLUGGY_DASHBOARD);
  console.log('[pluggy-setup] Complete sign-up or sign-in in the browser.');
  console.log('[pluggy-setup] When you can see the dashboard (apps, charts, etc.),');
  console.log('[pluggy-setup] come back to this terminal and press ENTER.');
  console.log('');

  const rl = readline.createInterface({ input: stdin, output: stdout });
  await rl.question('[pluggy-setup] Press ENTER once you are logged in > ');

  console.log('[pluggy-setup] Searching for API credentials...');

  // Try a few well-known paths. Pluggy's dashboard route names can shift —
  // we attempt the documented ones in order and bail out on the first hit.
  const candidatePaths = [
    '/applications',
    '/api',
    '/api-keys',
    '/settings/api',
    '/credentials',
  ];

  let clientId = null;
  let clientSecret = null;

  // Strategy 1: try each candidate URL, look for inputs/text that look like
  // a UUID (CLIENT_ID is typically a UUID) and a long random string.
  const UUID_REGEX = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;
  const SECRET_REGEX = /[A-Za-z0-9_-]{32,}/;

  for (const path of candidatePaths) {
    try {
      const url = `${PLUGGY_DASHBOARD}${path}`;
      console.log(`[pluggy-setup] Trying ${url}`);
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
      if (!resp || resp.status() >= 400) continue;
      await page.waitForTimeout(2000);

      // Read all text + input values from the page
      const pageData = await page.evaluate(() => {
        const text = document.body.innerText || '';
        const inputs = Array.from(document.querySelectorAll('input')).map((i) => ({
          name: i.name || '',
          value: i.value || '',
          type: i.type || '',
          placeholder: i.placeholder || '',
        }));
        const codes = Array.from(document.querySelectorAll('code, pre')).map((c) => c.textContent || '');
        return { text, inputs, codes };
      });

      // Scan for credential-shaped strings
      const allCandidates = [
        pageData.text,
        ...pageData.inputs.flatMap((i) => [i.value, i.placeholder]),
        ...pageData.codes,
      ].filter(Boolean).join('\n');

      const uuidMatches = allCandidates.match(new RegExp(UUID_REGEX.source, 'gi')) || [];
      if (uuidMatches.length > 0 && !clientId) {
        clientId = uuidMatches[0];
        console.log(`[pluggy-setup]   Found candidate CLIENT_ID: ${maskSecret(clientId)}`);
      }

      // Look for a long secret-shaped string that isn't the client ID
      const tokens = (allCandidates.match(new RegExp(SECRET_REGEX.source, 'g')) || [])
        .filter((t) => t.length >= 32 && t !== clientId && !UUID_REGEX.test(t));
      if (tokens.length > 0 && !clientSecret) {
        clientSecret = tokens[0];
        console.log(`[pluggy-setup]   Found candidate CLIENT_SECRET: ${maskSecret(clientSecret)}`);
      }

      if (clientId && clientSecret) break;
    } catch (err) {
      console.log(`[pluggy-setup]   Skipped ${path}: ${err.message}`);
    }
  }

  // Strategy 2: if auto-scrape failed, ask the user to paste manually
  if (!clientId || !clientSecret) {
    console.log('');
    console.log('[pluggy-setup] Could not auto-detect credentials.');
    console.log('[pluggy-setup] In the browser, navigate to your Pluggy API page');
    console.log('[pluggy-setup] (Dashboard → API or Applications → your app).');
    console.log('[pluggy-setup] Copy the values and paste them here:');
    console.log('');
    if (!clientId) {
      clientId = (await rl.question('CLIENT_ID  > ')).trim();
    }
    if (!clientSecret) {
      clientSecret = (await rl.question('CLIENT_SECRET > ')).trim();
    }
  }

  rl.close();
  await context.close();

  if (!clientId || !clientSecret) {
    console.error('[pluggy-setup] Missing CLIENT_ID or CLIENT_SECRET — aborting without writing .env.');
    process.exit(2);
  }

  await persistCreds(clientId, clientSecret);
  console.log('');
  console.log('[pluggy-setup] Wrote PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, PLUGGY_ENV=sandbox to .env');
  console.log('[pluggy-setup] Restart your backend (npm run server:dev) and then run:');
  console.log('');
  console.log('  TWINME_RUN_SANTANDER_DIAG=true TEST_CPF=<your CPF> \\');
  console.log('    npx playwright test tests/e2e/santander-connect-flow.spec.ts \\');
  console.log('    --project=chromium --reporter=line');
  console.log('');
}

main().catch((err) => {
  console.error('[pluggy-setup] Crashed:', err);
  process.exit(1);
});
