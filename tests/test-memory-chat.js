/**
 * Test Memory Service Chat Integration
 */

import { chromium } from 'playwright';

const API_BASE = 'http://localhost:3004/api';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxNjdjMjdiNS1hNDBiLTQ5ZmItOGQwMC1kZWIxYjFjNTdmNGQiLCJlbWFpbCI6InN0ZWZhbm9nZWJhcmFAZ21haWwuY29tIiwiaWF0IjoxNzcwMjEwMzkyLCJleHAiOjE3NzAyOTY3OTJ9.1dtDXPfxLy9yep6XV-KDyuRr4NNck3jVxOX_RbabqBg';

async function testMemoryChat() {
  console.log('🧪 Testing Memory Chat Integration\n');

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome'
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Step 1: Navigate first then set auth
    console.log('1. Setting up...');
    await page.goto('http://localhost:8086', { waitUntil: 'domcontentloaded' });

    await page.evaluate(() => {
      localStorage.setItem('auth_token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxNjdjMjdiNS1hNDBiLTQ5ZmItOGQwMC1kZWIxYjFjNTdmNGQiLCJlbWFpbCI6InN0ZWZhbm9nZWJhcmFAZ21haWwuY29tIiwiaWF0IjoxNzcwMjEwMzkyLCJleHAiOjE3NzAyOTY3OTJ9.1dtDXPfxLy9yep6XV-KDyuRr4NNck3jVxOX_RbabqBg');
      localStorage.setItem('auth_user', JSON.stringify({
        id: '167c27b5-a40b-49fb-8d00-deb1b1c57f4d',
        email: 'stefanogebara@gmail.com',
        name: 'Stefano'
      }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    console.log('✅ Auth set\n');

    // Step 2: Get initial memory count
    console.log('2. Getting initial memory stats...');
    const initialStats = await page.evaluate(async (params) => {
      const res = await fetch(`${params.apiBase}/mem0/stats`, {
        headers: { 'Authorization': `Bearer ${params.token}` }
      });
      return res.json();
    }, { apiBase: API_BASE, token: TOKEN });

    const initialCount = initialStats.stats?.total || 0;
    console.log(`   Initial memories: ${initialCount}`);
    console.log(`   By type:`, JSON.stringify(initialStats.stats?.byType || {}));
    console.log('');

    // Step 3: Send a message via API
    console.log('3. Sending test message via chat API...');
    const chatResponse = await page.evaluate(async (params) => {
      const res = await fetch(`${params.apiBase}/chat/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${params.token}`
        },
        body: JSON.stringify({
          message: 'I love listening to lo-fi beats when I study. It helps me concentrate better. I also enjoy ambient music for deep work sessions.',
          context: { platforms: ['spotify'] }
        })
      });
      return res.json();
    }, { apiBase: API_BASE, token: TOKEN });

    console.log('   Response:', chatResponse.success ? '✅ Success' : '❌ Failed');
    if (chatResponse.message) {
      console.log(`   Twin: "${chatResponse.message.substring(0, 120)}..."`);
    }
    if (chatResponse.contextSources) {
      console.log('   Context used:', JSON.stringify(chatResponse.contextSources));
    }
    console.log('');

    // Step 4: Wait for memory extraction (Claude extracts facts async)
    console.log('4. Waiting for memory extraction (5s)...');
    await page.waitForTimeout(5000);

    // Step 5: Check updated memory stats
    console.log('5. Checking updated memory stats...');
    const finalStats = await page.evaluate(async (params) => {
      const res = await fetch(`${params.apiBase}/mem0/stats`, {
        headers: { 'Authorization': `Bearer ${params.token}` }
      });
      return res.json();
    }, { apiBase: API_BASE, token: TOKEN });

    const finalCount = finalStats.stats?.total || 0;
    const newMemories = finalCount - initialCount;
    console.log(`   Final memories: ${finalCount}`);
    console.log(`   New memories added: ${newMemories}`);
    console.log(`   By type:`, JSON.stringify(finalStats.stats?.byType || {}));
    console.log('');

    // Step 6: Search for new memory
    console.log('6. Searching for new memory...');
    const searchResult = await page.evaluate(async (params) => {
      const res = await fetch(`${params.apiBase}/mem0/search?query=lo-fi%20study`, {
        headers: { 'Authorization': `Bearer ${params.token}` }
      });
      return res.json();
    }, { apiBase: API_BASE, token: TOKEN });

    if (searchResult.memories?.length > 0) {
      console.log(`   ✅ Found ${searchResult.memories.length} matching memories:`);
      searchResult.memories.slice(0, 3).forEach((m, i) => {
        console.log(`   [${i + 1}] ${m.type}: ${m.memory?.substring(0, 70)}...`);
      });
    } else {
      console.log('   ⚠️ No matching memories found');
    }

    // Step 7: Get all recent memories
    console.log('\n7. All recent memories:');
    const allMemories = await page.evaluate(async (params) => {
      const res = await fetch(`${params.apiBase}/mem0/memories?limit=10`, {
        headers: { 'Authorization': `Bearer ${params.token}` }
      });
      return res.json();
    }, { apiBase: API_BASE, token: TOKEN });

    if (allMemories.memories?.length > 0) {
      allMemories.memories.forEach((m, i) => {
        console.log(`   [${i + 1}] ${m.type}: ${m.memory?.substring(0, 60)}...`);
      });
    }

    console.log('\n========================================');
    console.log('🎉 MEMORY SERVICE TEST COMPLETE');
    console.log('========================================\n');

    if (newMemories > 0) {
      console.log(`✅ SUCCESS: ${newMemories} new memories stored from chat!`);
      console.log('   The Twin is now learning and remembering conversations.');
    } else {
      console.log('⚠️ No new memories - conversation was stored but no facts extracted.');
      console.log('   This is OK - not every message has extractable facts.');
    }

  } catch (error) {
    console.error('Test error:', error.message);
  }

  await page.waitForTimeout(3000);
  await browser.close();
}

testMemoryChat().catch(console.error);
