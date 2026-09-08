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
import { readLedger, monthSegments } from './analyst.js';
import { tellTwin } from './twinBridge.js';

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
  /* A card says a charge comes back every month; the person then asks which payments those
     were, when the next one lands and what it has cost so far. The transactions are already
     in hand, so the answer costs no query. */
  const charges = new Map();
  for (const t of rows) {
    if (Number(t.amount) >= 0) continue;
    if (!charges.has(t.merchant_key)) charges.set(t.merchant_key, []);
    charges.get(t.merchant_key).push({ id: t.id, occurred_at: t.occurred_at, amount: Math.abs(Number(t.amount) || 0), verdict: t.verdict || null });
  }
  return series.map((x) => {
    const paid = (charges.get(x.merchant_key) || []).sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
    return {
      ...x,
      merchant_name: names.get(x.merchant_key) || null,
      charges: paid.slice(0, 12),
      total_paid: Math.round(paid.reduce((sum, c) => sum + c.amount, 0) * 100) / 100,
      day_of_month: paid.length ? new Date(paid[0].occurred_at).getUTCDate() : null,
    };
  });
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
/**
 * PSD2 allows four unattended reads of a consent per 24 hours; Santander answers
 * 429 [HUB046] past that, and a consent burned on manual pulls leaves the person
 * with no reads until the window rolls. Every read is recorded, and the budget is
 * checked before the bank is asked.
 */
export const FEED_BUDGET = 4;

export async function feedBudget(userId, now = new Date()) {
  const from = new Date(now.getTime() - 24 * 3600000).toISOString();
  const { data } = await supabaseAdmin
    .from('money_feed_accesses')
    .select('at, outcome')
    .eq('user_id', userId).eq('attended', false)
    .gte('at', from)
    .order('at', { ascending: true });
  const used = (data || []).length;
  const oldest = data?.[0]?.at || null;
  return {
    used,
    left: Math.max(0, FEED_BUDGET - used),
    resets_at: oldest ? new Date(new Date(oldest).getTime() + 24 * 3600000).toISOString() : null,
  };
}

async function recordAccess(userId, accountId, { attended = false, rowsSeen = null, outcome = 'ok' } = {}) {
  const { error } = await supabaseAdmin.from('money_feed_accesses').insert({ user_id: userId, account_id: accountId, attended, rows_seen: rowsSeen, outcome });
  if (error) log.warn(`feed access log failed: ${error.message}`);
}

export async function pullBankFeed(userId, { since, attended = false } = {}) {
  const accounts = await listBankAccounts(userId);
  if (!accounts.length) return [];
  if (!attended) {
    const budget = await feedBudget(userId);
    if (budget.left <= 0) {
      const err = new Error('The bank allows four reads a day and today\'s are used.');
      err.code = 'feed_budget_spent';
      err.budget = budget;
      throw err;
    }
  }
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
    await recordAccess(userId, acc.id, { attended, rowsSeen: seen });
    summary.push({ account: acc.name || acc.iban_mask, seen, created });
  }
  return summary;
}

/**
 * What the ledger says today, stored so a sentence can be shown, judged and compared
 * with the same sentence tomorrow. Findings are recomputed from scratch every time and
 * upserted on (kind, month), so nothing accumulates and nothing goes stale silently.
 * A verdict the person already gave is kept.
 */
export async function refreshReadings(userId, now = new Date()) {
  const [transactions, recurring] = await Promise.all([
    listTransactions(userId, { limit: 5000 }),
    supabaseAdmin.from('money_recurring').select('*').eq('user_id', userId).then((r) => r.data || []),
  ]);
  const names = new Map();
  for (const t of transactions) if (t.merchant_raw && !names.has(t.merchant_key)) names.set(t.merchant_key, t.merchant_raw);
  const withNames = recurring.map((r) => ({ ...r, merchant_name: names.get(r.merchant_key) || null }));
  const { segments, findings } = readLedger({ transactions, recurring: withNames, now });
  /* A finding with no month (a subscription load, a weekday shape) has month NULL, and
     Postgres counts NULLs as distinct: an upsert on (kind, month) inserted a fresh copy
     every run. So the write is an explicit update-or-insert, which also keeps the id and
     the verdict the person already gave. */
  const { data: existing } = await supabaseAdmin.from('money_readings').select('id, kind, month').eq('user_id', userId);
  const keyOf = (kind, month) => `${kind}|${month || ''}`;
  const byKey = new Map((existing || []).map((r) => [keyOf(r.kind, r.month), r.id]));
  const seen = new Set();
  for (const f of findings) {
    const row = {
      sentence: f.sentence, detail: f.detail || null, numbers: f.numbers || {},
      receipt_ids: f.receipts.map((r) => r.id).filter(Boolean), evidence_count: f.evidence_count || 0,
      computed_at: now.toISOString(),
    };
    const key = keyOf(f.kind, f.month);
    seen.add(key);
    const id = byKey.get(key);
    const { error } = id
      ? await supabaseAdmin.from('money_readings').update(row).eq('id', id)
      : await supabaseAdmin.from('money_readings').insert({ user_id: userId, kind: f.kind, month: f.month, ...row });
    if (error) log.warn(`reading write failed (${f.kind}): ${error.message}`);
  }
  /* A finding that no longer holds should stop being shown, not linger from last week. */
  const stale = (existing || []).filter((r) => !seen.has(keyOf(r.kind, r.month))).map((r) => r.id);
  if (stale.length) await supabaseAdmin.from('money_readings').delete().in('id', stale);
  /* The twin should know what the money says, in the same stream as everything else it
     knows. Duplicate content inside a day is skipped by the memory stream itself. */
  const told = await tellTwin(userId, findings).catch((e) => { log.warn(`twin bridge failed: ${e.message}`); return { written: 0 }; });
  return { segments, findings, told: told.written };
}

/** The stored readings with their receipts resolved, newest computation first. */
export async function listReadings(userId) {
  const { data } = await supabaseAdmin.from('money_readings').select('*').eq('user_id', userId).order('computed_at', { ascending: false });
  const readings = data || [];
  const ids = [...new Set(readings.flatMap((r) => r.receipt_ids || []))];
  if (!ids.length) return readings.map((r) => ({ ...r, receipts: [] }));
  const { data: rows } = await supabaseAdmin
    .from('money_transactions')
    .select('id, occurred_at, amount, merchant_raw, merchant_key, channel, verdict')
    .eq('user_id', userId).in('id', ids);
  const byId = new Map((rows || []).map((r) => [r.id, r]));
  return readings.map((r) => ({ ...r, receipts: (r.receipt_ids || []).map((id) => byId.get(id)).filter(Boolean) }));
}

export async function setReadingVerdict(userId, readingId, verdict) {
  const { data, error } = await supabaseAdmin.from('money_readings')
    .update({ verdict, verdict_at: verdict ? new Date().toISOString() : null })
    .eq('user_id', userId).eq('id', readingId).select().single();
  if (error) throw new Error(error.message);
  return data;
}

/** Money in and out per calendar month, for the page that asks for it per month. */
export async function months(userId, now = new Date()) {
  const transactions = await listTransactions(userId, { limit: 5000 });
  return monthSegments(transactions, now);
}

/**
 * The money the twin should have in front of it in any conversation: this month, what
 * comes back, and the two or three things the ledger has to say. Compact by design —
 * two queries, a few hundred characters — because it rides in every system prompt.
 * Returns null when there is no ledger, so the twin says nothing rather than guessing.
 */
export async function moneyContext(userId, now = new Date()) {
  const [transactions, readings] = await Promise.all([
    listTransactions(userId, { limit: 2000 }),
    supabaseAdmin.from('money_readings').select('kind, sentence, detail, computed_at').eq('user_id', userId)
      .order('computed_at', { ascending: false }).limit(4).then((r) => r.data || []),
  ]);
  if (!transactions.length) return null;
  const segments = monthSegments(transactions, now);
  const here = segments[0];
  const before = segments[1] || null;
  return {
    month: here?.month || null,
    spent: here?.spent ?? 0,
    received: here?.received ?? 0,
    days_covered: here?.days_covered ?? 0,
    days_in_month: here?.days_in_month ?? 30,
    previous_month_spent: before ? before.spent : null,
    lines: here?.lines ?? 0,
    currency: transactions[0]?.currency || 'EUR',
    readings: readings.map((r) => ({ kind: r.kind, sentence: r.sentence, detail: r.detail })),
  };
}

/**
 * Where a month's money went, by kind of place. The kind comes from money_places, one row
 * per merchant, so this is a join and not a guess; a merchant nobody has looked up yet
 * counts as "not read yet" rather than being quietly filed under "other" — the difference
 * between a gap and a category matters when a person is deciding whether to trust the page.
 */
export async function categorySpend(userId, { month = null } = {}) {
  let q = supabaseAdmin.from('money_transactions')
    .select('id, amount, merchant_key, merchant_raw, occurred_at')
    .eq('user_id', userId).lt('amount', 0);
  if (month) {
    const start = `${String(month).slice(0, 7)}-01`;
    const end = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 1)).toISOString().slice(0, 10);
    q = q.gte('occurred_at', `${start}T00:00:00Z`).lt('occurred_at', `${end}T00:00:00Z`);
  }
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);
  if (!rows?.length) return { month, total: 0, read: 0, groups: [] };

  const keys = [...new Set(rows.map((r) => r.merchant_key))];
  const { data: places } = await supabaseAdmin
    .from('money_places')
    .select('merchant_key, name, kind, category, category_override, city, lat, lon, confidence')
    .in('merchant_key', keys);
  const byKey = new Map((places || []).map((p) => [p.merchant_key, p]));

  const groups = new Map();
  let total = 0;
  let read = 0;
  for (const r of rows) {
    const amount = Math.abs(Number(r.amount) || 0);
    total += amount;
    const place = byKey.get(r.merchant_key);
    const category = place ? (place.category_override || place.category || 'other') : null;
    if (category) read += amount;
    const key = category || 'not read yet';
    if (!groups.has(key)) groups.set(key, { category: key, known: Boolean(category), spent: 0, lines: 0, merchants: new Map() });
    const g = groups.get(key);
    g.spent += amount;
    g.lines += 1;
    const name = place?.name || r.merchant_raw || r.merchant_key;
    g.merchants.set(name, (g.merchants.get(name) || 0) + amount);
  }
  return {
    month,
    total: Math.round(total * 100) / 100,
    read: Math.round(read * 100) / 100,
    groups: [...groups.values()]
      .map((g) => ({
        category: g.category,
        known: g.known,
        spent: Math.round(g.spent * 100) / 100,
        lines: g.lines,
        share: total > 0 ? Math.round((g.spent / total) * 100) : 0,
        merchants: [...g.merchants.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, spent]) => ({ name, spent: Math.round(spent * 100) / 100 })),
      }))
      .sort((a, b) => b.spent - a.spent),
  };
}

/** The places behind a person's ledger, for a map and for a category correction. */
export async function listPlaces(userId) {
  const { data: rows } = await supabaseAdmin.from('money_transactions')
    .select('merchant_key, merchant_raw, merchant_city, amount').eq('user_id', userId).lt('amount', 0);
  const keys = [...new Set((rows || []).map((r) => r.merchant_key))];
  if (!keys.length) return [];
  const { data: places } = await supabaseAdmin.from('money_places').select('*').in('merchant_key', keys);
  const byKey = new Map((places || []).map((p) => [p.merchant_key, p]));
  const spend = new Map();
  const names = new Map();
  const cities = new Map();
  for (const r of rows || []) {
    spend.set(r.merchant_key, (spend.get(r.merchant_key) || 0) + Math.abs(Number(r.amount) || 0));
    if (!names.has(r.merchant_key) && r.merchant_raw) names.set(r.merchant_key, r.merchant_raw);
    if (!cities.has(r.merchant_key) && r.merchant_city) cities.set(r.merchant_key, r.merchant_city);
  }
  return keys.map((k) => {
    const p = byKey.get(k) || null;
    return {
      merchant_key: k,
      name: p?.name || names.get(k) || k,
      city: p?.city || cities.get(k) || null,
      kind: p?.kind || null,
      category: p?.category_override || p?.category || null,
      lat: p?.lat ?? null,
      lon: p?.lon ?? null,
      confidence: p?.confidence ?? null,
      spent: Math.round((spend.get(k) || 0) * 100) / 100,
      looked_up: Boolean(p),
    };
  }).sort((a, b) => b.spent - a.spent);
}

/** A person's correction to a category outlives the next lookup. */
export async function setPlaceCategory(merchantKey, category) {
  const { data, error } = await supabaseAdmin.from('money_places')
    .update({ category_override: category, overridden_at: category ? new Date().toISOString() : null })
    .eq('merchant_key', merchantKey).select().maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
