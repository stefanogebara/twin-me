/**
 * Standalone Playwright screenshot script for Brain Explorer Phase 4
 */

import { chromium } from 'playwright';

async function takeScreenshot() {
  console.log('Starting Playwright browser...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Set auth token in localStorage before navigating
  await page.addInitScript(() => {
    localStorage.setItem('authToken', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxNjdjMjdiNS1hNDBiLTQ5ZmItOGQwMC1kZWIxYjFjNTdmNGQiLCJlbWFpbCI6InN0ZWZhbm9nZWJhcmFAZ21haWwuY29tIiwiaWF0IjoxNzcwMjA2NDUxLCJleHAiOjE3NzAyOTI4NTF9.cskMrAjqnVP5IS65P54l8UdJcjqIOvjEfISDqsrZQbQ');
    localStorage.setItem('user', JSON.stringify({
      id: '167c27b5-a40b-49fb-8d00-deb1b1c57f4d',
      email: 'stefanogebara@gmail.com',
      name: 'Stefano'
    }));
  });

  console.log('Navigating to Brain Explorer...');
  await page.goto('http://localhost:8086/brain-explorer', {
    waitUntil: 'networkidle',
    timeout: 30000
  });

  // Wait for 3D graph to render
  console.log('Waiting for 3D graph to render...');
  await page.waitForTimeout(5000);

  // Take screenshot of global context
  console.log('Taking screenshot (Global Context)...');
  await page.screenshot({
    path: 'C:/Users/stefa/twin-ai-learn/tests/screenshots/brain-explorer-phase4-global.png',
    fullPage: true
  });

  // Click on Work context if available
  console.log('Trying to switch to Work context...');
  try {
    const workButton = page.locator('button:has-text("Work")').first();
    if (await workButton.isVisible({ timeout: 2000 })) {
      await workButton.click();
      await page.waitForTimeout(3000);

      console.log('Taking screenshot (Work Context)...');
      await page.screenshot({
        path: 'C:/Users/stefa/twin-ai-learn/tests/screenshots/brain-explorer-phase4-work.png',
        fullPage: true
      });
    }
  } catch (e) {
    console.log('Work context button not found or not visible');
  }

  await browser.close();
  console.log('Done! Screenshots saved to tests/screenshots/');
}

takeScreenshot().catch(console.error);
