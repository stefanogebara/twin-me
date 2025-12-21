/**
 * Apply Twin Chat Database Migration
 *
 * Applies the twin chat tables schema to Supabase database.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('='.repeat(80));
  console.log('TWIN CHAT DATABASE MIGRATION');
  console.log('='.repeat(80));

  try {
    // Read migration file
    const migrationPath = path.resolve(__dirname, '../../database/supabase/migrations/20250105000000_create_twin_chat_tables.sql');
    console.log(`\nReading migration file: ${migrationPath}`);

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log(`Migration file size: ${(migrationSQL.length / 1024).toFixed(2)} KB`);
    console.log('\nApplying migration...\n');

    // Execute migration
    // Note: Supabase JS client doesn't support executing raw SQL directly
    // We need to use the SQL editor in Supabase dashboard or use pg client
    console.log('⚠️  MANUAL STEP REQUIRED:');
    console.log('\nPlease apply the migration using ONE of these methods:\n');

    console.log('METHOD 1: Supabase Dashboard (Recommended)');
    console.log('  1. Go to: https://supabase.com/dashboard/project/lurebwaudisfilhuhmnj/sql/new');
    console.log('  2. Copy and paste the following SQL from:');
    console.log(`     ${migrationPath}`);
    console.log('  3. Click "Run" to execute the migration\n');

    console.log('METHOD 2: Use Supabase CLI');
    console.log('  1. Install Supabase CLI: npm install -g supabase');
    console.log('  2. Link to your project: supabase link --project-ref lurebwaudisfilhuhmnj');
    console.log(`  3. Apply migration: supabase db push\n`);

    console.log('METHOD 3: Direct PostgreSQL Connection');
    console.log('  1. Get connection string from Supabase Dashboard > Settings > Database');
    console.log('  2. Use psql or any PostgreSQL client');
    console.log(`  3. Execute the SQL file\n`);

    console.log('='.repeat(80));
    console.log('\nMIGRATION SQL PREVIEW:');
    console.log('='.repeat(80));
    console.log(migrationSQL.split('\n').slice(0, 30).join('\n'));
    console.log('\n... (file continues) ...\n');

    // Verify connection
    console.log('Verifying Supabase connection...');
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);

    if (error) {
      console.error('❌ Connection failed:', error.message);
    } else {
      console.log('✅ Connected to Supabase successfully');
    }

    console.log('\n' + '='.repeat(80));
    console.log('NEXT STEPS:');
    console.log('='.repeat(80));
    console.log('1. Apply the migration using one of the methods above');
    console.log('2. Test the twin chat system: npm run server:dev');
    console.log('3. Open the frontend: npm run dev');
    console.log('4. Navigate to /talk-to-twin and start chatting!');
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

applyMigration();
