/**
 * Fix Digital Twins Schema Migration Script
 * Applies the 005_fix_digital_twins_schema.sql migration to Supabase
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

// Create Supabase client with service role key (bypasses RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyCurrentSchema() {
  console.log('🔍 Checking current digital_twins schema...\n');

  try {
    // Get a sample twin to see current schema
    const { data: twins, error } = await supabase
      .from('digital_twins')
      .select('*')
      .limit(1);

    if (error && error.code !== 'PGRST116') {
      console.error('❌ Error querying digital_twins:', error.message);
      return false;
    }

    if (!twins || twins.length === 0) {
      console.log('ℹ️  No existing twins found (table may be empty)');
      return true;
    }

    const sampleTwin = twins[0];
    const existingColumns = Object.keys(sampleTwin);

    console.log('📊 Current columns in digital_twins:');
    console.log(existingColumns.map(col => `   - ${col}`).join('\n'));
    console.log('');

    // Check for missing columns
    const requiredColumns = [
      'teaching_philosophy',
      'student_interaction',
      'humor_style',
      'communication_style',
      'expertise',
      'voice_id',
      'metadata'
    ];

    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));

    if (missingColumns.length > 0) {
      console.log('⚠️  Missing columns that need to be added:');
      console.log(missingColumns.map(col => `   - ${col}`).join('\n'));
      console.log('');
      return true; // Need to apply migration
    } else {
      console.log('✅ All required columns already exist!');
      console.log('ℹ️  Migration may have already been applied.');
      console.log('');
      return false; // Migration not needed
    }
  } catch (err) {
    console.error('❌ Error checking schema:', err.message);
    return false;
  }
}

async function applyMigration() {
  console.log('🚀 Applying migration 005_fix_digital_twins_schema.sql...\n');

  // Read migration file
  const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '005_fix_digital_twins_schema.sql');

  if (!existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const migrationSQL = readFileSync(migrationPath, 'utf8');
  console.log(`📄 Loaded migration file`);
  console.log(`📏 Size: ${(migrationSQL.length / 1024).toFixed(2)} KB\n`);

  console.log('═'.repeat(70));
  console.log('⚠️  IMPORTANT: Supabase client cannot execute DDL statements directly.');
  console.log('   You must apply this migration via the Supabase Dashboard.');
  console.log('═'.repeat(70));
  console.log('');

  console.log('📋 STEP-BY-STEP INSTRUCTIONS:');
  console.log('');
  console.log('1️⃣  Open Supabase Dashboard:');
  console.log(`   https://supabase.com/dashboard/project/lurebwaudisfilhuhmnj`);
  console.log('');
  console.log('2️⃣  Navigate to SQL Editor:');
  console.log('   Click "SQL Editor" in the left sidebar');
  console.log('');
  console.log('3️⃣  Create new query:');
  console.log('   Click "+ New query" button');
  console.log('');
  console.log('4️⃣  Copy migration SQL:');
  console.log(`   File location: ${migrationPath}`);
  console.log('');
  console.log('5️⃣  Paste and execute:');
  console.log('   Paste the SQL into the editor and click "Run"');
  console.log('');
  console.log('═'.repeat(70));
  console.log('');

  console.log('📄 MIGRATION SQL PREVIEW:');
  console.log('─'.repeat(70));
  console.log(migrationSQL.substring(0, 800));
  console.log('... (truncated)');
  console.log('─'.repeat(70));
  console.log('');

  console.log('💡 After applying the migration, run this script again to verify.');
  console.log('');
}

async function verifyMigration() {
  console.log('🔍 Verifying migration was applied...\n');

  try {
    // Try to query a new column
    const { data, error } = await supabase
      .from('digital_twins')
      .select('teaching_philosophy, student_interaction, humor_style, communication_style, expertise, voice_id, metadata')
      .limit(1);

    if (error) {
      if (error.message.includes('column') && error.message.includes('does not exist')) {
        console.log('❌ Migration NOT applied yet.');
        console.log(`   Error: ${error.message}`);
        console.log('');
        return false;
      }
      console.log('⚠️  Warning:', error.message);
      return false;
    }

    console.log('✅ Migration verified! All new columns are accessible.');
    console.log('');

    // Show the columns
    if (data && data.length > 0) {
      console.log('📊 Sample data from new columns:');
      console.log(JSON.stringify(data[0], null, 2));
    } else {
      console.log('ℹ️  Table is empty, but schema is correct.');
    }
    console.log('');

    return true;
  } catch (err) {
    console.error('❌ Verification error:', err.message);
    return false;
  }
}

// Main execution
(async () => {
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║   Digital Twins Schema Fix - Migration 005                        ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Test connection
  console.log('🔌 Testing Supabase connection...');
  try {
    const { data, error } = await supabase
      .from('digital_twins')
      .select('count')
      .limit(1);

    if (error && error.code !== 'PGRST116') {
      console.error('❌ Connection failed:', error.message);
      console.log('');
      console.log('⚠️  Please check your .env file:');
      console.log('   - SUPABASE_URL');
      console.log('   - SUPABASE_SERVICE_ROLE_KEY');
      process.exit(1);
    }

    console.log('✅ Connected to Supabase successfully\n');
  } catch (err) {
    console.error('❌ Connection error:', err.message);
    process.exit(1);
  }

  // Check current schema
  const needsMigration = await verifyCurrentSchema();

  if (!needsMigration) {
    console.log('🎉 Schema is already up to date!');
    console.log('');
    process.exit(0);
  }

  // Show migration instructions
  await applyMigration();

  console.log('⏳ Waiting for you to apply the migration...');
  console.log('   (Press Ctrl+C to exit)');
  console.log('');
})();
