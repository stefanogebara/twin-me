/**
 * Money store: the only file in the module that talks to Supabase.
 * The pure files decide; this file applies.
 */

import { supabaseAdmin } from '../database.js';
import crypto from 'node:crypto';
import { splitShareOf, reimbursementIds, splitFindings, SPLIT_OPEN } from './bizum.js';
import { accuracy, ownScoreFinding } from './predictions.js';
import { currentFigureScores } from './figureScoreStore.js';
import { deltaFindings } from './deltas.js';
import { intentionFindings } from './intention.js';
import { statedIncome } from './allowance.js';
import { incomeEvents, incomeFindings } from './income.js';
import { createLogger } from '../logger.js';
import { ingestSightings } from './ingestion.js';
export { ingestSighting, ingestSightings } from './ingestion.js';
import { detectRecurring } from './recurring.js';
import { projectMonth } from './projection.js';
import { fetchTransactions, toSighting, distinctPending, fetchBalances } from './feeds/enableBanking.js';
import { readLedger, monthSegments } from './analyst.js';
import { spendingRule, markCounted, personRoles } from './spending.js';
import { poolMerchantPriors } from './priors.js';
import { nudgeFindings, retiredKinds, NUDGE_KINDS } from './nudges.js';
import { safeToSpend } from './allowance.js';
import { tellTwin, tellTwinFacts, tellTwinPatterns, tellTwinTurn } from './twinBridge.js';
import { lookupPlace, providerFor, categoryFromBrand, PROVIDER_NONE } from './places.js';
import { readUsage, unmeasurable, platformForMerchant } from './usage.js';
import { learnMerchants, predictNext, learnPatterns, describeForTwin, TWIN_PREDICTION_CONFIDENCE } from './brain.js';
import { openingQuestions, followUpQuestions, ledgerQuestions, checkCommitment, describeContext, FACT_KINDS } from './context.js';
import { calendarForecast, calendarFromFacts } from './calendar.js';
import { dayIn, dayOfMonthIn } from './zone.js';

import { listEuroTransactions } from './transactionRepository.js';
export { listTransactions, transactionPage } from './transactionRepository.js';
/* Pure reads and the forecast live in their own modules since 2026-09-19 (the two import
   cycles); store.js keeps their names so no caller had to move. */
import { INTERNAL_FACT_KINDS, listFacts, categoriesFor } from './factsRepository.js';
export { INTERNAL_FACT_KINDS, listFacts, categoriesFor } from './factsRepository.js';
import { forecast, months, scorePredictions } from './forecastService.js';
export { forecast, months, scorePredictions } from './forecastService.js';

const log = createLogger('money-store');

export async function sightingsFor(userId, transactionId) {
  const { data } = await supabaseAdmin.from('money_sightings').select('id, source, seen_at, raw_text, amount, currency, occurred_at, parse_confidence').eq('user_id', userId).eq('transaction_id', transactionId).order('seen_at');
  return data || [];
}

/** Recompute recurring series from the last 400 days and flag the ledger rows. */
export async function refreshRecurring(userId, now = new Date()) {
  const since = new Date(now.getTime() - 400 * 86400000).toISOString();
  const evidence = await listEuroTransactions(userId, { since, limit: 5000, includeRejected: true });
  const rows = evidence.filter((row) => row.verdict !== 'not_me');
  const { data: merchants } = await supabaseAdmin.from('money_merchants').select('merchant_key, platform').not('platform', 'is', null);
  const platforms = Object.fromEntries((merchants || []).map((m) => [m.merchant_key, m.platform]));
  const series = detectRecurring(rows, { now, platforms });
  /* The key is machine spelling ("render com"). A card should carry the name the ledger shows. */
  const names = new Map();
  for (const t of rows) if (t.merchant_raw && !names.has(t.merchant_key)) names.set(t.merchant_key, t.merchant_raw);
  const { data: previous, error: readError } = await supabaseAdmin.from('money_recurring').select('merchant_key').eq('user_id', userId);
  if (readError) throw new Error('Could not read recurring charges');
  if (series.length) {
    const { error } = await supabaseAdmin.from('money_recurring').upsert(series.map(({ platform, transaction_ids, variants, variant_amounts, ...item }) => ({ user_id: userId, ...item, updated_at: now.toISOString() })), { onConflict: 'user_id,merchant_key' });
    if (error) throw new Error('Could not save recurring charges');
  }
  // A rejected charge can dissolve a series. Remove the old commitment as well as its flags.
  const active = new Set(series.map((item) => item.merchant_key));
  const stale = (previous || []).map((item) => item.merchant_key).filter((key) => !active.has(key));
  if (stale.length) {
    const { error } = await supabaseAdmin.from('money_recurring').delete().eq('user_id', userId).in('merchant_key', stale);
    if (error) throw new Error('Could not remove an outdated recurring charge');
  }
  const ids = series.flatMap((item) => item.transaction_ids || []);
  const activeIds = new Set(ids);
  const clearedIds = evidence.filter((row) => row.is_recurring && !activeIds.has(row.id)).map((row) => row.id);
  if (clearedIds.length) {
    const { error } = await supabaseAdmin.from('money_transactions').update({ is_recurring: false }).eq('user_id', userId).in('id', clearedIds);
    if (error) throw new Error('Could not update recurring payment flags');
  }
  if (ids.length) {
    const { error } = await supabaseAdmin.from('money_transactions').update({ is_recurring: true }).eq('user_id', userId).in('id', ids);
    if (error) throw new Error('Could not update recurring payment flags');
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
      day_of_month: paid.length ? dayOfMonthIn(paid[0].occurred_at) : null,
    };
  });
}

export async function setVerdict(userId, transactionId, verdict) {
  const { data, error } = await supabaseAdmin.from('money_transactions')
    .update({ verdict, verdict_at: verdict ? new Date().toISOString() : null })
    .eq('user_id', userId).eq('id', transactionId).select().single();
  if (error) throw new Error(error.message);
  await refreshRecurring(userId);
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
export async function saveBankAccounts(userId, { sessionId, validUntil, accounts, bankName = null }) {
  if (!userId) throw new Error('userId required');
  const saved = [];
  for (const a of accounts) {
    const currency = String(a.currency || 'EUR').toUpperCase();
    const identity = a.identificationHash || (a.iban ? crypto.createHash('sha256').update(a.iban.replace(/\s/g,'').toUpperCase()).digest('hex') : null);
    const row = {
      provider_account_id:a.uid, account_fingerprint:identity ? `${identity}:${currency}` : null,
      name:a.name || null,currency,iban_mask:a.iban ? `${a.iban.slice(0,4)} **** ${a.iban.slice(-4)}` : null,
      consent_expires_at:validUntil,session_id:sessionId,bank_name:bankName,
    };
    const { data,error } = await supabaseAdmin.rpc('save_money_bank_account',{p_user_id:userId,p_account:row});
    if(error) throw new Error(`Cannot save bank account: ${error.message}`);
    saved.push(data);
  }
  return saved;
}

/**
 * Everyone with a bank the schedule can read. The cron asks for this rather than reaching
 * into the table itself: a route that queries the database directly is a route that can
 * drift from the rules the store keeps around these rows.
 */
export async function bankFeedUserIds() {
  const { data, error } = await supabaseAdmin.rpc('claim_money_sync_jobs', { p_limit: 3 });
  if (error) throw new Error(`Cannot claim bank jobs: ${error.message}`);
  return data || [];
}
export async function finishBankFeedJob(userId, outcome) {
  const { error } = await supabaseAdmin.rpc('finish_money_sync_job', { p_user_id: userId, p_outcome: outcome });
  if (error) throw new Error(`Cannot finish bank job: ${error.message}`);
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

/** Of two rows for one account, the one whose consent runs longest, then the newest. Pure. */
export function newestConsent(rows) {
  const byIban = new Map();
  for (const row of rows || []) {
    const key = row.account_fingerprint || (row.iban_mask ? `${row.bank_name || ''}:${row.currency || 'EUR'}:${row.iban_mask}` : row.provider_account_id || row.id);
    const seen = byIban.get(key);
    const later = (a, b) => String(a.consent_expires_at || '') > String(b.consent_expires_at || '')
      || (String(a.consent_expires_at || '') === String(b.consent_expires_at || '') && String(a.created_at || '') > String(b.created_at || ''));
    if (!seen || later(row, seen)) byIban.set(key, row);
  }
  return [...byIban.values()];
}

export async function listBankAccounts(userId) {
  const { data, error } = await supabaseAdmin.from('money_accounts').select('id, provider, provider_account_id, name, iban_mask, currency, consent_expires_at, last_pulled_at, bank_name, session_id, created_at, balance, balance_type, balance_at, balance_observed_at, sync_checkpoint, account_fingerprint').eq('user_id', userId).eq('provider', 'enablebanking');
  /* An empty list because the read failed would show every screen "no bank connected" and
     stop the cron in silence, the worst failure this product has. It is said out loud. */
  if (error) { log.error(`bank accounts read failed: ${error.message}`); throw new Error(`bank accounts read failed: ${error.message}`); }
  /* A reconnect gives the same account a new provider id and a fresh row with nothing read
     yet. One account is one row to the person, and the row that speaks for it is the one
     whose consent runs longest: a reconnect took effect the moment it was saved. */
  return newestConsent(data || []);
}

/** Which accounts' last read found the session gone, from each account's own last row. */
export async function reconnectByAccount(userId) {
  const { data } = await supabaseAdmin
    .from('money_feed_accesses')
    .select('account_id, outcome, at')
    .eq('user_id', userId).not('account_id', 'is', null)
    .order('at', { ascending: false })
    .limit(200);
  const last = new Map();
  for (const row of data || []) if (!last.has(row.account_id)) last.set(row.account_id, row.outcome);
  return new Set([...last.entries()].filter(([, o]) => o === 'session_expired').map(([id]) => id));
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

/** The unattended reads of the last 24 hours, oldest first. */
async function recentAccesses(userId, now = new Date()) {
  const from = new Date(now.getTime() - 24 * 3600000).toISOString();
  const { data } = await supabaseAdmin
    .from('money_feed_accesses')
    .select('at, outcome, account_id')
    .eq('user_id', userId).eq('attended', false)
    .gte('at', from)
    .order('at', { ascending: true });
  return data || [];
}

function budgetOf(rows) {
  const used = rows.length;
  const oldest = rows[0]?.at || null;
  return { used, left: Math.max(0, FEED_BUDGET - used), resets_at: oldest ? new Date(new Date(oldest).getTime() + 24 * 3600000).toISOString() : null };
}

/**
 * The four-a-day rule is the bank's rule on one consent, and a consent is a session: every
 * account under it shares the four. This plans a run: per consent, how many reads are left
 * and which of its accounts get them (the longest unread first), so three scheduled runs
 * over a consent with three accounts cannot make nine reads of it. Rows without an account
 * id, from the feed's first days, count against every consent. Pure.
 * @returns {{ budgets: Map<string, object>, pull: object[], skipped: object[] }}
 */
export function planReads(accounts, accesses) {
  const shared = accesses.filter((r) => !r.account_id);
  const sessionOf = new Map(accounts.map((a) => [a.id, a.session_id || a.id]));
  const bySession = new Map();
  for (const a of accounts) {
    const key = sessionOf.get(a.id);
    if (!bySession.has(key)) bySession.set(key, { accounts: [], rows: [...shared] });
    bySession.get(key).accounts.push(a);
  }
  for (const r of accesses) {
    if (!r.account_id) continue;
    const key = sessionOf.get(r.account_id);
    if (key && bySession.has(key)) bySession.get(key).rows.push(r);
  }
  const budgets = new Map();
  const pull = [];
  const skipped = [];
  for (const [key, group] of bySession) {
    const budget = budgetOf(group.rows.sort((a, b) => (a.at < b.at ? -1 : 1)));
    budgets.set(key, budget);
    const order = [...group.accounts].sort((a, b) => String(a.last_pulled_at || '') < String(b.last_pulled_at || '') ? -1 : 1);
    pull.push(...order.slice(0, budget.left));
    skipped.push(...order.slice(budget.left));
  }
  return { budgets, pull, skipped };
}

/** The person's budget as one figure: the consent with the least left speaks for all. */
export async function feedBudget(userId, now = new Date()) {
  const [accesses, accounts] = await Promise.all([recentAccesses(userId, now), listBankAccounts(userId)]);
  if (!accounts.length) return budgetOf(accesses.filter((r) => !r.account_id));
  const { budgets } = planReads(accounts, accesses);
  return [...budgets.values()].reduce((worst, b) => (b.left < worst.left ? b : worst));
}

/** A bank authorisation that came back and could not be saved, kept where the reads are, so
    it can be seen later without the platform's logs. The message is trimmed and has no ids. */
export async function recordCallbackFailure(userId, message, { keepIds = false } = {}) {
  /* Ids are stripped and the line kept short, unless the caller wants the whole thing kept
     for reading later (a bank's session object, which is not a secret). */
  const said = keepIds ? String(message || '').slice(0, 4000) : String(message || '').replace(/[0-9a-f-]{20,}/g, '').slice(0, 120);
  await recordAccess(userId, null, { attended: true, rowsSeen: 0, outcome: `callback_failed: ${said}` });
}

async function recordAccess(userId, accountId, { attended = false, rowsSeen = null, outcome = 'ok' } = {}) {
  const { error } = await supabaseAdmin.from('money_feed_accesses').insert({ user_id: userId, account_id: accountId, attended, rows_seen: rowsSeen, outcome });
  if (error) log.warn(`feed access log failed: ${error.message}`);
}

/** How far back the first attended read reaches. Two years is the most a PSD2 bank offers. */
export const FIRST_READ_DAYS = 730;

export async function pullBankFeed(userId, { since, attended = false, psu = null, deadline = Date.now() + 40000 } = {}) {
  const accounts = await listBankAccounts(userId);
  if (!accounts.length) return [];
  // Presence must be backed by PSU headers, never merely by an internal boolean.
  attended = Boolean(attended && psu?.ip);
  const summary = [];
  for (const acc of accounts) {
    if (Date.now() + 2000 >= deadline) {
      summary.push({ account: acc.name, seen: 0, created: 0, complete: false, error: 'time_budget_exhausted' });
      continue;
    }
    const { data: reservation, error: reserveError } = await supabaseAdmin.rpc('reserve_money_feed_read', {
      p_user_id: userId, p_account_id: acc.id, p_attended: attended,
    });
    if (reserveError) throw new Error(`Cannot reserve bank access: ${reserveError.message}`);
    if (!reservation.allowed) {
      summary.push({ account: acc.name, seen: 0, created: 0, complete: false, error: reservation.reason });
      continue;
    }
    const resume = !since && acc.sync_checkpoint;
    /* The first read of an account asks for everything the bank will give. PSD2 lets a bank
       answer generously while the person is standing there having just authorised it, and
       meanly afterwards, so the one attended read is the only chance at the months before
       today: ninety days was all this ever asked for, and a person who joins in September
       cannot be told what August cost. A bank that will not reach that far says so, and
       fetchTransactions asks again for ninety days. Later reads only want what is new. */
    const first = !acc.last_pulled_at && !resume;
    const from = since || resume?.from || (acc.last_pulled_at
      ? new Date(Date.parse(acc.last_pulled_at)-4*86400000).toISOString().slice(0,10)
      : new Date(Date.now()-(first && attended ? FIRST_READ_DAYS : 90)*86400000).toISOString().slice(0,10));
    let key = resume?.key || null; let seen = 0; let created = 0; let pages = 0;
    const occurrences = new Map(resume?.occurrences || []);
    let outcome = 'ok'; let failure = null;
    try {
      do {
        const page = await fetchTransactions(acc.provider_account_id, from, key, {
          psu: attended ? psu : null, signal: AbortSignal.timeout(Math.max(1,Math.min(8000,deadline-Date.now()-1000))),
        });
        const batch = distinctPending(page.rows.map((row) => toSighting(row, acc.id)).filter((s) => s.occurred_at && s.amount), occurrences);
        const result = await ingestSightings(userId,batch);
        seen += result.seen; created += result.created; pages++;
        key = page.continuationKey;
        if (key) {
          const { error } = await supabaseAdmin.from('money_accounts').update({ sync_checkpoint: { from, key, occurrences: [...occurrences] } }).eq('user_id',userId).eq('id',acc.id);
          if (error) throw new Error('Cannot checkpoint bank pagination');
        }
        // One unattended page spends one reserved read. Larger backfills resume durably.
        if (key && (!attended || pages >= 10 || Date.now()+9000>=deadline)) { outcome = 'partial'; break; }
      } while (key);
      const stamp = { sync_checkpoint: key ? { from, key, occurrences: [...occurrences] } : null };
      if (!key) stamp.last_pulled_at = new Date().toISOString();
      if (attended && Date.now()+9000<deadline) {
        try {
          const balance = await fetchBalances(acc.provider_account_id,{psu,currency:acc.currency});
          if (balance) Object.assign(stamp,{ balance: balance.amount, balance_type: balance.type+(balance.credit_included?'/credit':''), balance_at:balance.at, balance_observed_at:new Date().toISOString() });
        } catch { /* Keep the old timestamp; advice will refuse a stale observation. */ }
      }
      const { error } = await supabaseAdmin.from('money_accounts').update(stamp).eq('user_id',userId).eq('id',acc.id);
      if (error) throw new Error('Cannot save bank sync state');
    } catch (error) {
      failure = error;
      outcome = error.code === 'bank_session_expired' ? 'session_expired' : 'error';
    }
    {
      const results = await Promise.all([
        supabaseAdmin.from('money_feed_accesses').update({ rows_seen:seen,outcome }).eq('user_id',userId).eq('id',reservation.access_id),
        supabaseAdmin.from('money_feed_leases').update({ lease_until:null }).eq('account_id',acc.id),
      ]);
      if (results.some((r) => r.error)) throw new Error('Cannot record bank sync outcome');
    }
    summary.push({ account:acc.name || acc.iban_mask, bank:acc.bank_name || null, seen,created,complete:outcome==='ok',
      ...(failure ? { error:failure.code || 'read_failed' } : outcome==='partial' ? { error:'continuation_pending' } : {}) });
  }
  if (summary.length && summary.every((s) => s.error === 'feed_budget_spent')) {
    throw Object.assign(new Error('The bank allows four unattended reads per day.'),{code:'feed_budget_spent'});
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
  const [transactions, recurring, facts] = await Promise.all([
    listEuroTransactions(userId, { limit: 5000 }),
    supabaseAdmin.from('money_recurring').select('*').eq('user_id', userId).then((r) => {
      if (r.error) throw new Error(`Cannot read recurring commitments: ${r.error.message}`);
      return r.data || [];
    }),
    listFacts(userId, { includeInternal: true }).catch(() => []),
  ]);
  const names = new Map();
  for (const t of transactions) if (t.merchant_raw && !names.has(t.merchant_key)) names.set(t.merchant_key, t.merchant_raw);
  const withNames = recurring.map((r) => ({ ...r, merchant_name: names.get(r.merchant_key) || null }));
  /* The kind of place behind each payment, so the analyst can read a shape by kind. A
     merchant with no place yet has no kind, and the finding refuses to speak on thin data. */
  const keys = [...new Set(transactions.map((t) => t.merchant_key))];
  const categories = await categoriesFor(userId, keys);
  const categoryOf = (t) => categories.get(t.merchant_key) || CHANNEL_CATEGORY[t.channel] || null;
  const settled = reimbursementIds(facts, transactions, { now });
  const { segments, findings: read } = readLedger({ transactions, recurring: withNames, categoryOf, now, isSpending: spendingRule(facts), isIncome: (t) => !settled.has(t.id) });
  /* The two lines with a trial behind them (nudges.js): a week's charges the month cannot
     carry, and the largest named charge due within three days. Both need the forecast and
     the allowance; neither is spoken without a basis. */
  const cast = await forecast(userId, now).catch(() => null);
  const allowance = cast ? safeToSpend({ cast, segments, facts, now }) : null;
  /* Who still owes what for a shared payment (bizum.js): said while it is open, quiet once settled. */
  /* What it got wrong, in its own numbers (predictions.js): one line, only once there is a
     scored month or enough scored charges to be worth saying. */
  const own = ownScoreFinding(await accuracy(userId).catch(() => null));
  /* What changed against the person's own past (deltas.js): a kind of place up or down
     against its usual week, a habit gone quiet, a weekday out of line, the week's pace. */
  const profiles = learnMerchants(transactions, { now, categoryOf });
  /* The calendar as a covariate (covariates.js): days away stop a habit's silence clock,
     and the week's comparisons say when it was an exam week or a week away. */
  const { away, week } = calendarFromFacts(facts, { now });
  const deltas = deltaFindings({ transactions, profiles, categoryOf, isSpending: spendingRule(facts), now, away, week });
  /* What they said they want, read against the month (intention.js): silent without a fact. */
  const intent = intentionFindings({ facts, transactions, categoryOf, cast, now, isSpending: spendingRule(facts), income: statedIncome(facts) });
  /* A stated income that usually comes by now and has not (income.js). */
  const lateIncome = incomeFindings({ facts, transactions, isIncome: (t) => !settled.has(t.id), now });
  const findings = read.concat(intent, nudgeFindings({ cast, allowance, now }), splitFindings(facts, transactions, { now }), own ? [own] : [], deltas, lateIncome);
  /* A finding with no month (a subscription load, a weekday shape) has month NULL, and
     Postgres counts NULLs as distinct: an upsert on (kind, month) inserted a fresh copy
     every run. So the write is an explicit update-or-insert, which also keeps the id and
     the verdict the person already gave. */
  const { data: existing } = await supabaseAdmin.from('money_readings').select('id, kind, month, verdict').eq('user_id', userId);
  const keyOf = (kind, month) => `${kind}|${month || ''}`;
  const byKey = new Map((existing || []).map((r) => [keyOf(r.kind, r.month), r.id]));
  /* A kind this person has muted more than acted on, over thirty deliveries, is not
     computed again. The rows that retired it are kept: they are the reason. */
  const retired = retiredKinds(existing || []);
  const seen = new Set();
  for (const f of findings.filter((x) => !retired.has(x.kind))) {
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
  /* A finding that no longer holds should stop being shown, not linger from last week. A
     nudge is dated, so a past one is harmless on its own and is kept: the record of what
     was said and whether it was muted is what the retirement rule reads. */
  const stale = (existing || []).filter((r) => !seen.has(keyOf(r.kind, r.month)) && !NUDGE_KINDS.includes(r.kind) && r.kind !== SPLIT_OPEN).map((r) => r.id);
  if (stale.length) await supabaseAdmin.from('money_readings').delete().in('id', stale);
  /* The twin should know what the money says, in the same stream as everything else it
     knows. Duplicate content inside a day is skipped by the memory stream itself. */
  const told = await tellTwin(userId, findings).catch((e) => { log.warn(`twin bridge failed: ${e.message}`); return { written: 0 }; });
  /* And what the person said themselves. The twin held the readings and not the claims
     behind them, so it knew the month was 1610 EUR and not that 1750 EUR comes from family
     (2026-09-16). The stream skips a sentence it already holds, so this is cheap. */
  const saidTold = await tellTwinFacts(userId, facts).catch((e) => { log.warn(`twin facts failed: ${e.message}`); return { written: 0 }; });
  return { segments, findings, told: told.written + saidTold.written };
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
/**
 * The money the twin should have in front of it in any conversation: this month, what
 * comes back, and the two or three things the ledger has to say. Compact by design —
 * two queries, a few hundred characters — because it rides in every system prompt.
 * Returns null when there is no ledger, so the twin says nothing rather than guessing.
 */
export async function moneyContext(userId, now = new Date()) {
  const [transactions, readings] = await Promise.all([
    listEuroTransactions(userId, { limit: 2000 }),
    supabaseAdmin.from('money_readings').select('kind, sentence, detail, computed_at').eq('user_id', userId)
      .order('computed_at', { ascending: false }).limit(4).then((r) => r.data || []),
  ]);
  if (!transactions.length) return null;
  /* What the person said about their own money, kept apart from what was read, because a
     typed number and an observed payment must never be quoted with the same certainty. */
  /* Internal rows included: the calendar keeps everything it learned in two of them, and the
     block below read a filtered list, so the twin's calendar was always null (2026-09-16).
     Nothing here shows a fact raw; describeContext names the kinds it speaks. */
  const facts = await listFacts(userId, { includeInternal: true }).catch(() => []);
  const segments = monthSegments(transactions, now, spendingRule(facts));
  const here = segments[0];
  const before = segments[1] || null;
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
    .gte('confidence', TWIN_PREDICTION_CONFIDENCE)
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
 * The one place a payment is given its kind. A person's correction beats the lookup, the
 * lookup beats the channel, and a payment nothing can speak for stays unplaced rather than
 * being filed under "other". Every surface that groups spending must call this: the month
 * page and the chat once disagreed about the same euros because each had its own version.
 */
/**
 * The kind of place behind each merchant, for one person: their own word first (their
 * override), then what a provider said, else null. One read of each table, one map.
 */
export function categoryOfPayment(place, channel, role = null) {
  const fromPlace = place ? (place.category || null) : null;
  /* A transfer to the person named as the landlord is the rent, not "transfers": the one
     category a student's month is built around, and the one a places provider can never see. */
  if (!fromPlace && role === 'landlord' && (channel === 'transfer' || channel === 'bizum')) return 'rent';
  return fromPlace || CHANNEL_CATEGORY[channel] || null;
}

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
  const { data: all, error } = await q;
  if (error) throw new Error(error.message);
  /* A transfer to a friend is not where the money went; it is money that moved. The same
     rule the forecast uses, so the hero and this list add up to the same euros. */
  const facts = await listFacts(userId).catch(() => []);
  const counts = spendingRule(facts);
  const roles = personRoles(facts);
  const rows = (all || []).filter(counts);
  if (!rows.length) return { month, total: 0, read: 0, groups: [] };

  const keys = [...new Set(rows.map((r) => r.merchant_key))];
  const [{ data: places }, mine] = await Promise.all([
    supabaseAdmin.from('money_places').select('merchant_key, name, kind, category, city, lat, lon, confidence').in('merchant_key', keys),
    categoriesFor(userId, keys),
  ]);
  /* The person's own word replaces the provider's kind on their copy of the place. */
  const byKey = new Map((places || []).map((p) => [p.merchant_key, { ...p, category: mine.get(p.merchant_key) ?? p.category ?? null }]));
  for (const k of keys) if (!byKey.has(k) && mine.get(k)) byKey.set(k, { merchant_key: k, name: null, category: mine.get(k) });

  const groups = new Map();
  let total = 0;
  let read = 0;
  for (const r of rows) {
    const amount = Math.abs(Number(r.amount) || 0);
    total += amount;
    const place = byKey.get(r.merchant_key);
    /* A merchant that was looked up and not found is still unread, not "other": a miss is
       recorded so the same question is not asked twice, and it must not pass for an answer. */
    /* A transfer to a person is a transfer, whatever a places provider thinks: the channel
       the bank recorded is itself an answer, and a truthful one. */
    const category = categoryOfPayment(place, r.channel, roles.get(String(r.merchant_key || '').toLowerCase()) || null);
    if (category) read += amount;
    const key = category || 'not read yet';
    if (!groups.has(key)) groups.set(key, { category: key, known: Boolean(category), spent: 0, lines: 0, merchants: new Map() });
    const g = groups.get(key);
    g.spent += amount;
    g.lines += 1;
    const name = place?.name || r.merchant_raw || r.merchant_key;
    const m = g.merchants.get(name) || { spent: 0, merchant_key: r.merchant_key };
    m.spent += amount;
    g.merchants.set(name, m);
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
        merchants: [...g.merchants.entries()].sort((a, b) => b[1].spent - a[1].spent).slice(0, g.known ? 4 : 12).map(([name, m]) => ({ name, merchant_key: m.merchant_key, spent: Math.round(m.spent * 100) / 100 })),
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
  const [{ data: places }, mine] = await Promise.all([supabaseAdmin.from('money_places').select('*').in('merchant_key', keys), categoriesFor(userId, keys)]);
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
      category: mine.get(k) ?? p?.category ?? null,
      lat: p?.lat ?? null,
      lon: p?.lon ?? null,
      confidence: p?.confidence ?? null,
      spent: Math.round((spend.get(k) || 0) * 100) / 100,
      looked_up: Boolean(p),
    };
  }).sort((a, b) => b.spent - a.spent);
}

/** A person's correction to a category outlives the next lookup. */
/** The person's word on what kind of place a merchant is: kept for them alone; null forgets it. */
export async function setPlaceCategory(userId, merchantKey, category, { name = null } = {}) {
  if (category) {
    const { error } = await supabaseAdmin.from('money_place_overrides')
      .upsert({ user_id: userId, merchant_key: merchantKey, category, created_at: new Date().toISOString() }, { onConflict: 'user_id,merchant_key' });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabaseAdmin.from('money_place_overrides').delete().eq('user_id', userId).eq('merchant_key', merchantKey);
    if (error) throw new Error(error.message);
  }
  /* A merchant no provider has ever placed has no shared row: one is made so it has a name,
     with no kind on it, since the kind is this person's and not everyone's. */
  const { data } = await supabaseAdmin.from('money_places').select('merchant_key, name, category').eq('merchant_key', merchantKey).maybeSingle();
  if (!data) {
    const { error: e2 } = await supabaseAdmin.from('money_places').insert({ merchant_key: merchantKey, name: name || merchantKey, provider: 'person' });
    if (e2 && !/duplicate|23505/.test(e2.message)) throw new Error(e2.message);
  }
  return { merchant_key: merchantKey, name: data?.name || name || merchantKey, category: category || data?.category || null };
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
  let unreached = 0;
  const batch = todo.slice(0, limit);
  for (const key of batch) {
    const name = names.get(key) || key;
    /* What the name settles on its own beats what a geocoder guesses: a provider does not
       know Cabify is a ride or that OpenRouter is an API bill. Coordinates still come from
       the provider, so a brand keeps its place on a map. */
    const brand = categoryFromBrand(name);
    let place = null;
    try { place = await lookupPlace({ name, city: cities.get(key) || null, country: 'ES' }); }
    catch (error) {
      /* The provider was not reached, so nothing is known either way. Written down as a miss
         it would never be asked again; left alone, the next run asks. */
      log.warn(`place lookup failed (${name})`, { error: error.message });
      unreached += 1;
      continue;
    }
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
  return { looked: batch.length, placed, unreached, left: Math.max(0, todo.length - batch.length), provider: providerFor() };
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
    supabaseAdmin.from('money_recurring').select('*').eq('user_id', userId).then((r) => {
      if (r.error) throw new Error(`Cannot read recurring commitments: ${r.error.message}`);
      return r.data || [];
    }),
    listEuroTransactions(userId, { limit: 5000 }),
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

  /* Which of those platforms this person actually connected. A merchant whose name maps to a
     platform proves nothing about whether we could have seen the use. */
  const { data: conns } = await supabaseAdmin
    .from('platform_connections')
    .select('platform')
    .eq('user_id', userId)
    .in('status', ['connected', 'token_refreshed', 'pending']);
  const connected = [...new Set((conns || []).map((c) => c.platform).filter(Boolean))];

  const findings = readUsage({ recurring: withCharges, eventsByPlatform, connected, now });
  return {
    findings,
    unmeasurable: unmeasurable(withCharges).map((u) => ({ ...u, name: names.get(u.merchant_key) || u.merchant_key })),
    measured: wanted.filter((p) => connected.includes(p)),
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
/**
 * What the ledger has worked out about this person, without writing anything down.
 *
 * `learn` does the same work and stores what it finds; this is the read for a page, so it
 * costs one query and some arithmetic and leaves no rows behind. The person asked to see
 * the patterns the twin has been using, which until now only ever reached a prompt
 * (Stefano, 2026-09-16).
 */
export async function patternsFor(userId, now = new Date()) {
  const transactions = await listEuroTransactions(userId, { limit: 5000 });
  if (!transactions.length) return [];
  const keys = [...new Set(transactions.map((t) => t.merchant_key))];
  const categories = await categoriesFor(userId, keys);
  const categoryOf = (t) => categories.get(t.merchant_key) || CHANNEL_CATEGORY[t.channel] || null;
  const profiles = learnMerchants(transactions, { now, categoryOf });
  return learnPatterns({ transactions, profiles, categoryOf, now });
}

export async function learn(userId, now = new Date()) {
  const transactions = await listEuroTransactions(userId, { limit: 5000 });
  if (!transactions.length) return { profiles: [], patterns: [], predictions: [], summary: null };

  const keys = [...new Set(transactions.map((t) => t.merchant_key))];
  const categories = await categoriesFor(userId, keys);
  const categoryOf = (t) => categories.get(t.merchant_key) || CHANNEL_CATEGORY[t.channel] || null;

  /* What other people's ledgers say about these places, as aggregates and never rows:
     leave-one-out, so a person alone gets no prior and nothing changes for them. */
  const { data: others } = keys.length
    ? await supabaseAdmin.from('money_merchant_profiles').select('user_id, merchant_key, times, typical_amount, median_gap_days').in('merchant_key', keys).neq('user_id', userId).limit(5000)
    : { data: [] };
  const priors = poolMerchantPriors(others || []);

  const profiles = learnMerchants(transactions, { now, categoryOf, priors });
  /* Days the calendar says were spent away are not silence (covariates.js). */
  const { away } = calendarFromFacts(await listFacts(userId, { includeInternal: true }).catch(() => []), { now });
  const predictions = predictNext(profiles, { now, away });
  const patterns = learnPatterns({ transactions, profiles, categoryOf, now });
  const summary = describeForTwin({ profiles, patterns, predictions, now });
  /* The patterns reached a prompt and nothing else. In the stream they are retrievable by
     anything the person asks the twin, money or not (2026-09-16). */
  await tellTwinPatterns(userId, patterns).catch((e) => log.warn(`twin patterns failed: ${e.message}`));

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

/**
 * The questions still worth putting to this person: the opening ones they have not answered,
 * then the ones their own ledger raises, biggest unexplained money first. A question already
 * skipped is not asked again — a person who declined once declined for a reason.
 */
export async function questionsFor(userId, now = new Date()) {
  const [facts, transactions, asked, accounts] = await Promise.all([
    listFacts(userId),
    listEuroTransactions(userId, { limit: 5000 }),
    supabaseAdmin.from('money_questions_asked').select('question_id, skipped').eq('user_id', userId).then((r) => r.data || []),
    listBankAccounts(userId).catch(() => []),
  ]);
  const declined = new Set(asked.filter((a) => a.skipped).map((a) => a.question_id));
  const keys = [...new Set(transactions.map((t) => t.merchant_key))];
  const categories = await categoriesFor(userId, keys);
  const placeOf = (t) => categories.get(t.merchant_key) || null;

  /* What they already said, followed up where a number on the screen is wrong without the
     answer: an income with no day, an account nobody has said whether they spend from. */
  const oldest = transactions.length ? transactions.map((t) => t.occurred_at).sort()[0] : null;
  const daysOfLedger = oldest ? Math.floor((now.getTime() - new Date(oldest).getTime()) / 86400000) : 0;
  const standingCharge = transactions.some((t) => Math.abs(Number(t.amount) || 0) >= 200 && Number(t.amount) < 0);
  const follow = followUpQuestions({ facts, accounts, daysOfLedger, standingCharge }).filter((q) => !declined.has(q.id));
  return {
    opening: openingQuestions(facts).filter((q) => !declined.has(q.id)).concat(follow),
    fromLedger: ledgerQuestions({ transactions, facts, placeOf, now }).filter((q) => !declined.has(q.id)),
    answered: facts.length,
  };
}

/** Record an answer, and check it against the ledger where it is checkable. */
/** The kinds a person may write; the ledger's own rows are not among them. */
export const ANSWERABLE_KINDS = Object.freeze(FACT_KINDS.filter((k) => !INTERNAL_FACT_KINDS.includes(k)));
const cut = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : v);

export async function answerQuestion(userId, { questionId, kind, subject, subjectLabel, value, amount, day, share, note }) {
  if (!ANSWERABLE_KINDS.includes(kind)) throw Object.assign(new Error('That is not something a person writes here.'), { status: 400 });
  subject = cut(subject, 120); subjectLabel = cut(subjectLabel, 120); value = cut(value, 240); questionId = cut(questionId, 120);
  if (amount !== undefined && amount !== null && !Number.isFinite(Number(amount))) throw Object.assign(new Error('amount must be a number'), { status: 400 });
  /* The rent question is a choice, and a choice carries no amount. "Not fixed" is a decline
     that should not be asked again; the other two answers take their amount and day from
     the ledger lines that raised the question. */
  /* The keep is typed as a number in a text field; it is stored as the amount it is. */
  if (kind === 'keep' && !amount && value != null) {
    const n = Number(String(value).replace(/[^0-9.,]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return skipQuestion(userId, questionId);
    amount = Math.round(n * 100) / 100; value = null; subject = subject || '';
  }
  /* A day given for an income already known: the row is keyed on (kind, subject), so an
     answer carrying only a day would upsert the amount away. The amount and the words stay
     and the day joins them (2026-09-16). */
  if (kind === 'income' && String(questionId || '').startsWith('income_day:')) {
    const typed = Number(String(value ?? '').replace(/[^0-9]/g, ''));
    if (!Number.isFinite(typed) || typed < 1 || typed > 31) return skipQuestion(userId, questionId);
    const { data: said } = await supabaseAdmin.from('money_facts')
      .select('*').eq('user_id', userId).eq('kind', 'income').eq('subject', subject || '').maybeSingle();
    if (!said) return skipQuestion(userId, questionId);
    day = typed;
    amount = said.amount;
    value = said.value;
    subjectLabel = subjectLabel || said.subject_label;
  }
  if (kind === 'commitment' && String(questionId || '').startsWith('rent:')) {
    if (String(value || '').toLowerCase() === 'not fixed') return skipQuestion(userId, questionId);
    if (!amount && subject) {
      const rows = (await listEuroTransactions(userId, { limit: 5000 }))
        .filter((t) => t.merchant_key === subject && Number(t.amount) < 0 && Math.abs(Number(t.amount)) >= 200);
      if (rows.length) {
        const amounts = rows.map((t) => Math.abs(Number(t.amount))).sort((a, b) => a - b);
        const days = rows.map((t) => dayOfMonthIn(t.occurred_at)).sort((a, b) => a - b);
        amount = amounts[Math.floor(amounts.length / 2)];
        day = day || days[Math.floor(days.length / 2)];
      }
    }
    value = String(value || '').toLowerCase() === 'rent' ? 'rent' : (value || 'fixed cost');
  }
  const row = {
    user_id: userId, kind, subject: subject || '', subject_label: subjectLabel || null,
    value: value ?? null, amount: amount ?? null, day: day ?? null, share: share ?? null,
    /* Their own words on it, when a choice was not enough: "my landlord", "the ski trip deposit". */
    note: typeof note === 'string' && note.trim() ? note.trim().slice(0, 240) : null,
    source: 'asked', question_id: questionId || null, answered_at: new Date().toISOString(),
  };
  if (kind === 'commitment' && amount) {
    const transactions = await listEuroTransactions(userId, { limit: 5000 });
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

/**
 * Forget one thing the person said. The fact goes, and the question that produced it is
 * open again, so a wrong answer can be given again rather than argued with. Internal rows
 * (the calendar's read, the receipts address) are not the person's words and stay.
 */
export async function deleteFact(userId, factId) {
  const { data: fact } = await supabaseAdmin.from('money_facts').select('id, kind, question_id').eq('user_id', userId).eq('id', factId).maybeSingle();
  if (!fact || INTERNAL_FACT_KINDS.includes(fact.kind)) return { deleted: false };
  const { error } = await supabaseAdmin.from('money_facts').delete().eq('user_id', userId).eq('id', factId);
  if (error) throw new Error(error.message);
  if (fact.question_id) await supabaseAdmin.from('money_questions_asked').delete().eq('user_id', userId).eq('question_id', fact.question_id);
  return { deleted: true };
}

/* ------------------------------------------------------------------ the conversation, kept */

/** One turn of the conversation with the ledger, kept so it can be picked up again. */
export async function saveChatTurn(userId, { role, text, figures = null, actions = null, thinking = null, basis = null, receipts = null }) {
  if (receipts && receipts.length) figures = { figures: figures || [], receipts: receipts.slice(0, 8) };
  if (!text || !String(text).trim()) return null;
  const small = (v, n) => { if (v == null) return null; const j = JSON.stringify(v); return j.length > n ? null : v; };
  const { data, error } = await supabaseAdmin.from('money_chat_turns')
    .insert({ user_id: userId, role, text: String(text).slice(0, 4000), figures: small(figures, 20000), actions: small(actions, 8000), thinking: thinking ? String(thinking).slice(0, 4000) : null, basis: small(basis, 8000) })
    .select('id, created_at').maybeSingle();
  if (error) { log.warn(`chat turn not kept: ${error.message}`); throw new Error('Could not save the conversation'); }
  /* The twin remembers being asked. Ask kept its own transcript and the twin knew nothing of
     it, so a person could tell the ledger something on Monday and find the twin had never
     heard it (2026-09-16). Not awaited: a turn must reach the screen even if the stream is
     slow, and a lost memory is not a lost answer. */
  tellTwinTurn(userId, { role, text }).catch((e) => log.warn(`twin turn failed: ${e.message}`));
  return data;
}

/** The last turns, oldest first, for the page to open on where the conversation stood. */
export async function listChatTurns(userId, { limit = 30 } = {}) {
  const { data, error } = await supabaseAdmin.from('money_chat_turns')
    .select('id, role, text, figures, actions, thinking, basis, created_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
  if (error) { log.warn(`chat turns not read: ${error.message}`); throw new Error('Could not read the conversation'); }
  /* Receipts ride inside the figures column; they come back out here. */
  return (data || []).reverse().map((t) => {
    if (t.figures && !Array.isArray(t.figures) && Array.isArray(t.figures.figures)) return { ...t, figures: t.figures.figures, receipts: t.figures.receipts || [] };
    return { ...t, receipts: [] };
  });
}

/** The language the person chose for TwinMe (en, es, pt-BR), or null when never asked. */
export async function userLanguage(userId) {
  const { data } = await supabaseAdmin.from('users').select('preferred_language').eq('id', userId).maybeSingle();
  return data?.preferred_language || null;
}

/** The person's own words about their money, for the twin. */
export async function contextBlock(userId) {
  const facts = await listFacts(userId);
  return describeContext(facts);
}
