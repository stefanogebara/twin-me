import dotenv from 'dotenv';
dotenv.config();

const API_URL = process.env.VITE_API_URL || 'http://localhost:3001/api';
const TEST_USER_ID = 'a483a979-cf85-481d-b65b-af396c2c513a';

// Create a test JWT token for authentication
// In production, this would come from the auth flow
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🧪 Testing Memory API Endpoints');
console.log('================================\n');

async function getAuthToken() {
  // For testing, we'll create a simple JWT token
  // In production, this comes from the auth flow
  const { data, error } = await supabase.auth.admin.createUser({
    email: 'test@example.com',
    password: 'test123456',
    email_confirm: true,
    user_metadata: {
      id: TEST_USER_ID
    }
  });

  if (error && error.message !== 'User already registered') {
    console.error('Error creating test user:', error);
    throw error;
  }

  // Sign in to get a JWT
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: 'test@example.com',
    password: 'test123456'
  });

  if (signInError) {
    console.error('Error signing in:', signInError);
    throw signInError;
  }

  return signInData.session.access_token;
}

async function testSessionsList(token) {
  console.log('1️⃣ Testing GET /api/memory/sessions/list');
  try {
    const response = await fetch(`${API_URL}/memory/sessions/list`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await response.json();

    if (response.ok) {
      console.log('✅ Sessions list retrieved successfully');
      console.log(`   Found ${data.data?.sessions?.length || 0} sessions`);
      if (data.data?.sessions?.length > 0) {
        console.log(`   First session: ${data.data.sessions[0].sessionId}`);
        return data.data.sessions[0].sessionId;
      }
      return null;
    } else {
      console.error('❌ Failed to get sessions:', data);
      return null;
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
    return null;
  }
  console.log('');
}

async function testGetMemory(token, sessionId) {
  console.log(`\n2️⃣ Testing GET /api/memory/${sessionId}`);
  try {
    const response = await fetch(`${API_URL}/memory/${sessionId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await response.json();

    if (response.ok) {
      console.log('✅ Memory data retrieved successfully');
      console.log(`   Working Memory: ${data.data?.workingMemory?.messageCount || 0} messages`);
      console.log(`   Core Memory: ${data.data?.coreMemory?.preferenceCount || 0} preferences`);
      console.log(`   Long-Term Memory: ${data.data?.longTermMemory?.clusterCount || 0} clusters`);
      return true;
    } else {
      console.error('❌ Failed to get memory:', data);
      return false;
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
    return false;
  }
}

async function testDeleteSession(token, sessionId) {
  console.log(`\n3️⃣ Testing DELETE /api/memory/${sessionId}`);

  // First create a test session to delete
  const testSessionId = `test_delete_${Date.now()}`;
  const { MemoryManager } = await import('./api/services/memoryArchitecture.js');
  const memory = new MemoryManager(TEST_USER_ID, testSessionId);
  await memory.initialize();
  await memory.addUserMessage('Test message for deletion');

  try {
    const response = await fetch(`${API_URL}/memory/${testSessionId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await response.json();

    if (response.ok) {
      console.log('✅ Session deleted successfully');
      console.log(`   Deleted session: ${data.data?.sessionId}`);
      return true;
    } else {
      console.error('❌ Failed to delete session:', data);
      return false;
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
    return false;
  }
}

async function runTests() {
  try {
    // Get auth token
    console.log('🔑 Getting authentication token...');
    const token = await getAuthToken();
    console.log('✅ Authentication successful\n');

    // Test sessions list
    const sessionId = await testSessionsList(token);

    // Test get memory if we have a session
    if (sessionId) {
      await testGetMemory(token, sessionId);
    } else {
      console.log('⚠️  No sessions found, skipping memory retrieval test');
    }

    // Test delete session
    await testDeleteSession(token);

    console.log('\n✅ All backend API tests completed!');
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    console.error(error.stack);
  }
}

runTests();
