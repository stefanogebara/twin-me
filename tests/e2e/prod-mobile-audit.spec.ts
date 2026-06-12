/**
 * One-off mobile-viewport audit on production surfaces I touched this session.
 *
 * Drives a 375x667 (iPhone-SE-ish) browser against twinme.me, verifies no
 * horizontal overflow on /meetings (the new inProgress section + action row)
 * and /pricing (the synced-copy plan cards).
 *
 * Opt-in: TWINME_RUN_PROD_MOBILE=true
 */

import { test, expect, Page } from '@playwright/test';
import { injectAuth } from './helpers';

test.skip(
  process.env.TWINME_RUN_PROD_MOBILE !== 'true',
  'Prod mobile audit. Set TWINME_RUN_PROD_MOBILE=true to opt in.',
);

const PROD = 'https://www.twinme.me';

// Mobile viewport on the default Chromium project — avoids the
// devices['iPhone 12'] preset that defaults to WebKit (not installed locally).
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});

async function measureOverflow(page: Page) {
  return await page.evaluate(() => {
    const doc = document.documentElement;
    const overflow = {
      scrollW: doc.scrollWidth,
      clientW: doc.clientWidth,
      overflowPx: doc.scrollWidth - doc.clientWidth,
    };
    const offscreen: Array<{ tag: string; cls: string; right: number; width: number; text: string }> = [];
    const els = document.querySelectorAll('*');
    for (let i = 0; i < Math.min(els.length, 3000); i++) {
      const el = els[i] as HTMLElement;
      const rect = el.getBoundingClientRect();
      if (rect.right > doc.clientWidth + 2 && rect.width > 40) {
        offscreen.push({
          tag: el.tagName.toLowerCase(),
          cls: ((el.className as unknown as string) || '').toString().slice(0, 60),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          text: (el.textContent || '').trim().slice(0, 60),
        });
        if (offscreen.length >= 6) break;
      }
    }
    return { overflow, offscreen };
  });
}

// One-interface (2026-06-12): /meetings page removed — prep lives in the twin
// thread + NextMeetingCard on Home; the mobile-overflow check for it went with it.

test('mobile /pricing — no horizontal overflow, plan cards fit', async ({ page }) => {
  await injectAuth(page);
  await page.goto(`${PROD}/pricing`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: /Choose your depth/i }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);

  const m = await measureOverflow(page);
  console.log('\n=== /pricing mobile ===');
  console.log('viewport scrollW=' + m.overflow.scrollW + ' clientW=' + m.overflow.clientW);
  console.log('overflow px:', m.overflow.overflowPx);
  if (m.offscreen.length) {
    console.log('offscreen elements:');
    m.offscreen.forEach((e) => console.log('  ' + e.tag + '.' + e.cls + ' right=' + e.right + ' w=' + e.width + ' "' + e.text + '"'));
  } else {
    console.log('no offscreen elements');
  }

  await page.screenshot({ path: 'prod-mobile-pricing.png', fullPage: true });

  expect(m.overflow.overflowPx, '/pricing no horizontal overflow').toBeLessThanOrEqual(2);
});
