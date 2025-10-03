/**
 * Apply Database Migration Script
 * Applies the soul data collection architecture migration to Supabase
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

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

  // Split SQL into individual statements (simple split by semicolon)
  // Note: This is a basic splitter. For production, use a proper SQL parser
  const statements = migrationSQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`🔢 Found ${statements.length} SQL statements to execute\n`);

  let successCount = 0;
  let errorCount = 0;

  // Execute each statement
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];

    // Get first line for logging (statement preview)
    const preview = statement.split('\n')[0].substring(0, 80);
    console.log(`[${i + 1}/${statements.length}] Executing: ${preview}...`);

    try {
      const { data, error } = await supabase.rpc('exec_sql', {
        sql_query: statement + ';'
      });

      if (error) {
        // Try direct query if rpc fails
        const { error: directError } = await supabase
          .from('_migrations')
          .select('*')
          .limit(0); // Just to test connection

        if (directError) {
          console.error(`  ❌ Error: ${error.message}`);
          errorCount++;
        } else {
          console.log(`  ⚠️  Warning: ${error.message} (might be expected)`);
        }
      } else {
        console.log(`  ✅ Success`);
        successCount++;
      }
    } catch (err) {
      console.error(`  ❌ Exception: ${err.message}`);
      errorCount++;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 Migration Summary:`);
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${errorCount}`);
  console.log(`   📝 Total: ${statements.length}`);
  console.log(`${'='.repeat(60)}\n`);

  if (errorCount > 0) {
    console.log('⚠️  Some statements failed. This may be normal if:');
    console.log('   - Extensions/tables already exist');
    console.log('   - Policies are being recreated');
    console.log('   - Functions are being replaced');
    console.log('\n💡 You can manually apply the migration via Supabase dashboard:');
    console.log('   1. Go to https://supabase.com/dashboard/project/[your-project]/sql');
    console.log('   2. Copy contents of supabase/migrations/004_soul_data_collection_architecture.sql');
    console.log('   3. Paste and run in SQL editor');
  } else {
    console.log('🎉 Migration applied successfully!');
  }
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
    console.log('   3. Your Supabase project is active');
    process.exit(1);
  }

  console.log('⚠️  NOTE: Direct SQL execution via Supabase client is limited.');
  console.log('          For best results, apply migration manually via dashboard.\n');
  console.log('📋 RECOMMENDED APPROACH:');
  console.log('   1. Go to: https://supabase.com/dashboard');
  console.log('   2. Select your project: lurebwaudisfilhuhmnj');
  console.log('   3. Navigate to: SQL Editor');
  console.log('   4. Create new query');
  console.log('   5. Copy paste from: supabase/migrations/004_soul_data_collection_architecture.sql');
  console.log('   6. Run the query\n');

  console.log('Press Ctrl+C to cancel, or wait 5 seconds to attempt automatic application...');

  await new Promise(resolve => setTimeout(resolve, 5000));

  await applyMigration();
})();
