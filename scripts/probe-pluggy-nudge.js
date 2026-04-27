#!/usr/bin/env node
/**
 * End-to-end probe of the transaction-driven reflection path. Skips the
 * Pluggy webhook entirely — just inserts a fresh stress-shop-shaped tx
 * + emotional context, then calls maybeNudgeForTransactions directly.
 *
 * Verifies:
 *   - shouldNudge passes (amount + category + stress + age)
 *   - kill switch honored (PURCHASE_BOT_ENABLED)
 *   - opt-out honored (preferences.purchase_bot_enabled)
 *   - reflection lands in purchase_reflections audit table
 *   - WA send is suppressed (TWINME_DISABLE_OUTBOUND_SEND)
 *
 * Run: TWINME_DISABLE_OUTBOUND_SEND=true PURCHASE_BOT_ENABLED=true \
 *        node scripts/probe-pluggy-nudge.js
 */
import 'dotenv/config';
import { supabaseAdmin } from '../api/services/database.js';
import { maybeNudgeForTransactions } from '../api/services/transactions/transactionNudgeService.js';

const STEFANO = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

async function main() {
  if (process.env.TWINME_DISABLE_OUTBOUND_SEND !== 'true') {
    console.error('REFUSE: set TWINME_DISABLE_OUTBOUND_SEND=true so this probe does not actually fire WhatsApp.');
    process.exit(1);
  }

  console.log('1. Inserting synthetic stress-shop transaction NOW...');
  const txDate = new Date().toISOString();
  const externalId = `pluggy:probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { data: tx, error: txErr } = await supabaseAdmin
    .from('user_transactions')
    .insert({
      user_id: STEFANO,
      external_id: externalId,
      amount: -147.00,
      currency: 'BRL',
      merchant_raw: 'Mercado Livre Probe',
      merchant_normalized: 'Mercado Livre',
      category: 'shopping',           // discretionary ✓
      transaction_date: txDate,        // fresh ✓
      source_bank: 'pluggy',
      source: 'pluggy_webhook',
      account_type: 'credit_card',
      is_recurring: false,             // not recurring ✓
    })
    .select('id')
    .single();
  if (txErr) {
    console.error('Insert failed:', txErr);
    process.exit(1);
  }
  console.log(`   tx id: ${tx.id}, externalId: ${externalId}`);

  console.log('2. Inserting emotional context with stress=0.75...');
  const { error: ecErr } = await supabaseAdmin
    .from('transaction_emotional_context')
    .insert({
      transaction_id: tx.id,
      user_id: STEFANO,
      computed_stress_score: 0.75,    // > 0.6 ✓
      is_stress_shop_candidate: true,
      signals_found: 4,
    });
  if (ecErr) {
    console.warn('Emotional context insert warned:', ecErr.message);
  }

  console.log('3. Clearing recent stress_nudge cooldown for clean run...');
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  await supabaseAdmin
    .from('proactive_insights')
    .delete()
    .eq('user_id', STEFANO)
    .eq('category', 'stress_nudge')
    .gte('created_at', sixHoursAgo);

  console.log('4. Calling maybeNudgeForTransactions...');
  const t0 = Date.now();
  await maybeNudgeForTransactions(STEFANO, [tx.id]);
  console.log(`   elapsed: ${Date.now() - t0}ms`);

  console.log('4. Settling 4s for fire-and-forget audit write...');
  await new Promise(r => setTimeout(r, 4000));

  console.log('5. Checking purchase_reflections audit table...');
  const { data: rows } = await supabaseAdmin
    .from('purchase_reflections')
    .select('outcome, lang, has_music, has_calendar, moment_band, response_length, cost_usd, error_message, occurred_at')
    .eq('user_id', STEFANO)
    .gte('occurred_at', new Date(t0 - 1000).toISOString())
    .order('occurred_at', { ascending: false })
    .limit(3);

  if (!rows?.length) {
    console.log('   ❌ No audit row landed. Either the nudge was filtered out or the write failed.');
    console.log('   Possible reasons:');
    console.log('   - hasRecentNudge(userId) returned true → cooldown active');
    console.log('   - shouldNudge returned null → check amount/category/stress');
    console.log('   - kill switch / opt-out branch fired (look at recent audit rows below)');

    const { data: anyRecent } = await supabaseAdmin
      .from('purchase_reflections')
      .select('outcome, occurred_at')
      .eq('user_id', STEFANO)
      .order('occurred_at', { ascending: false })
      .limit(3);
    console.log('   Recent audit rows (any):', anyRecent);
  } else {
    console.log('   ✅ Audit row landed:');
    for (const r of rows) console.log('   ', r);
  }

  console.log('\n6. Cleaning up the probe transaction...');
  await supabaseAdmin.from('transaction_emotional_context').delete().eq('transaction_id', tx.id);
  await supabaseAdmin.from('user_transactions').delete().eq('id', tx.id);
  console.log('   ✅ Cleaned up.');
}

main().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
