import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Only use dotenv in development - Vercel provides env vars directly
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// Debug logging - Verify environment variables are loaded correctly
console.log('🔵 [Supabase Config] Initializing Supabase client');
console.log('🔵 [Supabase Config] NODE_ENV:', process.env.NODE_ENV);
console.log('🔵 [Supabase Config] SUPABASE_URL:', supabaseUrl);
console.log('🔵 [Supabase Config] SUPABASE_ANON_KEY length:', supabaseAnonKey?.length);
console.log('🔵 [Supabase Config] Using ANON KEY (RLS-compliant)');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ [Supabase Config] Missing environment variables');
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export default supabase;
