/**
 * Apply the twin_goals migration to Supabase.
 * Usage: node api/scripts/apply-goal-migration.js
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.join(__dirname, '../../database/supabase/migrations/20260220_create_twin_goals.sql');

async function applyMigration() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Split into individual statements (handle $$ blocks)
  const statements = [];
  let current = '';
  let inDollarBlock = false;

  for (const line of sql.split('\n')) {
    const trimmed = line.trim();

    // Skip pure comments
    if (trimmed.startsWith('--') && !inDollarBlock) {
      continue;
    }

    current += line + '\n';

    // Track $$ blocks (function bodies)
    const dollarCount = (line.match(/\$\$/g) || []).length;
    if (dollarCount % 2 !== 0) {
      inDollarBlock = !inDollarBlock;
    }

    // Statement ends with ; outside a $$ block
    if (trimmed.endsWith(';') && !inDollarBlock) {
      const stmt = current.trim();
      if (stmt.length > 5) {
        statements.push(stmt);
      }
      current = '';
    }
  }

  console.log(`Found ${statements.length} SQL statements to execute`);

  let success = 0;
  let errors = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.substring(0, 80).replace(/\n/g, ' ');

    try {
      const response = await fetch(`${url}/rest/v1/rpc/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({}),
      });

      // Supabase REST API can't run raw SQL directly.
      // Use the pg_net or management endpoint instead.
      // Fallback: use supabase-js client with .rpc() or direct pg connection
      break;
    } catch (e) {
      // Expected - REST API doesn't support raw SQL
      break;
    }
  }

  // Use @supabase/supabase-js to run SQL via the management API
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // Execute the full SQL as one block via the sql endpoint
  const fullSql = sql.replace(/--[^\n]*/g, '').trim();

  // Try using the Supabase Management API (requires project ref)
  const projectRef = url.match(/https:\/\/([^.]+)/)?.[1];
  if (!projectRef) {
    console.error('Could not extract project ref from URL:', url);
    process.exit(1);
  }

  console.log(`Project ref: ${projectRef}`);
  console.log('Applying migration via Supabase Management API...');

  // The Management API requires a different auth token (personal access token)
  // For now, let's use the supabase-js approach with individual table operations

  // Alternative: Execute via the PostgREST function
  // First check if the tables already exist
  const { data: existingTables, error: tableErr } = await supabase
    .from('twin_goals')
    .select('id')
    .limit(1);

  if (!tableErr) {
    console.log('Tables already exist! Migration may have been applied already.');
    console.log('Testing query... found', existingTables?.length || 0, 'rows');
    process.exit(0);
  }

  if (tableErr && !tableErr.message.includes('does not exist') && !tableErr.message.includes('relation')) {
    console.log('Table exists but query failed:', tableErr.message);
    console.log('This likely means the table exists. Checking goal_progress_log...');

    const { error: progressErr } = await supabase
      .from('goal_progress_log')
      .select('id')
      .limit(1);

    if (!progressErr) {
      console.log('Both tables exist! Migration already applied.');
      process.exit(0);
    }
  }

  // Tables don't exist - need to apply migration
  // The easiest way is via the Supabase Dashboard SQL editor or psql
  console.log('\n========================================');
  console.log('MANUAL STEP REQUIRED');
  console.log('========================================');
  console.log('The Supabase REST API cannot execute DDL (CREATE TABLE) statements.');
  console.log('Please apply the migration manually:');
  console.log('');
  console.log('Option 1: Supabase Dashboard');
  console.log(`  1. Go to https://supabase.com/dashboard/project/${projectRef}/sql/new`);
  console.log('  2. Paste the contents of:');
  console.log(`     ${migrationPath}`);
  console.log('  3. Click "Run"');
  console.log('');
  console.log('Option 2: psql');
  console.log(`  psql "postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres" -f "${migrationPath}"`);
  console.log('========================================');
}

applyMigration().catch(err => {
  console.error('Migration error:', err.message);
  process.exit(1);
});
