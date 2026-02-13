/**
 * Test Google Login and Memory Service
 * Uses real Google OAuth to authenticate
 */

import { chromium } from 'playwright';

async function testGoogleLogin() {
  console.log('🧪 Testing Google Login + Memory Service\n');

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  try {
    // Step 1: Navigate to the app
    console.log('1. Navigating to TwinMe...');
    await page.goto('http://localhost:8086', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    console.log('✅ App loaded\n');

    // Step 2: Go to auth page and click Google
    console.log('2. Going to auth page...');
    await page.goto('http://localhost:8086/auth', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const googleButton = page.locator('button:has-text("Google"), button:has-text("Continue with Google")').first();
    if (await googleButton.isVisible({ timeout: 5000 })) {
      console.log('   Found Google button, clicking...');
      await googleButton.click();
      await page.waitForTimeout(2000);
    }

    // Step 3: Wait for user to complete Google login (5 minutes timeout)
    console.log('\n==========================================');
    console.log('3. PLEASE COMPLETE GOOGLE LOGIN NOW');
    console.log('   - Select your Google account');
    console.log('   - Click Allow/Continue to authorize');
    console.log('   Waiting up to 5 minutes...');
    console.log('==========================================\n');

    // Wait for redirect back to the app (any localhost URL that's not Google)
    try {
      await page.waitForURL(url => {
        const urlStr = url.toString();
        return urlStr.includes('localhost:8086') && !urlStr.includes('accounts.google.com');
      }, { timeout: 300000 }); // 5 minutes
      console.log('✅ Login completed, redirected back to app\n');
    } catch (e) {
      console.log('⚠️ Timeout or already on app page\n');
    }

    await page.waitForTimeout(3000);
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);

    // Step 4: Check if logged in
    console.log('\n4. Checking authentication status...');
    const authData = await page.evaluate(() => {
      return {
        token: localStorage.getItem('auth_token'),
        user: localStorage.getItem('auth_user')
      };
    });

    if (authData.token) {
      console.log('✅ Auth token found!');
      const user = JSON.parse(authData.user || '{}');
      console.log(`   User: ${user.email || user.name || 'Unknown'}`);
      console.log(`   ID: ${user.id || 'Unknown'}`);

      // Step 5: Test memory API
      console.log('\n5. Testing memory API...');
      const stats = await page.evaluate(async (token) => {
        const res = await fetch('http://localhost:3004/api/mem0/stats', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        return res.json();
      }, authData.token);

      console.log('   Memory stats:', JSON.stringify(stats.stats || stats, null, 2));

      // Step 6: Navigate to Talk to Twin
      console.log('\n6. Going to Talk to Twin...');
      await page.goto('http://localhost:8086/talk-to-twin', { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);

      // Step 7: Send a test message asking about memories
      console.log('7. Sending test message...');
      const chatResponse = await page.evaluate(async (token) => {
        const res = await fetch('http://localhost:3004/api/chat/message', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            message: 'What do you remember about my music preferences and listening habits?',
            context: { platforms: ['spotify'] }
          })
        });
        return res.json();
      }, authData.token);

      if (chatResponse.success) {
        console.log('✅ Chat response received!');
        console.log(`\n   Twin says:\n   "${chatResponse.message?.substring(0, 300)}..."\n`);
        console.log('   Context sources used:', JSON.stringify(chatResponse.contextSources, null, 2));

        // Check if mem0Memory was used
        if (chatResponse.contextSources?.mem0Memory) {
          console.log('\n   ✅ MEMORY SERVICE WORKING - Twin used stored memories!');
        }
      } else {
        console.log('❌ Chat failed:', chatResponse.error);
      }

      // Step 8: Check for new memories
      console.log('\n8. Checking if new memories were created...');
      await page.waitForTimeout(5000);

      const finalStats = await page.evaluate(async (token) => {
        const res = await fetch('http://localhost:3004/api/mem0/stats', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        return res.json();
      }, authData.token);

      console.log('   Final stats:', JSON.stringify(finalStats.stats || finalStats, null, 2));

      // Show recent memories
      console.log('\n9. Recent memories:');
      const memories = await page.evaluate(async (token) => {
        const res = await fetch('http://localhost:3004/api/mem0/memories?limit=5', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        return res.json();
      }, authData.token);

      if (memories.memories?.length > 0) {
        memories.memories.forEach((m, i) => {
          console.log(`   [${i + 1}] ${m.type}: ${m.memory?.substring(0, 60)}...`);
        });
      }

    } else {
      console.log('❌ No auth token found - login may have failed');
      console.log('   Current URL:', currentUrl);
    }

    console.log('\n==========================================');
    console.log('🎉 TEST COMPLETE');
    console.log('==========================================\n');

  } catch (error) {
    console.error('Test error:', error.message);
  }

  // Keep browser open longer for inspection
  console.log('Browser will stay open for 30 seconds...');
  await page.waitForTimeout(30000);
  await browser.close();
}

testGoogleLogin().catch(console.error);
