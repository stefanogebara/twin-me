/**
 * Statement import: a Santander export becomes sightings.
 *
 * The fixtures are shaped like the real thing — four or five preamble rows, a header
 * in shouting Spanish, "1.234,56" amounts, dd/mm/yyyy dates — and are built inline so
 * the suite carries no binary files. The .xlsx case writes a workbook with the same
 * `xlsx` dependency the importer reads with, which exercises the sheet path for real.
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  parseDelimited,
  parseWorkbook,
  findHeader,
  parseSpanishAmount,
  parseSpanishDate,
  toSightings,
} from '../../../../api/services/money/statements/importer.js';

/** The five preamble rows Santander puts above the header. */
const PREAMBLE = [
  ['Cuenta: SANTANDER ONE 0049 1500 03 1234567890', '', '', '', ''],
  ['Titular: STEFANO GEBARA', '', '', '', ''],
  ['Rango de fechas: 01/09/2026 - 30/09/2026', '', '', '', ''],
  ['Divisa: EUR', '', '', '', ''],
  ['', '', '', '', ''],
];

const HEADER = ['FECHA OPERACIÓN', 'FECHA VALOR', 'CONCEPTO', 'IMPORTE', 'SALDO'];

const CARD_ROW = ['08/09/2026', '08/09/2026', 'PAGO MOVIL EN EL CORTE INGLES, MADRID ES, TARJ. :*741245', '-116,76', '2.345,67'];
const BIZUM_ROW = ['07/09/2026', '07/09/2026', 'BIZUM A FAVOR DE ANA LOPEZ CONCEPTO: Cena', '-20,00', '2.462,43'];
const TRANSFER_ROW = ['01/09/2026', '02/09/2026', 'TRANSFERENCIA INMEDIATA DE UNIVERSIDAD CARLOS III, CONCEPTO Nomina agosto', '1.850,00', '2.482,43'];
const BLANK_ROW = ['', '', '', '', ''];

const SANTANDER_SHEET = [...PREAMBLE, HEADER, CARD_ROW, BIZUM_ROW, TRANSFER_ROW, BLANK_ROW];

describe('parseSpanishAmount', () => {
  it('reads Spanish, English and accounting spellings of the same money', () => {
    expect(parseSpanishAmount('1.234,56')).toBe(1234.56);
    expect(parseSpanishAmount('-1.234,56')).toBe(-1234.56);
    expect(parseSpanishAmount('1,234.56')).toBe(1234.56);
    expect(parseSpanishAmount('1.234,56 €')).toBe(1234.56);
    expect(parseSpanishAmount('(45,00)')).toBe(-45);
    expect(parseSpanishAmount('45,5')).toBe(45.5);
    expect(parseSpanishAmount('1.234')).toBe(1234);          // Spanish grouping, not a decimal
    expect(parseSpanishAmount('116,76 EUR')).toBe(116.76);
    expect(parseSpanishAmount('20,00-')).toBe(-20);          // some exports trail the sign
    expect(parseSpanishAmount('0,00')).toBe(0);
  });
  it('is null for anything that is not money', () => {
    for (const bad of ['', '   ', 'SALDO', 'n/d', null, undefined, '1.2.3,4,5']) {
      expect(parseSpanishAmount(bad)).toBeNull();
    }
  });
});

describe('parseSpanishDate', () => {
  it('reads the day first, never the month', () => {
    expect(parseSpanishDate('08/09/2026')).toBe('2026-09-08');
    expect(parseSpanishDate('2026-09-08')).toBe('2026-09-08');
    expect(parseSpanishDate('8-9-2026')).toBe('2026-09-08');
    expect(parseSpanishDate('08/09/26')).toBe('2026-09-08');
    expect(parseSpanishDate('31/12/2025')).toBe('2025-12-31');
    expect(parseSpanishDate('08.09.2026')).toBe('2026-09-08');
  });
  it('reads an Excel serial that arrived as a string', () => {
    expect(parseSpanishDate('46273')).toBe('2026-09-08');
  });
  it('is null for a preamble line, an impossible day or an empty cell', () => {
    for (const bad of ['', 'Rango de fechas', '32/01/2026', '08/13/2026', '12', null]) {
      expect(parseSpanishDate(bad)).toBeNull();
    }
  });
});

describe('findHeader', () => {
  it('skips the preamble and maps the Santander header', () => {
    expect(findHeader(SANTANDER_SHEET)).toEqual({
      index: 5,
      columns: { date: 0, valueDate: 1, concept: 2, amount: 3, balance: 4 },
    });
  });
  it('maps separate debit and credit columns instead of one signed amount', () => {
    const header = findHeader([['Movimientos'], ['FECHA', 'CONCEPTO', 'CARGO', 'ABONO', 'SALDO']]);
    expect(header).toEqual({ index: 1, columns: { date: 0, concept: 1, debit: 2, credit: 3, balance: 4 } });
    expect(header.columns.amount).toBeUndefined();
  });
  it('reads accent-free, English and qualified spellings', () => {
    expect(findHeader([['fecha operacion', 'descripcion', 'importe (EUR)', 'divisa']])).toEqual({
      index: 0, columns: { date: 0, concept: 1, amount: 2, currency: 3 },
    });
    expect(findHeader([['Date', 'Description', 'Amount', 'Balance']])).toEqual({
      index: 0, columns: { date: 0, concept: 1, amount: 2, balance: 3 },
    });
  });
  it('is null when nothing in the file is a header', () => {
    expect(findHeader([['Cuenta: SANTANDER ONE'], ['Rango de fechas: 01/09/2026 - 30/09/2026'], ['']])).toBeNull();
    expect(findHeader([])).toBeNull();
    expect(findHeader(null)).toBeNull();
  });
});

describe('parseDelimited', () => {
  it('reads the Spanish semicolon default, with quoted concepts', () => {
    const csv = [
      'Cuenta: SANTANDER ONE 0049 1500 03 1234567890;;;;',
      'Rango de fechas: 01/09/2026 - 30/09/2026;;;;',
      ';;;;',
      'FECHA OPERACIÓN;FECHA VALOR;CONCEPTO;IMPORTE;SALDO',
      '08/09/2026;08/09/2026;"PAGO MOVIL EN EL CORTE INGLES, MADRID ES, TARJ. :*741245";-116,76;2.345,67',
      '07/09/2026;07/09/2026;BIZUM A FAVOR DE ANA LOPEZ CONCEPTO: Cena;-20,00;2.462,43',
    ].join('\r\n');
    const rows = parseDelimited(csv);
    expect(rows[3]).toEqual(HEADER);
    expect(rows[4][2]).toBe('PAGO MOVIL EN EL CORTE INGLES, MADRID ES, TARJ. :*741245');
    expect(rows[4][3]).toBe('-116,76');
  });
  it('reads a comma file whose amounts are quoted, and a tab file', () => {
    expect(parseDelimited('Date,Description,Amount\n2026-09-08,COMPRA MERCADONA,"1,234.56"')).toEqual([
      ['Date', 'Description', 'Amount'],
      ['2026-09-08', 'COMPRA MERCADONA', '1,234.56'],
    ]);
    expect(parseDelimited('FECHA\tCONCEPTO\tIMPORTE\n08/09/2026\tCOMPRA X\t-1,00')).toEqual([
      ['FECHA', 'CONCEPTO', 'IMPORTE'],
      ['08/09/2026', 'COMPRA X', '-1,00'],
    ]);
  });
  it('survives a byte-order mark and an empty file', () => {
    expect(parseDelimited('﻿FECHA;IMPORTE\n08/09/2026;-1,00')[0]).toEqual(['FECHA', 'IMPORTE']);
    expect(parseDelimited('')).toEqual([]);
  });
});

describe('parseWorkbook', () => {
  it('reads the first sheet of a real .xlsx as rows of strings', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(SANTANDER_SHEET), 'Movimientos');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['ignored']]), 'Otra');
    const rows = parseWorkbook(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    expect(rows[5]).toEqual(HEADER);
    expect(rows[6][2]).toBe(CARD_ROW[2]);
    expect(findHeader(rows).index).toBe(5);
  });
});

describe('toSightings', () => {
  it('pins the full shape of one sighting', () => {
    const { sightings } = toSightings(SANTANDER_SHEET, { accountId: 'acc-1' });
    const header = { index: 5, columns: { date: 0, valueDate: 1, concept: 2, amount: 3, balance: 4 } };
    expect(sightings[0]).toEqual({
      source: 'statement',
      source_ref: 'st:124055d0871eaa18f48e1d59930f047b',
      account_id: 'acc-1',
      raw_json: { row: CARD_ROW, header },
      raw_text: 'PAGO MOVIL EN EL CORTE INGLES, MADRID ES, TARJ. :*741245',
      amount: 116.76,
      currency: 'EUR',
      direction: 'out',
      merchant_raw: 'El Corte Ingles',
      merchant_key: 'el corte ingles',
      occurred_at: '2026-09-08T12:00:00.000Z',
      card_last4: '1245',
      parse_confidence: 0.95,
      channel: 'card',
    });
  });

  it('carries exactly the keys the bank feed produces', () => {
    const { sightings } = toSightings(SANTANDER_SHEET);
    expect(Object.keys(sightings[0]).sort()).toEqual([
      'account_id', 'amount', 'card_last4', 'channel', 'currency', 'direction',
      'merchant_key', 'merchant_raw', 'occurred_at', 'parse_confidence',
      'raw_json', 'raw_text', 'source', 'source_ref',
    ]);
  });

  it('reads a card purchase, a Bizum and a transfer in, and skips the blank row', () => {
    const { sightings, skipped, header } = toSightings(SANTANDER_SHEET);
    expect(header.index).toBe(5);
    expect(sightings.map((s) => [s.merchant_raw, s.channel, s.direction, s.amount])).toEqual([
      ['El Corte Ingles', 'card', 'out', 116.76],
      ['Ana Lopez', 'bizum', 'out', 20],
      ['Universidad Carlos Iii', 'transfer', 'in', 1850],
    ]);
    expect(skipped).toEqual([{ index: 9, row: BLANK_ROW, reason: 'empty_row' }]);
  });

  it('prefers the value date over the operation date', () => {
    const { sightings } = toSightings([HEADER, TRANSFER_ROW]);
    expect(sightings[0].occurred_at).toBe('2026-09-02T12:00:00.000Z');   // valor, not operación
    const noValueDate = ['05/09/2026', '', 'COMPRA MERCADONA, MADRID ES, TARJETA 5489010523741245', '-31,20', ''];
    expect(toSightings([HEADER, noValueDate]).sightings[0].occurred_at).toBe('2026-09-05T12:00:00.000Z');
  });

  it('reads the same rows from a semicolon CSV as from the sheet', () => {
    const csv = [
      'Cuenta: SANTANDER ONE 0049 1500 03 1234567890;;;;',
      'Titular: STEFANO GEBARA;;;;',
      'Rango de fechas: 01/09/2026 - 30/09/2026;;;;',
      'Divisa: EUR;;;;',
      ';;;;',
      HEADER.join(';'),
      `08/09/2026;08/09/2026;"${CARD_ROW[2]}";-116,76;2.345,67`,
      `07/09/2026;07/09/2026;${BIZUM_ROW[2]};-20,00;2.462,43`,
      `01/09/2026;02/09/2026;"${TRANSFER_ROW[2]}";1.850,00;2.482,43`,
      ';;;;',
    ].join('\n');
    const fromCsv = toSightings(parseDelimited(csv), { accountId: 'acc-1' });
    const fromSheet = toSightings(SANTANDER_SHEET, { accountId: 'acc-1' });
    expect(fromCsv.sightings.map((s) => s.source_ref)).toEqual(fromSheet.sightings.map((s) => s.source_ref));
    expect(fromCsv.sightings.map((s) => [s.merchant_key, s.amount, s.direction, s.occurred_at]))
      .toEqual(fromSheet.sightings.map((s) => [s.merchant_key, s.amount, s.direction, s.occurred_at]));
  });

  it('signs the amount from separate CARGO and ABONO columns', () => {
    const rows = [
      ['Movimientos de la cuenta', '', '', '', ''],
      ['FECHA', 'CONCEPTO', 'CARGO', 'ABONO', 'SALDO'],
      ['08/09/26', 'COMPRA GLOVOAPP ES, MADRID, TARJETA 5489010523741245', '24,90', '', '1.000,00'],
      ['09/09/26', 'BIZUM DE ANA LOPEZ CONCEPTO: Sin concepto', '', '15,00', '1.015,00'],
      ['10/09/26', 'RECIBO IBERDROLA CLIENTES', '(45,00)', '', '970,00'],
      ['11/09/26', 'APUNTE SIN IMPORTE', '', '', '970,00'],
    ];
    const { sightings, skipped } = toSightings(rows);
    expect(sightings.map((s) => [s.direction, s.amount, s.merchant_raw, s.channel])).toEqual([
      ['out', 24.9, 'Glovo', 'card'],
      ['in', 15, 'Ana Lopez', 'bizum'],
      ['out', 45, 'RECIBO IBERDROLA CLIENTES', 'direct_debit'],
    ]);
    expect(skipped).toEqual([{ index: 5, row: rows[5], reason: 'no_amount' }]);
  });

  it('reads thousand separators, a parenthesised negative and a euro sign in one file', () => {
    const rows = [
      HEADER,
      ['08/09/2026', '08/09/2026', 'TRANSFERENCIA DE STEFANO GEBARA', '12.500,00', ''],
      ['08/09/2026', '08/09/2026', 'COMISION MANTENIMIENTO', '(45,00)', ''],
      ['08/09/2026', '08/09/2026', 'COMPRA APPLE STORE, MADRID ES, TARJETA 5489010523741245', '-1.299,00 €', ''],
      ['08/09/2026', '08/09/2026', 'PAGO MOVIL EN MERCADONA, MADRID ES, TARJ. :*741245', '-1,50', ''],
    ];
    const { sightings } = toSightings(rows);
    expect(sightings.map((s) => [s.direction, s.amount])).toEqual([
      ['in', 12500], ['out', 45], ['out', 1299], ['out', 1.5],
    ]);
    expect(sightings[1].merchant_raw).toBe('Bank fee');            // the sentence names nobody
  });

  it('reads ISO dates, two-digit years and an unformatted serial in the same file', () => {
    const rows = [
      ['fecha', 'concepto', 'importe', 'divisa'],
      ['2026-09-08', 'COMPRA MERCADONA, MADRID ES, TARJETA 5489010523741245', '-31,20', 'EUR'],
      ['09/09/26', 'COMPRA ZARA, MADRID ES, TARJETA 5489010523741245', '-59,95', 'EUR'],
      ['46273', 'COMPRA IKEA, ALCORCON ES, TARJETA 5489010523741245', '-120,00', 'USD'],
      ['no es una fecha', 'COMPRA X', '-1,00', 'EUR'],
    ];
    const { sightings, skipped } = toSightings(rows);
    expect(sightings.map((s) => s.occurred_at.slice(0, 10))).toEqual(['2026-09-08', '2026-09-09', '2026-09-08']);
    expect(sightings.map((s) => s.currency)).toEqual(['EUR', 'EUR', 'USD']);
    expect(skipped).toEqual([{ index: 4, row: rows[4], reason: 'no_date' }]);
  });

  it('gives the same file the same source_refs twice, so the reconciler dedupes', () => {
    const a = toSightings(SANTANDER_SHEET, { accountId: 'acc-1' });
    const b = toSightings(SANTANDER_SHEET, { accountId: 'acc-1' });
    expect(b.sightings.map((s) => s.source_ref)).toEqual(a.sightings.map((s) => s.source_ref));
    expect(new Set(a.sightings.map((s) => s.source_ref)).size).toBe(3);
    expect(a.sightings.every((s) => /^st:[0-9a-f]{32}$/.test(s.source_ref))).toBe(true);
    /* The ref is content-addressed, so the account it was filed under does not change it,
       but a different day, amount or concept does. */
    expect(toSightings(SANTANDER_SHEET, { accountId: 'acc-2' }).sightings[0].source_ref).toBe(a.sightings[0].source_ref);
    const moved = [HEADER, [...CARD_ROW.slice(0, 3), '-116,77', '']];
    expect(toSightings(moved).sightings[0].source_ref).not.toBe(a.sightings[0].source_ref);
  });

  it('honours accountId and defaultCurrency, and defaults them', () => {
    const rows = [HEADER, CARD_ROW];
    expect(toSightings(rows)[0]).toBeUndefined();
    expect(toSightings(rows).sightings[0]).toMatchObject({ account_id: null, currency: 'EUR' });
    expect(toSightings(rows, { defaultCurrency: 'GBP' }).sightings[0].currency).toBe('GBP');
  });

  it('returns no sightings, and a reason per row, when no header is recognisable', () => {
    const rows = [
      ['Extracto de movimientos'],
      ['Cuenta: SANTANDER ONE 0049 1500 03 1234567890'],
      [''],
      ['No hay movimientos en el periodo seleccionado'],
    ];
    const out = toSightings(rows);
    expect(out.sightings).toEqual([]);
    expect(out.header).toBeNull();
    expect(out.skipped.map((s) => s.reason)).toEqual(['no_header', 'no_header', 'no_header']);
    expect(() => toSightings([])).not.toThrow();
    expect(toSightings([])).toEqual({ sightings: [], skipped: [], header: null });
    expect(toSightings(null)).toEqual({ sightings: [], skipped: [], header: null });
  });
});
