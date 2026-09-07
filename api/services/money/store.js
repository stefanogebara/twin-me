/**
 * Money store: the only file in the module that talks to Supabase.
 * The pure files decide; this file applies.
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';
import { reconcile } from './ledger.js';
import { detectRecurring } from './recurring.js';
import { projectMonth } from './projection.js';

const log = createLogger('money-store');

/** Insert a sighting, reconcile it into the ledger, link it. Returns { sighting, transaction, action }. */
export async function ingestSighting(userId, sighting) {
  const { data: saved, error } = await supabaseAdmin
    .from('money_sightings')
    .upsert({ user_id: userId, ...sighting }, { onConflict: 'user_id,source,source_ref', ignoreDuplicates: false })
    .select()
    .single();
  if (error) throw new Error(`sighting insert failed: ${error.message}`);
  if (saved.transaction_id) {
    const { data: existing } = await supabaseAdmin.from('money_transactions').select('*').eq('id', saved.transaction_id).single();
    return { sighting: saved, transaction: existing, action: 'existing' };
  }

  const at = new Date(sighting.occurred_at || Date.now());
  const { data: candidates } = await supabaseAdmin
    .from('money_transactions')
    .select('id, amount, merchant_key, merchant_raw, occurred_at, posted_at, card_last4, primary_sighting_id')
    .eq('user_id', userId)
    .gte('occurred_at', new Date(at.getTime() - 48 * 3600000).toISOString())
    .lte('occurred_at', new Date(at.getTime() + 48 * 3600000).toISOString());

  let primarySource = null;
  const match = candidates?.length ? candidates : [];
  const decision = reconcile({ ...sighting, id: saved.id }, match, primarySource);

  let transaction;
  if (decision.action === 'create') {
    const { data: created, error: e2 } = await supabaseAdmin
      .from('money_transactions')
      .insert({ user_id: userId, account_id: sighting.account_id || null, primary_sighting_id: saved.id, ...decision.transaction })
      .select().single();
    if (e2) throw new Error(`transaction insert failed: ${e2.message}`);
    transaction = created;
  } else {
    if (decision.transaction.primary_sighting_id) {
      const { data: prim } = await supabaseAdmin.from('money_sightings').select('source').eq('id', match.find((m) => m.id === decision.transaction.id)?.primary_sighting_id || '').maybeSingle();
      primarySource = prim?.source || null;
    }
    const { id, ...update } = decision.transaction;
    const { data: updated, error: e3 } = await supabaseAdmin.from('money_transactions').update({ ...update, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (e3) throw new Error(`transaction update failed: ${e3.message}`);
    transaction = updated;
  }
  await supabaseAdmin.from('money_sightings').update({ transaction_id: transaction.id }).eq('id', saved.id);
  return { sighting: saved, transaction, action: decision.action };
}

export async function listTransactions(userId, { since, limit = 200 } = {}) {
  let q = supabaseAdmin.from('money_transactions').select('*').eq('user_id', userId).order('occurred_at', { ascending: false }).limit(limit);
  if (since) q = q.gte('occurred_at', since);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function sightingsFor(userId, transactionId) {
  const { data } = await supabaseAdmin.from('money_sightings').select('id, source, seen_at, raw_text, amount, currency, occurred_at, parse_confidence').eq('user_id', userId).eq('transaction_id', transactionId).order('seen_at');
  return data || [];
}

/** Recompute recurring series from the last 400 days and flag the ledger rows. */
export async function refreshRecurring(userId, now = new Date()) {
  const since = new Date(now.getTime() - 400 * 86400000).toISOString();
  const rows = await listTransactions(userId, { since, limit: 5000 });
  const { data: merchants } = await supabaseAdmin.from('money_merchants').select('merchant_key, platform').not('platform', 'is', null);
  const platforms = Object.fromEntries((merchants || []).map((m) => [m.merchant_key, m.platform]));
  const series = detectRecurring(rows, { now, platforms });
  if (series.length) {
    const { error } = await supabaseAdmin.from('money_recurring').upsert(series.map((s) => ({ user_id: userId, ...s, platform: undefined, updated_at: now.toISOString() })).map(({ platform, ...s }) => s), { onConflict: 'user_id,merchant_key' });
    if (error) log.warn(`recurring upsert failed: ${error.message}`);
    const keys = series.map((s) => s.merchant_key);
    await supabaseAdmin.from('money_transactions').update({ is_recurring: true }).eq('user_id', userId).in('merchant_key', keys);
  }
  return series;
}

export async function forecast(userId, now = new Date()) {
  const since = new Date(now.getTime() - 100 * 86400000).toISOString();
  const [rows, rec] = await Promise.all([
    listTransactions(userId, { since, limit: 5000 }),
    supabaseAdmin.from('money_recurring').select('*').eq('user_id', userId).then((r) => r.data || []),
  ]);
  const result = projectMonth({ transactions: rows, recurring: rec, now });
  await supabaseAdmin.from('money_forecasts').insert({
    user_id: userId, as_of: result.as_of, month: result.month, spent: result.spent, committed: result.committed,
    projected_p10: result.projected_p10, projected_p50: result.projected_p50, projected_p90: result.projected_p90,
  }).then(({ error }) => { if (error) log.warn(`forecast snapshot failed: ${error.message}`); });
  return result;
}

export async function setVerdict(userId, transactionId, verdict) {
  const { data, error } = await supabaseAdmin.from('money_transactions')
    .update({ verdict, verdict_at: verdict ? new Date().toISOString() : null })
    .eq('user_id', userId).eq('id', transactionId).select().single();
  if (error) throw new Error(error.message);
  return data;
}

/** The user behind a capture key (one of api_keys, SHA-256 hashed), or null. Touches last_used_at. */
export async function userForCaptureKey(keyHash) {
  const { data } = await supabaseAdmin.from('api_keys').select('id, user_id, is_active, expires_at').eq('key_hash', keyHash).maybeSingle();
  if (!data || !data.is_active || (data.expires_at && new Date(data.expires_at) < new Date())) return null;
  supabaseAdmin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id).then(() => {}, () => {});
  return data.user_id;
}
