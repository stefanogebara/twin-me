/**
 * Statement import: the months PSD2 will not give back.
 * =====================================================
 * Santander España's PSD2 feed returns roughly 90 days. Everything older exists
 * only in the file the person downloads from the bank's own site — an .xlsx (the
 * default) or a .csv exported with Spanish conventions: semicolon delimiter,
 * "1.234,56" amounts, dd/mm/yyyy dates, and four or five preamble rows naming the
 * account and the date range before the real header.
 *
 * This module turns such a file into sightings, the same shape the Enable Banking
 * feed produces, so the reconciler ingests both without knowing where a row came
 * from. Pure: bytes in, sightings out. No Supabase, no network, no Express.
 *
 * The narrative in a statement is the same sentence the feed carries
 * ("PAGO MOVIL EN EL CORTE INGLES, MADRID ES, TARJ. :*741245"), so the reading of
 * who/how/which-card is delegated to ../narrative.js rather than re-derived here.
 *
 * A statement is truth about the amount and the day, but it has lost the minute of
 * the purchase, so its confidence is 0.95 and never 1.
 */

import crypto from 'node:crypto';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { merchantKey } from '../captureParser.js';
import { parseNarrative } from '../narrative.js';

/* ------------------------------------------------------------------ reading */

/** Lowercase, unaccented, whitespace-collapsed, punctuation-trimmed: the form headers are compared in. */
function norm(text) {
  return String(text ?? '')
    .replace(/ /g, ' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Delimiters a bank export actually uses, most Spanish first. */
const DELIMITERS = [';', ',', '\t', '|'];

/**
 * The delimiter of a delimited file, by counting candidates outside quotes.
 * Spanish Excel writes semicolons because the comma is the decimal separator, so a
 * comma-counting sniffer would read "1.234,56;Concepto" as two commas and lose.
 */
function sniffDelimiter(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim()).slice(0, 25);
  let best = ',';
  let bestScore = -1;
  for (const d of DELIMITERS) {
    let score = 0;
    for (const line of lines) {
      let inQuote = false;
      for (const ch of line) {
        if (ch === '"') inQuote = !inQuote;
        else if (ch === d && !inQuote) score += 1;
      }
    }
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return bestScore > 0 ? best : ',';
}

/**
 * A CSV/TSV text becomes rows of strings. The delimiter is sniffed (semicolon,
 * comma, tab or pipe), quoted fields are respected, and ragged rows are kept —
 * a preamble line has one cell and the header has six.
 * @param {string} text
 * @returns {string[][]}
 */
export function parseDelimited(text) {
  const body = String(text ?? '').replace(/^﻿/, '');
  if (!body.trim()) return [];
  const rows = parse(body, {
    delimiter: sniffDelimiter(body),
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: false,
    bom: true,
    trim: false,
  });
  return rows.map((row) => row.map((cell) => String(cell ?? '')));
}

/**
 * An .xlsx/.xls buffer becomes rows of strings, from the first sheet.
 * `raw: false` asks SheetJS for the formatted text, which is what the bank meant;
 * when a date column has no format the cell arrives as a serial number instead and
 * parseSpanishDate handles that.
 * @param {Buffer|Uint8Array|ArrayBuffer} buffer
 * @returns {string[][]}
 */
export function parseWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const first = wb.SheetNames[0];
  if (!first) return [];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[first], { header: 1, raw: false, defval: '' });
  return rows.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : []));
}

/* ------------------------------------------------------------------ headers */

/** Header spellings seen across Santander, BBVA and CaixaBank exports, accent-free. */
const HEADER_LABELS = new Map(Object.entries({
  // operation date
  'fecha operacion': 'date', 'f operacion': 'date', 'f de operacion': 'date',
  'fecha de operacion': 'date', 'fecha contable': 'date', 'fecha': 'date',
  'date': 'date', 'transaction date': 'date', 'booking date': 'date',
  // value date
  'fecha valor': 'valueDate', 'f valor': 'valueDate', 'fecha de valor': 'valueDate',
  'value date': 'valueDate',
  // what it was
  'concepto': 'concept', 'concepto ampliado': 'concept', 'descripcion': 'concept',
  'movimiento': 'concept', 'detalle': 'concept', 'description': 'concept',
  'observaciones': 'concept', 'referencia': 'concept',
  // signed amount
  'importe': 'amount', 'importe eur': 'amount', 'importe (eur)': 'amount',
  'importe €': 'amount', 'amount': 'amount',
  // separate columns instead of a signed one
  'debito': 'debit', 'debe': 'debit', 'cargo': 'debit', 'cargos': 'debit',
  'importe cargo': 'debit', 'debit': 'debit',
  'credito': 'credit', 'haber': 'credit', 'abono': 'credit', 'abonos': 'credit',
  'importe abono': 'credit', 'credit': 'credit',
  // trailing context
  'saldo': 'balance', 'saldo disponible': 'balance', 'balance': 'balance',
  'divisa': 'currency', 'moneda': 'currency', 'currency': 'currency',
}));

/** The logical field a header cell names, or null when the cell is not a header. */
function fieldFor(cell) {
  const n = norm(cell);
  if (!n) return null;
  const exact = HEADER_LABELS.get(n);
  if (exact) return exact;
  /* Exports append units and qualifiers the map cannot enumerate: "Importe (EUR)",
     "Fecha operación (dd/mm/aaaa)". Fall back to the leading word. */
  if (/^importe\b/.test(n)) {
    if (/\b(cargo|debito|debe)\b/.test(n)) return 'debit';
    if (/\b(abono|credito|haber)\b/.test(n)) return 'credit';
    return 'amount';
  }
  if (/^(fecha|f)\b/.test(n)) return /\bvalor\b/.test(n) ? 'valueDate' : 'date';
  if (/^saldo\b/.test(n)) return 'balance';
  return null;
}

/** How many rows deep a preamble is allowed to run before we give up looking. */
const MAX_PREAMBLE = 30;

/**
 * Find the header row under the preamble (account name, IBAN, date range, blanks).
 *
 * @param {string[][]} rows
 * @returns {{ index: number, columns: Record<string, number> } | null}
 *   `columns` maps logical fields to column indexes. A file with separate debit and
 *   credit columns has `debit`/`credit` instead of `amount` — the presence of those
 *   keys is how a caller knows the amount is split across two columns.
 */
export function findHeader(rows) {
  if (!Array.isArray(rows)) return null;
  const limit = Math.min(rows.length, MAX_PREAMBLE);
  for (let i = 0; i < limit; i += 1) {
    const row = Array.isArray(rows[i]) ? rows[i] : [];
    const columns = {};
    for (let c = 0; c < row.length; c += 1) {
      const field = fieldFor(row[c]);
      if (field && columns[field] === undefined) columns[field] = c;
    }
    const hasDate = columns.date !== undefined || columns.valueDate !== undefined;
    const hasMoney = columns.amount !== undefined || columns.debit !== undefined || columns.credit !== undefined;
    if (hasDate && hasMoney) return { index: i, columns };
  }
  return null;
}

/* ------------------------------------------------------------------ scalars */

/**
 * A statement amount becomes a number.
 * "1.234,56" → 1234.56 · "-1.234,56" → -1234.56 · "1,234.56" → 1234.56 ·
 * "1.234,56 €" → 1234.56 · "(45,00)" → -45. Null when it is not a number.
 * @param {string|number} text
 * @returns {number|null}
 */
export function parseSpanishAmount(text) {
  if (text === null || text === undefined) return null;
  if (typeof text === 'number') return Number.isFinite(text) ? Math.round(text * 100) / 100 : null;
  let t = String(text).replace(/ /g, ' ').trim();
  if (!t) return null;

  /* Accounting negatives come in brackets; some exports trail the minus sign. */
  let negative = false;
  if (/^\(.*\)$/.test(t)) { negative = true; t = t.slice(1, -1).trim(); }
  t = t.replace(/€|eur\b|euros?\b/gi, '').replace(/\s+/g, '').trim();
  if (/-$/.test(t)) { negative = true; t = t.slice(0, -1); }
  if (/^\+/.test(t)) t = t.slice(1);
  if (/^-/.test(t)) { negative = !negative; t = t.slice(1); }
  if (!t || !/^[\d.,]+$/.test(t)) return null;

  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    /* Whichever separator comes last is the decimal one: Spanish "1.234,56", English "1,234.56". */
    const decimal = lastComma > lastDot ? ',' : '.';
    const group = decimal === ',' ? '.' : ',';
    t = t.split(group).join('').replace(decimal, '.');
  } else if (lastComma >= 0) {
    t = /^\d{1,3}(,\d{3})+$/.test(t) ? t.split(',').join('') : t.replace(',', '.');
  } else if (lastDot >= 0) {
    /* "1.234" in a Spanish export is one thousand two hundred, not one point two. */
    t = /^\d{1,3}(\.\d{3})+$/.test(t) ? t.split('.').join('') : t;
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.round((negative ? -n : n) * 100) / 100;
}

/** Excel's day zero is 1899-12-30 (its 1900 leap-year bug baked in). */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
/** Serials outside this window are some other number that happens to be an integer. */
const SERIAL_MIN = 20000;   // 1954-10-03
const SERIAL_MAX = 80000;   // 2119-01-24

function ymd(y, m, d) {
  if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * A statement date becomes YYYY-MM-DD. Spanish order only: the day comes first, so
 * "08/09/2026" is the eighth of September and mm/dd is never guessed at.
 * Accepts dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, two-digit years (20xx), ISO
 * yyyy-mm-dd, and an Excel serial number arriving as a string.
 * @param {string|number} text
 * @returns {string|null}
 */
export function parseSpanishDate(text) {
  if (text === null || text === undefined) return null;
  const t = String(text).replace(/ /g, ' ').trim();
  if (!t) return null;

  const iso = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);
  if (iso) return ymd(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const es = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (es) {
    const year = es[3].length === 2 ? 2000 + Number(es[3]) : Number(es[3]);
    return ymd(year, Number(es[2]), Number(es[1]));
  }

  /* An unformatted date cell survives `raw: false` as its serial number. */
  if (/^\d{4,6}(\.\d+)?$/.test(t)) {
    const serial = Math.floor(Number(t));
    if (serial >= SERIAL_MIN && serial <= SERIAL_MAX) {
      const dt = new Date(EXCEL_EPOCH_MS + serial * 86400000);
      return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    }
  }
  return null;
}

/* ----------------------------------------------------------------- mapping */

/** Currency as the bank wrote it, normalised to a code. */
function currencyFrom(cell, fallback) {
  const n = norm(cell);
  if (!n) return fallback;
  if (/€|^eur/.test(n)) return 'EUR';
  if (/^\$|^usd/.test(n)) return 'USD';
  if (/^£|^gbp/.test(n)) return 'GBP';
  return /^[a-z]{3}$/.test(n) ? n.toUpperCase() : fallback;
}

/**
 * A stable reference for one statement line: the same file uploaded twice yields the
 * same refs, so the reconciler's unique index dedupes instead of double-counting.
 * Content-addressed on purpose — the row's position in the file is not stable across
 * two exports of the same month.
 */
function sourceRef(dateKey, signedAmount, concept) {
  const material = `${dateKey}|${signedAmount.toFixed(2)}|${norm(concept)}`;
  return `st:${crypto.createHash('sha256').update(material).digest('hex').slice(0, 32)}`;
}

const cell = (row, index) => (index === undefined || row[index] === undefined ? '' : String(row[index]));

/**
 * The rows of an exported statement become sightings.
 *
 * @param {string[][]} rows  every row, preamble included
 * @param {object} [opts]
 * @param {string|null} [opts.accountId]       money_accounts.id these rows belong to
 * @param {string} [opts.defaultCurrency]      when the export has no currency column
 * @returns {{ sightings: object[], skipped: object[], header: object|null }}
 *   Sightings carry exactly the keys the Enable Banking feed produces. Rows without a
 *   parseable date, or with a zero or absent amount, go to `skipped` with a reason.
 */
export function toSightings(rows, { accountId = null, defaultCurrency = 'EUR' } = {}) {
  const all = Array.isArray(rows) ? rows.map((r) => (Array.isArray(r) ? r : [])) : [];
  const header = findHeader(all);
  const sightings = [];
  const skipped = [];

  if (!header) {
    all.forEach((row, index) => {
      if (row.some((c) => String(c ?? '').trim())) skipped.push({ index, row, reason: 'no_header' });
    });
    return { sightings, skipped, header: null };
  }

  const { columns } = header;
  for (let i = header.index + 1; i < all.length; i += 1) {
    const row = all[i];
    if (!row.some((c) => String(c ?? '').trim())) { skipped.push({ index: i, row, reason: 'empty_row' }); continue; }

    const opDate = parseSpanishDate(cell(row, columns.date));
    const valueDate = parseSpanishDate(cell(row, columns.valueDate));
    /* The value date is when the money actually left; the operation date is when the
       shop asked. The reconciler matches against the former when the bank gives it. */
    const when = valueDate || opDate;
    if (!when) { skipped.push({ index: i, row, reason: 'no_date' }); continue; }

    let signed = null;
    if (columns.amount !== undefined) {
      signed = parseSpanishAmount(cell(row, columns.amount));
    } else {
      const debit = parseSpanishAmount(cell(row, columns.debit));
      const credit = parseSpanishAmount(cell(row, columns.credit));
      if (credit !== null && credit !== 0) signed = Math.abs(credit);
      else if (debit !== null && debit !== 0) signed = -Math.abs(debit);
      else signed = debit === null && credit === null ? null : 0;
    }
    if (signed === null) { skipped.push({ index: i, row, reason: 'no_amount' }); continue; }
    if (signed === 0) { skipped.push({ index: i, row, reason: 'zero_amount' }); continue; }

    const concept = cell(row, columns.concept).replace(/ /g, ' ').trim();
    const read = parseNarrative(concept);
    /* When the sentence names nobody — a settlement, an interest line — the sentence
       itself is the best name there is, the way the feed adapter keeps it. */
    const name = read.merchant || concept || null;

    sightings.push({
      source: 'statement',
      source_ref: sourceRef(when, signed, concept),
      account_id: accountId,
      raw_json: { row, header },
      raw_text: concept || null,
      amount: Math.abs(signed),
      currency: currencyFrom(cell(row, columns.currency), defaultCurrency),
      direction: signed > 0 ? 'in' : 'out',
      merchant_raw: name,
      merchant_key: merchantKey(name),
      occurred_at: new Date(`${when}T12:00:00Z`).toISOString(),
      card_last4: read.cardLast4,
      parse_confidence: 0.95,
      channel: read.channel,
    });
  }

  return { sightings, skipped, header };
}
