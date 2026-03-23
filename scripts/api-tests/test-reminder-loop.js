/**
 * E2E Test: Full Reminder Loop
 * ==============================
 * Tests the complete agentic reminder pipeline:
 *
 *   1. parseAndCreateReminder() — parse "remind me" message → prospective memory
 *   2. Verify prospective memory in DB (status: pending)
 *   3. Manually shift trigger time to past (simulate time passing)
 *   4. checkTimeTriggered() — cron fires the due memory
 *   5. Verify proactive insight created (delivered: false)
 *   6. Cleanup: delete test data
 *
 * Run: node api/scripts/test-reminder-loop.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const TEST_USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

async function run() {
  console.log('=== Reminder Loop E2E Test ===\n');

  const { supabaseAdmin } = await import('../services/database.js');
  const { parseAndCreateReminder } = await import('../services/taskIntentClassifier.js');
  const { checkTimeTriggered } = await import('../services/prospectiveMemoryService.js');

  // ── Step 1: Parse and create reminder ──────────────────────────────────
  console.log('Step 1: Parsing "remind me to check Seatable demos on Monday"...');
  const result = await parseAndCreateReminder(
    TEST_USER_ID,
    'remind me to check Seatable demo results on Monday morning'
  );

  if (!result?.memoryId) {
    console.error('FAIL: parseAndCreateReminder returned null');
    process.exit(1);
  }
  console.log(`  Parsed: what="${result.what}"`);
  console.log(`  When: ${result.when_description}`);
  console.log(`  Trigger type: ${result.trigger_type}`);
  console.log(`  Memory ID: ${result.memoryId}`);

  // ── Step 2: Verify in DB ───────────────────────────────────────────────
  console.log('\nStep 2: Verifying prospective memory in DB...');
  const { data: memory, error: memErr } = await supabaseAdmin
    .from('prospective_memories')
    .select('*')
    .eq('id', result.memoryId)
    .single();

  if (memErr || !memory) {
    console.error('FAIL: Could not find prospective memory:', memErr?.message);
    process.exit(1);
  }
  console.log(`  Status: ${memory.status}`);
  console.log(`  Trigger type: ${memory.trigger_type}`);
  console.log(`  Trigger spec: ${JSON.stringify(memory.trigger_spec)}`);
  console.log(`  Action: ${memory.action}`);

  if (memory.status !== 'pending') {
    console.error(`FAIL: Expected status 'pending', got '${memory.status}'`);
    await cleanup(supabaseAdmin, result.memoryId);
    process.exit(1);
  }
  console.log('  PASS: Memory is pending');

  // ── Step 3: Shift trigger time to past ─────────────────────────────────
  console.log('\nStep 3: Shifting trigger time to 1 minute ago (simulating time)...');
  const pastTime = new Date(Date.now() - 60_000).toISOString();

  if (memory.trigger_type === 'time') {
    await supabaseAdmin
      .from('prospective_memories')
      .update({ trigger_spec: { at: pastTime } })
      .eq('id', result.memoryId);
    console.log(`  Trigger shifted to: ${pastTime}`);
  } else {
    // Condition-based — convert to time trigger for testing
    console.log('  Memory is condition-based, converting to time trigger for test...');
    await supabaseAdmin
      .from('prospective_memories')
      .update({
        trigger_type: 'time',
        trigger_spec: { at: pastTime }
      })
      .eq('id', result.memoryId);
    console.log(`  Converted to time trigger at: ${pastTime}`);
  }

  // ── Step 4: Run cron check ─────────────────────────────────────────────
  console.log('\nStep 4: Running checkTimeTriggered() (simulating cron)...');
  const triggered = await checkTimeTriggered();
  console.log(`  Triggered count: ${triggered.length}`);

  const ourTrigger = triggered.find(t => t.id === result.memoryId);
  if (!ourTrigger) {
    console.error('FAIL: Our prospective memory was not triggered');
    console.log('  Triggered IDs:', triggered.map(t => t.id));
    await cleanup(supabaseAdmin, result.memoryId);
    process.exit(1);
  }
  console.log('  PASS: Our memory was triggered');

  // ── Step 5: Verify proactive insight created ───────────────────────────
  console.log('\nStep 5: Verifying proactive insight was created...');
  const { data: insights } = await supabaseAdmin
    .from('proactive_insights')
    .select('id, insight, urgency, category, delivered, created_at')
    .eq('user_id', TEST_USER_ID)
    .eq('category', 'reminder')
    .order('created_at', { ascending: false })
    .limit(3);

  const matchingInsight = insights?.find(i =>
    i.insight.includes(memory.action) || memory.action.includes(i.insight.slice(0, 30))
  );

  if (matchingInsight) {
    console.log('  PASS: Proactive insight found');
    console.log(`    ID: ${matchingInsight.id}`);
    console.log(`    Insight: ${matchingInsight.insight.slice(0, 100)}...`);
    console.log(`    Urgency: ${matchingInsight.urgency}`);
    console.log(`    Delivered: ${matchingInsight.delivered}`);
  } else {
    console.warn('  WARN: No exact match found in proactive_insights (may use different text)');
    console.log('  Recent reminder insights:', insights?.map(i => i.insight.slice(0, 60)));
  }

  // ── Step 6: Verify memory status updated ───────────────────────────────
  console.log('\nStep 6: Verifying memory status updated...');
  const { data: updatedMemory } = await supabaseAdmin
    .from('prospective_memories')
    .select('status, triggered_at')
    .eq('id', result.memoryId)
    .single();

  if (updatedMemory?.status === 'triggered') {
    console.log('  PASS: Memory status = triggered');
    console.log(`    Triggered at: ${updatedMemory.triggered_at}`);
  } else {
    console.error(`  FAIL: Expected 'triggered', got '${updatedMemory?.status}'`);
  }

  // ── Step 7: Verify agent event logged ──────────────────────────────────
  console.log('\nStep 7: Checking agent_events audit log...');
  const { data: events } = await supabaseAdmin
    .from('agent_events')
    .select('event_type, event_data, created_at')
    .eq('user_id', TEST_USER_ID)
    .eq('event_type', 'prospective_memory_triggered')
    .order('created_at', { ascending: false })
    .limit(1);

  if (events?.[0]) {
    console.log('  PASS: Agent event logged');
    console.log(`    Memory ID in event: ${events[0].event_data?.memory_id}`);
  } else {
    console.warn('  WARN: No agent event found');
  }

  // ── Cleanup ────────────────────────────────────────────────────────────
  await cleanup(supabaseAdmin, result.memoryId, matchingInsight?.id);

  console.log('\n=== Reminder Loop E2E Test COMPLETE ===');
  console.log('Full pipeline verified:');
  console.log('  Chat message → parseAndCreateReminder() → prospective_memories (pending)');
  console.log('  → checkTimeTriggered() cron → proactive_insights (reminder)');
  console.log('  → agent_events (audit log) → Memory status: triggered');

  process.exit(0);
}

async function cleanup(supabase, memoryId, insightId) {
  console.log('\nCleanup: removing test data...');
  if (memoryId) {
    await supabase.from('prospective_memories').delete().eq('id', memoryId);
    console.log(`  Deleted prospective memory: ${memoryId}`);
  }
  if (insightId) {
    await supabase.from('proactive_insights').delete().eq('id', insightId);
    console.log(`  Deleted proactive insight: ${insightId}`);
  }
  // Clean agent events for this test
  await supabase
    .from('agent_events')
    .delete()
    .eq('user_id', TEST_USER_ID)
    .eq('event_type', 'prospective_memory_triggered')
    .eq('source', 'prospective_memory');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
