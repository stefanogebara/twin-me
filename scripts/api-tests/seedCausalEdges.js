/**
 * Seed Causal Edges Script
 *
 * Creates test causal edges between existing nodes to demonstrate
 * the Phase 4 causal reasoning visualization features.
 *
 * Usage: node api/scripts/seedCausalEdges.js
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

// Causal relationship definitions using REAL node labels from database
const CAUSAL_EDGES = [
  // Music preferences causing/enabling traits
  { from: 'Music: Trap', to: 'The Energized Catalyst', type: 'causes', confidence: 0.85 },
  { from: 'Music: Brazilian Funk', to: 'Socially Energized', type: 'enables', confidence: 0.78 },
  { from: 'Loves Lo-fi Music', to: 'Focus Work Sessions', type: 'enables', confidence: 0.82 },

  // Traits causing behaviors
  { from: 'Outgoing and energetic', to: 'Socially Energized', type: 'causes', confidence: 0.90 },
  { from: 'Highly organized and disciplined', to: 'Focus Work Sessions', type: 'enables', confidence: 0.85 },
  { from: 'Purposeful Discipline', to: 'Balanced Schedule', type: 'causes', confidence: 0.88 },

  // Interests triggering behaviors
  { from: 'Interested in: Coding', to: 'Focus Work Sessions', type: 'triggers', confidence: 0.80 },
  { from: 'Interested in: Design', to: 'Writing', type: 'enables', confidence: 0.72 },
  { from: 'Interested in: Learning', to: 'Moderate Openness to Experience', type: 'enables', confidence: 0.75 },

  // Schedule patterns
  { from: 'Early Bird Scheduler', to: 'Focus Work Sessions', type: 'enables', confidence: 0.82 },
  { from: 'Schedule: Meetings', to: 'Socially Energized', type: 'triggers', confidence: 0.70 },

  // Trait interactions
  { from: 'High-Octane Optimizer', to: 'Highly organized and disciplined', type: 'enables', confidence: 0.85 },
  { from: 'Calm and resilient', to: 'Emotionally Unshakeable', type: 'causes', confidence: 0.92 },
  { from: 'Pragmatic Connector', to: 'Schedule: Calls', type: 'triggers', confidence: 0.75 }
];

async function findNodeByLabel(label) {
  // Try exact match first
  let { data, error } = await supabase
    .from('brain_nodes')
    .select('id, label')
    .ilike('label', label)
    .limit(1);

  if (data && data.length > 0) return data[0];

  // Try partial match
  const { data: partial } = await supabase
    .from('brain_nodes')
    .select('id, label')
    .ilike('label', `%${label}%`)
    .limit(1);

  return partial && partial.length > 0 ? partial[0] : null;
}

async function createCausalEdge(fromNode, toNode, type, confidence) {
  // Check if edge already exists
  const { data: existing } = await supabase
    .from('brain_edges')
    .select('id')
    .eq('from_node_id', fromNode.id)
    .eq('to_node_id', toNode.id)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`  Edge already exists: ${fromNode.label} -> ${toNode.label}, updating to causal`);

    const { data, error } = await supabase
      .from('brain_edges')
      .update({
        relationship_type: type,
        strength: confidence
      })
      .eq('id', existing[0].id)
      .select();

    if (error) {
      console.log(`    Update error: ${error.message}`);
    }

    return !error;
  }

  // Create new edge (without metadata column)
  const { data, error } = await supabase
    .from('brain_edges')
    .insert({
      from_node_id: fromNode.id,
      to_node_id: toNode.id,
      relationship_type: type,
      strength: confidence,
      context: 'causal'
    })
    .select();

  if (error) {
    console.log(`    Insert error: ${error.message}`);
  }

  return !error;
}

async function seedCausalEdges() {
  console.log('🧠 Seeding Causal Edges for Phase 4 Testing\n');

  let created = 0;
  let failed = 0;
  let skipped = 0;

  for (const edge of CAUSAL_EDGES) {
    console.log(`Processing: ${edge.from} --[${edge.type}]--> ${edge.to}`);

    const fromNode = await findNodeByLabel(edge.from);
    const toNode = await findNodeByLabel(edge.to);

    if (!fromNode) {
      console.log(`  ⚠️ Source node not found: "${edge.from}" - skipping`);
      skipped++;
      continue;
    }

    if (!toNode) {
      console.log(`  ⚠️ Target node not found: "${edge.to}" - skipping`);
      skipped++;
      continue;
    }

    console.log(`  Found: ${fromNode.label} (${fromNode.id}) -> ${toNode.label} (${toNode.id})`);

    const success = await createCausalEdge(fromNode, toNode, edge.type, edge.confidence);

    if (success) {
      console.log(`  ✅ Created causal edge: ${edge.type} (${Math.round(edge.confidence * 100)}% confidence)`);
      created++;
    } else {
      console.log(`  ❌ Failed to create edge`);
      failed++;
    }
  }

  console.log('\n📊 Summary:');
  console.log(`  Created: ${created}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Skipped (missing nodes): ${skipped}`);
  console.log('\n✨ Done!');
}

seedCausalEdges().catch(console.error);
