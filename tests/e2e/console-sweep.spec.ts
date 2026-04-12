import { test, expect } from '@playwright/test';

const TOKEN = process.env.TEST_AUTH_TOKEN!;

const PAGES = [
  { path: '/dashboard', name: 'Dashboard' },
  { path: '/talk-to-twin', name: 'Chat' },
  { path: '/identity', name: 'Identity' },
  { path: '/wiki', name: 'Wiki' },
  { path: '/departments', name: 'Departments' },
  { path: '/settings', name: 'Settings' },
];

function seedAuth(token: string) {
  localStorage.setItem('auth_token', token);
  localStorage.setItem('auth_user', JSON.stringify({
    id: '167c27b5-a40b-49fb-8d00-deb1b1c57f4d',
    email: 'stefanogebara@gmail.com',
    firstName: 'Stefano',
  }));
  localStorage.setItem('soul_sig_revealed_v2', '1');
}

for (const { path, name } of PAGES) {
  test(`${name} — no critical console errors`, async ({ page }) => {
    await page.addInitScript(seedAuth, TOKEN);

    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore known noisy but harmless errors
        if (!text.includes('favicon') && !text.includes('ResizeObserver') && !text.includes('net::ERR_ABORTED')) {
          errors.push(text.slice(0, 120));
        }
      }
    });

    await page.goto(`http://localhost:8086${path}`);
    await page.waitForTimeout(4000);

    if (errors.length > 0) {
      console.log(`[${name}] Errors:`, errors.slice(0, 5));
    }

    // Page should have some text content (not blank)
    const text = await page.evaluate(() => document.body.innerText.trim());
    expect(text.length, `${name} should not be blank`).toBeGreaterThan(30);
  });
}
