import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Testing Supabase connection...');
console.log('URL:', supabaseUrl);
console.log('Service key length:', supabaseServiceKey?.length);
console.log('Service key preview:', supabaseServiceKey?.substring(0, 50) + '...');

// Create client
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Test query
(async () => {
  try {
    console.log('\n[TEST 1] Querying public.users table...');
    const { data, error } = await supabase
      .from('users')
      .select('id, email')
      .limit(1);

    if (error) {
      console.error('❌ Query failed:', error.message);
      console.error('Full error:', JSON.stringify(error, null, 2));
    } else {
      console.log('✅ Query succeeded!');
      console.log('Data:', data);
    }

    console.log('\n[TEST 2] Attempting insert into soul_observer_events...');
    const testUserId = 'a483a979-cf85-481d-b65b-af396c2c513a';
    const { data: insertData, error: insertError } = await supabase
      .from('soul_observer_events')
      .insert({
        user_id: testUserId,
        session_id: 'test_session_' + Date.now(),
        event_type: 'test',
        timestamp: new Date().toISOString()
      })
      .select();

    if (insertError) {
      console.error('❌ Insert failed:', insertError.message);
      console.error('Full error:', JSON.stringify(insertError, null, 2));
    } else {
      console.log('✅ Insert succeeded!');
      console.log('Inserted data:', insertData);
    }

  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }
})();
