import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

console.log('🔍 Testing with ANON KEY');
console.log('📍 URL:', supabaseUrl);
console.log('🔑 Anon Key length:', supabaseAnonKey?.length);

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('\n✅ Client created with ANON key');

// Test query
console.log('\n🔍 Test: Querying users...');
try {
  const { data, error } = await supabase
    .from('users')
    .select('id, email')
    .limit(1);

  if (error) {
    console.error('❌ Error:', error);
  } else {
    console.log('✅ Query successful, found users:', data?.length);
  }
} catch (err) {
  console.error('❌ Exception:', err);
}

// Test insert
console.log('\n🔍 Test: Inserting user...');
try {
  const { data, error } = await supabase
    .from('users')
    .insert({
      email: 'test_anon_' + Date.now() + '@example.com',
      first_name: 'Test',
      last_name: 'Anon',
      oauth_provider: 'test'
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Insert error:', error);
  } else {
    console.log('✅ Insert successful:', data?.id);

    // Clean up
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', data.id);

    if (!deleteError) {
      console.log('✅ Test user cleaned up');
    }
  }
} catch (err) {
  console.error('❌ Exception:', err);
}

console.log('\n✅ Test complete');
process.exit(0);
