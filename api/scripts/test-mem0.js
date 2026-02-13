/**
 * Test Memory Service Integration
 *
 * Quick script to verify the memory service is working
 * Run: node api/scripts/test-mem0.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import {
  initializeMemory,
  addConversationMemory,
  searchMemories,
  addUserFact,
  getMemoryStats,
  getAllMemories
} from '../services/mem0Service.js';

const TEST_USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d'; // Use real user ID from .env or tests

async function runTests() {
  console.log('\n🧪 Testing Memory Service...\n');

  // Check API key
  console.log('Environment check:');
  console.log('   ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? '✓ Set' : '✗ Not set');
  console.log('   SUPABASE_URL:', process.env.SUPABASE_URL ? '✓ Set' : '✗ Not set');
  console.log('');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('❌ ANTHROPIC_API_KEY not set - fact extraction will be skipped');
  }

  // Initialize
  console.log('1. Initializing Memory Service...');
  const result = initializeMemory();
  console.log('✅ Memory service ready\n');

  // Test adding a conversation with fact extraction
  console.log('2. Adding test conversation (with fact extraction)...');
  try {
    const convResult = await addConversationMemory(
      TEST_USER_ID,
      'I really love jazz music, especially Miles Davis and John Coltrane. I usually listen to jazz when I need to focus on work.',
      'That\'s wonderful! Jazz is excellent for focus. Miles Davis\'s "Kind of Blue" is particularly good for concentration. Your appreciation for classic jazz shows sophisticated musical taste.',
      { platform: 'test', source: 'test_script' }
    );
    console.log('✅ Conversation added');
    console.log(`   Facts extracted: ${convResult?.factsExtracted || 0}\n`);
  } catch (err) {
    console.log('⚠️ Could not add conversation:', err.message);
    console.log('   (Table may not exist yet - run the migration)\n');
  }

  // Test adding a user fact directly
  console.log('3. Adding user fact directly...');
  try {
    await addUserFact(TEST_USER_ID, 'User prefers calm music in the morning for focus', 'music_preference');
    console.log('✅ User fact added\n');
  } catch (err) {
    console.log('⚠️ Could not add fact:', err.message, '\n');
  }

  // Test searching memories
  console.log('4. Searching memories for "jazz music"...');
  try {
    const results = await searchMemories(TEST_USER_ID, 'jazz music focus', 5);
    console.log(`✅ Found ${results.length} relevant memories`);
    results.forEach((mem, i) => {
      console.log(`   [${i + 1}] ${mem.type}: ${mem.memory?.substring(0, 60)}...`);
    });
    console.log('');
  } catch (err) {
    console.log('⚠️ Search failed:', err.message, '\n');
  }

  // Test getting stats
  console.log('5. Getting memory stats...');
  try {
    const stats = await getMemoryStats(TEST_USER_ID);
    console.log(`✅ Stats: ${stats.total} total memories`);
    if (Object.keys(stats.byType).length > 0) {
      console.log('   By type:', JSON.stringify(stats.byType));
    }
    console.log('');
  } catch (err) {
    console.log('⚠️ Stats failed:', err.message, '\n');
  }

  // Test getting all memories
  console.log('6. Getting recent memories...');
  try {
    const all = await getAllMemories(TEST_USER_ID, 5);
    console.log(`✅ Retrieved ${all.length} memories`);
    all.forEach((mem, i) => {
      console.log(`   [${i + 1}] ${mem.type}: ${mem.memory?.substring(0, 50)}...`);
    });
    console.log('');
  } catch (err) {
    console.log('⚠️ Get all failed:', err.message, '\n');
  }

  console.log('🎉 Memory service test complete!\n');
  console.log('Next steps:');
  console.log('1. Apply the migration: database/supabase/migrations/20260204_create_user_memories.sql');
  console.log('2. Restart the server');
  console.log('3. Chat with your Twin - memories will be extracted and stored automatically!\n');
}

runTests().catch(console.error);
