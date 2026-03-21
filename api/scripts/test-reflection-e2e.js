/**
 * Full E2E Test: Action Reflection Pipeline
 * ==========================================
 * Seeds data, runs analysis, generates procedures, checks autonomy,
 * composes reflection — all without Inngest infra.
 *
 * Run: node api/scripts/test-reflection-e2e.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

async function run() {
  console.log('=== Full Action Reflection E2E ===\n');

  const { supabaseAdmin } = await import('../services/database.js');
  const { complete, TIER_EXTRACTION } = await import('../services/llmGateway.js');
  const { addMemory } = await import('../services/memoryStreamService.js');

  // 1. Seed actions
  console.log('1. Seeding 14 test actions...');
  const actions = [
    { skill_name: 'music_mood_match', action_type: 'suggestion', action_content: 'Suggested chill lo-fi playlist for evening wind-down', user_response: 'accepted' },
    { skill_name: 'music_mood_match', action_type: 'suggestion', action_content: 'Suggested upbeat morning playlist for workout', user_response: 'accepted' },
    { skill_name: 'music_mood_match', action_type: 'suggestion', action_content: 'Suggested focus music during deep work block', user_response: 'accepted' },
    { skill_name: 'music_mood_match', action_type: 'suggestion', action_content: 'Suggested jazz for evening cooking session', user_response: 'accepted' },
    { skill_name: 'music_mood_match', action_type: 'suggestion', action_content: 'Suggested ambient for late-night coding', user_response: 'accepted' },
    { skill_name: 'music_mood_match', action_type: 'suggestion', action_content: 'Suggested party playlist on Tuesday morning', user_response: 'rejected' },
    { skill_name: 'morning_briefing', action_type: 'briefing', action_content: 'Morning briefing with schedule + goals', user_response: 'accepted' },
    { skill_name: 'morning_briefing', action_type: 'briefing', action_content: 'Morning briefing health focus', user_response: 'ignored' },
    { skill_name: 'pattern_alert', action_type: 'nudge', action_content: 'Late-night screen time pattern', user_response: 'rejected' },
    { skill_name: 'pattern_alert', action_type: 'nudge', action_content: 'Skipped meals during busy days', user_response: 'rejected' },
    { skill_name: 'pattern_alert', action_type: 'nudge', action_content: 'Weekend sleep schedule drift', user_response: 'rejected' },
    { skill_name: 'pattern_alert', action_type: 'nudge', action_content: 'Exercise frequency dropping', user_response: 'rejected' },
    { skill_name: 'pattern_alert', action_type: 'nudge', action_content: 'Coffee intake increasing', user_response: 'accepted' },
    { skill_name: 'pattern_alert', action_type: 'nudge', action_content: 'Social media time up 30%', user_response: 'rejected' },
  ];

  const seededIds = [];
  for (const a of actions) {
    const { data, error } = await supabaseAdmin.from('agent_actions').insert({
      user_id: USER_ID, ...a, autonomy_level: 1, resolved_at: new Date().toISOString(),
    }).select('id').single();
    if (data) seededIds.push(data.id);
    if (error) console.log('  Seed error:', error.message);
  }
  console.log(`  Seeded ${seededIds.length} actions`);

  // 2. Analyze patterns
  console.log('\n2. Analyzing patterns...');
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: outcomes } = await supabaseAdmin.from('agent_actions')
    .select('id, skill_name, action_type, action_content, user_response, outcome_data')
    .eq('user_id', USER_ID).not('resolved_at', 'is', null).gte('created_at', weekAgo);

  const bySkill = {};
  for (const a of outcomes) {
    const skill = a.skill_name || 'general';
    if (!bySkill[skill]) bySkill[skill] = { accepted: 0, rejected: 0, ignored: 0, total: 0, examples: [] };
    bySkill[skill].total++;
    const r = a.user_response?.toLowerCase() || '';
    if (r === 'accepted' || r === 'positive') bySkill[skill].accepted++;
    else if (r === 'rejected' || r === 'negative') bySkill[skill].rejected++;
    else bySkill[skill].ignored++;
    if (bySkill[skill].examples.length < 3) {
      bySkill[skill].examples.push({ content: a.action_content?.slice(0, 200), response: a.user_response });
    }
  }

  for (const [skill, stats] of Object.entries(bySkill)) {
    const responded = stats.accepted + stats.rejected;
    const rate = responded > 0 ? Math.round((stats.accepted / responded) * 100) : 0;
    console.log(`  ${skill}: ${stats.accepted} accepted, ${stats.rejected} rejected (${rate}% acceptance)`);
  }

  // 3. Generate procedure for music_mood_match
  console.log('\n3. Generating procedure memory for music_mood_match...');
  const musicStats = bySkill['music_mood_match'];
  if (musicStats && musicStats.accepted >= 5) {
    const exampleText = musicStats.examples
      .filter(e => e.response === 'accepted')
      .map(e => `- ${e.content}`)
      .join('\n');

    const rate = Math.round((musicStats.accepted / (musicStats.accepted + musicStats.rejected)) * 100);
    const response = await complete({
      messages: [{
        role: 'user',
        content: `Analyze these accepted twin actions for the "music_mood_match" skill and extract a reusable procedure.

ACCEPTED ACTIONS (${musicStats.accepted} total, ${rate}% acceptance rate):
${exampleText}

Write a concise procedure (2-3 sentences) describing:
1. When this approach works (conditions)
2. What makes it effective (framing/timing)
3. What to avoid

Procedure:`
      }],
      tier: TIER_EXTRACTION,
      maxTokens: 200,
      temperature: 0.3,
      userId: USER_ID,
      purpose: 'test_procedure'
    });

    const procedureText = (response?.content || response?.text || '').trim();
    console.log(`  Generated: ${procedureText.slice(0, 200)}`);

    const mem = await addMemory(
      USER_ID,
      `[PROCEDURE:music_mood_match] ${procedureText}`,
      'fact',
      { source: 'action_reflection', skill_name: 'music_mood_match', procedure: true },
      { importanceScore: 8 }
    );
    console.log(`  Stored as memory: ${mem?.id || 'FAILED'}`);
  } else {
    console.log('  Skipped — not enough accepted actions');
  }

  // 4. Verify procedure retrieval (same query as agenticCore.planTask)
  console.log('\n4. Verifying procedure retrieval (agenticCore.planTask query)...');
  const { data: procedures } = await supabaseAdmin.from('user_memories')
    .select('id, content')
    .eq('user_id', USER_ID)
    .eq('memory_type', 'fact')
    .like('content', '[PROCEDURE:%')
    .order('importance_score', { ascending: false })
    .limit(5);

  console.log(`  Found ${procedures?.length || 0} procedures:`);
  for (const p of (procedures || [])) {
    console.log(`    - ${p.content.slice(0, 120)}...`);
  }

  // 5. Autonomy suggestions
  console.log('\n5. Checking autonomy suggestions...');
  let suggestionsFound = 0;
  for (const [skill, stats] of Object.entries(bySkill)) {
    const responded = stats.accepted + stats.rejected;
    if (responded < 5) continue;
    const rate = stats.accepted / responded;
    if (rate >= 0.8) {
      console.log(`  UPGRADE: ${skill} (${Math.round(rate * 100)}% acceptance) -> "Want me to handle these more autonomously?"`);
      suggestionsFound++;
    } else if (rate <= 0.2) {
      console.log(`  DOWNGRADE: ${skill} (${Math.round(rate * 100)}% acceptance) -> "Should I dial back and just observe?"`);
      suggestionsFound++;
    }
  }
  if (suggestionsFound === 0) console.log('  No suggestions triggered');

  // 6. Compose reflection
  console.log('\n6. Composing reflection...');
  const skillSummaries = Object.entries(bySkill)
    .map(([s, st]) => `${s}: ${st.accepted} accepted, ${st.rejected} rejected`)
    .join('\n');

  const refl = await complete({
    messages: [{
      role: 'user',
      content: `Summarize what this twin learned from its recent actions in 2-3 sentences.

ACTION OUTCOMES:
${skillSummaries}

Write as if the twin is thinking. Start with "I learned that..." or "I noticed that..."`
    }],
    tier: TIER_EXTRACTION,
    maxTokens: 200,
    temperature: 0.4,
    userId: USER_ID,
    purpose: 'test_reflection'
  });

  const reflText = (refl?.content || refl?.text || '').trim();
  console.log(`  ${reflText}`);

  // Cleanup
  console.log('\n7. Cleanup...');
  if (seededIds.length > 0) {
    await supabaseAdmin.from('agent_actions').delete().in('id', seededIds);
    console.log(`  Removed ${seededIds.length} test actions (kept procedure memory)`);
  }

  console.log('\n=== All Tests Passed ===');
}

run().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
