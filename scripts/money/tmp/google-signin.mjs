/* Open a real Chrome for the owner to sign in with Google once; the profile keeps the refresh
   cookie, so later walks start signed in. Waits up to 8 minutes for /money to appear. */
import { chromium } from 'playwright';
const [BASE, PROFILE] = process.argv.slice(2);
const context = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', headless: false, viewport: { width: 1280, height: 900 } });
const page = context.pages()[0] || await context.newPage();
await page.goto(`${BASE}/auth`);
const t0 = Date.now();
while (Date.now() - t0 < 8 * 60 * 1000) {
  if (page.url().includes('/money')) { console.log('signed in; landed on', page.url().replace(BASE, '')); await page.waitForTimeout(4000); await context.close(); process.exit(0); }
  await page.waitForTimeout(1000);
}
console.log('no sign-in within 8 minutes'); await context.close(); process.exit(1);
