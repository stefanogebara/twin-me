import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔍 Testing Supabase Connection');
console.log('📍 URL:', supabaseUrl);
console.log('🔑 Service Key length:', supabaseServiceKey?.length);
console.log('🔑 Service Key first 50:', supabaseServiceKey?.substring(0, 50));
console.log('🔑 Service Key last 20:', supabaseServiceKey?.substring(supabaseServiceKey?.length - 20));

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('\n✅ Client created successfully');

// Test 1: Count users
console.log('\n🔍 Test 1: Counting users...');
try {
  const { data, error, count } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('❌ Error:', error);
  } else {
    console.log('✅ Users count:', count);
  }
} catch (err) {
  console.error('❌ Exception:', err);
}

// Test 2: Query a single user
console.log('\n🔍 Test 2: Querying users...');
try {
  const { data, error } = await supabase
    .from('users')
    .select('id, email')
    .limit(1);

  if (error) {
    console.error('❌ Error:', error);
    console.error('❌ Error code:', error.code);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error details:', error.details);
    console.error('❌ Error hint:', error.hint);
  } else {
    console.log('✅ Query successful, found users:', data?.length);
    if (data && data.length > 0) {
      console.log('✅ Sample user:', data[0]);
    }
  }
} catch (err) {
  console.error('❌ Exception:', err);
}

// Test 3: Try to insert a test user
console.log('\n🔍 Test 3: Testing insert...');
try {
  const { data, error } = await supabase
    .from('users')
    .insert({
      email: 'test_supabase_connection@example.com',
      first_name: 'Test',
      last_name: 'User',
      oauth_provider: 'test'
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Insert error:', error);
    console.error('❌ Error code:', error.code);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error details:', error.details);
    console.error('❌ Error hint:', error.hint);
  } else {
    console.log('✅ Insert successful:', data);

    // Clean up - delete the test user
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', data.id);

    if (deleteError) {
      console.error('❌ Failed to clean up test user:', deleteError);
    } else {
      console.log('✅ Test user cleaned up');
    }
  }
} catch (err) {
  console.error('❌ Exception:', err);
}

console.log('\n✅ Test complete');
process.exit(0);
