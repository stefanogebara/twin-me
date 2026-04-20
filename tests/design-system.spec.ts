import { test } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const OUT = path.join(process.cwd(), 'playwright-report-design-system');
const PROTO = path.join(process.cwd(), 'design-system', 'prototypes');

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
});

const screens = [
  { name: 'dashboard',      file: 'dashboard.html' },
  { name: 'chat',           file: 'chat.html' },
  { name: 'auth',           file: 'auth.html' },
  { name: 'soul-signature', file: 'soul-signature.html' },
];

for (const screen of screens) {
  test(`Design System — ${screen.name}`, async ({ page }) => {
    test.setTimeout(30000);
    const url = `file:///${PROTO.replace(/\\/g, '/')}/${screen.file}`;
    await page.goto(url, { waitUntil: 'load' });
    // Wait for Google Fonts to attempt load
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: path.join(OUT, `${screen.name}.png`),
      fullPage: true,
    });
    console.log(`Captured: ${screen.name}`);
  });
}
