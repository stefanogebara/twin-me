/** The sole ingestion path for single captures and imports. Two DB calls per 250 rows.
 * Pure matching decisions are retried against a fresh snapshot after a concurrent commit.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { supabaseAdmin } from '../database.js';
import { booked, reconcile } from './ledger.js';

const uuid = z.string().uuid();
const nullableText = (max) => z.string().max(max).nullable().optional();
const sightingSchema = z.object({
  source: z.enum(['phone', 'bizum', 'bankfeed', 'statement', 'email', 'gmail', 'upload']),
  source_ref: z.string().min(1).max(512),
  legacy_refs: z.array(z.string().max(512)).max(5).optional(),
  account_id: uuid.nullable().optional(),
  amount: z.number().finite().nonnegative().max(9999999999.99),
  currency: z.string().regex(/^[A-Z]{3}$/).default('EUR'),
  direction: z.enum(['in', 'out']),
  occurred_at: z.string().refine((s) => Number.isFinite(Date.parse(s)), 'Invalid payment date'),
  merchant_key: z.string().min(1).max(512),
  merchant_raw: nullableText(1000),
  raw_text: nullableText(100000),
  raw_json: z.record(z.unknown()).nullable().optional(),
  channel: nullableText(40),
  card_last4: z.string().regex(/^\d{4}$/).nullable().optional(),
  parse_confidence: z.number().min(0).max(1).nullable().optional(),
}).refine((s) => s.source !== 'statement' || Boolean(s.account_id), 'Statement account is required');

const key = (s) => `${s.source}:${s.source_ref}`;

export function planIngestion(inputs, snapshot) {
  const pool = snapshot.transactions.map((t) => ({ ...t, backings: [...(t.backings || [])] }));
  const prior = new Map(snapshot.sightings.map((s) => [key(s), s]));
  const saved = []; const creates = new Map(); const updates = new Map(); const links = []; const results = [];
  /* An old name belongs to one payment. Two coffees at one price on one day are read as two
     rows that carry the same earlier names, and if both claimed the same evidence row they
     would be written to one id and Postgres would keep the last: one payment gone. */
  const claimed = new Set();
  // Exact identities win even when they occur later in this page. An alias must not
  // steal another row's evidence, or the commit would write the same id twice.
  const reserved = new Set(inputs.map((input) => prior.get(key(input))?.id).filter(Boolean));
  const aliasRows = (input) => snapshot.sightings.filter((s) => s.source === input.source
    && (input.legacy_refs || []).some((ref) => s.source_ref === ref
      || (/^(pend:|bank:fallback:)/.test(ref) && s.source_ref.startsWith(`${ref}#`)
        && /^\d+$/.test(s.source_ref.slice(ref.length + 1)))));
  for (const input of inputs) {
    // Legacy aliases are accepted only when the stored row belongs to this account.
    const old = prior.get(key(input)) || aliasRows(input)
      .find((s) => s && !claimed.has(s.id) && !reserved.has(s.id) && (!input.account_id || s.account_id === input.account_id)
        && !(input.raw_json?.entry_reference && s.raw_json?.entry_reference
          && input.raw_json.entry_reference !== s.raw_json.entry_reference && booked(s))
        && (input.raw_json?.entry_reference && input.raw_json.entry_reference === s.raw_json?.entry_reference
          || ((s.currency || 'EUR') === input.currency && Number(s.amount) === input.amount
            && s.direction === input.direction && Date.parse(s.occurred_at) === Date.parse(input.occurred_at))));
    if (old) claimed.add(old.id);
    // A resolved observation whose transaction was removed retains that deletion. A
    // provider retry must neither resurrect it nor reinterpret it against other payments.
    // Leave the original source evidence and resolution history byte-for-byte intact.
    if (old?.reconciliation?.state === 'resolved' && !old.transaction_id) {
      results.push({ sighting: old, transaction: null, action: 'ignored_deleted' });
      continue;
    }
    const s = { ...input, id: old?.id || randomUUID(), ...(old?.reconciliation ? { reconciliation: old.reconciliation } : {}) };
    const existing = old?.transaction_id ? pool.find((t) => t.id === old.transaction_id) : null;
    const excluded = new Set(pool.filter((t) => {
      const same = t.backings.filter((b) => b.source === s.source && b.id !== s.id);
      if (!same.length) return false;
      // Only a pending->booked transition can reuse a line already backed by this source.
      return !(s.source === 'bankfeed' && (booked(s) ? !t.posted_at && same.every((b) => b.status === 'PDNG') : same.every((b) => b.status !== 'PDNG')));
    }).map((t) => t.id));
    const decision = reconcile(s, pool, null, { exclude: excluded, existing });
    if (decision.action === 'deferred') {
      const deferred = decision.sighting;
      saved.push(deferred);
      links.push({ sighting_id: deferred.id, transaction_id: null });
      const linked = { ...deferred, transaction_id: null };
      prior.set(key(deferred), linked);
      results.push({ sighting: linked, transaction: null, action: 'deferred' });
      continue;
    }
    let transaction;
    if (decision.action === 'create') {
      transaction = { id: randomUUID(), account_id: s.account_id || null, primary_sighting_id: s.id, ...decision.transaction, backings: [] };
      pool.push(transaction);
      creates.set(transaction.id, transaction);
    } else {
      transaction = pool.find((t) => t.id === decision.transaction.id);
      Object.assign(transaction, decision.transaction);
      if (!creates.has(transaction.id)) updates.set(transaction.id, { ...updates.get(transaction.id), ...decision.transaction });
    }
    if (transaction.primary_sighting_id === s.id) { transaction.primary_source = s.source; transaction.primary_status = s.raw_json?.status || 'BOOK'; }
    transaction.backings = transaction.backings.filter((b) => b.id !== s.id);
    transaction.backings.push({ id: s.id, source: s.source, status: s.raw_json?.status || 'BOOK' });
    const linked = { ...s, transaction_id: transaction.id };
    prior.set(key(s), linked);
    saved.push(s);
    links.push({ sighting_id: s.id, transaction_id: transaction.id });
    results.push({ sighting: linked, transaction, action: existing ? 'existing' : decision.action });
  }
  return { sightings: saved, creates: [...creates.values()], updates: [...updates.values()], links, results };
}

async function ingestChunk(userId, inputs) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: snapshot, error } = await supabaseAdmin.rpc('prepare_money_ingestion', { p_user_id: userId, p_sightings: inputs });
    if (error) throw new Error(`Cannot read payment evidence: ${error.message}`);
    const plan = planIngestion(inputs, snapshot);
    if (!plan.sightings.length) return { ...plan, revision: snapshot.revision };
    if (plan.results.some((r) => r.action === 'deferred') && snapshot.protocol !== 2) {
      throw new Error('Payment review is temporarily unavailable. Please retry this import.');
    }
    const { data: committed, error: commitError } = await supabaseAdmin.rpc('commit_money_ingestion', {
      p_user_id: userId, p_revision: snapshot.revision, p_sightings: plan.sightings,
      p_creates: plan.creates, p_updates: plan.updates, p_links: plan.links,
    });
    if (!commitError) return { ...plan, revision: committed?.revision ?? snapshot.revision + 1 };
    if (!['PT409', '40001'].includes(commitError.code)) throw new Error(`Payment import rolled back: ${commitError.message}`);
  }
  throw new Error('Payments are being updated. Please retry this import.');
}

export async function ingestSightings(userId, sightings, { single = false } = {}) {
  uuid.parse(userId);
  const validated = z.array(sightingSchema).max(20000).parse(sightings);
  // Last provider revision wins within one response; prevents duplicate SQL target rows.
  const inputs = [...new Map(validated.map((s) => [key(s), s])).values()];
  const result = { seen: inputs.length, created: 0, attached: 0, deferred: 0, ignored_deleted: 0, revision: null };
  for (let at = 0; at < inputs.length; at += 250) {
    const plan = await ingestChunk(userId, inputs.slice(at, at + 250));
    if (single) return plan.results[0];
    result.created += plan.creates.length;
    result.deferred += plan.results.filter((r) => r.action === 'deferred').length;
    result.ignored_deleted += plan.results.filter((r) => r.action === 'ignored_deleted').length;
    result.revision = plan.revision;
    result.attached += plan.results.filter((r) => r.action === 'attach').length;
  }
  return result;
}
export const ingestSighting = (userId, sighting) => ingestSightings(userId, [sighting], { single: true });
