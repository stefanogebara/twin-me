/**
 * Parser Dispatcher — sniffs file format and delegates to the right parser.
 * =========================================================================
 * Supports:
 *   - Nubank CSV (credit card + bank account variants)
 *   - Brazilian OFX SGML 1.x (Itaú, Bradesco, Santander, BB, Caixa, Nubank, Inter, C6)
 *
 * Returns a uniform shape:
 *   { format, sourceBank, accountType, transactions, errors }
 */

import crypto from 'crypto';
import { parseNubankCsv, detectNubankVariant } from './nubankCsvParser.js';
import { parseOfx, decodeOfxBuffer } from './ofxParser.js';

/**
 * Classify file format from a small preview of the content.
 * @returns 'ofx' | 'csv_nubank' | 'csv_generic' | 'unknown'
 */
export async function detectFormat(input) {
  const text = Buffer.isBuffer(input) ? await decodeOfxBuffer(input) : String(input);
  const head = text.slice(0, 400).trim();

  // OFX header starts with OFXHEADER:100 or <OFX or <?xml + <OFX
  if (/^OFXHEADER\s*:\s*\d/i.test(head) || /^<\?xml[\s\S]{0,120}<OFX/i.test(head) || /^<OFX[\s>]/i.test(head)) {
    return 'ofx';
  }

  // Nubank CSV
  if (detectNubankVariant(text)) {
    return 'csv_nubank';
  }

  // Fallback: if it looks CSV-ish, mark as generic
  if (head.includes(';') || head.includes(',')) {
    return 'csv_generic';
  }

  return 'unknown';
}

function sha256Hex(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Parse a bank statement file. Accepts a Buffer or string.
 * @returns {{
 *   format: string,
 *   sourceBank: string,
 *   accountType: 'checking'|'credit_card'|null,
 *   transactions: Array,
 *   errors: string[],
 *   fileHash: string
 * }}
 */
export async function parseBankStatement(input, options = {}) {
  const { filename = '' } = options;
  const fileHash = sha256Hex(input);
  const format = await detectFormat(input);

  if (format === 'ofx') {
    const result = await parseOfx(input);
    return { format, ...result, fileHash };
  }

  if (format === 'csv_nubank') {
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : String(input);
    const result = await parseNubankCsv(text);
    return {
      format,
      sourceBank: result.sourceBank,
      accountType: result.accountType,
      transactions: result.transactions,
      errors: result.errors,
      fileHash,
    };
  }

  return {
    format,
    sourceBank: 'unknown',
    accountType: null,
    transactions: [],
    errors: [
      `Unsupported format for file "${filename || '(unnamed)'}". ` +
      `Expected Nubank CSV or Brazilian OFX. Detected: ${format}.`,
    ],
    fileHash,
  };
}
