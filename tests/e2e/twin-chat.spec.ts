import { test, expect } from '@playwright/test';

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjE2N2MyN2I1LWE0MGItNDlmYi04ZDAwLWRlYjFiMWM1N2Y0ZCIsImVtYWlsIjoic3RlZmFub2dlYmFyYUBnbWFpbC5jb20iLCJpYXQiOjE3NzIzNzM5MzYsImV4cCI6MTc3NDk2NTkzNn0.yuTHeAeRPaM0HEyxjBd5zfKtgSeBr9K-LSwRMRBqYxc';
const BASE_URL = 'https://twin-ai-learn.vercel.app';

test.describe('Twin Chat — post jazz-purge eval', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.evaluate((token) => {
      localStorage.setItem('auth_token', token);
    }, TOKEN);
    await page.goto(`${BASE_URL}/talk-to-twin`);
    await page.waitForLoadState('networkidle');
  });

  test('chat page loads and shows input', async ({ page }) => {
    await expect(page).toHaveURL(/talk-to-twin/);
    const input = page.locator('textarea, input[type="text"]').first();
    await expect(input).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'tests/e2e/screenshots/chat-loaded.png' });
  });

  test('Q10 — no jazz hallucination', async ({ page }) => {
    const input = page.locator('textarea, input[type="text"]').first();
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.fill('What kind of content or recommendations would I share with a friend?');
    await input.press('Enter');

    // Wait for response
    await page.waitForTimeout(15000);
    await page.screenshot({ path: 'tests/e2e/screenshots/q10-response.png' });

    const pageText = await page.textContent('body');
    // Must NOT contain jazz hallucination terms
    expect(pageText?.toLowerCase()).not.toContain('kind of blue');
    expect(pageText?.toLowerCase()).not.toContain('miles davis');
    expect(pageText?.toLowerCase()).not.toContain('john coltrane');
    // Should reference real artists
    const hasRealArtist = ['drake', 'tame impala', 'fred again', 'benny', 'lil baby', 'eminem']
      .some(a => pageText?.toLowerCase().includes(a));
    expect(hasRealArtist).toBe(true);
  });

  test('Q3 — music taste uses Spotify data', async ({ page }) => {
    const input = page.locator('textarea, input[type="text"]').first();
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.fill('What music genre or artists do I listen to most?');
    await input.press('Enter');

    await page.waitForTimeout(15000);
    await page.screenshot({ path: 'tests/e2e/screenshots/q3-music.png' });

    const pageText = await page.textContent('body');
    // Drake should always appear (all-time #1)
    expect(pageText?.toLowerCase()).toContain('drake');
    // No jazz fabrication
    expect(pageText?.toLowerCase()).not.toContain('miles davis');
    expect(pageText?.toLowerCase()).not.toContain('kind of blue');
  });
});
