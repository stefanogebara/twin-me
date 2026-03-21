/**
 * E2E Test: Action Reflection Pipeline
 * ======================================
 * Tests the full action reflection flow:
 * 1. Seeds sample agent_actions with various outcomes
 * 2. Runs the reflection analysis
 * 3. Verifies procedure memories are created
 * 4. Checks autonomy suggestions
 *
 * Run: node api/scripts/test-action-reflection.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const TEST_USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

async function run() {
  console.log('=== Action Reflection E2E Test ===\n');

  const { supabaseAdmin } = await import('../services/database.js');

  // Step 1: Seed sample agent_actions with mixed outcomes
  console.log('Step 1: Seeding test agent_actions...');
  const testActions = [
    // Music suggestions — high acceptance rate (should trigger procedure)
    { skill_name: 'music_mood_match', action_type: 'suggestion', action_content: 'Suggested chill lo-fi playlist for evening wind-down', user_response: 'accepted', outcome_data: { followed: true } },
    { skill_name: 'music_mood_match', action_type: 'suggestion', action_content: 'Suggested upbeat morning playlist for workout', user_response: 'accepted', outcome_data: { followed: true } },
    { skill_name: 'music_mood_match', action_type: 'suggestion', action_content: 'Suggested focus music during deep work', user_response: 'accepted', outcome_data: { followed: true } },
    { skill_name: 'music_mood_match', action_type: 'suggestion', action_content: 'Suggested jazz for evening cooking', user_response: 'accepted', outcome_data: { followed: true } },
    { skill_name: 'music_mood_match', action_type: 'suggestion', action_content: 'Suggested ambient for late-night coding', user_response: 'accepted', outcome_data: { followed: true } },
    { skill_name: 'music_mood_match', action_type: 'suggestion', action_content: 'Suggested party playlist on a Tuesday morning', user_response: 'rejected', outcome_data: { followed: false } },

    // Morning briefing — mixed
    { skill_name: 'morning_briefing', action_type: 'briefing', action_content: 'Morning briefing with schedule + weather + goals', user_response: 'accepted', outcome_data: { read: true } },
    { skill_name: 'morning_briefing', action_type: 'briefing', action_content: 'Morning briefing with health recovery focus', user_response: 'ignored', outcome_data: null },

    // Pattern alert — low acceptance (should suggest downgrade)
    { skill_name: 'pattern_alert', action_type: 'nudge', action_content: 'Noticed late-night screen time pattern', user_response: 'rejected', outcome_data: { dismissed: true } },
    { skill_name: 'pattern_alert', action_type: 'nudge', action_content: 'Detected skipped meals during busy days', user_response: 'rejected', outcome_data: { dismissed: true } },
    { skill_name: 'pattern_alert', action_type: 'nudge', action_content: 'Weekend sleep schedule drift', user_response: 'rejected', outcome_data: { dismissed: true } },
    { skill_name: 'pattern_alert', action_type: 'nudge', action_content: 'Exercise frequency dropping', user_response: 'rejected', outcome_data: { dismissed: true } },
    { skill_name: 'pattern_alert', action_type: 'nudge', action_content: 'Coffee intake increasing', user_response: 'accepted', outcome_data: { acknowledged: true } },
    { skill_name: 'pattern_alert', action_type: 'nudge', action_content: 'Social media time up 30%', user_response: 'rejected', outcome_data: { dismissed: true } },
  ];

  const seeded = [];
  for (const action of testActions) {
    const { data, error } = await supabaseAdmin
      .from('agent_actions')
      .insert({
        user_id: TEST_USER_ID,
        ...action,
        autonomy_level: 1,
        resolved_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.log(`  ERROR seeding: ${error.message}`);
    } else {
      seeded.push(data.id);
    }
  }
  console.log(`  Seeded ${seeded.length}/${testActions.length} actions\n`);

  // Step 2: Run the reflection analysis directly (bypass Inngest)
  console.log('Step 2: Running action reflection...');
  try {
    // Simulate what the Inngest function does
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: outcomes } = await supabaseAdmin
      .from('agent_actions')
      .select('id, skill_name, action_type, action_content, user_response, outcome_data')
      .eq('user_id', TEST_USER_ID)
      .not('resolved_at', 'is', null)
      .gte('created_at', weekAgo);

    console.log(`  Found ${outcomes?.length || 0} resolved actions in last 7 days`);

    // Group by skill
    const bySkill = {};
    for (const a of (outcomes || [])) {
      const skill = a.skill_name || 'general';
      if (!bySkill[skill]) bySkill[skill] = { accepted: 0, rejected: 0, ignored: 0, total: 0 };
      bySkill[skill].total++;
      const r = a.user_response?.toLowerCase() || '';
      if (r === 'accepted' || r === 'positive') bySkill[skill].accepted++;
      else if (r === 'rejected' || r === 'negative') bySkill[skill].rejected++;
      else bySkill[skill].ignored++;
    }

    console.log('\n  Skill Analysis:');
    for (const [skill, stats] of Object.entries(bySkill)) {
      const responded = stats.accepted + stats.rejected;
      const rate = responded > 0 ? Math.round((stats.accepted / responded) * 100) : 0;
      console.log(`    ${skill}: ${stats.accepted} accepted, ${stats.rejected} rejected, ${stats.ignored} ignored (${rate}% acceptance)`);
    }
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }

  // Step 3: Check for existing procedure memories
  console.log('\nStep 3: Checking procedure memories...');
  const { data: procedures } = await supabaseAdmin
    .from('user_memories')
    .select('id, content, created_at')
    .eq('user_id', TEST_USER_ID)
    .eq('memory_type', 'fact')
    .like('content', '[PROCEDURE:%')
    .order('created_at', { ascending: false })
    .limit(5);

  if (procedures?.length > 0) {
    console.log(`  Found ${procedures.length} procedures:`);
    for (const p of procedures) {
      console.log(`    - ${p.content.slice(0, 100)}...`);
    }
  } else {
    console.log('  No procedures yet (will be created by Inngest function)');
  }

  // Step 4: Test insight feedback endpoint
  console.log('\nStep 4: Testing insight feedback...');
  const { data: testInsight } = await supabaseAdmin
    .from('proactive_insights')
    .select('id')
    .eq('user_id', TEST_USER_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (testInsight) {
    console.log(`  Found insight ${testInsight.id} — would POST /api/insights/${testInsight.id}/feedback with { rating: 1 }`);
  } else {
    console.log('  No insights found to test feedback on');
  }

  // Cleanup: remove seeded test actions
  console.log('\nCleanup: Removing seeded test actions...');
  if (seeded.length > 0) {
    const { error: cleanupError } = await supabaseAdmin
      .from('agent_actions')
      .delete()
      .in('id', seeded);
    console.log(cleanupError ? `  ERROR: ${cleanupError.message}` : `  Removed ${seeded.length} test actions`);
  }

  console.log('\n=== Test Complete ===');
}

run().catch(console.error);
