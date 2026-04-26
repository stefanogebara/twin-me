#!/usr/bin/env node
/**
 * Manual-login flow to find the WhatsApp webhook callback URL configured at
 * Meta. Headed Chrome, persistent profile under playwright/.auth/meta-fb so
 * the login persists across runs.
 *
 * Steps:
 *   1. Opens https://www.facebook.com/login
 *   2. Waits up to 5 min for you to log in
 *   3. Once on facebook.com (logged in), navigates to developers.facebook.com/apps
 *   4. Tries to navigate into the TwinMe app's WhatsApp config
 *   5. Reads the Callback URL field and prints it
 *
 * Run: node scripts/find-meta-webhook-url.js
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(__dirname, '..', 'playwright', '.auth', 'meta-fb');
fs.mkdirSync(PROFILE_DIR, { recursive: true });

const SCREENSHOTS = path.join(__dirname, '..', 'audit-screenshots');
fs.mkdirSync(SCREENSHOTS, { recursive: true });

async function main() {
  console.log('Launching headed Chrome with persistent profile at', PROFILE_DIR);
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1440, height: 900 },
    args: ['--start-maximized'],
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  // Step 1: go to FB login
  console.log('\n→ Navigating to facebook.com');
  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });

  console.log('\n========================================');
  console.log('LOG IN TO FACEBOOK NOW IN THE OPEN WINDOW.');
  console.log('I will wait up to 5 minutes for the URL to leave /login.');
  console.log('========================================\n');

  // Wait for url to indicate logged in (no /login segment, no ?next= redirect)
  try {
    await page.waitForFunction(
      () => !location.pathname.startsWith('/login') && !location.search.includes('next=') && location.hostname.includes('facebook.com'),
      { timeout: 5 * 60 * 1000 }
    );
    console.log('✓ Logged in. Current URL:', page.url());
  } catch (e) {
    console.log('Timed out waiting for login.');
    await page.screenshot({ path: path.join(SCREENSHOTS, 'meta-login-timeout.png') });
    await ctx.close();
    process.exit(1);
  }

  // Step 2: go to developer apps
  console.log('\n→ Navigating to developers.facebook.com/apps');
  await page.goto('https://developers.facebook.com/apps/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(SCREENSHOTS, 'meta-01-apps.png'), fullPage: true });

  // Try to find the TwinMe app — look for any link/card mentioning twin
  const appLink = page.locator('a, button').filter({ hasText: /twin/i }).first();
  if (await appLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('\n→ Clicking TwinMe app card');
    await appLink.click();
    await page.waitForTimeout(4000);
  } else {
    console.log('\n⚠ Could not find a TwinMe app link automatically.');
    console.log('  Click into the TwinMe app yourself in the open browser, then press Enter here.');
    await new Promise(r => process.stdin.once('data', r));
  }
  await page.screenshot({ path: path.join(SCREENSHOTS, 'meta-02-app-dashboard.png'), fullPage: true });

  // Step 3: navigate to WhatsApp Configuration
  // Try direct URL first — Meta's app config follows pattern:
  // /apps/{appId}/whatsapp-business/wa-settings/?
  console.log('\n→ Looking for WhatsApp config in left nav');
  const waLink = page.locator('a').filter({ hasText: /whatsapp/i }).first();
  if (await waLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    await waLink.click();
    await page.waitForTimeout(3000);
  }
  await page.screenshot({ path: path.join(SCREENSHOTS, 'meta-03-whatsapp.png'), fullPage: true });

  // Click on Configuration / Settings if needed
  for (const label of ['Configuration', 'Configurações', 'Webhooks']) {
    const link = page.locator('a, button').filter({ hasText: new RegExp(`^${label}$`, 'i') }).first();
    if (await link.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`  → Clicking "${label}"`);
      await link.click();
      await page.waitForTimeout(3000);
      break;
    }
  }
  await page.screenshot({ path: path.join(SCREENSHOTS, 'meta-04-configuration.png'), fullPage: true });

  // Step 4: read the Callback URL
  // The field is typically a labeled input. Look for "Callback URL" / "URL de retorno"
  const html = await page.content();
  fs.writeFileSync(path.join(SCREENSHOTS, 'meta-config-page.html'), html);

  // Try to find the URL via DOM
  const callbackUrl = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('label, span, div, td'));
    for (const l of labels) {
      const t = (l.textContent || '').trim();
      if (/callback url|url de retorno|webhook url/i.test(t) && t.length < 60) {
        // look at sibling input or next element for value
        let sib = l.nextElementSibling;
        for (let i = 0; i < 5 && sib; i++, sib = sib.nextElementSibling) {
          if (sib.tagName === 'INPUT') return { source: 'input-after-label', value: sib.value };
          const inner = sib.querySelector?.('input');
          if (inner) return { source: 'input-inside-sibling', value: inner.value };
        }
        // look at text content of nearby elements
        const parent = l.closest('div');
        if (parent) {
          const txt = parent.textContent || '';
          const m = txt.match(/https?:\/\/[^\s"'<>]+/);
          if (m) return { source: 'text-near-label', value: m[0] };
        }
      }
    }
    // Last resort: any URL on page that contains /webhook
    const allText = document.body.innerText || '';
    const allMatches = allText.match(/https?:\/\/[^\s"'<>]+webhook[^\s"'<>]*/g);
    if (allMatches?.length) return { source: 'fallback-text-search', value: allMatches };
    return null;
  });

  console.log('\n========================================');
  console.log('CALLBACK URL RESULT:');
  console.log(JSON.stringify(callbackUrl, null, 2));
  console.log('========================================\n');

  console.log('Screenshots saved to:', SCREENSHOTS);
  console.log('Page HTML saved to: meta-config-page.html');
  console.log('\nKeeping browser open 60s so you can verify visually.');
  await page.waitForTimeout(60_000);
  await ctx.close();
}

main().catch(err => { console.error('FAILED:', err); process.exit(1); });
