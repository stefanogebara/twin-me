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
console.log('🔵 [Supabase Config] SUPABASE_SERVICE_ROLE_KEY length:', process.env.SUPABASE_SERVICE_ROLE_KEY?.length);

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

// Admin client with service role key for bypassing RLS
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : supabase;
console.log('🔵 [Supabase Config] supabaseAdmin using:', supabaseServiceKey ? 'SERVICE_ROLE_KEY (bypasses RLS)' : 'ANON_KEY (RLS-compliant)');

export default supabase;
