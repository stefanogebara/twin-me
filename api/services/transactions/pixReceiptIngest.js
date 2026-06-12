/**
 * Pix Receipt Ingestion — bank-integration strategy Phase 3.
 * ==========================================================
 * The user forwards a Pix comprovante (screenshot or photo) to the twin's
 * WhatsApp seconds after paying — the emotional-immediacy layer the monthly
 * statement can't capture. A cheap vision model extracts the structured
 * transaction, a deterministic dedup guards against the same payment arriving
 * again later inside an OFX statement, and the ingest seam does the rest
 * (normalization, emotion tagging, memory dual-write).
 *
 * UX follows the Magie playbook (tasks/bank-integration-strategy/):
 * parse -> echo a structured summary back -> the thread doubles as the ledger.
 * Unlike Magie we never move money — TwinMe only understands it — so there is
 * no auth ceremony, just a confirmation message the user can correct.
 *
 * Receipts are deliberately partial coverage: they sample the emotionally
 * salient purchases; the statement loop remains the ledger of record.
 */

import crypto from 'crypto';
import { supabaseAdmin } from '../database.js';
import { downloadWhatsAppMedia } from '../whatsappService.js';
import { ingestRawTransactions } from './rawIngestion.js';
import { complete } from '../llmGateway.js';
import { createLogger } from '../logger.js';

const log = createLogger('pix-receipt');

// Vision-capable + cheap (~$0.0005/receipt) and already in the cost registry.
const VISION_MODEL = 'google/gemini-2.5-flash';

const EXTRACTION_PROMPT =
  'This image should be a Brazilian payment receipt (comprovante de Pix, ' +
  'transferencia, boleto, or card purchase). Extract the transaction and ' +
  'answer with ONLY a JSON object, no markdown, with exactly these fields:\n' +
  '{"is_receipt": boolean, "amount": number, "currency": "BRL", ' +
  '"counterparty": string, "date": "YYYY-MM-DD", ' +
  '"direction": "sent" | "received", "description": string}\n' +
  'Rules: amount is positive. direction is "sent" when the account holder ' +
  'paid someone, "received" when money came in. counterparty is the OTHER ' +
  'party\'s name (person or business). Brazilian dates are DD/MM/YYYY — ' +
  'convert to ISO. If the image is not a payment receipt, return ' +
  '{"is_receipt": false} and nothing else.';

/** Parse the model's JSON answer, tolerating accidental markdown fences. */
function parseExtraction(content) {
  if (!content) return null;
  const cleaned = String(content).replace(/```json|```/g, '').trim();
  try {
    const obj = JSON.parse(cleaned);
    return typeof obj === 'object' && obj !== null ? obj : null;
  } catch {
    return null;
  }
}

/**
 * Deterministic duplicate check (Magie lesson: extraction must be
 * deterministic, only the voice is AI). The same payment WILL arrive twice —
 * once as a forwarded receipt, weeks later inside the OFX statement. Match on
 * same user, same signed amount (to the cent), date within +/- 1 day.
 */
async function findDuplicate(userId, signedAmount, isoDate) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const dayBefore = new Date(d.getTime() - 86400_000).toISOString().slice(0, 10);
  const dayAfter = new Date(d.getTime() + 86400_000).toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from('user_transactions')
    .select('id, merchant_normalized, source')
    .eq('user_id', userId)
    .gte('transaction_date', dayBefore)
    .lte('transaction_date', dayAfter)
    .gte('amount', signedAmount - 0.005)
    .lte('amount', signedAmount + 0.005)
    .limit(1);
  if (error) {
    log.warn(`dedup query failed: ${error.message}`);
    return null; // fail open — a rare double-count beats losing the receipt
  }
  return data?.[0] || null;
}

const fmtBRL = (n) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(n));

/**
 * Handle a forwarded receipt image end to end. Never throws.
 *
 * @param {string} userId
 * @param {{ id: string, mimeType?: string }} image  inbound WhatsApp image ref
 * @returns {Promise<{ ok: boolean, reply: string, inserted?: number }>}
 */
export async function handleReceiptImage(userId, image) {
  const buffer = await downloadWhatsAppMedia(image?.id);
  if (!buffer) {
    return { ok: false, reply: 'I couldn\'t download that image. Mind sending it again?' };
  }

  let extraction = null;
  try {
    const mime = image?.mimeType || 'image/jpeg';
    const result = await complete({
      modelOverride: VISION_MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: EXTRACTION_PROMPT },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${buffer.toString('base64')}` } },
        ],
      }],
      maxTokens: 250,
      temperature: 0,
      userId,
      serviceName: 'pix-receipt-extraction',
      skipCache: true, // every receipt image is unique; caching only wastes the key space
    });
    extraction = parseExtraction(result?.content);
  } catch (err) {
    log.warn(`vision extraction failed for user ${userId}: ${err.message}`);
  }

  if (!extraction || extraction.is_receipt === false) {
    return {
      ok: false,
      reply:
        'I couldn\'t read a payment receipt in that image. ' +
        'Send a clear screenshot of the comprovante and I\'ll record it.',
    };
  }

  const amountNum = Number(extraction.amount);
  const isoDate = String(extraction.date || '').slice(0, 10);
  if (!Number.isFinite(amountNum) || amountNum <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return {
      ok: false,
      reply:
        'I could see it\'s a receipt but couldn\'t make out the amount or date. ' +
        'Try a sharper screenshot?',
    };
  }
  const signedAmount = extraction.direction === 'received' ? amountNum : -amountNum;
  const counterparty = String(extraction.counterparty || 'unknown').slice(0, 120);

  const dup = await findDuplicate(userId, signedAmount, isoDate);
  if (dup) {
    return {
      ok: true,
      inserted: 0,
      reply:
        `I already have this one: ${fmtBRL(amountNum)} ` +
        `${signedAmount < 0 ? 'to' : 'from'} ${dup.merchant_normalized || counterparty} on ${isoDate}. ` +
        'All good.',
    };
  }

  // Deterministic id so re-forwarding the same receipt is idempotent.
  const externalId = `pixreceipt:${crypto
    .createHash('sha256')
    .update(`${userId}|${signedAmount}|${isoDate}|${counterparty.toLowerCase()}`)
    .digest('hex')
    .slice(0, 32)}`;

  try {
    const result = await ingestRawTransactions(
      userId,
      { source: 'whatsapp_receipt', sourceBank: 'pix_receipt', platform: 'bank_statement' },
      [{
        external_id: externalId,
        amount: signedAmount,
        currency: extraction.currency || 'BRL',
        merchant_raw: counterparty,
        transaction_date: isoDate,
        account_type: 'checking',
      }],
    );

    // Magie pattern: parse -> echo -> confirm. The echo doubles as the
    // correction surface; the thread is the ledger.
    return {
      ok: true,
      inserted: result.inserted,
      reply:
        `Got it: ${fmtBRL(amountNum)} ${signedAmount < 0 ? 'to' : 'from'} ${counterparty} ` +
        `on ${isoDate}. Saved to your money picture. Reply if something\'s off.`,
    };
  } catch (err) {
    log.error(`receipt ingest failed for user ${userId}: ${err.message}`);
    return { ok: false, reply: 'I read the receipt but hit a problem saving it. Try again in a bit?' };
  }
}
