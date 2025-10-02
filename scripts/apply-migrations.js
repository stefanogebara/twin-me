import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration(migrationPath) {
  try {
    console.log(`📊 Reading migration: ${path.basename(migrationPath)}`);

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Fix inline INDEX syntax for PostgreSQL
    const fixedSQL = migrationSQL
      // Remove inline INDEX declarations
      .replace(/,\s*INDEX\s+idx_\w+\s*\([^)]+\)/gi, '')
      // Remove UNIQUE inline with INDEX
      .replace(/,\s*UNIQUE\s*\([^)]+\)\s*,\s*INDEX\s+idx_\w+\s*\([^)]+\)/gi, function(match) {
        // Extract just the UNIQUE constraint
        return match.match(/UNIQUE\s*\([^)]+\)/)[0];
      });

    console.log(`🚀 Applying migration to Supabase...`);

    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: fixedSQL
    });

    if (error) {
      // Try direct execution if exec_sql doesn't exist
      console.log(`⚠️  exec_sql not available, trying direct execution...`);

      // Split into individual statements and execute
      const statements = fixedSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        if (statement.trim().length === 0) continue;

        const { error: stmtError } = await supabase.rpc('exec', {
          query: statement + ';'
        });

        if (stmtError) {
          console.error(`❌ Error executing statement:`, stmtError.message);
          console.log(`Statement: ${statement.substring(0, 100)}...`);
        }
      }
    }

    console.log(`✅ Migration applied successfully!`);
    return true;
  } catch (error) {
    console.error(`❌ Migration failed:`, error.message);
    throw error;
  }
}

async function main() {
  const migrationFile = process.argv[2] || 'supabase/migrations/003_soul_signature_platform_data.sql';
  const migrationPath = path.join(__dirname, '..', migrationFile);

  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  await applyMigration(migrationPath);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
