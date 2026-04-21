#!/usr/bin/env node
/**
 * Phase 3.4 — Nudge E2E smoke test.
 *
 * Inserts a synthetic high-stress discretionary transaction for a user,
 * invokes maybeNudgeForTransactions, verifies a proactive_insights row
 * lands, then cleans up the scaffolding.
 *
 * A real push IS fired if the user has device_tokens — this is intentional:
 * that's the most honest end-to-end proof the chain works.
 *
 * Usage:
 *   node scripts/smoke-nudge.mjs <userId>
 *   node scripts/smoke-nudge.mjs 167c27b5-a40b-49fb-8d00-deb1b1c57f4d
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + ENCRYPTION_KEY + JWT_SECRET +
 * OPENROUTER_API_KEY in .env (server-side env).
 */

import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { supabaseAdmin } from '../api/services/database.js';
import { maybeNudgeForTransactions } from '../api/services/transactions/transactionNudgeService.js';

const userId = process.argv[2];
if (!userId) {
  console.error('usage: node scripts/smoke-nudge.mjs <userId>');
  process.exit(1);
}

async function run() {
  console.log(`[smoke] user=${userId}`);

  // 1. Insert synthetic tx (discretionary, R$250, fresh timestamp)
  const { data: txInsert, error: txErr } = await supabaseAdmin
    .from('user_transactions')
    .insert({
      user_id: userId,
      external_id: `smoke-nudge:${Date.now()}`,
      amount: -250,
      currency: 'BRL',
      merchant_raw: 'SMOKE TEST STORE',
      merchant_normalized: 'SmokeTestStore',
      category: 'shopping',
      transaction_date: new Date().toISOString(),
      source_bank: 'smoke',
      account_type: 'credit_card',
      source: 'csv_upload',
      is_recurring: false,
    })
    .select('id')
    .single();

  if (txErr || !txInsert?.id) {
    console.error('[smoke] tx insert failed:', txErr?.message);
    process.exit(1);
  }
  const txId = txInsert.id;
  console.log(`[smoke] synthetic tx ${txId} inserted`);

  // 2. Insert emotional context with high stress
  const { error: ctxErr } = await supabaseAdmin
    .from('transaction_emotional_context')
    .insert({
      transaction_id: txId,
      user_id: userId,
      computed_stress_score: 0.75,
      is_stress_shop_candidate: true,
      signals_found: 3,
    });
  if (ctxErr) {
    console.error('[smoke] context insert failed:', ctxErr.message);
    await supabaseAdmin.from('user_transactions').delete().eq('id', txId);
    process.exit(1);
  }
  console.log('[smoke] emotional_context inserted (stress=0.75)');

  // 3. Invoke the nudge service
  console.log('[smoke] invoking maybeNudgeForTransactions…');
  await maybeNudgeForTransactions(userId, [txId]);

  // 4. Verify a proactive_insights row was created referencing this tx
  const { data: insights, error: selErr } = await supabaseAdmin
    .from('proactive_insights')
    .select('id, insight, category, urgency, metadata, created_at')
    .eq('user_id', userId)
    .eq('category', 'stress_nudge')
    .order('created_at', { ascending: false })
    .limit(3);

  if (selErr) {
    console.error('[smoke] select insights failed:', selErr.message);
  }

  const match = (insights || []).find((i) => i.metadata?.source_tx_id === txId);
  if (match) {
    console.log('[smoke] ✓ nudge fired — insight id=%s', match.id);
    console.log('[smoke] body preview:', match.insight.slice(0, 140));
    console.log('[smoke] metadata:', JSON.stringify(match.metadata));
  } else {
    console.warn('[smoke] ✗ no matching stress_nudge insight found');
    console.warn('[smoke] recent insights:', JSON.stringify((insights || []).map(i => ({ id: i.id, cat: i.category, txid: i.metadata?.source_tx_id })), null, 2));
  }

  // 5. Cleanup
  if (match) {
    await supabaseAdmin.from('proactive_insights').delete().eq('id', match.id);
    console.log(`[smoke] cleaned up insight ${match.id}`);
  }
  await supabaseAdmin.from('transaction_emotional_context').delete().eq('transaction_id', txId);
  await supabaseAdmin.from('user_transactions').delete().eq('id', txId);
  console.log(`[smoke] cleaned up tx ${txId}`);

  process.exit(match ? 0 : 1);
}

run().catch((err) => {
  console.error('[smoke] crashed:', err);
  process.exit(1);
});
