import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { createLogger } from '../services/logger.js';

const log = createLogger('Supabase');

// Only use dotenv in development - Vercel provides env vars directly
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// Debug logging - Verify environment variables are loaded correctly
log.info('Initializing Supabase client', {
  nodeEnv: process.env.NODE_ENV,
  supabaseUrl: supabaseUrl ? '***configured***' : 'MISSING',
  anonKeyLength: supabaseAnonKey?.length,
  serviceRoleKeyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length
});

if (!supabaseUrl || !supabaseAnonKey) {
  log.error('Missing environment variables');
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
if (!supabaseServiceKey) {
  log.error('Missing SUPABASE_SERVICE_ROLE_KEY for admin Supabase client');
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY for admin Supabase client');
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});
log.info('supabaseAdmin configured', { keyType: 'SERVICE_ROLE_KEY (bypasses RLS)' });

export default supabase;
