/**
 * Build realistic test inputs from the database for each target.
 * Caches to disk so all rounds in a session use identical inputs.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { TEST_USER_ID } from './config.js';

export async function buildTestInputs(target, supabaseAdmin, outputDir) {
  const cachePath = resolve(outputDir, 'test-inputs.json');

  // Return cached if exists (deterministic across rounds)
  if (existsSync(cachePath)) {
    return JSON.parse(readFileSync(cachePath, 'utf-8'));
  }

  let contextData = {};

  // Fetch real data from DB for context
  const { data: memories } = await supabaseAdmin
    .from('user_memories')
    .select('content, memory_type, metadata, created_at')
    .eq('user_id', TEST_USER_ID)
    .order('created_at', { ascending: false })
    .limit(50);

  const platformData = (memories || []).filter(m => m.memory_type === 'platform_data').slice(0, 10);
  const reflections = (memories || []).filter(m => m.memory_type === 'reflection').slice(0, 10);
  const observations = (memories || []).filter(m => m.memory_type === 'platform_data' || m.memory_type === 'observation').slice(0, 15);
  const facts = (memories || []).filter(m => m.memory_type === 'fact').slice(0, 5);

  // Fetch twin summary
  const { data: summaryRow } = await supabaseAdmin
    .from('twin_summaries')
    .select('summary')
    .eq('user_id', TEST_USER_ID)
    .single();

  const twinSummary = summaryRow?.summary || 'Stefano is a tech-savvy Brazilian entrepreneur who loves music, coding, and building AI products.';

  switch (target.id) {
    case 'twin-chat':
      contextData = {
        twinSummary,
        memories: [...platformData, ...reflections.slice(0, 5), ...facts].slice(0, 15),
      };
      break;

    case 'onboarding':
      // Test inputs are static (defined in config), no DB context needed
      contextData = {};
      break;

    case 'reflections':
      contextData = {
        memories: [...platformData, ...observations].slice(0, 20),
      };
      break;

    case 'insights':
      contextData = {
        observations: observations.slice(0, 15),
        reflections: reflections.slice(0, 5),
      };
      break;
  }

  const result = { testInputs: target.testInputs, contextData };

  // Cache to disk
  writeFileSync(cachePath, JSON.stringify(result, null, 2));
  return result;
}
