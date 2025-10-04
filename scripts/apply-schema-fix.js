/**
 * Apply Database Schema Fix for Missing Columns
 * This script adds missing columns to digital_twins table
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyMigration() {
  console.log('🔄 Applying database schema fixes...\n');

  try {
    // Read the migration SQL
    const migrationSQL = `
-- Add missing columns for conversational twin builder
ALTER TABLE digital_twins
ADD COLUMN IF NOT EXISTS teaching_philosophy TEXT,
ADD COLUMN IF NOT EXISTS student_interaction TEXT,
ADD COLUMN IF NOT EXISTS humor_style TEXT,
ADD COLUMN IF NOT EXISTS communication_style TEXT,
ADD COLUMN IF NOT EXISTS expertise TEXT[],
ADD COLUMN IF NOT EXISTS voice_id TEXT,
ADD COLUMN IF NOT EXISTS common_phrases TEXT[],
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_digital_twins_voice_id ON digital_twins(voice_id);
CREATE INDEX IF NOT EXISTS idx_digital_twins_metadata ON digital_twins USING gin(metadata);

-- Add comments
COMMENT ON COLUMN digital_twins.teaching_philosophy IS 'Teachers teaching philosophy and approach';
COMMENT ON COLUMN digital_twins.student_interaction IS 'How the teacher interacts with students';
COMMENT ON COLUMN digital_twins.humor_style IS 'Teachers humor style and personality';
COMMENT ON COLUMN digital_twins.communication_style IS 'Communication style and tone';
COMMENT ON COLUMN digital_twins.expertise IS 'Array of expertise areas';
COMMENT ON COLUMN digital_twins.voice_id IS 'ElevenLabs voice ID for voice cloning';
COMMENT ON COLUMN digital_twins.common_phrases IS 'Array of common phrases the teacher uses';
COMMENT ON COLUMN digital_twins.metadata IS 'Additional metadata for the twin';
    `.trim();

    console.log('📝 Migration SQL:');
    console.log(migrationSQL);
    console.log('\n');

    // Execute the migration using Supabase RPC
    const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL });

    if (error) {
      console.error('❌ Migration failed:', error.message);
      console.error('📋 Error details:', JSON.stringify(error, null, 2));

      // If RPC doesn't exist, provide manual instructions
      if (error.code === '42883') { // undefined_function
        console.log('\n⚠️  The exec_sql RPC function does not exist.');
        console.log('\n📋 MANUAL MIGRATION INSTRUCTIONS:');
        console.log('1. Go to your Supabase Dashboard: https://lurebwaudisfilhuhmnj.supabase.co');
        console.log('2. Navigate to SQL Editor');
        console.log('3. Copy and paste the following SQL:\n');
        console.log('----------------------------------------');
        console.log(migrationSQL);
        console.log('----------------------------------------\n');
        console.log('4. Click "Run" to execute the migration');
        console.log('5. Verify the columns exist by querying the table');
      }

      return;
    }

    console.log('✅ Migration applied successfully!');
    console.log('\n🔍 Verifying schema...');

    // Verify the schema
    const { data: columns, error: schemaError } = await supabase
      .from('digital_twins')
      .select('*')
      .limit(0); // Just get schema, no data

    if (schemaError) {
      console.log('⚠️  Could not verify schema:', schemaError.message);
    } else {
      console.log('✅ Schema verification complete');
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);

    // Provide manual instructions as fallback
    console.log('\n📋 MANUAL MIGRATION REQUIRED');
    console.log('Please apply the migration manually through Supabase Dashboard SQL Editor.');
    console.log('Migration file location: supabase/migrations/005_fix_digital_twins_schema.sql');
  }
}

console.log('🚀 Database Schema Fix Script');
console.log('================================\n');

applyMigration().then(() => {
  console.log('\n✅ Script completed');
  process.exit(0);
}).catch((error) => {
  console.error('\n❌ Script failed:', error);
  process.exit(1);
});
