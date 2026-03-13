/**
 * Test Memory Service Integration with Playwright
 * Tests the Talk to Twin chat with memory features
 */

import { chromium } from 'playwright';

const API_BASE = 'http://localhost:3004/api';
// Set TEST_AUTH_TOKEN env var (never hardcode JWTs in source)

async function testMemoryService() {
  console.log('🧪 Testing Memory Service Integration\n');

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome'
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Step 1: Set up authentication
  console.log('1. Setting up authentication...');
  await page.goto('http://localhost:8086', { waitUntil: 'domcontentloaded' });

  await page.evaluate(() => {
    localStorage.setItem('auth_token', process.env.TEST_AUTH_TOKEN);
    localStorage.setItem('auth_user', JSON.stringify({
      id: '167c27b5-a40b-49fb-8d00-deb1b1c57f4d',
      email: 'stefanogebara@gmail.com',
      name: 'Stefano'
    }));
  });

  await page.reload({ waitUntil: 'networkidle' });
  console.log('✅ Authentication set up\n');

  // Step 2: Test memory API directly via page context
  console.log('2. Testing Memory API endpoints...');

  const token = process.env.TEST_AUTH_TOKEN;

  // Test stats endpoint
  const statsResult = await page.evaluate(async (params) => {
    const res = await fetch(`${params.apiBase}/mem0/stats`, {
      headers: { 'Authorization': `Bearer ${params.token}` }
    });
    return await res.json();
  }, { apiBase: API_BASE, token });

  console.log('   Memory Stats:', JSON.stringify(statsResult, null, 2));

  // Test memories endpoint
  const memoriesResult = await page.evaluate(async (params) => {
    const res = await fetch(`${params.apiBase}/mem0/memories?limit=5`, {
      headers: { 'Authorization': `Bearer ${params.token}` }
    });
    return await res.json();
  }, { apiBase: API_BASE, token });

  console.log(`   Found ${memoriesResult.count || 0} memories`);
  if (memoriesResult.memories?.length > 0) {
    memoriesResult.memories.slice(0, 3).forEach((m, i) => {
      console.log(`   [${i + 1}] ${m.type}: ${m.memory?.substring(0, 50)}...`);
    });
  }

  // Test search endpoint
  const searchResult = await page.evaluate(async (params) => {
    const res = await fetch(`${params.apiBase}/mem0/search?query=music`, {
      headers: { 'Authorization': `Bearer ${params.token}` }
    });
    return await res.json();
  }, { apiBase: API_BASE, token });

  console.log(`   Search for "music": ${searchResult.count || 0} results\n`);

  // Step 3: Navigate to Talk to Twin
  console.log('3. Navigating to Talk to Twin...');
  await page.goto('http://localhost:8086/talk-to-twin', {
    waitUntil: 'networkidle',
    timeout: 30000
  });
  await page.waitForTimeout(2000);

  // Take screenshot
  await page.screenshot({
    path: 'C:/Users/stefa/twin-ai-learn/tests/screenshots/talk-to-twin-initial.png',
    fullPage: true
  });
  console.log('✅ Screenshot saved: talk-to-twin-initial.png\n');

  // Step 4: Send a test message
  console.log('4. Sending test message...');

  // Find the textarea input
  const textarea = page.locator('textarea');
  if (await textarea.isVisible({ timeout: 5000 })) {
    await textarea.fill('I really enjoy listening to electronic music when I code. What patterns do you see in my data?');
    await page.waitForTimeout(500);

    // Click send button
    const sendButton = page.locator('button').filter({ has: page.locator('svg') }).last();
    await sendButton.click();

    console.log('   Message sent, waiting for response...');
    await page.waitForTimeout(10000); // Wait for AI response

    // Take screenshot of response
    await page.screenshot({
      path: 'C:/Users/stefa/twin-ai-learn/tests/screenshots/talk-to-twin-response.png',
      fullPage: true
    });
    console.log('✅ Screenshot saved: talk-to-twin-response.png\n');

    // Check if memory was stored
    console.log('5. Checking if memory was stored...');
    await page.waitForTimeout(3000); // Wait for memory to be stored

    const updatedStats = await page.evaluate(async (params) => {
      const res = await fetch(`${params.apiBase}/mem0/stats`, {
        headers: { 'Authorization': `Bearer ${params.token}` }
      });
      return await res.json();
    }, { apiBase: API_BASE, token });

    console.log('   Updated Memory Stats:', JSON.stringify(updatedStats, null, 2));

    // Search for the new message
    const newSearch = await page.evaluate(async (params) => {
      const res = await fetch(`${params.apiBase}/mem0/search?query=electronic%20music%20code`, {
        headers: { 'Authorization': `Bearer ${params.token}` }
      });
      return await res.json();
    }, { apiBase: API_BASE, token });

    console.log(`   Search for "electronic music code": ${newSearch.count || 0} results`);
    if (newSearch.memories?.length > 0) {
      console.log('   ✅ New conversation found in memory!');
      newSearch.memories.slice(0, 2).forEach((m, i) => {
        console.log(`      [${i + 1}] ${m.type}: ${m.memory?.substring(0, 60)}...`);
      });
    }
  } else {
    console.log('   ⚠️ Could not find message input - may need to connect platforms first');
    await page.screenshot({
      path: 'C:/Users/stefa/twin-ai-learn/tests/screenshots/talk-to-twin-no-input.png',
      fullPage: true
    });
  }

  console.log('\n🎉 Memory Service Integration Test Complete!\n');

  await page.waitForTimeout(3000);
  await browser.close();
}

testMemoryService().catch(console.error);
