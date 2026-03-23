/**
 * List Brain Nodes Script
 * Lists all brain nodes to help identify valid node labels for causal edge creation.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Use service role key to bypass RLS
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function listNodes() {
  // First check what tables exist
  console.log('Checking tables...');

  // Try twins_brain_nodes first (might be the actual table name)
  let { data, error } = await supabase
    .from('twins_brain_nodes')
    .select('id, label, category, node_type')
    .limit(100);

  if (error) {
    console.log('twins_brain_nodes error:', error.message);
    // Try brain_nodes
    const result = await supabase
      .from('brain_nodes')
      .select('id, label, category, node_type')
      .limit(100);
    data = result.data;
    error = result.error;
  }

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`\nFound ${data?.length || 0} nodes:\n`);

  if (!data || data.length === 0) {
    console.log('No nodes found in database.');
    return;
  }

  let currentCategory = null;
  for (const node of data) {
    if (node.category !== currentCategory) {
      currentCategory = node.category;
      console.log(`\n=== ${currentCategory?.toUpperCase() || 'UNKNOWN'} ===`);
    }
    console.log(`  [${node.node_type || 'unknown'}] ${node.label}`);
  }
}

listNodes().catch(console.error);
