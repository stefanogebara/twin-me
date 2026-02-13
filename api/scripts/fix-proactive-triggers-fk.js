/**
 * Fix proactive_triggers FK constraint
 * Run with: node api/scripts/fix-proactive-triggers-fk.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from root directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration');
  console.log('SUPABASE_URL:', supabaseUrl ? 'set' : 'missing');
  console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'set' : 'missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixForeignKey() {
  console.log('🔧 Fixing proactive_triggers FK constraint...');

  try {
    // Execute each statement separately using rpc
    const statements = [
      // Drop old FK constraints
      `ALTER TABLE proactive_triggers DROP CONSTRAINT IF EXISTS proactive_triggers_user_id_fkey`,
      `ALTER TABLE trigger_executions DROP CONSTRAINT IF EXISTS trigger_executions_user_id_fkey`,

      // Add correct FK constraints referencing auth.users
      `ALTER TABLE proactive_triggers ADD CONSTRAINT proactive_triggers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`,
      `ALTER TABLE trigger_executions ADD CONSTRAINT trigger_executions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`,
    ];

    for (const sql of statements) {
      console.log(`Executing: ${sql.substring(0, 60)}...`);

      // Use the Supabase SQL editor API directly
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey,
        },
        body: JSON.stringify({ sql }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.log(`⚠️  Statement result: ${response.status} - ${error}`);
      } else {
        console.log(`✅ Statement executed`);
      }
    }

    console.log('✅ FK constraint fix complete!');

    // Test by trying to get triggers
    console.log('\n🔍 Testing triggers query...');
    const { data, error } = await supabase
      .from('proactive_triggers')
      .select('id, name')
      .limit(5);

    if (error) {
      console.log('Query result:', error.message);
    } else {
      console.log('Query successful, triggers:', data?.length || 0);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixForeignKey();
