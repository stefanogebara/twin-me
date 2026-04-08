/**
 * OAuth Reconnect Script
 * Opens the user's default Chrome profile to complete OAuth flows
 * that require existing Google sessions.
 *
 * Usage: node scripts/oauth-reconnect.mjs <platform>
 * Example: node scripts/oauth-reconnect.mjs youtube
 */

import { chromium } from 'playwright';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';

const platform = process.argv[2] || 'youtube';
const envFile = process.argv[3] || '.env.vercel-latest';

// Load env vars
const envContent = readFileSync(envFile, 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=["']?(.+?)["']?\s*$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const JWT_SECRET = env.JWT_SECRET;
const APP_URL = 'https://twin-ai-learn.vercel.app';
const USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

// Generate a fresh JWT
const token = jwt.sign({ id: USER_ID }, JWT_SECRET, { expiresIn: '1h' });

console.log(`Reconnecting ${platform}...`);
console.log(`Using JWT for user ${USER_ID.slice(0, 8)}...`);

// Get the OAuth URL from the API
const connectRes = await fetch(`${APP_URL}/api/connectors/connect/${platform}`, {
  headers: { 'Authorization': `Bearer ${token}` },
});
const connectData = await connectRes.json();

if (connectData.message === 'Token refreshed successfully') {
  console.log('Token was refreshed successfully! No browser needed.');
  process.exit(0);
}

const authUrl = connectData.data?.authUrl;
if (!authUrl) {
  console.error('No auth URL returned:', connectData);
  process.exit(1);
}

console.log('Got OAuth URL, launching browser with user profile...');

// Use a temp profile with copied cookies from the user's Chrome
const userDataDir = process.env.LOCALAPPDATA + '/Temp/chrome-oauth-profile';

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  channel: 'chrome',
  args: [
    '--no-first-run',
    '--disable-blink-features=AutomationControlled',
  ],
  viewport: { width: 1280, height: 800 },
  timeout: 30000,
});

const page = context.pages()[0] || await context.newPage();

// Navigate to the OAuth URL
console.log('Navigating to Google consent screen...');
await page.goto(authUrl, { waitUntil: 'networkidle', timeout: 30000 });

// Wait for either:
// 1. Google consent page (need to click "Continue" / account selection)
// 2. Redirect back to our callback (already consented)

console.log('Page URL:', page.url());

// Check if already redirected to callback
if (page.url().includes('/oauth/callback')) {
  console.log('Already redirected to callback! OAuth complete.');
  await page.waitForTimeout(3000);
  await context.close();
  process.exit(0);
}

// Google sign-in flow
if (page.url().includes('accounts.google.com')) {
  console.log('Google sign-in required...');

  // Enter email
  const emailInput = page.locator('input[type="email"]');
  if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('Entering email...');
    await emailInput.fill('stefanogebara@gmail.com');
    await page.waitForTimeout(500);

    // Click Next/Avançar
    const nextBtn = page.locator('button:has-text("Next"), button:has-text("Avançar"), button:has-text("Próxima")').first();
    await nextBtn.click();
    await page.waitForTimeout(3000);
    console.log('Email submitted, waiting for password page...');
  }

  // Wait for password page
  console.log('Current URL after email:', page.url());
  console.log('');
  console.log('=== WAITING FOR PASSWORD ENTRY (visible Chrome window) ===');
  console.log('Waiting up to 120 seconds for sign-in...');
  console.log('');

  // Intercept the callback redirect to capture the code+state before the SPA processes it
  let capturedCode = null;
  let capturedState = null;
  page.on('request', req => {
    const u = req.url();
    if (u.includes('/oauth/callback') && u.includes('code=')) {
      const params = new URL(u).searchParams;
      capturedCode = params.get('code');
      capturedState = params.get('state');
      console.log(`CAPTURED code=${capturedCode?.slice(0, 20)}... state prefix=${capturedState?.split('.')[0]}`);
    }
  });

  // Poll every 3s, handle each page in the OAuth flow
  const deadline = Date.now() + 180_000; // 3 minutes total
  let done = false;

  while (Date.now() < deadline && !done) {
    await page.waitForTimeout(3000);
    const url = page.url();

    if (url.includes('/oauth/callback')) {
      console.log('Redirected to callback! OAuth complete.');
      done = true;
      break;
    }

    // Handle "This app isn't verified" warning page
    if (url.includes('oauth/warning') || url.includes('oauth/consent')) {
      console.log('On OAuth warning/consent page, navigating through...');
      try { await page.screenshot({ path: 'oauth-warning.png', timeout: 5000 }); } catch(_) {}

      // Click "Advanced" / "Show Advanced" / "Continue"
      for (const sel of [
        '#details-button',                         // "Advanced" link
        'a:has-text("Advanced")',
        'a:has-text("Avançado")',
        'button:has-text("Advanced")',
        'button:has-text("Avançado")',
      ]) {
        try {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
            console.log(`Clicking advanced: ${sel}`);
            await el.click();
            await page.waitForTimeout(2000);
            break;
          }
        } catch (_) {}
      }

      // Click "Go to [app]" / "Continue" unsafe app link
      for (const sel of [
        'a:has-text("twin-ai-learn")',
        'a:has-text("Go to")',
        'a:has-text("Ir para")',
        'a:has-text("Continue")',
        'button:has-text("Continue")',
        'button:has-text("Continuar")',
        'button:has-text("Allow")',
        'button:has-text("Permitir")',
        '#submit_approve_access',
      ]) {
        try {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
            console.log(`Clicking: ${sel}`);
            await el.click();
            await page.waitForTimeout(3000);
            break;
          }
        } catch (_) {}
      }
    }

    // Handle account chooser
    if (url.includes('oauthchooseaccount') || url.includes('accountchooser')) {
      console.log('On account chooser...');
      try {
        const acct = page.locator('[data-email="stefanogebara@gmail.com"]').first();
        if (await acct.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('Selecting account stefanogebara@gmail.com');
          await acct.click();
          await page.waitForTimeout(3000);
        }
      } catch (_) {}
    }

    // Handle OAuth delegation (consent granting) page
    if (url.includes('oauth/delegation')) {
      console.log('On delegation page, looking for allow/continue button...');
      try { await page.screenshot({ path: 'oauth-delegation.png', timeout: 5000 }); } catch(_) {}

      // The delegation page uses various button styles
      for (const sel of [
        'button[type="submit"]',
        'button:has-text("Allow")',
        'button:has-text("Permitir")',
        'button:has-text("Continue")',
        'button:has-text("Continuar")',
        '#submit_approve_access',
        'input[type="submit"]',
        'button[data-idom-class]',
      ]) {
        try {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
            console.log(`Clicking delegation: ${sel}`);
            await el.click();
            await page.waitForTimeout(3000);
            break;
          }
        } catch (_) {}
      }
    }

    // Handle consent / permissions page
    if (url.includes('consent') || url.includes('approval')) {
      console.log('On consent/approval page...');
      for (const sel of [
        'button:has-text("Continue")',
        'button:has-text("Continuar")',
        'button:has-text("Allow")',
        'button:has-text("Permitir")',
        '#submit_approve_access',
      ]) {
        try {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
            console.log(`Clicking consent: ${sel}`);
            await el.click();
            await page.waitForTimeout(3000);
            break;
          }
        } catch (_) {}
      }
    }
  }

  // If we captured the code, call backend directly (bypass React SPA)
  if (capturedCode && capturedState) {
    console.log('Calling backend /connectors/callback directly...');
    const cbRes = await fetch(`${APP_URL}/api/connectors/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: capturedCode, state: capturedState }),
    });
    const cbData = await cbRes.json();
    console.log('Backend callback response:', cbRes.status, JSON.stringify(cbData));
    if (cbData.success) {
      console.log(`${platform} reconnected successfully!`);
      done = true;
    }
  }

  if (!done) {
    console.log('Flow did not complete. Final URL:', page.url());
    try { await page.screenshot({ path: 'oauth-debug.png' }); } catch (_) {}
  }
}

// Check final status
console.log('Verifying connection status...');
const statusRes = await fetch(`${APP_URL}/api/connectors/status/${USER_ID}`, {
  headers: { 'Authorization': `Bearer ${token}` },
});
const statusData = await statusRes.json();
const ytStatus = statusData.data?.[platform];
console.log(`${platform} status:`, ytStatus ? `${ytStatus.status}, expired=${ytStatus.tokenExpired}` : 'not found');

await context.close();
process.exit(0);
