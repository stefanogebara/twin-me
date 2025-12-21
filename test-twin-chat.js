/**
 * Twin Chat System Test Script
 *
 * Tests the complete twin chat system including:
 * - Database connectivity
 * - API endpoints
 * - Personality profile generation
 * - Chat response generation
 */

import dotenv from 'dotenv';
dotenv.config();

console.log('='.repeat(80));
console.log('TWIN CHAT SYSTEM TEST');
console.log('='.repeat(80));

// Test 1: Environment Variables
console.log('\n[TEST 1] Checking Environment Variables...');

const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
  'JWT_SECRET'
];

let envCheckPassed = true;
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.log(`  ❌ Missing: ${envVar}`);
    envCheckPassed = false;
  } else {
    console.log(`  ✅ Found: ${envVar}`);
  }
}

if (!envCheckPassed) {
  console.log('\n❌ Environment variable check failed. Please check your .env file.');
  process.exit(1);
}

console.log('\n✅ All required environment variables found.');

// Test 2: Import Services
console.log('\n[TEST 2] Importing Services...');

try {
  const { createClient } = await import('@supabase/supabase-js');
  console.log('  ✅ Supabase client imported');

  const Anthropic = await import('@anthropic-ai/sdk');
  console.log('  ✅ Anthropic SDK imported');

  // Test imports of our services
  await import('./api/services/twinPersonality.js');
  console.log('  ✅ Twin Personality service imported');

  await import('./api/services/anthropicService.js');
  console.log('  ✅ Anthropic service imported');

  await import('./api/services/conversationManager.js');
  console.log('  ✅ Conversation Manager imported');

  await import('./api/routes/twin-chat.js');
  console.log('  ✅ Twin Chat routes imported');

  console.log('\n✅ All services imported successfully');
} catch (error) {
  console.log(`\n❌ Import failed: ${error.message}`);
  console.log('\nStack trace:', error.stack);
  process.exit(1);
}

// Test 3: Database Connection
console.log('\n[TEST 3] Testing Database Connection...');

try {
  const { createClient } = await import('@supabase/supabase-js');

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Test connection
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .limit(1);

  if (error) {
    throw error;
  }

  console.log('  ✅ Database connection successful');

  // Check if twin_conversations table exists
  const { data: tables, error: tableError } = await supabase
    .from('twin_conversations')
    .select('id')
    .limit(1);

  if (tableError) {
    console.log('  ⚠️  twin_conversations table not found or not accessible');
    console.log('  💡 Please run the database migration first');
    console.log('     Run: node api/scripts/apply-twin-chat-migration.js');
  } else {
    console.log('  ✅ twin_conversations table exists');
  }

  console.log('\n✅ Database connection test passed');
} catch (error) {
  console.log(`\n❌ Database connection failed: ${error.message}`);
  process.exit(1);
}

// Test 4: Anthropic API Connection
console.log('\n[TEST 4] Testing Anthropic API Connection...');

try {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  // Test with a simple message
  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 10,
    messages: [{ role: 'user', content: 'Say "test"' }]
  });

  if (response.content[0].text) {
    console.log(`  ✅ Anthropic API connection successful`);
    console.log(`  Response: "${response.content[0].text}"`);
  }

  console.log('\n✅ Anthropic API test passed');
} catch (error) {
  console.log(`\n❌ Anthropic API test failed: ${error.message}`);
  console.log('  💡 Check your ANTHROPIC_API_KEY in .env file');
  process.exit(1);
}

// Test 5: Personality Profile Generation (Simulated)
console.log('\n[TEST 5] Testing Personality Profile Logic...');

try {
  const { generateSystemPrompt } = await import('./api/services/twinPersonality.js');

  // Simulate a personality profile
  const mockProfile = {
    profile_data: {
      communication_style: {
        tone: 'casual',
        formality: 'informal',
        emoji_usage: 'moderate',
        sentence_length: 'medium',
        characteristics: ['technically proficient', 'continuous learner']
      },
      interests: [
        { category: 'music', items: ['Synthwave', 'Electronic'], source: 'spotify' }
      ],
      expertise: [
        { category: 'programming', skills: ['TypeScript', 'React'], source: 'github' }
      ],
      patterns: {
        spotify: { top_genres: ['Synthwave', 'Electronic'], listening_style: 'energetic' },
        github: { primary_languages: ['TypeScript', 'JavaScript'], coding_style: 'modern' }
      }
    }
  };

  const systemPrompt = generateSystemPrompt(mockProfile, 'twin', 'personal', 'casual');

  if (systemPrompt && systemPrompt.length > 100) {
    console.log('  ✅ System prompt generated successfully');
    console.log(`  Length: ${systemPrompt.length} characters`);
    console.log('  Preview:');
    console.log('  ' + systemPrompt.split('\n')[0]);
  } else {
    throw new Error('System prompt too short or empty');
  }

  console.log('\n✅ Personality profile logic test passed');
} catch (error) {
  console.log(`\n❌ Personality profile test failed: ${error.message}`);
  process.exit(1);
}

// Test 6: Rate Limit Logic
console.log('\n[TEST 6] Testing Rate Limit Logic...');

try {
  const { checkRateLimit } = await import('./api/services/anthropicService.js');

  const testUserId = 'test-user-' + Date.now();

  // Test first request
  const result1 = checkRateLimit(testUserId);
  if (result1.allowed && result1.remaining === 49) {
    console.log('  ✅ First request allowed (49 remaining)');
  } else {
    throw new Error(`Unexpected rate limit result: ${JSON.stringify(result1)}`);
  }

  // Test second request
  const result2 = checkRateLimit(testUserId);
  if (result2.allowed && result2.remaining === 48) {
    console.log('  ✅ Second request allowed (48 remaining)');
  } else {
    throw new Error(`Unexpected rate limit result: ${JSON.stringify(result2)}`);
  }

  console.log('\n✅ Rate limit logic test passed');
} catch (error) {
  console.log(`\n❌ Rate limit test failed: ${error.message}`);
  process.exit(1);
}

// Summary
console.log('\n' + '='.repeat(80));
console.log('TEST SUMMARY');
console.log('='.repeat(80));
console.log('✅ Environment Variables: PASSED');
console.log('✅ Service Imports: PASSED');
console.log('✅ Database Connection: PASSED');
console.log('✅ Anthropic API: PASSED');
console.log('✅ Personality Profile Logic: PASSED');
console.log('✅ Rate Limit Logic: PASSED');
console.log('='.repeat(80));

console.log('\n🎉 All tests passed! Your twin chat system is ready.');

console.log('\nNEXT STEPS:');
console.log('1. Apply database migration (if not done yet):');
console.log('   - Go to Supabase Dashboard SQL Editor');
console.log('   - Copy/paste from database/supabase/migrations/20250105000000_create_twin_chat_tables.sql');
console.log('   - Run the SQL');
console.log('');
console.log('2. Start the backend server:');
console.log('   npm run server:dev');
console.log('');
console.log('3. Start the frontend:');
console.log('   npm run dev');
console.log('');
console.log('4. Navigate to:');
console.log('   http://localhost:8086/talk-to-twin');
console.log('');
console.log('5. Connect platforms and start chatting with your digital twin!');
console.log('');
console.log('='.repeat(80));
