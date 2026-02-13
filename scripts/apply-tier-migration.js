import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Supabase exposes a SQL endpoint at /rest/v1/rpc for service_role
// But DDL needs the pg endpoint. Use the /pg/ SQL API (available in newer Supabase)
// Fallback: use the management API

const statements = [
  `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'free'`,
  `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS monthly_chat_count INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS monthly_chat_reset_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', NOW())`,
  `CREATE INDEX IF NOT EXISTS idx_users_subscription_tier ON public.users(subscription_tier)`,
];

async function runSQL(sql) {
  // Use the Supabase SQL API endpoint (available with service role key)
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql })
  });
  return { status: res.status, body: await res.text() };
}

async function runViaPostgrestHack(sql) {
  // Alternative: use Supabase's pg_query extension if available
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pg_query`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ query: sql })
  });
  return { status: res.status, body: await res.text() };
}

async function run() {
  const fullSQL = statements.join(';\n') + ';';
  console.log('Attempting SQL via Supabase...');

  // Method 1: Direct SQL endpoint
  let result = await runSQL(fullSQL);
  console.log('Method 1 (rpc/):', result.status, result.body.substring(0, 200));

  if (result.status !== 200) {
    // Method 2: pg_query
    result = await runViaPostgrestHack(fullSQL);
    console.log('Method 2 (pg_query):', result.status, result.body.substring(0, 200));
  }

  if (result.status !== 200) {
    console.log('\n--- Manual migration needed ---');
    console.log('Run this SQL in the Supabase SQL Editor (Dashboard > SQL Editor):');
    console.log('');
    console.log(fullSQL);
    console.log('');
    console.log('URL: https://supabase.com/dashboard/project/lurebwaudisfilhuhmnj/sql');
  }
}

run().catch(console.error);
