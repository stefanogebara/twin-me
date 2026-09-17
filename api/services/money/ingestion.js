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
});

const key = (s) => `${s.source}:${s.source_ref}`;

export function planIngestion(inputs, snapshot) {
  const pool = snapshot.transactions.map((t) => ({ ...t, backings: [...(t.backings || [])] }));
  const prior = new Map(snapshot.sightings.map((s) => [key(s), s]));
  const saved = []; const creates = new Map(); const updates = new Map(); const links = []; const results = [];
  for (const input of inputs) {
    // Legacy aliases are accepted only when the stored row belongs to this account.
    const old = prior.get(key(input)) || (input.legacy_refs || []).map((ref) => prior.get(key({ ...input, source_ref: ref })))
      .find((s) => s && (!input.account_id || s.account_id === input.account_id)
        && (input.raw_json?.entry_reference && input.raw_json.entry_reference === s.raw_json?.entry_reference
          || ((s.currency || 'EUR') === input.currency && Number(s.amount) === input.amount
            && s.direction === input.direction && Date.parse(s.occurred_at) === Date.parse(input.occurred_at))));
    const s = { ...input, id: old?.id || randomUUID() };
    const existing = old?.transaction_id ? pool.find((t) => t.id === old.transaction_id) : null;
    const excluded = new Set(pool.filter((t) => {
      const same = t.backings.filter((b) => b.source === s.source && b.id !== s.id);
      if (!same.length) return false;
      // Only a pending->booked transition can reuse a line already backed by this source.
      return !(s.source === 'bankfeed' && (booked(s) ? !t.posted_at && same.every((b) => b.status === 'PDNG') : same.every((b) => b.status !== 'PDNG')));
    }).map((t) => t.id));
    const decision = reconcile(s, pool, null, { exclude: excluded, existing });
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
    const { error: commitError } = await supabaseAdmin.rpc('commit_money_ingestion', {
      p_user_id: userId, p_revision: snapshot.revision, p_sightings: plan.sightings,
      p_creates: plan.creates, p_updates: plan.updates, p_links: plan.links,
    });
    if (!commitError) return plan;
    if (commitError.code !== '40001') throw new Error(`Payment import rolled back: ${commitError.message}`);
  }
  throw new Error('Payments are being updated. Please retry this import.');
}

export async function ingestSightings(userId, sightings, { single = false } = {}) {
  uuid.parse(userId);
  const validated = z.array(sightingSchema).max(20000).parse(sightings);
  // Last provider revision wins within one response; prevents duplicate SQL target rows.
  const inputs = [...new Map(validated.map((s) => [key(s), s])).values()];
  const result = { seen: inputs.length, created: 0, attached: 0 };
  for (let at = 0; at < inputs.length; at += 250) {
    const plan = await ingestChunk(userId, inputs.slice(at, at + 250));
    if (single) return plan.results[0];
    result.created += plan.creates.length;
    result.attached += plan.results.filter((r) => r.action === 'attach').length;
  }
  return result;
}
export const ingestSighting = (userId, sighting) => ingestSightings(userId, [sighting], { single: true });
