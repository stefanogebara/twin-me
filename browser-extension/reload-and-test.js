/**
 * Reload extension and test Soul Observer with enhanced logging
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function reloadAndTestExtension() {
  console.log('🚀 Starting extension reload and test...');

  const extensionPath = __dirname;
  console.log('Extension path:', extensionPath);

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const page = await context.pages()[0] || await context.newPage();

  try {
    // Navigate to chrome://extensions to reload
    console.log('\n📋 Navigating to chrome://extensions...');
    await page.goto('chrome://extensions');
    await page.waitForTimeout(2000);

    // Enable developer mode
    console.log('🔧 Enabling developer mode...');
    await page.evaluate(() => {
      const devModeToggle = document.querySelector('extensions-manager')
        ?.shadowRoot?.querySelector('#devMode');
      if (devModeToggle && !devModeToggle.checked) {
        devModeToggle.click();
      }
    });
    await page.waitForTimeout(1000);

    // Find and click reload button for Soul Signature extension
    console.log('🔄 Reloading Soul Signature extension...');
    await page.evaluate(() => {
      const extensionItems = document.querySelector('extensions-manager')
        ?.shadowRoot?.querySelectorAll('extensions-item-list')
        ?.[0]?.shadowRoot?.querySelectorAll('extensions-item');

      for (const item of extensionItems || []) {
        const name = item.shadowRoot?.querySelector('#name-and-version')?.textContent;
        if (name?.includes('Soul Signature')) {
          const reloadButton = item.shadowRoot?.querySelector('#dev-reload-button');
          if (reloadButton) {
            console.log('Found Soul Signature extension, clicking reload...');
            reloadButton.click();
            return;
          }
        }
      }
      console.log('Could not find reload button for Soul Signature extension');
    });

    await page.waitForTimeout(2000);
    console.log('✅ Extension reloaded!\n');

    // Navigate to a test page
    console.log('📄 Navigating to test page (example.com)...');
    await page.goto('https://example.com', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Check if Soul Observer is tracking
    console.log('\n🔍 Checking Soul Observer status...');
    const isTracking = await page.evaluate(() => {
      return new Promise((resolve) => {
        chrome.storage.local.get(['soulObserverEnabled'], (data) => {
          resolve(data.soulObserverEnabled !== false);
        });
      });
    });

    console.log('Soul Observer tracking enabled:', isTracking);

    if (!isTracking) {
      console.log('⚠️ Soul Observer is not enabled. Please enable it from the extension popup.');
    } else {
      // Perform some interactions to trigger events
      console.log('\n🖱️ Performing test interactions...');

      // Type in the search box if there is one
      await page.evaluate(() => {
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'test-input';
        document.body.appendChild(input);
      });

      await page.click('#test-input');
      await page.type('#test-input', 'Testing Soul Observer', { delay: 100 });
      console.log('✅ Typed test text');

      // Move mouse
      await page.mouse.move(100, 100);
      await page.mouse.move(200, 200);
      await page.mouse.move(300, 150);
      console.log('✅ Moved mouse');

      // Scroll
      await page.evaluate(() => {
        window.scrollBy(0, 100);
      });
      console.log('✅ Scrolled page');

      // Click
      await page.click('body');
      console.log('✅ Clicked page');

      console.log('\n⏳ Waiting 35 seconds for batch interval to trigger...');
      console.log('(Events should be sent to backend after 30 seconds)');

      // Wait for batch interval to trigger (30 seconds + buffer)
      await page.waitForTimeout(35000);

      console.log('\n✅ Test complete!');
      console.log('\nPlease check the following:');
      console.log('1. Browser console for Soul Observer logs');
      console.log('2. Backend server logs for incoming POST requests');
      console.log('3. Database for new soul_observer_events entries');
    }

    console.log('\n🔍 Opening browser console to view logs...');
    console.log('Press Ctrl+C to exit');

    // Keep browser open to view console logs
    await page.waitForTimeout(300000); // 5 minutes

  } catch (error) {
    console.error('❌ Error during test:', error);
  } finally {
    await context.close();
  }
}

reloadAndTestExtension().catch(console.error);
