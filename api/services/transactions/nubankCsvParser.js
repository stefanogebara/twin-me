/**
 * Nubank CSV Parser (Financial-Emotional Twin Phase 2A)
 * =====================================================
 * Supports three Nubank CSV variants observed in production:
 *
 * 1. Credit card (app export, current):   date;title;amount       (semicolon, comma decimal)
 * 2. Credit card (legacy web export):     DATA;DESCRICAO;VALOR    (semicolon, comma decimal)
 * 3. Bank account (conta Nubank):         Data,Valor,Identificador,Descrição  (comma, dot decimal)
 *
 * Returns normalized transactions:
 *   { external_id, amount, currency, merchant_raw, transaction_date, account_type }
 *
 * amount: NEGATIVE = outflow/debit, POSITIVE = inflow/credit.
 * Card rows are always stored as negative (they are expenses); refunds in CSV come as `-50,00`
 * which becomes POSITIVE (refund = money returned).
 *
 * Pure parser — no DB, no side effects.
 */

import crypto from 'crypto';

// Lazy-loaded — csv-parse has a CJS subpath import that can be fragile on
// Vercel cold start. Load inside the parser call instead of at module init.
let _parseCsv = null;
async function loadCsvParser() {
  if (_parseCsv) return _parseCsv;
  const mod = await import('csv-parse/sync');
  _parseCsv = mod.parse || mod.default?.parse || mod.default;
  return _parseCsv;
}

const HEADER_CARD_APP = /^date\s*;\s*title\s*;\s*amount$/i;
const HEADER_CARD_LEGACY = /^DATA\s*;\s*DESCRICAO\s*;\s*VALOR$/i;
const HEADER_ACCOUNT = /^Data\s*,\s*Valor\s*,\s*Identificador\s*,\s*Descri(ç|c)ão$/i;

/**
 * Parse Brazilian-locale amount string → number.
 *   "50,00"    → 50
 *   "-150.00"  → -150
 *   "1.234,56" → 1234.56
 *   "1,234.56" → 1234.56
 * Also handles Santander's mixed separators seen in OFX — safer to normalize here too.
 */
export function parseBrlAmount(raw) {
  if (raw === null || raw === undefined) return NaN;
  const s = String(raw).trim();
  if (!s) return NaN;

  // Strip currency symbols / spaces
  const cleaned = s.replace(/R\$|\s/g, '');

  // Decide decimal separator: the LAST , or . in the string is the decimal
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  let normalized;
  if (lastComma === -1 && lastDot === -1) {
    normalized = cleaned;
  } else if (lastComma > lastDot) {
    // decimal is comma → drop dots (thousands), replace comma with dot
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    // decimal is dot → drop commas (thousands)
    normalized = cleaned.replace(/,/g, '');
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Sniff the CSV variant from the first non-empty line (header).
 * @returns {'card_app' | 'card_legacy' | 'account' | null}
 */
export function detectNubankVariant(text) {
  if (!text) return null;
  const firstLine = text.split(/\r?\n/).map(l => l.trim()).find(l => l.length > 0);
  if (!firstLine) return null;
  if (HEADER_CARD_APP.test(firstLine)) return 'card_app';
  if (HEADER_CARD_LEGACY.test(firstLine)) return 'card_legacy';
  if (HEADER_ACCOUNT.test(firstLine)) return 'account';
  return null;
}

/**
 * Stable external_id for a transaction row when the CSV doesn't provide one.
 * Prevents duplicate imports of the same file.
 */
function makeExternalId({ date, description, amount, accountType }) {
  const key = `${accountType}|${date}|${amount}|${description}`;
  return 'nu_' + crypto.createHash('sha256').update(key).digest('hex').slice(0, 24);
}

function parseDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  // YYYY-MM-DD[ HH:MM:SS]
  const d = new Date(s.length === 10 ? s + 'T12:00:00-03:00' : s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Parse a Nubank CSV (any of the 3 variants) into normalized transactions.
 * @param {string} text - raw CSV content
 * @returns {{
 *   variant: string,
 *   accountType: 'credit_card'|'checking',
 *   sourceBank: 'nubank',
 *   transactions: Array<{
 *     external_id: string,
 *     amount: number,
 *     currency: 'BRL',
 *     merchant_raw: string,
 *     transaction_date: string,
 *     account_type: string
 *   }>,
 *   errors: string[]
 * }}
 */
export async function parseNubankCsv(text) {
  const variant = detectNubankVariant(text);
  if (!variant) {
    return {
      variant: null,
      accountType: null,
      sourceBank: 'nubank',
      transactions: [],
      errors: ['Unrecognized Nubank CSV header. Expected "date;title;amount", "DATA;DESCRICAO;VALOR", or "Data,Valor,Identificador,Descrição".'],
    };
  }

  const isAccount = variant === 'account';
  const delimiter = isAccount ? ',' : ';';
  const accountType = isAccount ? 'checking' : 'credit_card';

  const errors = [];
  let rows;
  try {
    const parseCsv = await loadCsvParser();
    rows = parseCsv(text, {
      delimiter,
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    });
  } catch (err) {
    return {
      variant,
      accountType,
      sourceBank: 'nubank',
      transactions: [],
      errors: [`CSV parse error: ${err.message}`],
    };
  }

  const transactions = [];
  for (const row of rows) {
    let dateStr, description, amountStr, providedId;

    if (variant === 'card_app') {
      dateStr = row.date;
      description = row.title;
      amountStr = row.amount;
    } else if (variant === 'card_legacy') {
      dateStr = row.DATA;
      description = row.DESCRICAO;
      amountStr = row.VALOR;
    } else {
      // account
      dateStr = row.Data;
      amountStr = row.Valor;
      providedId = row.Identificador;
      description = row['Descrição'] || row.Descricao || row['Descri\u00e7\u00e3o'];
    }

    if (!dateStr || !amountStr) {
      errors.push(`Skipped row with missing date/amount: ${JSON.stringify(row)}`);
      continue;
    }

    const transaction_date = parseDate(dateStr);
    if (!transaction_date) {
      errors.push(`Invalid date "${dateStr}" — skipped`);
      continue;
    }

    let amount = parseBrlAmount(amountStr);
    if (!Number.isFinite(amount)) {
      errors.push(`Invalid amount "${amountStr}" — skipped`);
      continue;
    }

    // Credit card CSV rows are expenses — store as NEGATIVE (outflow).
    // Refunds come as negative in the CSV, which should flip to POSITIVE here.
    if (accountType === 'credit_card') {
      amount = -amount;
    }
    // Bank account CSV amounts are signed correctly (negative = debit, positive = credit) — keep as-is.

    const merchant_raw = (description || '').trim();
    const external_id = providedId
      ? `nu_acc_${providedId}`
      : makeExternalId({ date: dateStr, description: merchant_raw, amount, accountType });

    transactions.push({
      external_id,
      amount,
      currency: 'BRL',
      merchant_raw,
      transaction_date,
      account_type: accountType,
    });
  }

  return {
    variant,
    accountType,
    sourceBank: 'nubank',
    transactions,
    errors,
  };
}
