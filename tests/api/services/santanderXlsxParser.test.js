/**
 * parseSantanderXlsx — regression guard added alongside the xlsx CVE fix
 * (repointed to the patched SheetJS 0.20.3 CDN build). Builds Santander-Magie-
 * shaped workbooks in memory with the same xlsx build the parser uses, so this
 * exercises the real read path end-to-end (write → read → parse).
 *
 * Layout note: column A is blank in the real export; the parser reads data from
 * columns B-E (array indices 1-4), so each row here is ['', date, amount, tipo,
 * payee].
 */
import { describe, it, expect } from 'vitest';
import xlsx from 'xlsx';
import { parseSantanderXlsx } from '../../../api/services/transactions/santanderXlsxParser.js';

const HEADER = ['', 'Data da Transação', 'Valor (R$)', 'Tipo', 'Descrição'];

function buildWorkbook(rows, sheetName = 'Extrato Magie') {
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(rows), sheetName);
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('parseSantanderXlsx', () => {
  it('extracts transactions and parses BR amounts/dates', () => {
    const buf = buildWorkbook([
      ['Extrato Magie'],
      [''],
      HEADER,
      ['', '15/06/2026 10:30:00', '-1.595,34', 'Pix enviado', 'Mercado Pão'],
      ['', '14/06/2026 09:00:00', '2.000,00', 'Pix recebido', 'Salário'],
    ]);
    const r = parseSantanderXlsx(buf);

    expect(r.sourceBank).toBe('santander');
    expect(r.accountType).toBe('checking');
    expect(r.errors).toEqual([]);
    expect(r.transactions).toHaveLength(2);
    expect(r.transactions[0]).toMatchObject({
      amount: -1595.34,
      currency: 'BRL',
      merchant_raw: 'Mercado Pão',
      transaction_date: '2026-06-15T10:30:00-03:00',
      account_type: 'checking',
    });
    expect(r.transactions[1]).toMatchObject({ amount: 2000, merchant_raw: 'Salário' });
  });

  it('skips internal "Depósito via Santander" transfers and the Rendimentos section', () => {
    const buf = buildWorkbook([
      HEADER,
      ['', '15/06/2026 10:30:00', '-100,00', 'Pix enviado', 'Loja'],
      ['', '15/06/2026 10:30:01', '100,00', 'Depósito via Santander', ''],
      ['', 'RENDIMENTOS', '', '', ''],
      ['', '13/06/2026 00:00:00', '0,50', 'Rendimento', ''],
    ]);
    const r = parseSantanderXlsx(buf);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0].merchant_raw).toBe('Loja');
  });

  it('falls back to tipo when the payee column is blank', () => {
    const buf = buildWorkbook([
      HEADER,
      ['', '12/06/2026 08:00:00', '-50,00', 'Tarifa de serviço', ''],
    ]);
    expect(parseSantanderXlsx(buf).transactions[0].merchant_raw).toBe('Tarifa de serviço');
  });

  it('returns an error (no transactions) when the header row is absent', () => {
    const buf = buildWorkbook([
      ['', 'random', 'stuff'],
      ['', 'more', 'rows'],
    ]);
    const r = parseSantanderXlsx(buf);
    expect(r.transactions).toEqual([]);
    expect(r.errors[0]).toMatch(/header/i);
  });

  it('selects the sheet whose name contains "magie" among multiple sheets', () => {
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([['junk']]), 'Resumo');
    xlsx.utils.book_append_sheet(
      wb,
      xlsx.utils.aoa_to_sheet([HEADER, ['', '11/06/2026 07:00:00', '-10,00', 'Compra', 'Padaria']]),
      'Extrato Magie'
    );
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const r = parseSantanderXlsx(buf);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0].merchant_raw).toBe('Padaria');
  });

  // audit-2026-07-03 (money HIGH): the parser emitted NO external_id, so the
  // upload route inserted NULL — and the (user_id, external_id) UNIQUE
  // constraint never fires on NULLs, so re-uploading the same Magie XLSX
  // duplicated every row (each copy then tagged independently: the "once
  // bare, once tagged, distinct keys" double-render, and the double-counted
  // 90-day summary). These pin the dedup-key contract.
  describe('external_id (dedup key)', () => {
    const ROWS = [
      HEADER,
      ['', '27/04/2026 10:30:00', '-25,00', 'Pix enviado', 'Eduardo Campbell Rodrigues Barbosa'],
      ['', '09/04/2026 14:00:00', '-1.595,34', 'Pix enviado', 'Murillo Henrique Nojosa Arruda'],
      ['', '09/04/2026 09:15:00', '-182,16', 'Compra', 'True Paleo'],
    ];

    it('assigns every transaction a non-empty external_id', () => {
      const r = parseSantanderXlsx(buildWorkbook(ROWS));
      expect(r.transactions).toHaveLength(3);
      for (const t of r.transactions) {
        expect(typeof t.external_id).toBe('string');
        expect(t.external_id.length).toBeGreaterThan(0);
      }
    });

    it('gives distinct rows distinct external_ids', () => {
      const r = parseSantanderXlsx(buildWorkbook(ROWS));
      const ids = r.transactions.map((t) => t.external_id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('is deterministic across separate exports of the same rows (re-upload upserts, not duplicates)', () => {
      // Two workbook builds of the same logical content produce different
      // binary buffers (zip metadata) — the ids must depend on row CONTENT
      // only, so a re-uploaded statement hits the (user_id, external_id)
      // conflict instead of inserting a second copy.
      const first = parseSantanderXlsx(buildWorkbook(ROWS));
      const second = parseSantanderXlsx(buildWorkbook(ROWS));
      expect(second.transactions.map((t) => t.external_id)).toEqual(
        first.transactions.map((t) => t.external_id)
      );
    });

    it('keeps identical rows within one file distinct AND stable (two same-second identical Pix)', () => {
      const dupRows = [
        HEADER,
        ['', '05/04/2026 11:00:00', '-170,00', 'Pix enviado', 'Sophia Alegretti Soares'],
        ['', '05/04/2026 11:00:00', '-170,00', 'Pix enviado', 'Sophia Alegretti Soares'],
      ];
      const first = parseSantanderXlsx(buildWorkbook(dupRows));
      expect(first.transactions).toHaveLength(2);
      // Distinct: a content hash alone would collapse them in the upsert batch.
      expect(first.transactions[0].external_id).not.toBe(first.transactions[1].external_id);
      // Stable: the same file re-uploaded maps each copy to the same id.
      const second = parseSantanderXlsx(buildWorkbook(dupRows));
      expect(second.transactions.map((t) => t.external_id)).toEqual(
        first.transactions.map((t) => t.external_id)
      );
    });
  });
});
