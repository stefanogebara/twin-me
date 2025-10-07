import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔵 Testing Supabase Connection');
console.log('🔵 SUPABASE_URL:', supabaseUrl);
console.log('🔵 SUPABASE_SERVICE_ROLE_KEY (first 50 chars):', supabaseServiceKey?.substring(0, 50) + '...');

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function testConnection() {
  try {
    console.log('\n🔵 Testing query to users table...');
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .limit(1);

    if (error) {
      console.error('❌ Query failed:', error);
      return;
    }

    console.log('✅ Query successful!');
    console.log('✅ Data:', data);
  } catch (err) {
    console.error('❌ Exception:', err);
  }
}

testConnection();
