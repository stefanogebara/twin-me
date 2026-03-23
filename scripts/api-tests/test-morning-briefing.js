/**
 * Test Morning Briefing Pipeline — End-to-End
 * =============================================
 * Exercises the same steps as the Inngest morning briefing function
 * without requiring the Inngest dev server. Runs locally via:
 *
 *   node --experimental-vm-modules api/scripts/test-morning-briefing.js
 *
 * Steps:
 *   1. Gather calendar data from platform_data
 *   2. Gather health (Whoop) data from platform_data
 *   3. Get core memory blocks for personality
 *   4. Compose briefing via LLM (TIER_ANALYSIS)
 *   5. Deliver as proactive insight + agent_actions + agent_events
 *   6. Verify: query proactive_insights to confirm delivery
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const TEST_USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

async function run() {
  console.log('=== Morning Briefing E2E Test ===');
  console.log(`User: ${TEST_USER_ID}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  // Dynamic imports to ensure env is loaded first
  const { supabaseAdmin } = await import('../services/database.js');
  const { complete, TIER_ANALYSIS } = await import('../services/llmGateway.js');
  const { getBlocks } = await import('../services/coreMemoryService.js');

  // Step 1: Gather calendar data
  console.log('Step 1: Gathering calendar data...');
  let calendarData = null;
  try {
    const { data } = await supabaseAdmin
      .from('platform_data')
      .select('raw_data')
      .eq('user_id', TEST_USER_ID)
      .eq('provider', 'google_calendar')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    calendarData = data?.raw_data || null;
    console.log(`  Calendar: ${calendarData ? 'Found (' + JSON.stringify(calendarData).length + ' chars)' : 'No data'}`);
  } catch {
    console.log('  Calendar: No data available');
  }

  // Step 2: Gather health data (Whoop)
  console.log('Step 2: Gathering Whoop health data...');
  let healthData = null;
  try {
    const { data } = await supabaseAdmin
      .from('platform_data')
      .select('raw_data')
      .eq('user_id', TEST_USER_ID)
      .eq('provider', 'whoop')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    healthData = data?.raw_data || null;
    console.log(`  Health: ${healthData ? 'Found (' + JSON.stringify(healthData).length + ' chars)' : 'No data'}`);
  } catch {
    console.log('  Health: No data available');
  }

  // Step 3: Get core memory blocks
  console.log('Step 3: Loading core memory blocks...');
  const coreBlocks = await getBlocks(TEST_USER_ID);
  const blockNames = Object.keys(coreBlocks).filter(k => coreBlocks[k]?.content);
  console.log(`  Blocks loaded: ${blockNames.join(', ') || 'none'}`);
  for (const name of blockNames) {
    console.log(`    ${name}: ${coreBlocks[name].content.length} chars`);
  }

  // Step 4: Compose briefing
  console.log('\nStep 4: Composing briefing via LLM (TIER_ANALYSIS)...');
  const soulSignature = coreBlocks.soul_signature?.content || '';
  const humanBlock = coreBlocks.human?.content || '';
  const goalsBlock = coreBlocks.goals?.content || '';

  const prompt = `You are composing a morning briefing for someone as their digital twin — a close friend who knows them deeply.

WHO THEY ARE:
${soulSignature}

WHAT YOU KNOW:
${humanBlock}

THEIR GOALS:
${goalsBlock}

TODAY'S CALENDAR:
${calendarData ? JSON.stringify(calendarData).slice(0, 1500) : 'No calendar data available'}

HEALTH/RECOVERY:
${healthData ? JSON.stringify(healthData).slice(0, 800) : 'No health data available'}

Write a warm, personal morning briefing (3-5 short paragraphs). Include:
1. A personality-appropriate greeting (match their communication style)
2. Health/recovery context if available (frame as a friend would, not clinical)
3. Today's agenda highlights (meetings, blocks, priorities)
4. One insight connecting their data (e.g., "packed day + moderate recovery = pace yourself")
5. A small positive note or encouragement

Keep it casual, warm, and USEFUL. No corporate speak. No bullet lists.
Write it like a text from their smartest, most perceptive friend.`;

  const response = await complete({
    messages: [{ role: 'user', content: prompt }],
    tier: TIER_ANALYSIS,
    maxTokens: 600,
    temperature: 0.7,
    userId: TEST_USER_ID,
    purpose: 'morning_briefing_test'
  });

  const briefing = response?.content || response?.text || null;
  if (!briefing) {
    console.error('FAIL: Briefing generation returned null');
    process.exit(1);
  }
  console.log(`  Briefing generated: ${briefing.length} chars`);
  console.log('\n--- BRIEFING OUTPUT ---');
  console.log(briefing);
  console.log('--- END BRIEFING ---\n');

  // Step 5: Deliver as proactive insight
  console.log('Step 5: Delivering as proactive insight...');
  const { data: insight, error: insightErr } = await supabaseAdmin
    .from('proactive_insights')
    .insert({
      user_id: TEST_USER_ID,
      insight: briefing,
      urgency: 'medium',
      category: 'briefing',
      delivered: false
    })
    .select()
    .single();

  if (insightErr) {
    console.error('FAIL: Could not insert proactive insight:', insightErr.message);
    process.exit(1);
  }
  console.log(`  Insight created: ${insight.id}`);

  // Log agent action
  const { data: action, error: actionErr } = await supabaseAdmin
    .from('agent_actions')
    .insert({
      user_id: TEST_USER_ID,
      skill_name: 'morning_briefing',
      action_type: 'briefing',
      action_content: briefing,
      autonomy_level: 3,
      platform_sources: [
        calendarData ? 'calendar' : null,
        healthData ? 'whoop' : null,
      ].filter(Boolean),
    })
    .select()
    .single();

  if (actionErr) {
    console.warn('  Warning: agent_actions insert failed:', actionErr.message);
  } else {
    console.log(`  Agent action logged: ${action.id}`);
  }

  // Log agent event
  const { error: eventErr } = await supabaseAdmin
    .from('agent_events')
    .insert({
      user_id: TEST_USER_ID,
      event_type: 'morning_briefing_generated',
      event_data: {
        hasCalendar: !!calendarData,
        hasHealth: !!healthData,
        briefingLength: briefing.length,
        test: true,
      },
      source: 'morning_briefing_test',
    });

  if (eventErr) {
    console.warn('  Warning: agent_events insert failed:', eventErr.message);
  } else {
    console.log('  Agent event logged');
  }

  // Step 6: Verify
  console.log('\nStep 6: Verification...');
  const { data: verifyInsight } = await supabaseAdmin
    .from('proactive_insights')
    .select('id, urgency, category, delivered, created_at')
    .eq('id', insight.id)
    .single();

  if (verifyInsight) {
    console.log('  PASS: Proactive insight verified in DB');
    console.log(`    ID: ${verifyInsight.id}`);
    console.log(`    Category: ${verifyInsight.category}`);
    console.log(`    Delivered: ${verifyInsight.delivered}`);
    console.log(`    Created: ${verifyInsight.created_at}`);
  } else {
    console.error('  FAIL: Could not verify proactive insight');
  }

  console.log('\n=== Morning Briefing E2E Test COMPLETE ===');
  console.log('Summary:');
  console.log(`  Calendar data: ${calendarData ? 'YES' : 'NO'}`);
  console.log(`  Health data: ${healthData ? 'YES' : 'NO'}`);
  console.log(`  Core blocks: ${blockNames.length}/4`);
  console.log(`  Briefing: ${briefing.length} chars`);
  console.log(`  Insight ID: ${insight.id}`);

  process.exit(0);
}

run().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
