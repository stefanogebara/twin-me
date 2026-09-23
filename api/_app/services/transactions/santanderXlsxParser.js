/**
 * Parser for Santander Magie XLSX statements.
 *
 * Format: multi-sheet workbook exported from Magie internet banking.
 * Targets "Extrato Magie" sheet (or first sheet whose name includes "Magie").
 * Skips internal "Depósito via Santander" transfers and yield (Rendimentos) rows.
 */

import crypto from 'crypto';
import xlsx from 'xlsx';

/**
 * Stable, content-derived external_id (audit-2026-07-03 money HIGH).
 *
 * This parser used to emit rows WITHOUT external_id. The upload route's
 * upsert dedupes on the (user_id, external_id) UNIQUE constraint — and
 * Postgres treats NULLs as distinct there, so every re-upload of the same
 * Magie XLSX inserted a full duplicate set (each copy then emotionally
 * tagged on its own: the double-rendered list and double-counted summary
 * on /money). The other parsers already do this (nubankCsvParser `nu_`,
 * ofxParser `ofx_`).
 *
 * `seq` is the occurrence index of the same (date|amount|merchant) key
 * within ONE file: two genuinely identical rows (same-second identical
 * Pix) stay distinct instead of collapsing in the upsert batch, and the
 * numbering is deterministic across re-uploads because sheet row order is
 * part of the export.
 */
function makeExternalId({ date, amount, merchant, seq }) {
  const key = `santander_xlsx|${date}|${amount}|${merchant}|${seq}`;
  return 'stdr_' + crypto.createHash('sha256').update(key).digest('hex').slice(0, 24);
}

/**
 * Parse "-1.595,34" → -1595.34  (Brazilian decimal format)
 */
function parseBRAmount(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw).trim().replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/**
 * Parse "DD/MM/YYYY HH:MM:SS" → "YYYY-MM-DDTHH:MM:SS-03:00"
 */
function parseBRDate(raw) {
  if (!raw) return null;
  const m = String(raw).match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}:\d{2}:\d{2}))?/);
  if (!m) return null;
  const [, dd, mm, yyyy, time] = m;
  return `${yyyy}-${mm}-${dd}T${time || '12:00:00'}-03:00`;
}

export function parseSantanderXlsx(buffer) {
  const wb = xlsx.read(buffer, { type: 'buffer' });

  // Prefer the "Extrato Magie" sheet; fall back to any sheet containing "magie"
  const sheetName =
    wb.SheetNames.find(n => /magie/i.test(n)) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Find header row
  const headerIdx = rows.findIndex(r =>
    String(r[1]).includes('Data da Transação')
  );
  if (headerIdx === -1) {
    return {
      sourceBank: 'santander',
      accountType: 'checking',
      transactions: [],
      errors: ['Could not find header row in Santander XLSX'],
    };
  }

  const transactions = [];
  const errors = [];
  const seenKeys = new Map(); // content key -> occurrence count (for seq)
  let inRendimentos = false;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const dateRaw  = String(row[1]).trim();
    const amtRaw   = String(row[2]).trim();
    const tipo     = String(row[3]).trim();
    const payee    = String(row[4]).trim();

    // Section break: "RENDIMENTOS" heading — everything after is yield, skip
    if (/rendimentos/i.test(dateRaw) || /rendimentos/i.test(tipo)) {
      inRendimentos = true;
      continue;
    }
    if (inRendimentos) continue;

    // Skip blank or summary rows
    if (!dateRaw || !amtRaw) continue;

    // Skip internal Santander balance transfers (paired with every Pix outflow)
    if (/depósito via santander/i.test(tipo) || /deposito via santander/i.test(tipo)) continue;

    const transaction_date = parseBRDate(dateRaw);
    if (!transaction_date) {
      errors.push(`Row ${i}: unparseable date "${dateRaw}"`);
      continue;
    }

    const amount = parseBRAmount(amtRaw);
    if (amount === null) {
      errors.push(`Row ${i}: unparseable amount "${amtRaw}"`);
      continue;
    }

    const merchant_raw = payee || tipo || 'Desconhecido';

    const contentKey = `${transaction_date}|${amount}|${merchant_raw}`;
    const seq = seenKeys.get(contentKey) || 0;
    seenKeys.set(contentKey, seq + 1);

    transactions.push({
      external_id: makeExternalId({ date: transaction_date, amount, merchant: merchant_raw, seq }),
      amount,
      currency: 'BRL',
      merchant_raw,
      transaction_date,
      account_type: 'checking',
    });
  }

  return {
    sourceBank: 'santander',
    accountType: 'checking',
    transactions,
    errors,
  };
}
