import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env from parent directory
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  try {
    console.log('🔄 Reading migration file...');
    const migrationPath = path.resolve(process.cwd(), '../supabase/migrations/001_initial_schema.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('🔄 Executing migration...');
    const { error } = await supabase.rpc('exec_sql', {
      sql: migrationSQL
    });

    if (error) {
      console.error('❌ Migration failed:', error);

      // Try executing the SQL directly using the REST API
      console.log('🔄 Trying direct SQL execution...');
      const { error: directError } = await supabase
        .from('_internal')
        .select('version()')
        .limit(1);

      if (directError) {
        console.log('🔄 Executing SQL statements individually...');

        // Split the SQL into individual statements and execute them
        const statements = migrationSQL
          .split(';')
          .map(stmt => stmt.trim())
          .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

        for (const statement of statements) {
          try {
            console.log(`🔄 Executing: ${statement.substring(0, 50)}...`);
            const { error: stmtError } = await supabase.rpc('exec_sql', {
              sql: statement + ';'
            });

            if (stmtError) {
              console.warn(`⚠️  Statement failed: ${stmtError.message}`);
            }
          } catch (err) {
            console.warn(`⚠️  Statement error: ${err.message}`);
          }
        }
      }
    } else {
      console.log('✅ Migration completed successfully!');
    }

    // Test if tables were created
    console.log('🔍 Checking if tables were created...');
    const { data: tables, error: tableError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['profiles', 'digital_twins', 'training_materials', 'conversations', 'messages']);

    if (tableError) {
      console.error('❌ Failed to check tables:', tableError);
    } else {
      console.log('📋 Tables found:', tables?.map(t => t.table_name) || []);
    }

  } catch (error) {
    console.error('❌ Migration error:', error);
  }
}

runMigration();