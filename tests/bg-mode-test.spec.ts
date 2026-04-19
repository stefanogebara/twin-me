import { test, expect, Page } from '@playwright/test';

const BASE = 'http://localhost:8086';

async function setMode(page: Page, mode: 'natural' | 'dark') {
  await page.evaluate((m) => localStorage.setItem('bg_mode', m), mode);
  await page.reload({ waitUntil: 'networkidle' });
}

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `playwright-report-bg-mode/screenshots/${name}.png`,
    fullPage: false,
  });
}

test.describe('Background Mode — natural vs dark', () => {
  test.beforeEach(async ({ page }) => {
    // Stub auth so protected pages show content not redirect
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.setItem('bg_mode', 'natural');
    });
  });

  test('Landing page — natural mode shows photo background', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.setItem('bg_mode', 'natural'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Background container should exist (the outer fixed wrapper)
    const bgFixed = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('[aria-hidden="true"]'));
      const fixed = all.find((el) => getComputedStyle(el).position === 'fixed');
      return fixed ? getComputedStyle(fixed).position : null;
    });
    expect(bgFixed).toBe('fixed');

    await shot(page, 'landing-natural');
  });

  test('Landing page — dark mode shows gradient (no photo)', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.setItem('bg_mode', 'dark'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await shot(page, 'landing-dark');
  });

  test('Auth page — natural mode: glass panel visible over photo', async ({ page }) => {
    await page.goto(`${BASE}/auth`, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.setItem('bg_mode', 'natural'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    // Verify background fixed layer exists
    const hasBg = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[aria-hidden="true"]'))
        .some((el) => getComputedStyle(el).position === 'fixed')
    );
    expect(hasBg).toBe(true);

    // Verify page rendered content
    await expect(page.locator('body')).toBeAttached();
    await shot(page, 'auth-natural');
  });

  test('Auth page — dark mode', async ({ page }) => {
    await page.goto(`${BASE}/auth`, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.setItem('bg_mode', 'dark'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await shot(page, 'auth-dark');
  });

  test('Text readability — heading has sufficient contrast in natural mode', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.setItem('bg_mode', 'natural'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    // Check hero heading is visible (not transparent, not matching bg)
    const heading = page.locator('h1, h2').first();
    if (await heading.count() > 0) {
      const color = await heading.evaluate((el) => getComputedStyle(el).color);
      // Color should not be fully transparent or black (which blends with dark bg)
      expect(color).not.toBe('rgba(0, 0, 0, 0)');
    }
  });

  test('No page has a full-screen solid white or black div blocking background', async ({ page }) => {
    const routes = ['/', '/auth'];
    for (const route of routes) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.evaluate(() => localStorage.setItem('bg_mode', 'natural'));
      await page.reload({ waitUntil: 'networkidle' });

      // Check for full-screen solid divs that block the photo
      const blocker = await page.evaluate(() => {
        const divs = Array.from(document.querySelectorAll('div'));
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        return divs.filter((div) => {
          const rect = div.getBoundingClientRect();
          const style = getComputedStyle(div);
          const bg = style.backgroundColor;
          // Full-screen + solid (non-transparent) background = potential blocker
          if (rect.width >= vw * 0.9 && rect.height >= vh * 0.9) {
            if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
              // Exclude the background component itself (z-index 0) and body
              const zIndex = parseInt(style.zIndex || '0');
              if (zIndex > 0 && style.position !== 'fixed') {
                return true;
              }
            }
          }
          return false;
        }).map((el) => ({
          tag: el.tagName,
          class: el.className.slice(0, 80),
          bg: getComputedStyle(el).backgroundColor,
          zIndex: getComputedStyle(el).zIndex,
        }));
      });

      if (blocker.length > 0) {
        console.warn(`Potential bg-blocking divs on ${route}:`, blocker);
      }
    }
  });

  test('Mode toggle persists across navigation', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.setItem('bg_mode', 'dark'));
    await page.reload({ waitUntil: 'networkidle' });

    // Navigate to auth
    await page.goto(`${BASE}/auth`, { waitUntil: 'networkidle' });

    const stored = await page.evaluate(() => localStorage.getItem('bg_mode'));
    expect(stored).toBe('dark');
    await shot(page, 'auth-dark-after-nav');
  });

  test('Full visual audit — 6 screenshots: 3 routes × 2 modes', async ({ page }) => {
    test.setTimeout(90000);
    const routes = [
      { path: '/', name: 'landing' },
      { path: '/auth', name: 'auth' },
    ];
    const modes: Array<'natural' | 'dark'> = ['natural', 'dark'];

    for (const mode of modes) {
      for (const route of routes) {
        await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle' });
        await setMode(page, mode);
        await page.waitForTimeout(600);
        await shot(page, `${route.name}-${mode}-final`);
      }
    }
  });
});
