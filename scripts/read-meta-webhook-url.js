#!/usr/bin/env node
/**
 * Step 2 of the manual-login flow. Reuses the persistent profile from
 * find-meta-webhook-url.js (Meta for Developers login already done) and
 * navigates straight to the TwinMe app's WhatsApp Webhook config.
 *
 * Goal: print the Callback URL field. That's the one piece of info we need
 * to know whether Meta is delivering messages to /api/whatsapp-twin/webhook
 * or to the legacy Kapso path.
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(__dirname, '..', 'playwright', '.auth', 'meta-fb');
const SCREENSHOTS = path.join(__dirname, '..', 'audit-screenshots');
fs.mkdirSync(SCREENSHOTS, { recursive: true });

async function main() {
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1440, height: 900 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  console.log('→ Navigating to apps dashboard');
  await page.goto('https://developers.facebook.com/apps/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Dismiss cookie banner if it shows
  for (const text of ['Permitir todos os cookies', 'Allow all cookies', 'Accept All']) {
    const btn = page.locator('button, [role="button"]').filter({ hasText: new RegExp(`^${text}$`, 'i') }).first();
    if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
      console.log(`  → Dismissing cookie banner: ${text}`);
      await btn.click();
      await page.waitForTimeout(2000);
      break;
    }
  }

  await page.screenshot({ path: path.join(SCREENSHOTS, 'meta-21-apps-list.png'), fullPage: true });

  // List apps visible on the page (text we can find)
  const appCards = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/apps/"]'));
    return links
      .map(a => ({
        text: (a.textContent || '').trim().slice(0, 80),
        href: a.href,
      }))
      .filter(l => l.text && /\/apps\/\d+/.test(l.href))
      .slice(0, 20);
  });
  console.log('\nApps found:');
  for (const a of appCards) console.log(`  ${a.text} → ${a.href}`);

  // Try to find one matching "twin" / "twinme" / "Twin Me"
  let appHref = appCards.find(a => /twin/i.test(a.text))?.href;

  if (!appHref && appCards.length === 1) {
    appHref = appCards[0].href;
    console.log(`  Only 1 app found, using it: ${appHref}`);
  }

  if (!appHref) {
    console.log('\n⚠ Could not auto-pick a TwinMe app. Click into it manually in the open browser.');
    console.log('  Waiting 60s for you to land on the app dashboard...');
    await page.waitForTimeout(60_000);
  } else {
    console.log(`\n→ Opening app: ${appHref}`);
    await page.goto(appHref, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
  }

  await page.screenshot({ path: path.join(SCREENSHOTS, 'meta-22-app-home.png'), fullPage: true });

  // Try direct URL to WhatsApp configuration. Pattern is:
  //   /apps/{APP_ID}/whatsapp-business/wa-settings/?business_id=...
  // But it depends on the app structure. Try clicking left-nav link first.
  const waNavLink = page.locator('a[href*="whatsapp"]').first();
  if (await waNavLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    const href = await waNavLink.getAttribute('href');
    console.log(`\n→ Following WhatsApp left-nav: ${href}`);
    await waNavLink.click();
    await page.waitForTimeout(4000);
  }

  await page.screenshot({ path: path.join(SCREENSHOTS, 'meta-23-whatsapp-overview.png'), fullPage: true });

  // From WhatsApp overview, try to find "Configuration" / "Webhooks"
  for (const label of ['Configuration', 'Configurações', 'Webhooks']) {
    const link = page.locator('a, button, span').filter({ hasText: new RegExp(`^\\s*${label}\\s*$`, 'i') }).first();
    if (await link.isVisible({ timeout: 2500 }).catch(() => false)) {
      console.log(`  → Clicking "${label}"`);
      await link.click();
      await page.waitForTimeout(4000);
      break;
    }
  }

  await page.screenshot({ path: path.join(SCREENSHOTS, 'meta-24-config.png'), fullPage: true });

  // Now extract the Callback URL.
  const result = await page.evaluate(() => {
    // Multiple Meta UI variants — try several selectors
    const labels = Array.from(document.querySelectorAll('span, label, div'));
    for (const l of labels) {
      const t = (l.textContent || '').trim();
      if (!t) continue;
      if (/^callback url$/i.test(t) || /^url de retorno de chamada$/i.test(t) || /^webhook callback url$/i.test(t)) {
        // Walk up to a row container and look for an input/text adjacent
        let p = l;
        for (let i = 0; i < 6 && p; i++) {
          p = p.parentElement;
          if (!p) break;
          const input = p.querySelector('input');
          if (input?.value) return { source: 'walk-up-input', value: input.value };
          // text content with URL
          const m = p.textContent?.match(/https?:\/\/[^\s"'<>]+webhook[^\s"'<>]*/);
          if (m) return { source: 'walk-up-text', value: m[0] };
        }
      }
    }
    // Last resort: any URL on page that contains "webhook" in path
    const txt = document.body.innerText || '';
    const matches = txt.match(/https?:\/\/[^\s"'<>]+webhook[^\s"'<>]*/g);
    if (matches?.length) return { source: 'fallback-page-text', value: matches };
    // Even broader: any twin-ai-learn or twinme.me URL
    const tw = txt.match(/https?:\/\/[^\s"'<>]*(twin-ai-learn|twinme\.me|whatsapp-twin)[^\s"'<>]*/g);
    if (tw?.length) return { source: 'fallback-twin-url', value: tw };
    return null;
  });

  console.log('\n========================================');
  console.log('CALLBACK URL DETECTION:');
  console.log(JSON.stringify(result, null, 2));
  console.log('========================================\n');

  // Also dump current URL + first 1KB of visible text for context
  console.log('Final URL:', page.url());
  const visibleText = await page.evaluate(() => (document.body.innerText || '').slice(0, 2000));
  console.log('--- Visible text excerpt ---');
  console.log(visibleText);
  console.log('--- End excerpt ---\n');

  console.log('Screenshots in:', SCREENSHOTS);
  console.log('Browser stays open 90s for you to verify visually + click around.');
  await page.waitForTimeout(90_000);
  await ctx.close();
}

main().catch(err => { console.error('FAILED:', err); process.exit(1); });
