/**
 * Test Learning Opportunities button clicks
 */

import { chromium } from 'playwright';

async function testLearningOpportunities() {
  console.log('Starting Playwright browser...');

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome'  // Use installed Chrome
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  // First navigate to homepage to set localStorage
  console.log('Setting up authentication...');
  await page.goto('http://localhost:8086', { waitUntil: 'domcontentloaded' });

  // Set auth token in localStorage with correct keys (auth_token, auth_user)
  await page.evaluate(() => {
    localStorage.setItem('auth_token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxNjdjMjdiNS1hNDBiLTQ5ZmItOGQwMC1kZWIxYjFjNTdmNGQiLCJlbWFpbCI6InN0ZWZhbm9nZWJhcmFAZ21haWwuY29tIiwiaWF0IjoxNzcwMjEwMzkyLCJleHAiOjE3NzAyOTY3OTJ9.1dtDXPfxLy9yep6XV-KDyuRr4NNck3jVxOX_RbabqBg');
    localStorage.setItem('auth_user', JSON.stringify({
      id: '167c27b5-a40b-49fb-8d00-deb1b1c57f4d',
      email: 'stefanogebara@gmail.com',
      name: 'Stefano'
    }));
  });

  // Reload the page to pick up the auth
  console.log('Reloading with auth...');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  console.log('Navigating to Brain Explorer...');
  await page.goto('http://localhost:8086/brain', {
    waitUntil: 'networkidle',
    timeout: 30000
  });

  // Wait for page to load and data to fetch
  console.log('Waiting for page to load...');
  await page.waitForTimeout(5000);

  // Take screenshot of current state
  await page.screenshot({
    path: 'C:/Users/stefa/twin-ai-learn/tests/screenshots/brain-initial-state.png',
    fullPage: true
  });

  // Check for error state and click Reconnect if needed
  const reconnectButton = page.locator('button:has-text("Reconnect")');
  if (await reconnectButton.isVisible({ timeout: 2000 })) {
    console.log('Found error state, clicking Reconnect...');
    await reconnectButton.click();
    await page.waitForTimeout(5000);
  }

  // Scroll down to find Learning Opportunities
  console.log('Scrolling to find Learning Opportunities...');
  await page.evaluate(() => window.scrollTo(0, 1000));
  await page.waitForTimeout(1000);

  // Look for Learning Opportunities section
  console.log('Looking for Learning Opportunities section...');
  const learningSection = page.locator('text=Learning Opportunities');

  if (await learningSection.isVisible({ timeout: 5000 })) {
    console.log('✅ Learning Opportunities section found');

    // Find clickable suggestion cards
    const suggestionCards = page.locator('.cursor-pointer').filter({ has: page.locator('text=high, text=medium, text=low') });
    const cardCount = await suggestionCards.count();
    console.log(`Found ${cardCount} suggestion cards`);

    // Try to find any card with priority badge
    const cards = page.locator('div.cursor-pointer:has(span.uppercase)');
    const count = await cards.count();
    console.log(`Found ${count} cards with priority badges`);

    if (count > 0) {
      // Get the first card's text
      const firstCard = cards.first();
      const cardText = await firstCard.textContent();
      console.log(`First card text: ${cardText?.substring(0, 100)}...`);

      // Click the first suggestion card
      console.log('Clicking first suggestion card...');
      const currentUrl = page.url();

      await firstCard.click();
      await page.waitForTimeout(2000);

      const newUrl = page.url();

      if (newUrl !== currentUrl) {
        console.log(`✅ Navigation worked! New URL: ${newUrl}`);
      } else {
        console.log('⚠️ URL did not change after click');
        // Check for alert dialog
        page.on('dialog', async dialog => {
          console.log(`✅ Alert dialog appeared: ${dialog.message()}`);
          await dialog.accept();
        });
      }

      // Take screenshot
      await page.screenshot({
        path: 'C:/Users/stefa/twin-ai-learn/tests/screenshots/learning-opportunities-click.png',
        fullPage: true
      });
      console.log('Screenshot saved');
    } else {
      console.log('⚠️ No suggestion cards found to click');
    }
  } else {
    console.log('⚠️ Learning Opportunities section not visible');
    // Take screenshot to debug
    await page.screenshot({
      path: 'C:/Users/stefa/twin-ai-learn/tests/screenshots/brain-explorer-debug.png',
      fullPage: true
    });
  }

  // Wait a bit before closing
  await page.waitForTimeout(3000);

  await browser.close();
  console.log('Done!');
}

testLearningOpportunities().catch(console.error);
