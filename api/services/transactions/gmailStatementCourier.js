/**
 * Gmail Statement Courier — bank-integration strategy Phase 2.
 * ============================================================
 * Brazilian banks email statements on request: Nubank's in-app "Exportar
 * Extrato" delivers an OFX to the registered address within ~3 minutes. With
 * this courier the user's monthly ritual collapses to one tap inside the bank
 * app — TwinMe picks the file up from Gmail automatically on the hourly
 * observation cron and feeds it through the same ingest seam as the /money
 * upload zone and the WhatsApp statement loop.
 *
 * Privacy contract: the Gmail observation fetcher is metadata-only by design.
 * This courier READS ATTACHMENT BYTES, so it runs ONLY for users who flipped
 * the explicit `gmail_statement_courier` opt-in (feature_flags, default off).
 * The search targets OFX attachments specifically — an .ofx file is a bank
 * statement by definition, so no sender allowlist (and no body reading) is
 * needed.
 *
 * Cost posture: one Gmail search per user per cron run; per-file SHA-256
 * dedup against user_transactions.source_file_hash means a statement is
 * downloaded at most twice and ingested exactly once — the downstream
 * pipeline (tagger LLM calls) never re-runs for a known file.
 */

import axios from 'axios';
import crypto from 'crypto';
import { supabaseAdmin } from '../database.js';
import { parseBankStatement } from './parserDispatcher.js';
import { ingestRawTransactions } from './rawIngestion.js';
import { createLogger } from '../logger.js';

const log = createLogger('gmail-statement-courier');

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
// 3-day lookback: the cron is hourly, but gaps happen (deploy windows, cron
// dedup). Idempotent ingestion makes the overlap free.
const SEARCH_QUERY = 'has:attachment filename:ofx newer_than:3d';
const MAX_MESSAGES_PER_RUN = 5;

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** Recursively collect OFX attachment parts from a Gmail message payload. */
function collectOfxParts(part, found = []) {
  if (!part) return found;
  if (part.filename && /\.ofx$/i.test(part.filename) && part.body?.attachmentId) {
    found.push({ filename: part.filename, attachmentId: part.body.attachmentId });
  }
  for (const child of part.parts || []) collectOfxParts(child, found);
  return found;
}

/**
 * Scan the user's Gmail for fresh OFX statement attachments and ingest them.
 * Caller (the Gmail observation fetcher) has already verified the feature
 * flag and holds a valid access token. Never throws — statement courier
 * failures must not break observation ingestion.
 *
 * @param {string} userId
 * @param {string} accessToken  valid Gmail OAuth token (gmail.readonly)
 * @returns {Promise<{ filesSeen: number, filesIngested: number, inserted: number }>}
 */
export async function runGmailStatementCourier(userId, accessToken) {
  const stats = { filesSeen: 0, filesIngested: 0, inserted: 0 };
  const headers = { Authorization: `Bearer ${accessToken}` };

  let messageIds = [];
  try {
    const res = await axios.get(`${GMAIL_BASE}/messages`, {
      headers,
      params: { q: SEARCH_QUERY, maxResults: MAX_MESSAGES_PER_RUN },
      timeout: 10_000,
    });
    messageIds = (res.data?.messages || []).map((m) => m.id);
  } catch (err) {
    log.warn(`gmail search failed for user ${userId}: ${err.message}`);
    return stats;
  }
  if (!messageIds.length) return stats;

  for (const messageId of messageIds) {
    try {
      const msg = await axios.get(`${GMAIL_BASE}/messages/${messageId}`, {
        headers,
        params: { format: 'full' },
        timeout: 10_000,
      });
      const ofxParts = collectOfxParts(msg.data?.payload);

      for (const part of ofxParts) {
        stats.filesSeen++;
        const att = await axios.get(
          `${GMAIL_BASE}/messages/${messageId}/attachments/${part.attachmentId}`,
          { headers, timeout: 15_000 },
        );
        const b64 = att.data?.data;
        if (!b64) continue;
        // Gmail returns base64url (-, _) rather than standard base64.
        const buffer = Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

        // Dedup fast-path: if any transaction already carries this file hash,
        // the statement was ingested before — skip download-to-pipeline work.
        const fileHash = sha256Hex(buffer);
        const { data: existing } = await supabaseAdmin
          .from('user_transactions')
          .select('id')
          .eq('user_id', userId)
          .eq('source_file_hash', fileHash)
          .limit(1);
        if (existing?.length) continue;

        const parsed = await parseBankStatement(buffer, { filename: part.filename });
        if (!parsed.transactions?.length) {
          log.info(`no transactions parsed from ${part.filename} for user ${userId}`);
          continue;
        }

        const result = await ingestRawTransactions(
          userId,
          {
            source: 'gmail_statement',
            sourceBank: parsed.sourceBank || 'unknown',
            platform: 'bank_statement',
            fileHash,
          },
          parsed.transactions,
        );
        stats.filesIngested++;
        stats.inserted += result.inserted;
        log.info(`gmail courier ingested ${result.inserted} tx from ${part.filename} for user ${userId}`);
      }
    } catch (err) {
      log.warn(`gmail courier message ${messageId} failed for user ${userId}: ${err.message}`);
    }
  }

  return stats;
}
