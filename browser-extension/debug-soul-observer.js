/**
 * Comprehensive Soul Observer Debugging Script
 * Captures console logs and monitors event flow
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImE0ODNhOTc5LWNmODUtNDgxZC1iNjViLWFmMzk2YzJjNTEzYSIsImVtYWlsIjoic3RlZmFub2dlYmFyYUBnbWFpbC5jb20iLCJpYXQiOjE3NjAzOTQzNDksImV4cCI6MTc2MDk5OTE0OX0.xpkBM1FwnRPsmb3NLcS9J7HDTzSg3tWp_bMO9ecE6ok';

(async () => {
  console.log('🔍 Starting Soul Observer Debug Session\n');

  const extensionPath = __dirname;
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  const page = await context.pages()[0] || await context.newPage();

  // Capture console logs
  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push({ time: new Date().toISOString(), text });
    if (text.includes('[Soul Observer]')) {
      console.log(`📝 [Console] ${text}`);
    }
  });

  try {
    // Step 1: Inject token
    console.log('🔧 Step 1: Injecting token into extension storage...');
    await page.goto(`chrome-extension://acnofcjjfjaikcfnalggkkbghjaijepc/popup-new.html`);
    await page.waitForTimeout(2000);

    const injectionResult = await page.evaluate(async (token) => {
      try {
        await chrome.storage.sync.set({ authToken: token });
        const result = await chrome.storage.sync.get(['authToken']);
        await chrome.storage.local.set({
          soulObserverEnabled: true,
          soulObserverActivatedAt: new Date().toISOString()
        });
        return {
          success: true,
          tokenSaved: !!result.authToken,
          tokenLength: result.authToken?.length
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }, AUTH_TOKEN);

    console.log('   Token injection:', injectionResult);

    if (!injectionResult.success) {
      throw new Error(`Token injection failed: ${injectionResult.error}`);
    }

    // Step 2: Navigate to test page
    console.log('\n🌐 Step 2: Navigating to test page...');
    await page.goto('https://example.com', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Step 3: Check if content script loaded
    console.log('\n🔍 Step 3: Checking content script status...');
    const contentScriptStatus = await page.evaluate(() => {
      // Check if window has any Soul Observer indicators
      const scripts = Array.from(document.querySelectorAll('script'));
      return {
        pageLoaded: true,
        documentReady: document.readyState,
        scriptsCount: scripts.length
      };
    });
    console.log('   Page status:', contentScriptStatus);

    // Step 4: Wait a bit for content script to initialize
    await page.waitForTimeout(2000);

    // Step 5: Check console logs for Soul Observer initialization
    console.log('\n📋 Step 4: Checking for Soul Observer initialization in console...');
    const soulObserverLogs = consoleLogs.filter(log => log.text.includes('[Soul Observer]'));

    if (soulObserverLogs.length === 0) {
      console.log('   ❌ NO Soul Observer logs found!');
      console.log('   This means content script did not load or initialize.');
      console.log('\n   Possible causes:');
      console.log('   1. Content script not injected into page');
      console.log('   2. manifest.json content_scripts configuration issue');
      console.log('   3. Extension not reloaded after code changes');
    } else {
      console.log(`   ✅ Found ${soulObserverLogs.length} Soul Observer logs`);
      soulObserverLogs.forEach(log => {
        console.log(`      ${log.text}`);
      });
    }

    // Step 6: Generate interactions
    console.log('\n🎭 Step 5: Generating user interactions...');

    await page.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'debug-test-input';
      input.style.cssText = 'position:fixed;top:100px;left:50px;width:500px;padding:20px;font-size:18px;border:3px solid #D97706;border-radius:8px;z-index:99999;';
      input.placeholder = 'Debug test input...';
      document.body.appendChild(input);
    });

    await page.waitForTimeout(1000);
    await page.click('#debug-test-input');
    await page.waitForTimeout(300);
    await page.type('#debug-test-input', 'Testing Soul Observer debugging!', { delay: 100 });
    await page.waitForTimeout(500);

    console.log('   ✅ Generated typing interactions');

    // Step 7: Check for event capture logs
    console.log('\n📊 Step 6: Checking for event capture logs (waiting 5 seconds)...');
    await page.waitForTimeout(5000);

    const eventCaptureLogs = consoleLogs.filter(log =>
      log.text.includes('Event captured') ||
      log.text.includes('buffer size')
    );

    if (eventCaptureLogs.length === 0) {
      console.log('   ❌ NO event capture logs found!');
      console.log('   Events are not being captured.');
    } else {
      console.log(`   ✅ Found ${eventCaptureLogs.length} event capture logs`);
      console.log(`      Latest: ${eventCaptureLogs[eventCaptureLogs.length - 1]?.text}`);
    }

    // Step 8: Wait for batch send
    console.log('\n⏳ Step 7: Waiting 35 seconds for batch send...');

    const startBufferSize = eventCaptureLogs.length;

    for (let i = 5; i <= 35; i += 5) {
      await page.waitForTimeout(5000);
      console.log(`   ${i}/35 seconds elapsed...`);

      // Check for batch send logs
      const batchSendLogs = consoleLogs.filter(log =>
        log.text.includes('Sending batch') ||
        log.text.includes('📤') ||
        log.text.includes('Batch sent successfully')
      );

      if (batchSendLogs.length > 0 && i > 25) {
        console.log('   🎉 Batch send detected!');
        batchSendLogs.forEach(log => console.log(`      ${log.text}`));
        break;
      }
    }

    // Step 9: Final analysis
    console.log('\n📈 Step 8: Final Analysis\n');

    const allSoulLogs = consoleLogs.filter(log => log.text.includes('[Soul Observer]'));
    console.log(`   Total Soul Observer logs: ${allSoulLogs.length}`);

    const batchLogs = consoleLogs.filter(log =>
      log.text.includes('Sending batch') ||
      log.text.includes('Batch sent')
    );
    console.log(`   Batch send logs: ${batchLogs.length}`);

    const errorLogs = consoleLogs.filter(log =>
      log.text.toLowerCase().includes('error') ||
      log.text.includes('❌') ||
      log.text.includes('failed')
    );
    console.log(`   Error logs: ${errorLogs.length}`);

    if (errorLogs.length > 0) {
      console.log('\n   ⚠️  Errors found:');
      errorLogs.forEach(log => console.log(`      ${log.text}`));
    }

    console.log('\n📝 All Soul Observer logs:');
    allSoulLogs.forEach((log, i) => {
      console.log(`   ${i + 1}. ${log.text}`);
    });

    console.log('\n💡 Browser will stay open for manual inspection. Press Ctrl+C to exit.\n');

    // Keep browser open
    await page.waitForTimeout(300000); // 5 minutes

  } catch (error) {
    console.error('\n❌ Debug error:', error.message);
    console.error(error.stack);
  } finally {
    await context.close();
  }
})();
