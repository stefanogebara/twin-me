/**
 * OAuth Reconnect v2 — robust Google consent handling
 * Uses Playwright role-based selectors and page.evaluate for shadow DOM
 */
import { chromium } from 'playwright';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';

const platform = process.argv[2] || 'youtube';
const envFile = process.argv[3] || '.env.vercel-latest';

const envContent = readFileSync(envFile, 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=["']?(.+?)["']?\s*$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const APP_URL = 'https://twin-ai-learn.vercel.app';
const USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const token = jwt.sign({ id: USER_ID }, env.JWT_SECRET, { expiresIn: '1h' });

console.log(`Reconnecting ${platform}...`);

// Get fresh OAuth URL
const connectRes = await fetch(`${APP_URL}/api/connectors/connect/${platform}`, {
  headers: { 'Authorization': `Bearer ${token}` },
});
const connectData = await connectRes.json();
if (connectData.message === 'Token refreshed successfully') {
  console.log('Token refreshed! No browser needed.');
  process.exit(0);
}
const authUrl = connectData.data?.authUrl;
if (!authUrl) { console.error('No auth URL:', connectData); process.exit(1); }

// Use temp profile that already has Google session from prior runs
const userDataDir = process.env.LOCALAPPDATA + '/Temp/chrome-oauth-profile';
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  channel: 'chrome',
  args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
  viewport: { width: 1280, height: 800 },
  timeout: 30000,
});

const page = context.pages()[0] || await context.newPage();

// Intercept callback redirect to capture code
let capturedCode = null, capturedState = null;
page.on('request', req => {
  const u = req.url();
  if (u.includes('/oauth/callback') && u.includes('code=')) {
    const params = new URL(u).searchParams;
    capturedCode = params.get('code');
    capturedState = params.get('state');
    console.log(`CAPTURED code=${capturedCode?.slice(0, 20)}...`);
  }
});

console.log('Navigating to OAuth...');
await page.goto(authUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
console.log('Page loaded:', page.url().substring(0, 80));

// Helper: click first visible from a list of selectors
async function tryClick(selectors, label) {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
        console.log(`  [${label}] Clicking: ${sel.substring(0, 60)}`);
        await el.click();
        await page.waitForTimeout(2000);
        return true;
      }
    } catch (_) {}
  }
  return false;
}

// Helper: use evaluate to find and click buttons by text content in page DOM
async function evalClick(textPatterns, label) {
  const clicked = await page.evaluate((patterns) => {
    // Search all buttons, links, and divs with role=button
    const candidates = [
      ...document.querySelectorAll('button, a, [role="button"], input[type="submit"]'),
      ...document.querySelectorAll('span, div'), // Google hides buttons in spans/divs
    ];
    for (const pattern of patterns) {
      const re = new RegExp(pattern, 'i');
      for (const el of candidates) {
        if (re.test(el.textContent || '') && el.offsetParent !== null) {
          el.click();
          return el.textContent.trim().substring(0, 50);
        }
      }
    }
    // Also check iframes
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const iDoc = iframe.contentDocument;
        if (!iDoc) continue;
        const iCandidates = iDoc.querySelectorAll('button, a, [role="button"]');
        for (const pattern of patterns) {
          const re = new RegExp(pattern, 'i');
          for (const el of iCandidates) {
            if (re.test(el.textContent || '') && el.offsetParent !== null) {
              el.click();
              return `[iframe] ${el.textContent.trim().substring(0, 50)}`;
            }
          }
        }
      } catch (_) {} // cross-origin iframe
    }
    return null;
  }, textPatterns);
  if (clicked) {
    console.log(`  [${label}] Clicked via evaluate: "${clicked}"`);
    await page.waitForTimeout(2500);
    return true;
  }
  return false;
}

const deadline = Date.now() + 120_000;
let step = 0;

while (Date.now() < deadline) {
  const url = page.url();
  step++;

  // Done?
  if (url.includes('/oauth/callback') || capturedCode) {
    console.log('OAuth callback reached!');
    break;
  }

  // Account chooser
  if (url.includes('accountchooser') || url.includes('selectaccount')) {
    console.log(`[step ${step}] Account chooser`);
    await tryClick([
      '[data-email="stefanogebara@gmail.com"]',
      'li:has-text("stefanogebara")',
      'div:has-text("stefanogebara@gmail.com")',
    ], 'account') || await evalClick(['stefanogebara@gmail\\.com', 'Stefano Gebara'], 'account');
    continue;
  }

  // Sign-in identifier (email entry)
  if (url.includes('signin/identifier')) {
    console.log(`[step ${step}] Email entry`);
    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await emailInput.fill('stefanogebara@gmail.com');
      await page.waitForTimeout(500);
      await evalClick(['Next', 'Avan.ar', 'Pr.xim'], 'next');
    }
    await page.waitForTimeout(3000);
    continue;
  }

  // Password page - user needs to type
  if (url.includes('signin/challenge') || url.includes('signin/v2/challenge')) {
    console.log(`[step ${step}] Password page - waiting for manual entry...`);
    await page.waitForTimeout(5000);
    continue;
  }

  // OAuth warning ("Google hasn't verified this app")
  if (url.includes('oauth/warning')) {
    console.log(`[step ${step}] Unverified app warning`);
    // Click "Advanced"
    await evalClick(['Advanced', 'Avan.ado', 'Show details'], 'advanced');
    await page.waitForTimeout(1000);
    // Click "Go to twin-ai-learn.vercel.app (unsafe)"
    await evalClick(['Go to twin', 'Ir para twin', 'twin-ai-learn.*unsafe', 'Continue'], 'go-unsafe');
    continue;
  }

  // OAuth delegation (consent granting)
  if (url.includes('oauth/delegation') || url.includes('consent')) {
    console.log(`[step ${step}] Consent/delegation page`);

    // Step A: Check all permission checkboxes
    const checked = await page.evaluate(() => {
      let count = 0;
      // Google uses checkboxes or toggle inputs for permissions
      const checkboxes = document.querySelectorAll('input[type="checkbox"]:not(:checked)');
      for (const cb of checkboxes) {
        cb.click();
        count++;
      }
      // Also try material design checkboxes (div-based)
      const mdCheckboxes = document.querySelectorAll('[role="checkbox"][aria-checked="false"]');
      for (const cb of mdCheckboxes) {
        cb.click();
        count++;
      }
      return count;
    });
    if (checked > 0) console.log(`  Checked ${checked} permission checkboxes`);

    // Step B: Scroll to bottom of permissions list (some consent UIs require this)
    await page.evaluate(() => {
      const scrollables = document.querySelectorAll('[class*="scroll"], [style*="overflow"]');
      for (const el of scrollables) {
        el.scrollTop = el.scrollHeight;
      }
      // Also scroll the main page
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(500);

    // Step C: Select all permission items if they're individual "Select" buttons
    await page.evaluate(() => {
      const items = document.querySelectorAll('[data-grant-item], [data-scope]');
      for (const item of items) {
        item.click();
      }
    });

    // Step D: Now try clicking Continue with Playwright's click (not evaluate)
    // Use Playwright's force click to bypass any disabled state
    try {
      const continueBtn = page.locator('button:has-text("Continue")').last();
      if (await continueBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('  Force-clicking Continue button...');
        await continueBtn.click({ force: true });
        await page.waitForTimeout(3000);

        // Check if we moved past the page
        if (!page.url().includes('oauth/delegation')) {
          console.log('  Moved past delegation page!');
          continue;
        }
      }
    } catch (e) {
      console.log(`  Continue click failed: ${e.message.substring(0, 60)}`);
    }

    // Step E: Try selecting "Select all" if present
    await evalClick(['Select all', 'Selecionar tudo', 'Check all'], 'select-all');

    // Step F: Try clicking the second Continue/Allow button (some pages have two)
    try {
      const buttons = await page.locator('button:has-text("Continue")').all();
      if (buttons.length > 1) {
        console.log(`  Found ${buttons.length} Continue buttons, clicking last one...`);
        await buttons[buttons.length - 1].click({ force: true });
        await page.waitForTimeout(3000);
      }
    } catch (_) {}

    continue;
  }

  // Default: wait and check
  console.log(`[step ${step}] Waiting on: ${url.substring(0, 80)}...`);
  await page.waitForTimeout(3000);
}

// If we captured the code, call backend directly
if (capturedCode && capturedState) {
  console.log('Calling backend with captured OAuth code...');
  const cbRes = await fetch(`${APP_URL}/api/connectors/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: capturedCode, state: capturedState }),
  });
  const cbData = await cbRes.json();
  console.log('Backend response:', cbRes.status, JSON.stringify(cbData));
}

// Final status check
const statusRes = await fetch(
  `https://twin-ai-learn.vercel.app/api/connectors/status/${USER_ID}`,
  { headers: { 'Authorization': `Bearer ${token}` } }
);
const statusData = await statusRes.json();
const ytStatus = statusData.data?.[platform];
console.log(`\n${platform} final status:`, ytStatus ? `${ytStatus.status}, expired=${ytStatus.tokenExpired}` : 'not found');

await context.close();
process.exit(capturedCode ? 0 : 1);
