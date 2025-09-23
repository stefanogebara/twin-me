import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from parent directory
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createTables() {
  try {
    console.log('🔄 Creating tables directly...');

    // First, let's check if we can create a simple table to test our permissions
    console.log('🔄 Testing table creation permissions...');

    // Try to create the profiles table first
    const { data: profilesResult, error: profilesError } = await supabase
      .from('profiles')
      .select('count', { count: 'exact', head: true });

    if (profilesError && profilesError.code === 'PGRST204') {
      console.log('📋 Profiles table doesn\'t exist, this is expected.');

      // Let's check what tables do exist
      console.log('🔍 Checking existing tables...');
      const { data: existingTables, error: tablesError } = await supabase
        .from('pg_tables')
        .select('tablename')
        .eq('schemaname', 'public');

      if (tablesError) {
        console.error('❌ Cannot access pg_tables:', tablesError);
      } else {
        console.log('📋 Existing tables:', existingTables?.map(t => t.tablename) || []);
      }

      // Instead of creating tables via API, let's provide instructions
      console.log('\n📝 MANUAL MIGRATION REQUIRED:');
      console.log('The Supabase client cannot execute DDL statements via the REST API.');
      console.log('Please follow these steps:');
      console.log('1. Go to your Supabase Dashboard: https://app.supabase.com/');
      console.log('2. Navigate to SQL Editor');
      console.log('3. Copy and paste the contents of: supabase/migrations/001_initial_schema.sql');
      console.log('4. Execute the SQL to create all tables and policies');
      console.log('\nAlternatively, if you have the Supabase CLI installed:');
      console.log('1. Run: supabase db reset --local (if using local dev)');
      console.log('2. Or: supabase db push (to push migrations to remote)');

    } else if (profilesError) {
      console.error('❌ Unexpected error:', profilesError);
    } else {
      console.log('✅ Profiles table already exists!');

      // Check all required tables
      const requiredTables = [
        'profiles', 'digital_twins', 'training_materials',
        'conversations', 'messages', 'student_profiles', 'voice_profiles'
      ];

      console.log('🔍 Checking all required tables...');
      for (const tableName of requiredTables) {
        try {
          const { data, error } = await supabase
            .from(tableName)
            .select('count', { count: 'exact', head: true });

          if (error) {
            console.log(`❌ Table '${tableName}' missing or inaccessible:`, error.message);
          } else {
            console.log(`✅ Table '${tableName}' exists`);
          }
        } catch (err) {
          console.log(`❌ Table '${tableName}' check failed:`, err.message);
        }
      }
    }

  } catch (error) {
    console.error('❌ Migration error:', error);
  }
}

createTables();