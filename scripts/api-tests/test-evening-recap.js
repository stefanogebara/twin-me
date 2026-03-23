/**
 * E2E Test: Evening Recap Pipeline
 * ==================================
 * Run: node api/scripts/test-evening-recap.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const TEST_USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

async function run() {
  console.log('=== Evening Recap E2E Test ===\n');

  const { supabaseAdmin } = await import('../services/database.js');
  const { complete, TIER_ANALYSIS } = await import('../services/llmGateway.js');
  const { getBlocks } = await import('../services/coreMemoryService.js');

  // Step 1: Gather health (fallback chain)
  console.log('Step 1: Gathering health data (platform-agnostic)...');
  const HEALTH_PROVIDERS = ['whoop', 'oura', 'garmin', 'fitbit', 'strava'];
  let healthProvider = null, healthData = null;
  for (const p of HEALTH_PROVIDERS) {
    try {
      const { data } = await supabaseAdmin.from('platform_data').select('raw_data')
        .eq('user_id', TEST_USER_ID).eq('provider', p).order('created_at', { ascending: false }).limit(1).single();
      if (data?.raw_data) { healthProvider = p; healthData = data.raw_data; break; }
    } catch {}
  }
  console.log(`  Health: ${healthProvider || 'none'}`);

  // Step 2: Gather calendar (fallback chain)
  console.log('Step 2: Gathering calendar data...');
  let calendarProvider = null, calendarData = null;
  for (const p of ['google_calendar', 'outlook']) {
    try {
      const { data } = await supabaseAdmin.from('platform_data').select('raw_data')
        .eq('user_id', TEST_USER_ID).eq('provider', p).order('created_at', { ascending: false }).limit(1).single();
      if (data?.raw_data) { calendarProvider = p; calendarData = data.raw_data; break; }
    } catch {}
  }
  console.log(`  Calendar: ${calendarProvider || 'none'}`);

  // Step 3: Gather today's activity across ALL platforms
  console.log('Step 3: Gathering today\'s platform activity...');
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const { data: memories } = await supabaseAdmin
    .from('user_memories')
    .select('content, memory_type, metadata')
    .eq('user_id', TEST_USER_ID)
    .in('memory_type', ['platform_data', 'observation'])
    .gte('created_at', todayStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(30);

  const byPlatform = {};
  for (const mem of (memories || [])) {
    const platform = mem.metadata?.platform || mem.metadata?.source || 'unknown';
    if (!byPlatform[platform]) byPlatform[platform] = [];
    if (byPlatform[platform].length < 3) byPlatform[platform].push(mem.content);
  }
  const platformNames = Object.keys(byPlatform);
  console.log(`  Platforms active: ${platformNames.length > 0 ? platformNames.join(', ') : 'none'}`);

  // Step 4: Gather twin actions today
  console.log('Step 4: Gathering twin actions today...');
  const { data: actions } = await supabaseAdmin
    .from('agent_actions')
    .select('skill_name, action_type, action_content')
    .eq('user_id', TEST_USER_ID)
    .gte('created_at', todayStart.toISOString())
    .limit(5);
  console.log(`  Twin actions: ${actions?.length || 0}`);

  // Step 5: Get personality
  console.log('Step 5: Loading personality...');
  const coreBlocks = await getBlocks(TEST_USER_ID);
  console.log(`  Blocks: ${Object.keys(coreBlocks).filter(k => coreBlocks[k]?.content).join(', ')}`);

  // Step 6: Compose recap
  console.log('\nStep 6: Composing evening recap via LLM...');
  const soulSignature = coreBlocks.soul_signature?.content || '';
  const humanBlock = coreBlocks.human?.content || '';
  const goalsBlock = coreBlocks.goals?.content || '';

  let activitySection = 'No platform activity tracked today.';
  if (Object.keys(byPlatform).length > 0) {
    activitySection = Object.entries(byPlatform)
      .map(([p, items]) => `${p}: ${items.join(' | ')}`)
      .join('\n');
  }

  let actionsSection = '';
  if (actions?.length > 0) {
    actionsSection = `\nTHINGS I DID TODAY:\n${actions.map(a => `- ${a.skill_name || a.action_type}: ${a.action_content?.slice(0, 100)}`).join('\n')}`;
  }

  const prompt = `You are composing an evening recap for someone as their digital twin — a close friend wrapping up the day together.

WHO THEY ARE:
${soulSignature}

WHAT YOU KNOW:
${humanBlock}

THEIR GOALS:
${goalsBlock}

TODAY'S CALENDAR:
${calendarData ? JSON.stringify(calendarData).slice(0, 1200) : 'No calendar data'}

HEALTH/RECOVERY:
${healthData ? JSON.stringify(healthData).slice(0, 600) : 'No health data'}
(Source: ${healthProvider || 'none'})

TODAY'S ACTIVITY ACROSS PLATFORMS:
${activitySection}
${actionsSection}

Write a warm, reflective evening recap (3-5 short paragraphs). Include:
1. How the day actually went (based on data, not generic)
2. Health/energy reflection if data available (friend tone, not clinical)
3. What stood out today — any interesting patterns or moments
4. A brief look-ahead or suggestion for the evening
5. A genuine closing note (not cheesy, match their personality)

Keep it casual, warm, and REAL. No corporate speak. No bullet lists.
Write it like texting a close friend at the end of the day.`;

  const response = await complete({
    messages: [{ role: 'user', content: prompt }],
    tier: TIER_ANALYSIS,
    maxTokens: 700,
    temperature: 0.7,
    userId: TEST_USER_ID,
    purpose: 'evening_recap_test'
  });

  const recap = response?.content || response?.text || null;
  if (!recap) { console.error('FAIL: Recap generation returned null'); process.exit(1); }
  console.log(`  Generated: ${recap.length} chars`);
  console.log('\n--- EVENING RECAP ---');
  console.log(recap);
  console.log('--- END RECAP ---\n');

  // Step 7: Deliver
  console.log('Step 7: Delivering...');
  const { data: insight, error: insErr } = await supabaseAdmin.from('proactive_insights').insert({
    user_id: TEST_USER_ID, insight: recap, urgency: 'low', category: 'evening_recap', delivered: false,
  }).select().single();

  if (insErr) { console.error('FAIL:', insErr.message); process.exit(1); }
  console.log(`  PASS: Insight ${insight.id}`);

  await supabaseAdmin.from('agent_events').insert({
    user_id: TEST_USER_ID, event_type: 'evening_recap_generated',
    event_data: { healthSource: healthProvider, platformsActive: platformNames, test: true },
    source: 'evening_recap_test',
  });
  console.log('  Agent event logged');

  // Verify
  const { data: verify } = await supabaseAdmin.from('proactive_insights')
    .select('id, category, urgency').eq('id', insight.id).single();
  console.log(`  PASS: Verified — ${verify?.category}`);

  console.log('\n=== Evening Recap E2E Test COMPLETE ===');
  console.log(`  Health: ${healthProvider || 'none'} | Calendar: ${calendarProvider || 'none'}`);
  console.log(`  Platforms: ${platformNames.join(', ') || 'none'} | Twin actions: ${actions?.length || 0}`);
  console.log(`  Recap: ${recap.length} chars | Insight: ${insight.id}`);
  process.exit(0);
}

run().catch(err => { console.error('Failed:', err); process.exit(1); });
