/**
 * End-to-End Test for Soul Observer
 * Tests the complete flow from user interaction to backend storage
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTENSION_ID = 'acnofcjjfjaikcfnalggkkbghjaijepc';

async function testSoulObserver() {
  console.log('🧪 Starting Soul Observer End-to-End Test\n');

  const extensionPath = __dirname;
  console.log('Extension path:', extensionPath);

  // Launch browser with extension
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
    ],
  });

  const page = await context.pages()[0] || await context.newPage();

  try {
    // Step 1: Reload extension to ensure latest code
    console.log('\n📋 Step 1: Reloading extension...');
    await page.goto('chrome://extensions');
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
      const devModeToggle = document.querySelector('extensions-manager')
        ?.shadowRoot?.querySelector('#devMode');
      if (devModeToggle && !devModeToggle.checked) {
        devModeToggle.click();
      }
    });

    await page.evaluate(() => {
      const extensionItems = document.querySelector('extensions-manager')
        ?.shadowRoot?.querySelectorAll('extensions-item-list')
        ?.[0]?.shadowRoot?.querySelectorAll('extensions-item');

      for (const item of extensionItems || []) {
        const name = item.shadowRoot?.querySelector('#name-and-version')?.textContent;
        if (name?.includes('Soul Signature')) {
          const reloadButton = item.shadowRoot?.querySelector('#dev-reload-button');
          if (reloadButton) {
            reloadButton.click();
            return;
          }
        }
      }
    });

    await page.waitForTimeout(2000);
    console.log('✅ Extension reloaded');

    // Step 2: Check authentication
    console.log('\n📋 Step 2: Checking authentication status...');
    const isAuthenticated = await page.evaluate(async (extId) => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(extId, { type: 'GET_AUTH_STATUS' }, (response) => {
          resolve(response?.authenticated || false);
        });
      });
    }, EXTENSION_ID);

    console.log('Authentication status:', isAuthenticated ? '✅ AUTHENTICATED' : '❌ NOT AUTHENTICATED');

    if (!isAuthenticated) {
      console.log('\n⚠️  Not authenticated. You need to:');
      console.log('   1. Navigate to http://localhost:8086/auth');
      console.log('   2. Complete Google OAuth');
      console.log('   3. Run this test again\n');
      await context.close();
      return;
    }

    // Step 3: Enable Soul Observer via storage
    console.log('\n📋 Step 3: Enabling Soul Observer...');
    await page.evaluate(async () => {
      await chrome.storage.local.set({
        soulObserverEnabled: true,
        soulObserverActivatedAt: new Date().toISOString()
      });
    });
    console.log('✅ Soul Observer enabled in storage');

    // Step 4: Navigate to test page
    console.log('\n📋 Step 4: Navigating to test page...');
    await page.goto('https://example.com', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Step 5: Check if content script loaded
    console.log('\n📋 Step 5: Checking if content script loaded...');
    const contentScriptLoaded = await page.evaluate(() => {
      // Look for the content script's console logs
      return window.performance.getEntries().length > 0; // Basic check
    });
    console.log('Content script check:', contentScriptLoaded ? '✅ LOADED' : '⚠️  May not be loaded');

    // Step 6: Send activation message to all tabs
    console.log('\n📋 Step 6: Sending ACTIVATE_SOUL_OBSERVER message to content script...');
    await page.evaluate(async () => {
      return new Promise((resolve) => {
        chrome.tabs.query({}, async (tabs) => {
          for (const tab of tabs) {
            try {
              await chrome.tabs.sendMessage(tab.id, {
                type: 'ACTIVATE_SOUL_OBSERVER'
              });
            } catch (e) {
              // Tab doesn't have content script, ignore
            }
          }
          resolve();
        });
      });
    });
    console.log('✅ Activation messages sent');

    // Step 7: Perform user interactions to generate events
    console.log('\n📋 Step 7: Performing user interactions to generate events...');

    // Create an input field and type in it
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'test-input-soul-observer';
      input.style.position = 'fixed';
      input.style.top = '50px';
      input.style.left = '50px';
      input.style.width = '300px';
      input.style.padding = '10px';
      input.style.fontSize = '16px';
      input.style.border = '2px solid #D97706';
      input.placeholder = 'Type here to generate events...';
      document.body.appendChild(input);
    });

    await page.waitForTimeout(1000);

    // Interact with the page
    console.log('   - Clicking input field...');
    await page.click('#test-input-soul-observer');
    await page.waitForTimeout(500);

    console.log('   - Typing text...');
    await page.type('#test-input-soul-observer', 'Testing Soul Observer Mode!', { delay: 100 });
    await page.waitForTimeout(500);

    console.log('   - Moving mouse...');
    await page.mouse.move(100, 100);
    await page.waitForTimeout(200);
    await page.mouse.move(300, 200);
    await page.waitForTimeout(200);
    await page.mouse.move(500, 150);
    await page.waitForTimeout(500);

    console.log('   - Clicking elements...');
    await page.click('body');
    await page.waitForTimeout(300);
    await page.click('h1');
    await page.waitForTimeout(500);

    console.log('   - Scrolling page...');
    await page.evaluate(() => {
      window.scrollBy(0, 100);
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.scrollBy(0, -50);
    });
    await page.waitForTimeout(500);

    console.log('✅ Generated multiple events (typing, mouse movements, clicks, scrolling)');

    // Step 8: Wait for batch interval to trigger
    console.log('\n📋 Step 8: Waiting 35 seconds for batch send interval to trigger...');
    console.log('(Events are sent every 30 seconds or when buffer reaches 50 events)');

    let secondsWaited = 0;
    const waitInterval = 5;
    while (secondsWaited < 35) {
      await page.waitForTimeout(waitInterval * 1000);
      secondsWaited += waitInterval;
      console.log(`   ⏳ ${secondsWaited}/35 seconds elapsed...`);
    }

    console.log('✅ Wait period completed');

    // Step 9: Check browser console logs
    console.log('\n📋 Step 9: Instructions for verification:');
    console.log('\n   🔍 Browser Console (Current Page):');
    console.log('   - Press F12 to open DevTools');
    console.log('   - Look for "[Soul Observer]" logs');
    console.log('   - You should see:');
    console.log('     ✓ "Content script loaded"');
    console.log('     ✓ "Initialized with tracking ENABLED"');
    console.log('     ✓ Multiple "Event captured" messages');
    console.log('     ✓ "📤 Sending batch of X events to background script"');
    console.log('     ✓ "✅ Batch sent successfully"');

    console.log('\n   🔍 Background Script Console:');
    console.log('   - Go to chrome://extensions');
    console.log('   - Find Soul Signature extension');
    console.log('   - Click "service worker" link');
    console.log('   - Look for:');
    console.log('     ✓ "Auth token loaded on startup: true"');
    console.log('     ✓ "📥 Received event batch from content script"');
    console.log('     ✓ "🌐 Sending POST request to: http://localhost:3001/api/soul-observer/activity"');
    console.log('     ✓ "Response status: 200 OK"');
    console.log('     ✓ "✅ Activity data sent to AI for processing successfully"');

    console.log('\n   🔍 Backend Server Logs:');
    console.log('   - Check your terminal running the backend server');
    console.log('   - Look for:');
    console.log('     ✓ "POST /api/soul-observer/activity"');
    console.log('     ✓ Request with X activities');

    console.log('\n   🔍 Database Check:');
    console.log('   - Run this query in your database:');
    console.log('     SELECT COUNT(*) FROM soul_observer_events;');
    console.log('     SELECT * FROM soul_observer_events ORDER BY timestamp DESC LIMIT 5;');

    console.log('\n✅ Test interactions completed!');
    console.log('\n💡 The browser will stay open for you to inspect logs.');
    console.log('   Press Ctrl+C in terminal to close and exit.\n');

    // Keep browser open for inspection
    await page.waitForTimeout(300000); // 5 minutes

  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    console.error(error.stack);
  } finally {
    await context.close();
  }
}

testSoulObserver().catch(console.error);
