/**
 * Apply Database Migration Script
 * Applies the soul data collection architecture migration to Supabase
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

// Create Supabase client with service role key (bypasses RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  console.log('🚀 Starting migration application...\n');

  // Read migration file
  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '004_soul_data_collection_architecture.sql');

  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
  console.log(`📄 Loaded migration: 004_soul_data_collection_architecture.sql`);
  console.log(`📏 Size: ${(migrationSQL.length / 1024).toFixed(2)} KB\n`);

  console.log('⚠️  NOTE: Direct SQL execution requires Supabase RPC function.');
  console.log('          Attempting to execute migration...\n');

  try {
    // Try to execute the entire migration as one query
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: migrationSQL
    });

    if (error) {
      console.error('❌ Migration failed via RPC:', error.message);
      console.log('\n💡 MANUAL APPLICATION REQUIRED:\n');
      printManualInstructions();
      process.exit(1);
    }

    console.log('✅ Migration executed successfully!\n');
    console.log('🎉 Soul data collection system is now ready!\n');

    // Verify tables were created
    await verifyMigration();

  } catch (err) {
    console.error('❌ Exception during migration:', err.message);
    console.log('\n💡 MANUAL APPLICATION REQUIRED:\n');
    printManualInstructions();
    process.exit(1);
  }
}

async function verifyMigration() {
  console.log('🔍 Verifying migration...\n');

  const tables = [
    'user_platform_data',
    'user_text_content',
    'user_embeddings',
    'user_style_profile',
    'user_ngrams',
    'conversation_memory',
    'platform_insights',
    'data_extraction_jobs'
  ];

  let verified = 0;

  for (const table of tables) {
    try {
      const { error } = await supabase.from(table).select('count').limit(0);

      if (!error || error.code === 'PGRST116') {
        console.log(`  ✅ Table exists: ${table}`);
        verified++;
      } else {
        console.log(`  ❌ Table missing: ${table}`);
      }
    } catch (err) {
      console.log(`  ⚠️  Cannot verify: ${table}`);
    }
  }

  console.log(`\n📊 Verified ${verified}/${tables.length} tables\n`);
}

function printManualInstructions() {
  console.log('📋 MANUAL MIGRATION STEPS:');
  console.log('   1. Go to: https://supabase.com/dashboard/project/lurebwaudisfilhuhmnj/sql');
  console.log('   2. Click "New query" or "+ New query"');
  console.log('   3. Copy entire contents of: supabase/migrations/004_soul_data_collection_architecture.sql');
  console.log('   4. Paste into SQL editor');
  console.log('   5. Click "Run" or press Ctrl+Enter');
  console.log('   6. Verify no errors in output\n');
  console.log('📁 Migration file location:');
  console.log('   C:\\Users\\stefa\\twin-ai-learn\\supabase\\migrations\\004_soul_data_collection_architecture.sql\n');
}

// Test connection first
async function testConnection() {
  console.log('🔌 Testing Supabase connection...');

  try {
    const { data, error } = await supabase
      .from('digital_twins')
      .select('count')
      .limit(1);

    if (error && error.code !== 'PGRST116') { // PGRST116 = table not found (acceptable)
      console.error('❌ Connection failed:', error.message);
      return false;
    }

    console.log('✅ Connected to Supabase successfully\n');
    return true;
  } catch (err) {
    console.error('❌ Connection error:', err.message);
    return false;
  }
}

// Main execution
(async () => {
  const connected = await testConnection();

  if (!connected) {
    console.log('\n⚠️  Cannot connect to Supabase. Please check:');
    console.log('   1. SUPABASE_URL is correct in .env');
    console.log('   2. SUPABASE_SERVICE_ROLE_KEY is correct in .env');
    console.log('   3. Your Supabase project is active\n');
    printManualInstructions();
    process.exit(1);
  }

  await applyMigration();
})();
