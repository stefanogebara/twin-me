/**
 * Raw Transaction Ingestion — the generic seam every non-aggregator source feeds.
 * ===============================================================================
 * Bank-integration strategy (tasks/bank-integration-strategy/README.md) Phase 0:
 * CSV upload, WhatsApp statement attachments, and the Gmail OFX courier all
 * produce parser-shaped transactions ({ external_id, amount, merchant_raw,
 * transaction_date, ... }) and converge here:
 *
 *   ingestRawTransactions(userId, sourceMeta, transactions)
 *     -> amount sanity filter (parser garbage never reaches the DB)
 *     -> merchant normalization
 *     -> idempotent upsert on (user_id, external_id)
 *     -> shared downstream pipeline (recurrence -> emotion tagging -> memory
 *        stream dual-write -> optional nudges)
 *
 * The downstream pipeline + memory write are also exported standalone so the
 * aggregator ingests (pluggyIngestion) and the legacy CSV upload route can
 * delegate instead of keeping their own drifting copies. plaidIngestion keeps
 * its own variant deliberately (investment events land in memory regardless of
 * direction) — if you change the memory format here, check plaidIngestion too.
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';
import { normalizeMerchant } from './merchantNormalizer.js';
import { detectAndMarkRecurring } from './recurrenceDetector.js';
import { tagTransactionsBatch } from './transactionEmotionTagger.js';
import { maybeNudgeForTransactions } from './transactionNudgeService.js';
import { addPlatformObservation } from '../memoryStreamService.js';
import { DEFAULT_CURRENCY } from '../../config/financialThresholds.js';

const log = createLogger('raw-ingestion');

// Only material transactions enter the memory stream (same floor as the
// aggregator ingests) — sub-R$50 noise would pollute retrieval.
const MEMORY_MIN_AMOUNT = 50;

// Amount sanity range (audit-2026-05-08 H3, lifted from the upload route so
// every source gets it): single tx > 1M is parser garbage, sub-cent rows are
// FX rounding artifacts.
const MAX_TX_AMOUNT = 1_000_000;
const MIN_TX_AMOUNT = 0.01;

/**
 * Dual-write material outflows to user_memories so the twin can reflect on
 * spending in chat and the reflection engine.
 *
 * Column list must match the real transaction_emotional_context schema
 * (computed_stress_score, is_stress_shop_candidate — there is no emotion_label
 * column; the 2026-06-10 regression selected one AND ignored the error, so the
 * twin never learned from any transaction). Errors are surfaced, never
 * swallowed into an empty list.
 *
 * @param {string} userId
 * @param {string[]} insertedIds  user_transactions row ids from this ingest
 * @param {string} platform      memory platform tag ('pluggy', 'bank_statement', ...)
 */
export async function writeTransactionMemories(userId, insertedIds, platform) {
  if (!insertedIds?.length) return { written: 0 };

  const { data: txRows, error: txErr } = await supabaseAdmin
    .from('user_transactions')
    .select(`
      id, amount, merchant_normalized, merchant_raw, category,
      transaction_date,
      emotional_context:transaction_emotional_context (
        computed_stress_score, is_stress_shop_candidate
      )
    `)
    .in('id', insertedIds)
    .eq('user_id', userId)
    .lt('amount', 0);
  if (txErr) throw new Error(`material-tx select failed: ${txErr.message}`);

  const material = (txRows || []).filter(
    (r) => Math.abs(Number(r.amount) || 0) >= MEMORY_MIN_AMOUNT
  );

  await Promise.all(
    material.map((r) => {
      const merchant = r.merchant_normalized || r.merchant_raw || 'unknown';
      const amountStr = new Intl.NumberFormat('pt-BR', {
        style: 'currency', currency: 'BRL',
      }).format(Math.abs(r.amount));
      const date = r.transaction_date?.slice(0, 10) || 'unknown date';
      // PostgREST embeds to-one relations as an object, but be tolerant of
      // array shape (composite-key edge) — take the first row either way.
      const ecRaw = r.emotional_context;
      const ec = Array.isArray(ecRaw) ? ecRaw[0] : ecRaw;
      const stressPct = ec?.computed_stress_score != null
        ? Math.round(ec.computed_stress_score * 100)
        : null;
      const emotionNote = ec?.is_stress_shop_candidate
        ? `; emotional context: possible stress purchase${stressPct != null ? `, stress=${stressPct}%` : ''}`
        : stressPct != null
          ? `; stress at purchase time=${stressPct}%`
          : '';
      const content = `Spent ${amountStr} at ${merchant} on ${date}${emotionNote}.`;
      return addPlatformObservation(userId, content, platform, {
        category: r.category,
        source_tx_id: r.id,
      }).catch((err) => log.warn(`memory write failed for tx ${r.id}: ${err.message}`));
    })
  );

  if (material.length) {
    log.info(`wrote ${material.length} tx observations to memory stream for user ${userId}`);
  }
  return { written: material.length };
}

/**
 * Shared downstream pipeline: recurrence -> emotion tagging -> memory
 * dual-write -> optional nudges. Each step is idempotent and non-fatal —
 * a tagger blip must never fail the ingest that triggered it.
 *
 * @param {string} userId
 * @param {string[]} insertedIds
 * @param {{ allowNudge?: boolean, platform?: string }} opts
 *   allowNudge: only live (webhook-fresh) transactions should nudge — never
 *   historical backfills. platform: memory platform tag.
 */
export async function runSharedDownstreamPipeline(
  userId,
  insertedIds,
  { allowNudge = false, platform = 'bank_statement' } = {},
) {
  try {
    await detectAndMarkRecurring(userId);
  } catch (err) {
    log.warn(`recurrence detector failed for user ${userId}: ${err.message}`);
  }

  if (!insertedIds?.length) return;

  try {
    await tagTransactionsBatch(userId, insertedIds);
  } catch (err) {
    log.warn(`emotion tagger failed for user ${userId}: ${err.message}`);
  }

  try {
    await writeTransactionMemories(userId, insertedIds, platform);
  } catch (err) {
    log.warn(`memory stream dual-write failed for user ${userId}: ${err.message}`);
  }

  if (allowNudge) {
    try {
      await maybeNudgeForTransactions(userId, insertedIds);
    } catch (err) {
      log.warn(`nudge check failed for user ${userId}: ${err.message}`);
    }
  }
}

/**
 * Ingest parser-shaped transactions from any raw source.
 *
 * @param {string} userId
 * @param {{ source: string, sourceBank?: string, platform?: string, fileHash?: string }} sourceMeta
 *   source: user_transactions.source value ('whatsapp_statement', 'csv_upload',
 *   'gmail_statement'...). platform: memory tag (defaults to 'bank_statement').
 * @param {Array<{ external_id: string, amount: number|string, currency?: string,
 *   merchant_raw: string, transaction_date: string, account_type?: string }>} transactions
 * @param {{ allowNudge?: boolean }} opts
 * @returns {{ inserted: number, insertedIds: string[], skipped: string[] }}
 */
export async function ingestRawTransactions(userId, sourceMeta, transactions, opts = {}) {
  if (!userId) throw new Error('userId is required');
  const { source, sourceBank = 'unknown', platform = 'bank_statement', fileHash = null } = sourceMeta || {};
  if (!source) throw new Error('sourceMeta.source is required');
  if (!Array.isArray(transactions) || !transactions.length) {
    return { inserted: 0, insertedIds: [], skipped: [] };
  }

  // Amount sanity filter — parser garbage never reaches the DB.
  const skipped = [];
  const rows = [];
  for (const t of transactions) {
    if (!t?.external_id || !t?.transaction_date) {
      skipped.push(`missing external_id/transaction_date for ${t?.merchant_raw || '(unknown)'}`);
      continue;
    }
    const n = Number(t.amount);
    if (!Number.isFinite(n)) {
      skipped.push(`non-numeric amount for ${t.external_id}: ${t.amount}`);
      continue;
    }
    const abs = Math.abs(n);
    if (abs > MAX_TX_AMOUNT || abs < MIN_TX_AMOUNT) {
      skipped.push(`out-of-range amount ${n} for ${t.external_id}`);
      continue;
    }
    const { brand, category } = normalizeMerchant(t.merchant_raw || 'unknown');
    rows.push({
      user_id: userId,
      external_id: t.external_id,
      amount: n,
      currency: t.currency || DEFAULT_CURRENCY,
      merchant_raw: t.merchant_raw || 'unknown',
      merchant_normalized: brand,
      category,
      transaction_date: t.transaction_date,
      source,
      source_bank: sourceBank,
      // NOT NULL in user_transactions; 'checking' is the same fallback
      // pluggyIngestion.mapAccountType uses for unrecognized accounts.
      account_type: t.account_type || 'checking',
      ...(fileHash ? { source_file_hash: fileHash } : {}),
    });
  }

  if (!rows.length) {
    return { inserted: 0, insertedIds: [], skipped };
  }

  // Idempotent upsert: re-sending the same statement is a no-op, not a dupe.
  const { data, error } = await supabaseAdmin
    .from('user_transactions')
    .upsert(rows, { onConflict: 'user_id,external_id', ignoreDuplicates: false })
    .select('id');
  if (error) throw new Error(`transaction upsert failed: ${error.message}`);

  const insertedIds = (data || []).map((r) => r.id);
  await runSharedDownstreamPipeline(userId, insertedIds, {
    allowNudge: opts.allowNudge === true,
    platform,
  });

  log.info(`ingested ${insertedIds.length} tx (skipped ${skipped.length}) for user ${userId} via ${source}`);
  return { inserted: insertedIds.length, insertedIds, skipped };
}
