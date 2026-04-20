import { test } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const STITCH_URL = 'https://claude.ai/design/projects/561536274433251881';
const OUT = path.join(process.cwd(), 'playwright-report-stitch');

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
});

test('Open TwinMe Stitch project', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto(STITCH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, 'stitch-project.png'), fullPage: false });
  console.log(`Project URL: ${STITCH_URL}`);
  console.log(`Screenshot saved: ${OUT}/stitch-project.png`);
});
