/**
 * Money store: the only file in the module that talks to Supabase.
 * The pure files decide; this file applies.
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';
import { reconcile } from './ledger.js';
import { detectRecurring } from './recurring.js';
import { projectMonth } from './projection.js';
import { fetchTransactions, toSighting } from './feeds/enableBanking.js';

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

/**
 * Many sightings at once, in a handful of round trips instead of four per row.
 * One pull of ninety days is hundreds of rows, and one-at-a-time reconciliation
 * spent longer than a serverless request is allowed to live: the first real pull
 * wrote its rows and then reported a timeout to the person who asked for it.
 *
 * The batch reconciles against the transactions that existed when it started,
 * plus the ones it creates as it goes, so a purchase seen twice inside the same
 * batch still folds into one line.
 */
export async function ingestSightings(userId, sightings) {
  if (!sightings?.length) return { seen: 0, created: 0, attached: 0 };
  const { data: saved, error } = await supabaseAdmin
    .from('money_sightings')
    .upsert(sightings.map((s) => ({ user_id: userId, ...s })), { onConflict: 'user_id,source,source_ref', ignoreDuplicates: false })
    .select();
  if (error) throw new Error(`sightings insert failed: ${error.message}`);

  const times = saved.map((s) => new Date(s.occurred_at).getTime()).filter(Number.isFinite);
  if (!times.length) return { seen: saved.length, created: 0, attached: 0 };
  const { data: existing } = await supabaseAdmin
    .from('money_transactions')
    .select('id, amount, merchant_key, merchant_raw, occurred_at, posted_at, card_last4, primary_sighting_id')
    .eq('user_id', userId)
    .gte('occurred_at', new Date(Math.min(...times) - 48 * 3600000).toISOString())
    .lte('occurred_at', new Date(Math.max(...times) + 48 * 3600000).toISOString());

  const pool = [...(existing || [])];
  const creates = [];                     // { tmp, row, sightingIds: [] }
  const attaches = [];                    // { id, update, sightingId }
  for (const s of saved) {
    if (s.transaction_id) continue;
    const decision = reconcile(s, pool, null);
    if (decision.action === 'create') {
      const tmp = `tmp:${creates.length}`;
      creates.push({ tmp, row: { user_id: userId, account_id: s.account_id || null, primary_sighting_id: s.id, ...decision.transaction }, sightingIds: [s.id] });
      pool.push({ id: tmp, ...decision.transaction });
      continue;
    }
    const { id, ...update } = decision.transaction;
    const pending = creates.find((c) => c.tmp === id);
    if (pending) { pending.sightingIds.push(s.id); continue; }   // folds into a line this batch just made
    attaches.push({ id, update, sightingId: s.id });
  }

  const links = [];                       // { sightingId, transactionId }
  if (creates.length) {
    const { data: inserted, error: e2 } = await supabaseAdmin.from('money_transactions').insert(creates.map((c) => c.row)).select('id, primary_sighting_id');
    if (e2) throw new Error(`transactions insert failed: ${e2.message}`);
    for (const c of creates) {
      const row = (inserted || []).find((r) => r.primary_sighting_id === c.sightingIds[0]);
      if (row) for (const sid of c.sightingIds) links.push({ sightingId: sid, transactionId: row.id });
    }
  }
  for (const a of attaches) {
    if (Object.keys(a.update).length) {
      await supabaseAdmin.from('money_transactions').update({ ...a.update, updated_at: new Date().toISOString() }).eq('id', a.id);
    }
    links.push({ sightingId: a.sightingId, transactionId: a.id });
  }
  /* One statement per transaction id, so the links cost a few calls, not one per row. */
  const byTransaction = new Map();
  for (const l of links) {
    if (!byTransaction.has(l.transactionId)) byTransaction.set(l.transactionId, []);
    byTransaction.get(l.transactionId).push(l.sightingId);
  }
  for (const [transactionId, ids] of byTransaction) {
    await supabaseAdmin.from('money_sightings').update({ transaction_id: transactionId }).in('id', ids);
  }
  return { seen: saved.length, created: creates.length, attached: attaches.length };
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
  /* The key is machine spelling ("render com"). A card should carry the name the ledger shows. */
  const names = new Map();
  for (const t of rows) if (t.merchant_raw && !names.has(t.merchant_key)) names.set(t.merchant_key, t.merchant_raw);
  if (series.length) {
    const { error } = await supabaseAdmin.from('money_recurring').upsert(series.map((s) => ({ user_id: userId, ...s, platform: undefined, updated_at: now.toISOString() })).map(({ platform, ...s }) => s), { onConflict: 'user_id,merchant_key' });
    if (error) log.warn(`recurring upsert failed: ${error.message}`);
    const keys = series.map((s) => s.merchant_key);
    await supabaseAdmin.from('money_transactions').update({ is_recurring: true }).eq('user_id', userId).in('merchant_key', keys);
  }
  return series.map((s) => ({ ...s, merchant_name: names.get(s.merchant_key) || null }));
}

export async function forecast(userId, now = new Date()) {
  const since = new Date(now.getTime() - 100 * 86400000).toISOString();
  const [rows, rec] = await Promise.all([
    listTransactions(userId, { since, limit: 5000 }),
    supabaseAdmin.from('money_recurring').select('*').eq('user_id', userId).then((r) => r.data || []),
  ]);
  const result = projectMonth({ transactions: rows, recurring: rec, now });
  /* What is still to come is named on the hero, so it needs a name and not a key. */
  const names = new Map();
  for (const t of rows) if (t.merchant_raw && !names.has(t.merchant_key)) names.set(t.merchant_key, t.merchant_raw);
  result.committed_items = (result.committed_items || []).map((c) => ({ ...c, merchant_name: names.get(c.merchant_key) || null }));
  result.expected_items = (result.expected_items || []).map((c) => ({ ...c, merchant_name: names.get(c.merchant_key) || null }));
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

/** Persist the accounts a bank authorisation returned. */
export async function saveBankAccounts(userId, { sessionId, validUntil, accounts }) {
  const rows = accounts.map((a) => ({
    user_id: userId, provider: 'enablebanking', provider_account_id: a.uid, name: a.name, currency: a.currency || 'EUR',
    iban_mask: a.iban ? `${a.iban.slice(0, 4)} **** ${a.iban.slice(-4)}` : null, consent_expires_at: validUntil, session_id: sessionId,
  }));
  const { data, error } = await supabaseAdmin.from('money_accounts').upsert(rows, { onConflict: 'user_id,provider,provider_account_id' }).select();
  if (error) throw new Error(`accounts upsert failed: ${error.message}`);
  return data || [];
}

export async function listBankAccounts(userId) {
  const { data } = await supabaseAdmin.from('money_accounts').select('id, provider, provider_account_id, name, iban_mask, currency, consent_expires_at, last_pulled_at').eq('user_id', userId).eq('provider', 'enablebanking');
  return data || [];
}

/**
 * The truth path: pull each account since its last pull (or 90 days) and reconcile every row.
 * PSD2 allows four unattended pulls a day per account; callers schedule accordingly.
 */
export async function pullBankFeed(userId, { since } = {}) {
  const accounts = await listBankAccounts(userId);
  const summary = [];
  for (const acc of accounts) {
    const from = since || (acc.last_pulled_at ? acc.last_pulled_at.slice(0, 10) : new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
    let key = null; let seen = 0; let created = 0;
    do {
      const page = await fetchTransactions(acc.provider_account_id, from, key);
      const batch = page.rows.map((row) => toSighting(row, acc.id)).filter((s) => s.occurred_at && s.amount);
      const r = await ingestSightings(userId, batch);
      seen += r.seen; created += r.created;
      key = page.continuationKey;
    } while (key);
    await supabaseAdmin.from('money_accounts').update({ last_pulled_at: new Date().toISOString() }).eq('id', acc.id);
    summary.push({ account: acc.name || acc.iban_mask, seen, created });
  }
  return summary;
}
