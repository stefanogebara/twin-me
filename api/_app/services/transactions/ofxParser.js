/**
 * OFX Parser for Brazilian banks (Itaú, Bradesco, Santander, BB, Caixa, C6, Inter).
 * =================================================================================
 * Brazilian banks export SGML 1.x OFX (not XML 2.x) encoded in Windows-1252.
 * We decode with iconv-lite, then extract transactions with a native SGML
 * regex parser (no external dep — the former `ofx-data-extractor` package was
 * ESM-only and threw "Unexpected token 'export'" in Vercel's serverless
 * runtime, breaking every OFX upload).
 *
 * Quirks handled:
 *   - Windows-1252 encoding (not UTF-8) — must decode first
 *   - Both <STMTRS> (bank account) and <CCSTMTRS> (credit card) roots
 *   - Mixed comma/dot decimal separator in TRNAMT (Santander quirk)
 *   - DTPOSTED with `[-3:BRT]` timezone suffix
 *   - TRNTYPE is almost always "OTHER" — not useful for classification
 *
 * Pure parser — no DB, no side effects.
 */

import crypto from 'crypto';
import { parseBrlAmount } from './nubankCsvParser.js';

// iconv-lite is lazy-loaded on first use (only needed for Windows-1252 files)
// so a cold start never pays for it on the UTF-8 happy path.
let _iconv = null;
async function loadIconv() {
  if (_iconv) return _iconv;
  const mod = await import('iconv-lite');
  _iconv = mod.default || mod;
  return _iconv;
}
/**
 * Native SGML OFX transaction extractor — replaces the ESM-only
 * `ofx-data-extractor` dependency, which threw "Unexpected token 'export'"
 * in Vercel's serverless runtime (prod bug 2026-06-11) and broke every OFX
 * upload + the WhatsApp/Gmail OFX flows. Brazilian OFX is SGML 1.x: leaf tags
 * are `<TAG>value` with no closing tag, value running to the next `<` or EOL.
 * A focused regex parse is strictly more robust here and has zero deps.
 */
function ofxLeaf(body, tag) {
  const m = body.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'));
  return m ? m[1].trim() : undefined;
}

function extractStmtTrnBlocks(text) {
  const blocks = [];
  const re = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const body = m[1];
    blocks.push({
      TRNTYPE: ofxLeaf(body, 'TRNTYPE'),
      DTPOSTED: ofxLeaf(body, 'DTPOSTED'),
      TRNAMT: ofxLeaf(body, 'TRNAMT'),
      FITID: ofxLeaf(body, 'FITID'),
      MEMO: ofxLeaf(body, 'MEMO') ?? ofxLeaf(body, 'NAME'),
    });
  }
  return blocks;
}

/**
 * Decode a raw OFX file buffer. Tries Windows-1252 first (Brazilian default),
 * falls back to UTF-8 if content looks UTF-8.
 */
export async function decodeOfxBuffer(buffer) {
  if (typeof buffer === 'string') return buffer;
  if (!Buffer.isBuffer(buffer)) throw new Error('decodeOfxBuffer: expected Buffer or string');

  // Heuristic: if buffer contains bytes >= 0x80 and UTF-8 parses cleanly, assume UTF-8.
  const utf8 = buffer.toString('utf8');
  if (!utf8.includes('\uFFFD')) {
    return utf8;
  }
  const iconv = await loadIconv();
  return iconv.decode(buffer, 'win1252');
}

/**
 * Parse DTPOSTED like `20240305143200[-3:BRT]` → ISO string.
 */
export function parseOfxDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  // Strip timezone suffix `[-3:BRT]` or `[-03:BRT]` if present
  const core = s.replace(/\[.*?\]$/, '').replace(/[^0-9]/g, '');
  if (core.length < 8) return null;
  const yyyy = core.slice(0, 4);
  const mm = core.slice(4, 6);
  const dd = core.slice(6, 8);
  const hh = core.length >= 10 ? core.slice(8, 10) : '12';
  const mi = core.length >= 12 ? core.slice(10, 12) : '00';
  const ss = core.length >= 14 ? core.slice(12, 14) : '00';
  // Assume Brazilian timezone if no TZ — safer than assuming UTC for BR bank exports
  const iso = `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}-03:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function inferSourceBank(text) {
  const lower = text.slice(0, 4000).toLowerCase();
  if (lower.includes('itau') || lower.includes('itaú')) return 'itau';
  if (lower.includes('bradesco')) return 'bradesco';
  if (lower.includes('santander')) return 'santander';
  if (lower.includes('banco do brasil') || /<org>\s*bb\s*</i.test(text)) return 'bb';
  if (lower.includes('caixa')) return 'caixa';
  if (lower.includes('nubank') || lower.includes('nu pagamentos')) return 'nubank';
  if (lower.includes('inter')) return 'inter';
  if (lower.includes('c6 bank') || lower.includes('c6bank')) return 'c6';
  return 'other';
}

function hasTag(text, tag) {
  return new RegExp(`<${tag}[\\s>]`, 'i').test(text);
}

function makeExternalId({ bank, fitid, date, amount, memo }) {
  if (fitid && String(fitid).trim()) {
    return `ofx_${bank}_${String(fitid).trim()}`;
  }
  // Fall back to hash (some Brazilian OFX files omit FITID or reuse "000000")
  const key = `${bank}|${date}|${amount}|${memo}`;
  return 'ofx_hash_' + crypto.createHash('sha256').update(key).digest('hex').slice(0, 24);
}

function normalizeTxnList(list) {
  if (!list) return [];
  if (Array.isArray(list)) return list;
  return [list];
}

/**
 * Parse a Brazilian OFX file (raw string or Buffer).
 * @returns {{
 *   accountType: 'checking'|'credit_card',
 *   sourceBank: string,
 *   transactions: Array<{
 *     external_id, amount, currency, merchant_raw, transaction_date, account_type
 *   }>,
 *   errors: string[]
 * }}
 */
export async function parseOfx(input) {
  const text = await decodeOfxBuffer(input);
  const sourceBank = inferSourceBank(text);

  const errors = [];

  // Detect whether this is a bank account (STMTRS) or credit card (CCSTMTRS).
  // The native extractor pulls all <STMTTRN> blocks regardless of section; the
  // flag only drives the credit-card sign convention below.
  const isCreditCard = hasTag(text, 'CCSTMTRS') || hasTag(text, 'CCACCTFROM');
  const accountType = isCreditCard ? 'credit_card' : 'checking';

  let rawTxns = [];
  try {
    rawTxns = normalizeTxnList(extractStmtTrnBlocks(text));
  } catch (err) {
    errors.push(`Transaction list extraction failed: ${err.message}`);
  }

  const transactions = [];
  for (const t of rawTxns) {
    if (!t) continue;
    const dtPosted = t.DTPOSTED || t.dtPosted || t.dtposted;
    const trnAmt = t.TRNAMT ?? t.trnAmt ?? t.trnamt;
    const fitId = t.FITID || t.fitId || t.fitid;
    const memo = (t.MEMO ?? t.memo ?? t.NAME ?? t.name ?? '').toString().trim();

    if (!dtPosted || trnAmt === undefined || trnAmt === null) {
      errors.push(`Skipped OFX row missing DTPOSTED or TRNAMT`);
      continue;
    }

    const transaction_date = parseOfxDate(dtPosted);
    if (!transaction_date) {
      errors.push(`Invalid DTPOSTED "${dtPosted}" — skipped`);
      continue;
    }

    let amount = parseBrlAmount(trnAmt);
    if (!Number.isFinite(amount)) {
      errors.push(`Invalid TRNAMT "${trnAmt}" — skipped`);
      continue;
    }

    // For credit card: invert sign so outflow = negative (OFX convention varies).
    // Standard OFX: TRNAMT is signed from the bank's POV — for credit cards, positive TRNAMT
    // typically means a charge (outflow to the user). We flip to match our convention:
    //   outflow = negative, inflow = positive.
    if (isCreditCard && amount > 0) {
      amount = -amount;
    } else if (isCreditCard && amount < 0) {
      // credit card refund
      amount = Math.abs(amount);
    }

    transactions.push({
      external_id: makeExternalId({ bank: sourceBank, fitid: fitId, date: transaction_date, amount, memo }),
      amount,
      currency: 'BRL',
      merchant_raw: memo,
      transaction_date,
      account_type: accountType,
    });
  }

  return { accountType, sourceBank, transactions, errors };
}
