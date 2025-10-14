/**
 * Inject auth token into extension storage and test Soul Observer
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Token from localStorage
const AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImE0ODNhOTc5LWNmODUtNDgxZC1iNjViLWFmMzk2YzJjNTEzYSIsImVtYWlsIjoic3RlZmFub2dlYmFyYUBnbWFpbC5jb20iLCJpYXQiOjE3NjAzOTQzNDksImV4cCI6MTc2MDk5OTE0OX0.xpkBM1FwnRPsmb3NLcS9J7HDTzSg3tWp_bMO9ecE6ok';

(async () => {
  console.log('🚀 Starting token injection and Soul Observer test\n');

  const extensionPath = __dirname;
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  const page = await context.pages()[0] || await context.newPage();

  try {
    // Step 1: Navigate to extension popup to inject token
    console.log('📝 Step 1: Navigating to extension popup...');
    await page.goto(`chrome-extension://acnofcjjfjaikcfnalggkkbghjaijepc/popup-new.html`);
    await page.waitForTimeout(2000);

    // Step 2: Inject token into chrome.storage.sync
    console.log('💉 Step 2: Injecting auth token into extension storage...');
    const injectionResult = await page.evaluate(async (token) => {
      try {
        // Set token in chrome.storage.sync
        await chrome.storage.sync.set({ authToken: token });

        // Verify it was saved
        const result = await chrome.storage.sync.get(['authToken']);

        // Also set Soul Observer as enabled
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

    console.log('   Result:', injectionResult);

    if (!injectionResult.success) {
      throw new Error(`Token injection failed: ${injectionResult.error}`);
    }

    console.log('✅ Token injected successfully!\n');

    // Step 3: Navigate to test page
    console.log('📄 Step 3: Navigating to test page...');
    await page.goto('https://example.com', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Step 4: Create input field and generate interactions
    console.log('🎭 Step 4: Generating user interactions...\n');

    await page.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'soul-test-input';
      input.style.position = 'fixed';
      input.style.top = '100px';
      input.style.left = '50px';
      input.style.width = '500px';
      input.style.padding = '20px';
      input.style.fontSize = '18px';
      input.style.border = '3px solid #D97706';
      input.style.borderRadius = '8px';
      input.style.zIndex = '99999';
      input.placeholder = 'Soul Observer is capturing your interactions...';
      document.body.appendChild(input);
    });

    await page.waitForTimeout(1000);

    // Click and type
    await page.click('#soul-test-input');
    await page.waitForTimeout(300);
    await page.type('#soul-test-input', 'Testing Soul Observer with authentication!', { delay: 100 });
    await page.waitForTimeout(500);

    // Mouse movements
    await page.mouse.move(200, 200);
    await page.waitForTimeout(200);
    await page.mouse.move(400, 300);
    await page.waitForTimeout(200);
    await page.mouse.move(600, 200);
    await page.waitForTimeout(500);

    // Clicks
    await page.click('body');
    await page.waitForTimeout(300);
    await page.click('h1');
    await page.waitForTimeout(500);

    // Scrolling
    await page.evaluate(() => window.scrollBy(0, 100));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollBy(0, -50));
    await page.waitForTimeout(500);

    console.log('✅ Generated interactions: typing, mouse movements, clicks, scrolling\n');

    // Step 5: Wait for batch send
    console.log('⏳ Step 5: Waiting 35 seconds for batch send (30s interval + buffer)...');

    for (let i = 5; i <= 35; i += 5) {
      await page.waitForTimeout(5000);
      console.log(`   ${i}/35 seconds elapsed...`);
    }

    console.log('\n✅ Wait complete!\n');

    // Step 6: Check console logs
    console.log('📊 Step 6: Verification Instructions:\n');
    console.log('   🔍 Open DevTools (F12) and check the Console tab');
    console.log('   Look for:');
    console.log('   ✓ "[Soul Observer] Event captured" messages');
    console.log('   ✓ "[Soul Observer] 📤 Sending batch" message');
    console.log('   ✓ "[Soul Observer] ✅ Batch sent successfully" message\n');

    console.log('   🔍 Check background script console:');
    console.log('   - Go to chrome://extensions');
    console.log('   - Click "service worker" link for Soul Signature extension');
    console.log('   Look for:');
    console.log('   ✓ "Auth token loaded on startup: true"');
    console.log('   ✓ "📥 Received event batch"');
    console.log('   ✓ "🌐 Sending POST request to: http://localhost:3001/api/soul-observer/activity"');
    console.log('   ✓ "Response status: 200 OK"');
    console.log('   ✓ "✅ Activity data sent to AI for processing successfully"\n');

    console.log('   🔍 Check backend server logs for:');
    console.log('   ✓ "POST /api/soul-observer/activity"');
    console.log('   ✓ "Received X activities"\n');

    console.log('   🔍 Verify in database:');
    console.log('   Run: SELECT COUNT(*) FROM soul_observer_events;');
    console.log('   Should show events > 0\n');

    console.log('💡 Browser will stay open for inspection. Press Ctrl+C to exit.\n');

    // Keep browser open
    await page.waitForTimeout(300000); // 5 minutes

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await context.close();
  }
})();
