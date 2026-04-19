/**
 * TTFT Measurement: Message 2 (DEEP tier)
 * "I've been feeling a bit anxious about the future, what do you think?"
 */

import { test, expect } from '@playwright/test';

const AUTH_STATE = 'playwright/.auth/user.json';

test('TTFT: deep tier emotional message', async ({ browser }) => {
  test.setTimeout(150000); // 150 seconds - DEEP tier needs more time
  const context = await browser.newContext({ storageState: AUTH_STATE });
  const page = await context.newPage();

  await page.goto('http://localhost:8086/talk-to-twin', { waitUntil: 'networkidle' });

  const textarea = page.locator('textarea').first();
  await textarea.waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(1500);

  const existingCount = await page.evaluate(() => {
    return document.querySelectorAll('.prose.prose-invert').length;
  });

  console.log(`Existing assistant messages: ${existingCount}`);

  // Inject mutation observer
  await page.evaluate((count: number) => {
    (window as any).__ttft = null;
    (window as any).__sendTime = null;
    (window as any).__existingCount = count;

    const observer = new MutationObserver(() => {
      if ((window as any).__ttft) return;
      const proseEls = document.querySelectorAll('.prose.prose-invert');
      if (proseEls.length > (window as any).__existingCount) {
        const newest = proseEls[proseEls.length - 1];
        const text = newest?.textContent?.trim() || '';
        if (text.length > 0 && (window as any).__sendTime) {
          (window as any).__ttft = Date.now() - (window as any).__sendTime;
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    (window as any).__observer = observer;
  }, existingCount);

  const msg = "I've been feeling a bit anxious about the future, what do you think?";
  await textarea.fill(msg);

  await page.evaluate(() => {
    (window as any).__sendTime = Date.now();
  });

  await page.keyboard.press('Enter');

  // Poll up to 120 seconds
  const maxWaitMs = 120000;
  const pollMs = 100;
  let elapsed = 0;
  let ttft: number | null = null;

  while (elapsed < maxWaitMs) {
    await page.waitForTimeout(pollMs);
    elapsed += pollMs;
    ttft = await page.evaluate(() => (window as any).__ttft as number | null);
    if (ttft !== null) break;
  }

  await page.evaluate(() => (window as any).__observer?.disconnect());

  const ttftSeconds = ttft !== null ? (ttft / 1000).toFixed(2) : 'TIMEOUT';

  await page.waitForTimeout(2000);

  const responsePreview = await page.evaluate((prevCount: number) => {
    const proseEls = document.querySelectorAll('.prose.prose-invert');
    if (proseEls.length > prevCount) {
      return proseEls[proseEls.length - 1]?.textContent?.trim()?.substring(0, 300) || '';
    }
    return '';
  }, existingCount);

  console.log(`\n========================================`);
  console.log(`TTFT MSG2 (DEEP): ${ttftSeconds}s`);
  console.log(`Message: "${msg}"`);
  console.log(`Expected tier: DEEP (emotional: 'feeling' + 'anxious')`);
  console.log(`Response preview: "${responsePreview.substring(0, 200)}"`);
  console.log(`========================================\n`);

  await page.screenshot({ path: 'tests/artifacts/ttft-msg2-deep-result.png', fullPage: false });

  expect(ttft).not.toBeNull();
  expect(ttft as number).toBeLessThan(120000);

  await context.close();
});
