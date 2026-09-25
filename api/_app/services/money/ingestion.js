/** The sole ingestion path for single captures and imports. Two DB calls per 250 rows, and one
 * more per 250 for a statement file longer than 250 rows (see ingestSightings).
 * Pure matching decisions are retried against a fresh snapshot after a concurrent commit.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { supabaseAdmin } from '../database.js';
import { booked, deferral, pairStatement, reconcile } from './ledger.js';

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
/** The file a statement row came from (importer.js documentFingerprint), when it was recorded. */
const documentOf = (s) => (s?.source === 'statement' && s.raw_json?.document) || null;

/** Per file, the stored lines its rows name again (by their own ref, or an earlier one on the
    same account): a file never joins a line one of its own rows already backs. Adds to `into`. */
function linesNamedAgain(inputs, sightings, into) {
  const stored = new Map(sightings.map((s) => [key(s), s]));
  for (const input of inputs) {
    const doc = documentOf(input);
    if (!doc) continue;
    for (const ref of [input.source_ref, ...(input.legacy_refs || [])]) {
      const again = stored.get(`${input.source}:${ref}`);
      if (!again?.transaction_id || (ref !== input.source_ref && again.account_id !== input.account_id)) continue;
      (into.get(doc) || into.set(doc, new Set()).get(doc)).add(again.transaction_id);
    }
  }
  return into;
}

/**
 * @param {object[]} inputs   validated sightings, unique by source and source_ref
 * @param {object} snapshot   what prepare_money_ingestion returned
 * @param {object} [opts]
 * @param {Map<string, Set<string>>} [opts.documentLines]  per file, the lines an earlier write of
 *   the same import linked its rows to; a snapshot's backings do not say which file a row came from
 */
export function planIngestion(inputs, snapshot, { documentLines = new Map() } = {}) {
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

  /* One payment is one line, whichever files describe it: a kept sheet and the bank's PDF of the
     same month were two statement sources to this planner, so every payment in both became two
     lines (36 lines and 882,67 for a month of 22 and 510,60, 2026-09-26). A statement row may join
     a line other files back, one row of each file per line (ledger.pairStatement), and never a
     line its own file backs, which is how two equal payments in one file stay two. A line's
     backings name its file only for rows placed here, so the lines a file already backs are also
     gathered from what ingestSightings carried over and from the stored rows this page reads
     again, before any row is placed: a later export lists the 16th before the 15th it repeats. */
  const backed = linesNamedAgain(inputs, snapshot.sightings, new Map([...documentLines].map(([doc, ids]) => [doc, new Set(ids)])));
  const backedBy = (doc) => backed.get(doc) || backed.set(doc, new Set()).get(doc);
  /* Lines backed by statement rows of other files (or of none recorded: imported before files
     were), and by none of this row's own file. */
  const otherFiles = (s, doc) => pool.filter((t) => !backedBy(doc).has(t.id)
    && t.backings.some((b) => b.source === 'statement' && b.id !== s.id)
    && t.backings.every((b) => b.source !== 'statement' || b.id === s.id || b.document !== doc));

  const place = (index, s, decision, action) => {
    if (decision.action === 'deferred') {
      const deferred = decision.sighting;
      saved.push(deferred);
      links.push({ sighting_id: deferred.id, transaction_id: null });
      const linked = { ...deferred, transaction_id: null };
      prior.set(key(deferred), linked);
      results[index] = { sighting: linked, transaction: null, action: 'deferred' };
      return;
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
    const doc = documentOf(s);
    transaction.backings = transaction.backings.filter((b) => b.id !== s.id);
    transaction.backings.push({ id: s.id, source: s.source, status: s.raw_json?.status || 'BOOK', ...(doc ? { document: doc } : {}) });
    if (doc) backedBy(doc).add(transaction.id);
    const linked = { ...s, transaction_id: transaction.id };
    prior.set(key(s), linked);
    saved.push(s);
    links.push({ sighting_id: s.id, transaction_id: transaction.id });
    results[index] = { sighting: linked, transaction, action };
  };
  // The rules every source meets: the matching window, and one line per row of a source.
  const matchAnyLine = (index, s, existing) => {
    const excluded = new Set(pool.filter((t) => {
      const same = t.backings.filter((b) => b.source === s.source && b.id !== s.id);
      if (!same.length) return false;
      // Only a pending->booked transition can reuse a line already backed by this source.
      return !(s.source === 'bankfeed' && (booked(s) ? !t.posted_at && same.every((b) => b.status === 'PDNG') : same.every((b) => b.status !== 'PDNG')));
    }).map((t) => t.id));
    const decision = reconcile(s, pool, null, { exclude: excluded, existing });
    place(index, s, decision, existing ? 'existing' : decision.action);
  };
  const joinOtherFile = (index, s, line) => place(index, s, reconcile(s, pool, null, { existing: line }), 'attach');

  const waiting = [];
  for (const [index, input] of inputs.entries()) {
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
      results[index] = { sighting: old, transaction: null, action: 'ignored_deleted' };
      continue;
    }
    const s = { ...input, id: old?.id || randomUUID(), ...(old?.reconciliation ? { reconciliation: old.reconciliation } : {}) };
    const existing = old?.transaction_id ? pool.find((t) => t.id === old.transaction_id) : null;
    const doc = documentOf(s);
    // A row with its own line keeps it, and a deferred one waits for the person, as before.
    if (doc && !existing && !s.reconciliation) {
      const pairing = pairStatement(s, otherFiles(s, doc));
      if (pairing.kind === 'pair') { joinOtherFile(index, s, pairing.match); continue; }
      if (pairing.kind === 'ambiguous') { waiting.push({ index, s, pairing }); continue; }
    }
    matchAnyLine(index, s, existing);
  }
  /* A row that could not tell two lines apart waits for the rest of its file to take its own
     lines: "CAFETERIA PEPE" cannot choose between the sheet's Cafe and Metro at 2,50, and once
     "METRO DE MADRID" has taken Metro it has one line left. Whatever still cannot choose is
     deferred with its candidates (#592), since the person can tell and this cannot. */
  for (let moved = true; waiting.length && moved;) {
    moved = false;
    for (const row of [...waiting]) {
      row.pairing = pairStatement(row.s, otherFiles(row.s, documentOf(row.s)));
      if (row.pairing.kind === 'ambiguous') continue;
      waiting.splice(waiting.indexOf(row), 1);
      moved = true;
      if (row.pairing.kind === 'pair') joinOtherFile(row.index, row.s, row.pairing.match);
      else matchAnyLine(row.index, row.s, null);
    }
  }
  for (const row of waiting) place(row.index, row.s, deferral(row.s, row.pairing.candidateIds), 'deferred');
  return { sightings: saved, creates: [...creates.values()], updates: [...updates.values()], links, results };
}

async function ingestChunk(userId, inputs, documentLines) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: snapshot, error } = await supabaseAdmin.rpc('prepare_money_ingestion', { p_user_id: userId, p_sightings: inputs });
    if (error) throw new Error(`Cannot read payment evidence: ${error.message}`);
    const plan = planIngestion(inputs, snapshot, { documentLines });
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
  /* Per file, the lines this import's rows back. A write's snapshot cannot say which file a
     stored row came from and names only its own 250 rows' stored twins, so an import longer than
     one write first asks each write's twins (a year's export repeating January would otherwise
     pair its 1st of February with the 31st of January it re-reads a write later), and each write
     then hands on the lines it linked (the 251st daily ride must not join the 250th). */
  const documentLines = new Map();
  if (inputs.length > 250 && inputs.some(documentOf)) {
    for (let at = 0; at < inputs.length; at += 250) {
      const page = inputs.slice(at, at + 250);
      const { data: snapshot, error } = await supabaseAdmin.rpc('prepare_money_ingestion', { p_user_id: userId, p_sightings: page });
      if (error) throw new Error(`Cannot read payment evidence: ${error.message}`);
      linesNamedAgain(page, snapshot.sightings, documentLines);
    }
  }
  for (let at = 0; at < inputs.length; at += 250) {
    const plan = await ingestChunk(userId, inputs.slice(at, at + 250), documentLines);
    if (single) return plan.results[0];
    for (const { sighting, transaction } of plan.results) {
      const doc = documentOf(sighting);
      if (doc && transaction) (documentLines.get(doc) || documentLines.set(doc, new Set()).get(doc)).add(transaction.id);
    }
    result.created += plan.creates.length;
    result.deferred += plan.results.filter((r) => r.action === 'deferred').length;
    result.ignored_deleted += plan.results.filter((r) => r.action === 'ignored_deleted').length;
    result.revision = plan.revision;
    result.attached += plan.results.filter((r) => r.action === 'attach').length;
  }
  return result;
}
export const ingestSighting = (userId, sighting) => ingestSightings(userId, [sighting], { single: true });
