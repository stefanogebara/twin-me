/**
 * WhatsApp Statement Ingestion — bank-integration strategy Phase 1.
 * =================================================================
 * The user forwards their monthly bank statement (OFX/CSV/XLSX export from the
 * bank app) to the twin's WhatsApp number. The Kapso webhook routes document
 * messages here: download the media, parse via parserDispatcher (same parsers
 * as the /money upload zone), ingest through the generic raw seam, and build
 * the reply the twin sends back.
 *
 * Everything degrades to a helpful reply string — a parse failure or download
 * blip should read as "tell the user what to try", never crash the webhook.
 */

import { downloadWhatsAppMedia } from '../whatsappService.js';
import { parseBankStatement } from './parserDispatcher.js';
import { ingestRawTransactions } from './rawIngestion.js';
import { createLogger } from '../logger.js';

const log = createLogger('whatsapp-statement');

// Statement-looking attachments. Banks export .ofx/.csv/.xlsx; WhatsApp mime
// types for these are inconsistent across senders (often application/
// octet-stream), so the filename extension is the primary signal.
const STATEMENT_EXT_RE = /\.(ofx|csv|xlsx)$/i;
const STATEMENT_MIMES = new Set([
  'text/csv',
  'application/csv',
  'application/x-ofx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/**
 * Does this inbound document look like a bank statement we can parse?
 * @param {{ filename?: string, mimeType?: string }} doc
 */
export function isStatementDocument(doc) {
  if (!doc) return false;
  if (doc.filename && STATEMENT_EXT_RE.test(doc.filename)) return true;
  if (doc.mimeType && STATEMENT_MIMES.has(String(doc.mimeType).toLowerCase())) return true;
  return false;
}

/**
 * Download + parse + ingest a statement document, returning the reply text
 * for the twin to send. Never throws.
 *
 * @param {string} userId
 * @param {{ id: string, filename?: string, mimeType?: string }} doc
 * @returns {Promise<{ ok: boolean, reply: string, inserted?: number }>}
 */
export async function handleStatementDocument(userId, doc) {
  const filename = doc?.filename || 'statement';

  const buffer = await downloadWhatsAppMedia(doc?.id);
  if (!buffer) {
    return {
      ok: false,
      reply: 'I couldn\'t download that file. Mind sending it again?',
    };
  }

  let parsed;
  try {
    parsed = await parseBankStatement(buffer, { filename });
  } catch (err) {
    log.warn(`parse threw for ${filename}: ${err.message}`);
    parsed = null;
  }

  if (!parsed || !parsed.transactions?.length) {
    return {
      ok: false,
      reply:
        'I received the file but couldn\'t read any transactions from it. ' +
        'I can read OFX and CSV statements exported from your bank app ' +
        '(Nubank: Conta or Cartao screen, Exportar Extrato, OFX). Try that format?',
    };
  }

  let result;
  try {
    result = await ingestRawTransactions(
      userId,
      {
        source: 'whatsapp_statement',
        sourceBank: parsed.sourceBank || 'unknown',
        platform: 'bank_statement',
        fileHash: parsed.fileHash,
      },
      parsed.transactions,
    );
  } catch (err) {
    log.error(`ingest failed for user ${userId} file ${filename}: ${err.message}`);
    return {
      ok: false,
      reply: 'I read the statement but hit a problem saving it. Try again in a few minutes?',
    };
  }

  // Deterministic summary reply — no LLM call needed for the confirmation.
  // Date range + outflow total give the user immediate proof it worked.
  const dates = parsed.transactions
    .map((t) => t.transaction_date)
    .filter(Boolean)
    .sort();
  const range = dates.length
    ? ` (${dates[0].slice(0, 10)} to ${dates[dates.length - 1].slice(0, 10)})`
    : '';
  const outflow = parsed.transactions
    .filter((t) => Number(t.amount) < 0)
    .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
  const outflowStr = outflow > 0
    ? ` Total spent: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(outflow)}.`
    : '';

  log.info(`statement ingested for user ${userId}: ${result.inserted} tx from ${filename}`);
  return {
    ok: true,
    inserted: result.inserted,
    reply:
      `Got it. I imported ${result.inserted} transactions from your statement${range}.${outflowStr} ` +
      'Ask me anything about your spending, or check the Money page for the full picture.',
  };
}
