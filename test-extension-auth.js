/**
 * Playwright Test for Extension Authentication Flow
 * Tests the complete auth flow from clicking "Connect to Twin Me" to token receipt
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testExtensionAuth() {
  console.log('🚀 Starting Extension Auth Flow Test...\n');

  // Launch browser with extension loaded
  const extensionPath = path.join(__dirname, 'browser-extension');
  console.log(`📦 Extension path: ${extensionPath}\n`);

  const browser = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  const page = await browser.newPage();

  // Collect all console messages
  const consoleMessages = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleMessages.push({
      type: msg.type(),
      text: text,
      timestamp: new Date().toISOString()
    });

    // Print with emoji for easy identification
    const emoji = text.includes('✅') ? '✅' :
                  text.includes('📨') ? '📨' :
                  text.includes('🔑') ? '🔑' :
                  text.includes('📤') ? '📤' :
                  text.includes('⏳') ? '⏳' :
                  text.includes('❌') ? '❌' : '📋';

    console.log(`${emoji} [${msg.type()}] ${text}`);
  });

  try {
    // Step 1: Navigate to the app
    console.log('\n📍 Step 1: Navigating to http://localhost:8086...');
    await page.goto('http://localhost:8086');
    await page.waitForLoadState('networkidle');

    // Take screenshot of homepage
    await page.screenshot({ path: 'test-screenshots/01-homepage.png', fullPage: true });
    console.log('📸 Screenshot saved: 01-homepage.png');

    // Step 2: Open extension popup (simulate clicking extension icon)
    console.log('\n📍 Step 2: Checking extension popup...');

    // Get all pages (popup will open in new context)
    const pages = browser.pages();
    console.log(`Found ${pages.length} pages`);

    // Step 3: Click "Connect to Twin Me" button in popup
    // Since we can't easily trigger extension popup in Playwright,
    // we'll directly navigate to the extension auth page
    console.log('\n📍 Step 3: Navigating to extension auth page...');
    await page.goto('http://localhost:8086/extension-auth');
    await page.waitForLoadState('networkidle');

    // Wait a moment for auth flow to complete
    console.log('\n⏳ Waiting 10 seconds for auth flow to complete...');
    await page.waitForTimeout(10000);

    // Take screenshot of final state
    await page.screenshot({ path: 'test-screenshots/02-extension-auth-page.png', fullPage: true });
    console.log('📸 Screenshot saved: 02-extension-auth-page.png');

    // Step 4: Analyze console logs
    console.log('\n\n📊 CONSOLE LOG ANALYSIS:');
    console.log('=' .repeat(80));

    // Check for key messages in the auth flow
    const checks = {
      'Content script loaded': consoleMessages.some(m => m.text.includes('[Extension Auth Listener] ✅ Content script loaded')),
      'Chrome runtime available': consoleMessages.some(m => m.text.includes('Chrome runtime available: true')),
      'Web page sending auth': consoleMessages.some(m => m.text.includes('[Extension Auth] 📤 Sending auth message')),
      'Content script received message': consoleMessages.some(m => m.text.includes('[Extension Auth Listener] 📨 Received message')),
      'Auth message detected': consoleMessages.some(m => m.text.includes('[Extension Auth Listener] 🔑 Auth message detected')),
      'Forwarding to service worker': consoleMessages.some(m => m.text.includes('Forwarding to service worker')),
      'Service worker received': consoleMessages.some(m => m.text.includes('[Service Worker] 🔑 EXTENSION_AUTH_SUCCESS received')),
      'Auth data saved': consoleMessages.some(m => m.text.includes('[Service Worker] ✅ Authentication successful')),
      'Web page got confirmation': consoleMessages.some(m => m.text.includes('[Extension Auth] ✅ Got confirmation from extension'))
    };

    console.log('\n✅ Success Indicators:');
    for (const [check, passed] of Object.entries(checks)) {
      console.log(`  ${passed ? '✅' : '❌'} ${check}`);
    }

    // Check for errors
    const errors = consoleMessages.filter(m => m.type === 'error');
    if (errors.length > 0) {
      console.log('\n❌ ERRORS FOUND:');
      errors.forEach(err => {
        console.log(`  ${err.text}`);
      });
    } else {
      console.log('\n✅ No errors found in console');
    }

    // Find where the flow breaks
    console.log('\n🔍 FLOW ANALYSIS:');
    console.log('=' .repeat(80));

    if (!checks['Content script loaded']) {
      console.log('❌ FAILURE POINT: Content script did not load');
      console.log('   Possible causes:');
      console.log('   - Extension not properly loaded');
      console.log('   - manifest.json content_scripts configuration incorrect');
      console.log('   - URL pattern not matching http://localhost:8086/extension-auth');
    } else if (!checks['Web page sending auth']) {
      console.log('❌ FAILURE POINT: Web page did not send auth message');
      console.log('   Possible causes:');
      console.log('   - User not authenticated (no auth token)');
      console.log('   - ExtensionAuth component not executing sendTokenToExtension');
    } else if (!checks['Content script received message']) {
      console.log('❌ FAILURE POINT: Content script did not receive window.postMessage');
      console.log('   Possible causes:');
      console.log('   - window.postMessage origin mismatch');
      console.log('   - Content script event listener not set up');
    } else if (!checks['Service worker received']) {
      console.log('❌ FAILURE POINT: Service worker did not receive message from content script');
      console.log('   Possible causes:');
      console.log('   - chrome.runtime.sendMessage failing');
      console.log('   - Service worker not active/installed');
      console.log('   - Extension context invalidated');
    } else if (!checks['Auth data saved']) {
      console.log('❌ FAILURE POINT: Service worker failed to save auth data');
      console.log('   Possible causes:');
      console.log('   - chrome.storage.local.set failing');
      console.log('   - saveAuthData function error');
    } else if (!checks['Web page got confirmation']) {
      console.log('❌ FAILURE POINT: Web page did not receive confirmation');
      console.log('   Possible causes:');
      console.log('   - window.postMessage response not sent');
      console.log('   - Message event listener on page not working');
    } else {
      console.log('✅ ALL STEPS PASSED - Auth flow working correctly!');
    }

    // Print all console messages for debugging
    console.log('\n📋 FULL CONSOLE LOG:');
    console.log('=' .repeat(80));
    consoleMessages.forEach((msg, i) => {
      console.log(`[${i + 1}] [${msg.type}] ${msg.text}`);
    });

  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    console.log('\n\n🏁 Test complete. Press Ctrl+C to close browser...');
    // Keep browser open for manual inspection
    await page.waitForTimeout(60000);
    await browser.close();
  }
}

// Run the test
testExtensionAuth().catch(console.error);
