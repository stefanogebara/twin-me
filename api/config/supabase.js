import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Only use dotenv in development - Vercel provides env vars directly
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Debug logging
console.log('🔵 [Supabase Config] Initializing Supabase client');
console.log('🔵 [Supabase Config] SUPABASE_URL:', supabaseUrl);
console.log('🔵 [Supabase Config] SUPABASE_SERVICE_ROLE_KEY length:', supabaseServiceKey?.length);
console.log('🔵 [Supabase Config] SUPABASE_SERVICE_ROLE_KEY first 50:', supabaseServiceKey?.substring(0, 50));
console.log('🔵 [Supabase Config] SUPABASE_SERVICE_ROLE_KEY last 10:', supabaseServiceKey?.substring(supabaseServiceKey.length - 10));

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ [Supabase Config] Missing environment variables');
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export default supabase;
