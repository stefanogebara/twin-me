/**
 * Test script for the behavioral evidence pipeline
 * Run with: node api/test-evidence-pipeline.js
 */

import 'dotenv/config';
import behavioralEvidencePipeline from './services/behavioralEvidencePipeline.js';
import { supabaseAdmin } from './services/database.js';

const TEST_USER_ID = 'a483a979-cf85-481d-b65b-af396c2c513a';

async function testPipeline() {
  console.log('\n=== Testing Behavioral Evidence Pipeline ===\n');
  console.log(`User ID: ${TEST_USER_ID}`);

  // 1. Check connected platforms
  console.log('\n--- Step 1: Checking connected platforms ---');
  const { data: connections, error: connError } = await supabaseAdmin
    .from('platform_connections')
    .select('platform, status, connected_at')
    .eq('user_id', TEST_USER_ID)
    .in('status', ['connected', 'token_refreshed', 'pending']);

  if (connError) {
    console.error('Error fetching connections:', connError.message);
    return;
  }

  console.log('Connected platforms:');
  connections.forEach(c => {
    console.log(`  - ${c.platform}: ${c.status}`);
  });

  // 2. Run the evidence pipeline
  console.log('\n--- Step 2: Running evidence pipeline ---');
  const result = await behavioralEvidencePipeline.runPipeline(TEST_USER_ID);

  if (!result.success) {
    console.error('Pipeline failed:', result.message || result.error);
    return;
  }

  console.log('\n=== Pipeline Results ===');
  console.log(`Platforms processed: ${result.platformsProcessed?.join(', ')}`);
  console.log(`Features extracted: ${result.featuresExtracted}`);
  console.log(`Evidence generated: ${result.evidenceGenerated}`);

  // 3. Show evidence by dimension
  console.log('\n--- Evidence by Dimension ---');
  for (const [dimension, items] of Object.entries(result.evidence)) {
    console.log(`\n${dimension.toUpperCase()} (${items.length} items):`);
    items.slice(0, 3).forEach(item => {
      console.log(`  - ${item.feature} (r=${item.correlation}): ${item.description?.substring(0, 60)}...`);
    });
    if (items.length > 3) {
      console.log(`  ... and ${items.length - 3} more`);
    }
  }

  // 4. Show confidence scores
  console.log('\n--- Confidence Scores ---');
  if (result.confidence) {
    console.log(`Overall: ${(result.confidence.overall * 100).toFixed(1)}%`);
    for (const [dim, score] of Object.entries(result.confidence.by_dimension)) {
      console.log(`  ${dim}: ${(score * 100).toFixed(1)}%`);
    }
  }

  // 5. Check updated personality scores
  console.log('\n--- Updated Personality Scores ---');
  const { data: scores } = await supabaseAdmin
    .from('personality_scores')
    .select('*')
    .eq('user_id', TEST_USER_ID)
    .single();

  if (scores) {
    console.log(`Openness: ${scores.openness} (${scores.openness_confidence}% confidence)`);
    console.log(`Conscientiousness: ${scores.conscientiousness} (${scores.conscientiousness_confidence}% confidence)`);
    console.log(`Extraversion: ${scores.extraversion} (${scores.extraversion_confidence}% confidence)`);
    console.log(`Agreeableness: ${scores.agreeableness} (${scores.agreeableness_confidence}% confidence)`);
    console.log(`Neuroticism: ${scores.neuroticism} (${scores.neuroticism_confidence}% confidence)`);
    console.log(`Source: ${scores.source}`);
  } else {
    console.log('No personality scores found');
  }

  console.log('\n=== Test Complete ===\n');
}

testPipeline().catch(console.error);
