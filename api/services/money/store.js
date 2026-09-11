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
import { lookupPlace, providerFor, categoryFromBrand, PROVIDER_NONE } from './places.js';
import { readUsage, unmeasurable, platformForMerchant } from './usage.js';
import { learnMerchants, predictNext, learnPatterns, describeForTwin } from './brain.js';
import { openingQuestions, ledgerQuestions, checkCommitment, describeContext } from './context.js';
import { calendarForecast, calendarFromFacts } from './calendar.js';

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
  const [rows, rec, facts] = await Promise.all([
    listTransactions(userId, { since, limit: 5000 }),
    supabaseAdmin.from('money_recurring').select('*').eq('user_id', userId).then((r) => r.data || []),
    listFacts(userId),
  ]);

  /* What the person told us, turned into the four things it changes: money already spoken
     for, money coming in, the share of a split cost that is actually theirs, and which
     transfers are not spending at all. */
  const commitments = facts.filter((f) => f.kind === 'commitment' && f.amount);
  const income = facts.filter((f) => f.kind === 'income' && f.amount);
  const shares = new Map(facts.filter((f) => f.kind === 'shared_cost' && f.share != null)
    .map((f) => [String(f.subject || '').toLowerCase(), Number(f.share)]));
  const roles = new Map(facts.filter((f) => f.kind === 'person' && f.value)
    .map((f) => [String(f.subject || '').toLowerCase(), f.value]));

  const shareOf = (t) => {
    const exact = shares.get(t.merchant_key);
    if (exact != null) return Math.min(Math.max(exact, 0), 1);
    /* A named split can also be a whole category ("groceries"), which the merchant key
       will not match; the caller resolves that, and an unmatched payment is wholly theirs. */
    return 1;
  };
  /* Money handed to a flatmate or a parent moved between people; it is not a purchase.
     A friend paid back is the same. Landlord and work are real spending and stay. */
  const NOT_SPENDING = new Set(['flatmate', 'family', 'friend', 'partner']);
  const isSpending = (t) => {
    if (!['transfer', 'bizum'].includes(t.channel)) return true;
    const role = roles.get(t.merchant_key);
    return !(role && NOT_SPENDING.has(role));
  };

  const result = projectMonth({ transactions: rows, recurring: rec, commitments, income, shareOf, isSpending, now });
  /* What is still to come is named on the hero, so it needs a name and not a key. */
  const names = new Map();
  for (const t of rows) if (t.merchant_raw && !names.has(t.merchant_key)) names.set(t.merchant_key, t.merchant_raw);
  result.committed_items = (result.committed_items || []).map((c) => ({ ...c, merchant_name: names.get(c.merchant_key) || null }));
  result.expected_items = (result.expected_items || []).map((c) => ({ ...c, merchant_name: names.get(c.merchant_key) || null }));
  /* What the calendar adds: events before month end whose kind has a learned cost. Read from
     the snapshot kept at the last calendar read, so this costs no request to Google. */
  Object.assign(result, calendarForecast(facts, { now }));
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

/** Whether the last read of this person's bank failed because the connection had ended. */
export async function bankNeedsReconnect(userId) {
  const { data } = await supabaseAdmin
    .from('money_feed_accesses')
    .select('outcome, at')
    .eq('user_id', userId)
    .order('at', { ascending: false })
    .limit(1);
  const last = (data || [])[0];
  return Boolean(last && last.outcome === 'session_expired');
}

export async function listBankAccounts(userId) {
  const { data } = await supabaseAdmin.from('money_accounts').select('id, provider, provider_account_id, name, iban_mask, currency, consent_expires_at, last_pulled_at').eq('user_id', userId).eq('provider', 'enablebanking');
  /* A reconnect gives the same account a new provider id. One account is one row to the
     person: the most recently read row per IBAN speaks for all of them. */
  const byIban = new Map();
  for (const row of data || []) {
    const key = row.iban_mask || row.provider_account_id || row.id;
    const seen = byIban.get(key);
    if (!seen || String(row.last_pulled_at || '') > String(seen.last_pulled_at || '')) byIban.set(key, row);
  }
  return [...byIban.values()];
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
    try {
      do {
        const page = await fetchTransactions(acc.provider_account_id, from, key);
        const batch = page.rows.map((row) => toSighting(row, acc.id)).filter((s) => s.occurred_at && s.amount);
        const r = await ingestSightings(userId, batch);
        seen += r.seen; created += r.created;
        key = page.continuationKey;
      } while (key);
    } catch (error) {
      /* A dead session is recorded so the product can say what is wrong, and the read is not
         counted as a successful one. The caller decides what to tell the person. */
      if (error.code === 'bank_session_expired') {
        await recordAccess(userId, acc.id, { attended, rowsSeen: 0, outcome: 'session_expired' });
      }
      throw error;
    }
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
  /* The kind of place behind each payment, so the analyst can read a shape by kind. A
     merchant with no place yet has no kind, and the finding refuses to speak on thin data. */
  const keys = [...new Set(transactions.map((t) => t.merchant_key))];
  const { data: places } = keys.length
    ? await supabaseAdmin.from('money_places').select('merchant_key, category, category_override').in('merchant_key', keys)
    : { data: [] };
  const categories = new Map((places || []).map((p) => [p.merchant_key, p.category_override || p.category || null]));
  const categoryOf = (t) => categories.get(t.merchant_key) || CHANNEL_CATEGORY[t.channel] || null;
  const { segments, findings } = readLedger({ transactions, recurring: withNames, categoryOf, now });
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
export async function listReadings(userId, { includeRejected = false } = {}) {
  const { data } = await supabaseAdmin.from('money_readings').select('*').eq('user_id', userId).order('computed_at', { ascending: false });
  /* A reading the person marked as not theirs is not shown again and is never cited: saying
     "not me" has to mean something, or it is a poll rather than a control. The row is kept,
     so the same finding stays quiet when it is recomputed tomorrow. */
  const readings = (data || []).filter((r) => includeRejected || r.verdict !== 'not_me');
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
  /* What the person said about their own money, kept apart from what was read, because a
     typed number and an observed payment must never be quoted with the same certainty. */
  const facts = await listFacts(userId).catch(() => []);
  const said = describeContext(facts);
  /* The calendar, as last read: the days ahead with what they tend to cost, and the kinds of
     event the ledger has learned. Kept short; this rides in a prompt. */
  const cal = calendarFromFacts(facts, { now });
  const calendar = cal.connected ? {
    ahead: cal.snapshot.filter((i) => new Date(i.start).getTime() < now.getTime() + 7 * 86400000).slice(0, 7)
      .map((i) => ({ label: i.label || i.title, on: i.start, all_day: i.all_day, expected: i.expected ? { amount: i.expected.amount, low: i.expected.low, high: i.expected.high, basis: i.expected.basis } : null })),
    learned: cal.learned.slice(0, 8).map((s) => ({ label: s.label, times: s.occurrences, paid: s.paid, usually: s.median, categories: s.categories || [] })),
    routine: cal.routine,
  } : null;

  /* What the ledger has learned about this person, in the twin's own context. Profiles are
     already stored, so this is a read, not a re-learn. */
  const { data: learned } = await supabaseAdmin
    .from('money_merchant_profiles')
    .select('name, times, typical_amount, amount_is_fixed, usual_weekday, median_gap_days, days_since_last, is_overdue, category, city')
    .eq('user_id', userId).order('total', { ascending: false }).limit(8);
  const { data: upcoming } = await supabaseAdmin
    .from('money_predictions')
    .select('name, expected_on, typical_amount, confidence')
    .eq('user_id', userId).is('happened', null).gte('expected_on', now.toISOString().slice(0, 10))
    .order('expected_on').limit(5);

  return {
    month: here?.month || null,
    spent: here?.spent ?? 0,
    said,
    calendar,
    known: (learned || []).map((p) => ({
      name: p.name, times: p.times, typical: Number(p.typical_amount), fixed: p.amount_is_fixed,
      category: p.category, city: p.city, every_days: p.median_gap_days ? Number(p.median_gap_days) : null,
      days_since: p.days_since_last, overdue: p.is_overdue,
    })),
    expected: (upcoming || []).filter((p) => Number(p.confidence) >= 0.3)
      .map((p) => ({ name: p.name, on: p.expected_on, amount: Number(p.typical_amount) })),
    received: here?.received ?? 0,
    days_covered: here?.days_covered ?? 0,
    days_in_month: here?.days_in_month ?? 30,
    previous_month_spent: before ? before.spent : null,
    lines: here?.lines ?? 0,
    currency: transactions[0]?.currency || 'EUR',
    readings: readings.map((r) => ({ kind: r.kind, sentence: r.sentence, detail: r.detail })),
  };
}

/* Some channels answer the question by themselves. */
const CHANNEL_CATEGORY = { transfer: 'transfers', bizum: 'transfers', cash: 'cash', fee: 'fees', direct_debit: 'bills' };

/**
 * Where a month's money went, by kind of place. The kind comes from money_places, one row
 * per merchant, so this is a join and not a guess; a merchant nobody has looked up yet
 * counts as "not read yet" rather than being quietly filed under "other" — the difference
 * between a gap and a category matters when a person is deciding whether to trust the page.
 */
export async function categorySpend(userId, { month = null } = {}) {
  let q = supabaseAdmin.from('money_transactions')
    .select('id, amount, merchant_key, merchant_raw, occurred_at, channel')
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
    /* A merchant that was looked up and not found is still unread, not "other": a miss is
       recorded so the same question is not asked twice, and it must not pass for an answer. */
    const place_category = place ? (place.category_override || place.category || null) : null;
    /* A transfer to a person is a transfer, whatever a places provider thinks: the channel
       the bank recorded is itself an answer, and a truthful one. */
    const category = place_category || CHANNEL_CATEGORY[r.channel] || null;
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

/**
 * Look up the merchants nobody has looked up yet, one row per merchant, cached forever.
 * Capped per run because the free provider allows one request a second and a serverless
 * request dies at sixty: the caller comes back for the rest. Online brands cost no request
 * at all, which is most of a builder's ledger.
 */
export async function enrichPlaces(userId, { limit = 12 } = {}) {
  if (providerFor() === PROVIDER_NONE) return { looked: 0, placed: 0, left: 0, provider: PROVIDER_NONE };
  const { data: rows } = await supabaseAdmin
    .from('money_transactions')
    .select('merchant_key, merchant_raw, merchant_city, amount')
    .eq('user_id', userId).lt('amount', 0);
  if (!rows?.length) return { looked: 0, placed: 0, left: 0, provider: providerFor() };

  /* Biggest spend first: the merchant worth naming is the one taking the most money. */
  const spend = new Map();
  const names = new Map();
  const cities = new Map();
  for (const r of rows) {
    spend.set(r.merchant_key, (spend.get(r.merchant_key) || 0) + Math.abs(Number(r.amount) || 0));
    if (r.merchant_raw && !names.has(r.merchant_key)) names.set(r.merchant_key, r.merchant_raw);
    if (r.merchant_city && !cities.has(r.merchant_key)) cities.set(r.merchant_key, r.merchant_city);
  }
  const { data: known } = await supabaseAdmin.from('money_places').select('merchant_key');
  const done = new Set((known || []).map((k) => k.merchant_key));
  const todo = [...spend.keys()]
    .filter((k) => !done.has(k))
    .sort((a, b) => spend.get(b) - spend.get(a));

  let placed = 0;
  const batch = todo.slice(0, limit);
  for (const key of batch) {
    const name = names.get(key) || key;
    /* What the name settles on its own beats what a geocoder guesses: a provider does not
       know Cabify is a ride or that OpenRouter is an API bill. Coordinates still come from
       the provider, so a brand keeps its place on a map. */
    const brand = categoryFromBrand(name);
    let place = null;
    try { place = await lookupPlace({ name, city: cities.get(key) || null, country: 'ES' }); }
    catch (error) { log.warn(`place lookup failed (${name})`, { error: error.message }); }
    /* A miss is recorded too, so the next run does not ask the same question again. */
    /* A weak provider answer is worse than none: "Abada" came back as "Calle de la Abada",
       a street. Below half confidence the lookup is recorded and its category dropped. */
    const trusted = place && (place.confidence ?? 0) >= 0.5;
    const row = place
      ? {
        /* The ledger's name stays the name. The provider's label lives in raw. */
        merchant_key: key, name, kind: (trusted ? place.kind : null) || brand?.kind || null,
        category: brand?.category || (trusted ? place.category : null) || null,
        lat: trusted ? (place.lat ?? null) : null, lon: trusted ? (place.lon ?? null) : null,
        city: place.city || cities.get(key) || null,
        country: place.country || null, provider: brand ? 'brand' : (place.provider || null),
        provider_place_id: place.provider_place_id || null,
        confidence: brand ? Math.max(0.8, place.confidence ?? 0) : (place.confidence ?? null),
        raw: { provider_name: place.name || null, describe: place.kind || null, body: place.raw || null },
        looked_up_at: new Date().toISOString(),
      }
      : {
        merchant_key: key, name, kind: brand?.kind || null, category: brand?.category || null,
        city: cities.get(key) || null,
        provider: brand ? 'brand' : providerFor(), confidence: brand ? 0.8 : 0,
        looked_up_at: new Date().toISOString(),
      };
    const { error } = await supabaseAdmin.from('money_places').upsert(row, { onConflict: 'merchant_key' });
    if (error) log.warn(`place cache write failed (${key}): ${error.message}`);
    else if (place || brand) placed += 1;
  }
  return { looked: batch.length, placed, left: Math.max(0, todo.length - batch.length), provider: providerFor() };
}

/**
 * Whether the subscriptions were used, and what that costs per use.
 * ================================================================
 * The activity lives where every other platform signal lives: platform_data rows in the
 * memory stream. Only the platforms TwinMe actually connects can answer, and for this
 * ledger that is Spotify alone — Higgsfield, ElevenLabs, Fly.io and Render have no
 * connector, so the honest answer about them is that nobody here can see it. That gap is
 * returned as `unmeasurable` rather than hidden, because a page that quietly drops what it
 * cannot check is a page that cannot be trusted about what it can.
 */
export async function subscriptionUsage(userId, now = new Date()) {
  const [series, transactions] = await Promise.all([
    supabaseAdmin.from('money_recurring').select('*').eq('user_id', userId).then((r) => r.data || []),
    listTransactions(userId, { limit: 5000 }),
  ]);
  if (!series.length) return { findings: [], unmeasurable: [], measured: [] };

  const names = new Map();
  const charges = new Map();
  for (const t of transactions) {
    if (t.merchant_raw && !names.has(t.merchant_key)) names.set(t.merchant_key, t.merchant_raw);
    if (Number(t.amount) >= 0) continue;
    if (!charges.has(t.merchant_key)) charges.set(t.merchant_key, []);
    charges.get(t.merchant_key).push({ id: t.id, occurred_at: t.occurred_at, amount: Math.abs(Number(t.amount) || 0) });
  }
  const withCharges = series.map((r) => ({
    ...r,
    merchant_name: names.get(r.merchant_key) || null,
    charges: (charges.get(r.merchant_key) || []).sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at)),
  }));

  /* Only fetch activity for platforms a subscription actually points at. */
  const wanted = [...new Set(withCharges.map((r) => platformForMerchant(r.merchant_name || r.merchant_key)).filter(Boolean))];
  const eventsByPlatform = {};
  if (wanted.length) {
    const since = new Date(now.getTime() - 120 * 86400000).toISOString();
    const { data: rows } = await supabaseAdmin
      .from('user_memories')
      .select('created_at, metadata')
      .eq('user_id', userId).eq('memory_type', 'platform_data')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(2000);
    for (const platform of wanted) eventsByPlatform[platform] = [];
    for (const row of rows || []) {
      const platform = row.metadata?.platform || row.metadata?.source || null;
      if (!platform || !eventsByPlatform[platform]) continue;
      eventsByPlatform[platform].push({ at: row.created_at, kind: row.metadata?.kind || 'activity' });
    }
  }

  const findings = readUsage({ recurring: withCharges, eventsByPlatform, now });
  return {
    findings,
    unmeasurable: unmeasurable(withCharges).map((u) => ({ ...u, name: names.get(u.merchant_key) || u.merchant_key })),
    measured: wanted,
  };
}

/**
 * What the ledger has learned, remembered.
 * ========================================
 * The system learns about a person from their money alone: which places, which prices,
 * which days, which rhythms, and what is normal for them. This runs the learning engine
 * over the whole ledger, stores the merchant profiles (derived and disposable — delete
 * them and the next pull rebuilds them), records dated predictions so they can be scored
 * later against what actually happened, and returns the block the twin is given.
 */
export async function learn(userId, now = new Date()) {
  const transactions = await listTransactions(userId, { limit: 5000 });
  if (!transactions.length) return { profiles: [], patterns: [], predictions: [], summary: null };

  const keys = [...new Set(transactions.map((t) => t.merchant_key))];
  const { data: places } = keys.length
    ? await supabaseAdmin.from('money_places').select('merchant_key, category, category_override').in('merchant_key', keys)
    : { data: [] };
  const categories = new Map((places || []).map((x) => [x.merchant_key, x.category_override || x.category || null]));
  const categoryOf = (t) => categories.get(t.merchant_key) || CHANNEL_CATEGORY[t.channel] || null;

  const profiles = learnMerchants(transactions, { now, categoryOf });
  const predictions = predictNext(profiles, { now });
  const patterns = learnPatterns({ transactions, profiles, categoryOf, now });
  const summary = describeForTwin({ profiles, patterns, predictions, now });

  if (profiles.length) {
    const rows = profiles.map((p) => ({
      user_id: userId, merchant_key: p.merchant_key, name: p.name, city: p.city, category: p.category,
      channel: p.channel, times: p.times, first_seen: p.first_seen, last_seen: p.last_seen,
      total: p.total, typical_amount: p.typical_amount, amount_low: p.amount_low, amount_high: p.amount_high,
      amount_is_fixed: p.amount_is_fixed, weekday_counts: p.weekday_counts, usual_weekday: p.usual_weekday,
      usual_day_of_month: p.usual_day_of_month, median_gap_days: p.median_gap_days, cadence: p.cadence,
      days_since_last: p.days_since_last, is_overdue: p.is_overdue, learned_at: now.toISOString(),
    }));
    const { error } = await supabaseAdmin.from('money_merchant_profiles').upsert(rows, { onConflict: 'user_id,merchant_key' });
    if (error) log.warn(`merchant profiles upsert failed: ${error.message}`);
  }

  if (predictions.length) {
    /* A prediction already made for the same merchant and date is not made again: the point
       is to be scored against what happens, and rewriting it would erase the record. */
    const rows = predictions.map((p) => ({
      user_id: userId, merchant_key: p.merchant_key, name: p.name,
      expected_on: p.expected_on, typical_amount: p.typical_amount, confidence: p.confidence,
    }));
    const { error } = await supabaseAdmin.from('money_predictions').upsert(rows, { onConflict: 'user_id,merchant_key,expected_on', ignoreDuplicates: true });
    if (error) log.warn(`predictions upsert failed: ${error.message}`);
  }

  return { profiles, patterns, predictions, summary };
}

/**
 * Did what the ledger expected actually happen? Open predictions whose date has passed are
 * matched against the transactions around them, within three days and a quarter of the
 * expected amount. A forecast nobody scores is a forecast nobody should trust.
 */
export async function scorePredictions(userId, now = new Date()) {
  const { data: open } = await supabaseAdmin
    .from('money_predictions')
    .select('id, merchant_key, expected_on, typical_amount')
    .eq('user_id', userId).is('happened', null).lt('expected_on', now.toISOString().slice(0, 10));
  if (!open?.length) return { scored: 0, hit: 0 };

  const transactions = await listTransactions(userId, { limit: 5000 });
  let hit = 0;
  for (const p of open) {
    const target = new Date(`${p.expected_on}T12:00:00Z`).getTime();
    const match = transactions.find((t) => t.merchant_key === p.merchant_key
      && Number(t.amount) < 0
      && Math.abs(new Date(t.occurred_at).getTime() - target) <= 3 * 86400000
      && (!p.typical_amount || Math.abs(Math.abs(Number(t.amount)) - Number(p.typical_amount)) <= Number(p.typical_amount) * 0.25));
    const update = match
      ? { happened: true, happened_on: match.occurred_at.slice(0, 10), happened_amount: Math.abs(Number(match.amount)), scored_at: now.toISOString() }
      : { happened: false, scored_at: now.toISOString() };
    if (match) hit += 1;
    await supabaseAdmin.from('money_predictions').update(update).eq('id', p.id);
  }
  return { scored: open.length, hit };
}

/** How often the ledger's predictions have been right, once there are enough to say. */
export async function predictionAccuracy(userId) {
  const { data } = await supabaseAdmin.from('money_predictions')
    .select('happened').eq('user_id', userId).not('happened', 'is', null);
  const scored = (data || []).length;
  if (scored < 5) return { scored, hit_rate: null };
  const hit = (data || []).filter((x) => x.happened).length;
  return { scored, hit_rate: Math.round((hit / scored) * 100) / 100 };
}

/** What the person has told the system about their own money. */
/* Rows the calendar lens keeps for itself. They are working memory, not things the person
   said, and they never appear where facts are shown or phrased. */
export const INTERNAL_FACT_KINDS = Object.freeze(['event_spend', 'event_spend_meta', 'home_point']);

export async function listFacts(userId, { includeInternal = false } = {}) {
  const { data } = await supabaseAdmin.from('money_facts').select('*').eq('user_id', userId).order('answered_at');
  const rows = data || [];
  return includeInternal ? rows : rows.filter((f) => !INTERNAL_FACT_KINDS.includes(f.kind));
}

/**
 * The questions still worth putting to this person: the opening ones they have not answered,
 * then the ones their own ledger raises, biggest unexplained money first. A question already
 * skipped is not asked again — a person who declined once declined for a reason.
 */
export async function questionsFor(userId, now = new Date()) {
  const [facts, transactions, asked] = await Promise.all([
    listFacts(userId),
    listTransactions(userId, { limit: 5000 }),
    supabaseAdmin.from('money_questions_asked').select('question_id, skipped').eq('user_id', userId).then((r) => r.data || []),
  ]);
  const declined = new Set(asked.filter((a) => a.skipped).map((a) => a.question_id));
  const keys = [...new Set(transactions.map((t) => t.merchant_key))];
  const { data: places } = keys.length
    ? await supabaseAdmin.from('money_places').select('merchant_key, category, category_override').in('merchant_key', keys)
    : { data: [] };
  const categories = new Map((places || []).map((x) => [x.merchant_key, x.category_override || x.category || null]));
  const placeOf = (t) => categories.get(t.merchant_key) || null;

  return {
    opening: openingQuestions(facts).filter((q) => !declined.has(q.id)),
    fromLedger: ledgerQuestions({ transactions, facts, placeOf, now }).filter((q) => !declined.has(q.id)),
    answered: facts.length,
  };
}

/** Record an answer, and check it against the ledger where it is checkable. */
export async function answerQuestion(userId, { questionId, kind, subject, subjectLabel, value, amount, day, share }) {
  /* The rent question is a choice, and a choice carries no amount. "Not fixed" is a decline
     that should not be asked again; the other two answers take their amount and day from
     the ledger lines that raised the question. */
  if (kind === 'commitment' && String(questionId || '').startsWith('rent:')) {
    if (String(value || '').toLowerCase() === 'not fixed') return skipQuestion(userId, questionId);
    if (!amount && subject) {
      const rows = (await listTransactions(userId, { limit: 5000 }))
        .filter((t) => t.merchant_key === subject && Number(t.amount) < 0 && Math.abs(Number(t.amount)) >= 200);
      if (rows.length) {
        const amounts = rows.map((t) => Math.abs(Number(t.amount))).sort((a, b) => a - b);
        const days = rows.map((t) => new Date(t.occurred_at).getUTCDate()).sort((a, b) => a - b);
        amount = amounts[Math.floor(amounts.length / 2)];
        day = day || days[Math.floor(days.length / 2)];
      }
    }
    value = String(value || '').toLowerCase() === 'rent' ? 'rent' : (value || 'fixed cost');
  }
  const row = {
    user_id: userId, kind, subject: subject || '', subject_label: subjectLabel || null,
    value: value ?? null, amount: amount ?? null, day: day ?? null, share: share ?? null,
    source: 'asked', question_id: questionId || null, answered_at: new Date().toISOString(),
  };
  if (kind === 'commitment' && amount) {
    const transactions = await listTransactions(userId, { limit: 5000 });
    const check = checkCommitment(row, transactions);
    row.check_status = check.status;
    row.check_note = check.note;
    row.checked_at = new Date().toISOString();
  }
  const { data, error } = await supabaseAdmin.from('money_facts')
    .upsert(row, { onConflict: 'user_id,kind,subject' }).select().single();
  if (error) throw new Error(error.message);
  if (questionId) {
    await supabaseAdmin.from('money_questions_asked')
      .upsert({ user_id: userId, question_id: questionId, answered: true, skipped: false }, { onConflict: 'user_id,question_id' });
  }
  return data;
}

/** A question declined is a question answered: it stops being asked. */
export async function skipQuestion(userId, questionId) {
  const { error } = await supabaseAdmin.from('money_questions_asked')
    .upsert({ user_id: userId, question_id: questionId, answered: false, skipped: true }, { onConflict: 'user_id,question_id' });
  if (error) throw new Error(error.message);
  return { skipped: questionId };
}

/** The person's own words about their money, for the twin. */
export async function contextBlock(userId) {
  const facts = await listFacts(userId);
  return describeContext(facts);
}
