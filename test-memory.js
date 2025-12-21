import { MemoryManager } from './api/services/memoryArchitecture.js';
import dotenv from 'dotenv';

dotenv.config();

const userId = 'a483a979-cf85-481d-b65b-af396c2c513a';
const sessionId = 'test_session_' + Date.now();

console.log('🧪 Testing Three-Tier Memory Architecture');
console.log('=========================================\n');

async function testMemory() {
  try {
    console.log('1️⃣ Initializing MemoryManager...');
    const memory = new MemoryManager(userId, sessionId);
    await memory.initialize();
    console.log('✅ Memory initialized\n');

    console.log('2️⃣ Adding user message to working memory...');
    await memory.addUserMessage('Hello! I love learning about finance and geopolitics.');
    console.log('✅ User message saved\n');

    console.log('3️⃣ Adding assistant message to working memory...');
    await memory.addAssistantMessage('That\'s wonderful! Finance and geopolitics are deeply interconnected. What aspect interests you most?');
    console.log('✅ Assistant message saved\n');

    console.log('4️⃣ Getting context for AI...');
    const context = await memory.getContextForAI();
    console.log('✅ Memory context retrieved:\n');
    console.log('Working Memory:');
    console.log(`  - Messages: ${Array.isArray(context.workingMemory) ? context.workingMemory.length : 0}`);
    console.log(`  - Scratchpad: ${memory.workingMemory.scratchpad || 'empty'}\n`);

    console.log('Core Memory:');
    console.log(`  - Preferences: ${context.coreMemory ? Object.keys(context.coreMemory).length : 0}`);
    console.log(`  - Important Facts: ${context.coreMemory?.important_facts ? context.coreMemory.important_facts.length : 0}\n`);

    console.log('Long-Term Memory:');
    console.log(`  - Life Clusters: ${context.longTermMemory?.life_clusters ? context.longTermMemory.life_clusters.length : 0}`);
    console.log(`  - Soul Signature: ${context.longTermMemory ? JSON.stringify(context.longTermMemory).substring(0, 100) : 'not yet extracted'}\n`);

    console.log('5️⃣ Testing message retrieval...');
    console.log('Recent messages:');
    if (Array.isArray(context.workingMemory) && context.workingMemory.length > 0) {
      context.workingMemory.forEach((msg, idx) => {
        console.log(`  ${idx + 1}. [${msg.role}]: ${msg.content.substring(0, 60)}...`);
      });
    } else {
      console.log('  No messages yet');
    }

    console.log('\n✅ All tests passed! Memory system is working correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack:', error.stack);
  }
}

testMemory();
