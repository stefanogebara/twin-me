/**
 * Characterization tests for parserDispatcher.detectFormat — the pure format
 * sniffer that routes a bank statement to the right parser. Uses the REAL
 * sibling detectors (detectNubankVariant, decodeOfxBuffer) with fixture inputs;
 * no mocking. parseBankStatement's delegation to the heavy parsers is out of
 * scope (verified elsewhere / live); the routing decision is what's pinned here.
 */
import { describe, it, expect } from 'vitest';
import { detectFormat } from '../../../api/services/transactions/parserDispatcher.js';

describe('detectFormat — XLSX', () => {
  it('detects the PK zip magic bytes as xlsx', async () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    expect(await detectFormat(buf)).toBe('xlsx');
  });

  it('detects an .xlsx filename even for non-PK content', async () => {
    expect(await detectFormat('col1,col2', 'statement.xlsx')).toBe('xlsx');
    expect(await detectFormat('anything', 'REPORT.XLSX')).toBe('xlsx');
  });
});

describe('detectFormat — OFX', () => {
  it('detects the SGML OFXHEADER preamble', async () => {
    const ofx = 'OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\n<OFX><BANKMSGSRSV1></BANKMSGSRSV1></OFX>';
    expect(await detectFormat(ofx)).toBe('ofx');
  });

  it('detects a bare <OFX> root tag', async () => {
    expect(await detectFormat('<OFX>\n<SIGNONMSGSRSV1>')).toBe('ofx');
  });

  it('detects XML-prefixed OFX 2.x', async () => {
    const xmlOfx = '<?xml version="1.0" encoding="UTF-8"?>\n<OFX>\n<BANKMSGSRSV1>';
    expect(await detectFormat(xmlOfx)).toBe('ofx');
  });
});

describe('detectFormat — Nubank CSV', () => {
  it('detects the app card header (date;title;amount)', async () => {
    expect(await detectFormat('date;title;amount\n2026-01-01;Coffee;-10.00')).toBe('csv_nubank');
  });

  it('detects the legacy card header (DATA;DESCRICAO;VALOR)', async () => {
    expect(await detectFormat('DATA;DESCRICAO;VALOR\n01/01/2026;Cafe;-10,00')).toBe('csv_nubank');
  });

  it('detects the account header (Data,Valor,Identificador,Descrição)', async () => {
    expect(await detectFormat('Data,Valor,Identificador,Descrição\n2026-01-01,-10.00,abc,Coffee')).toBe('csv_nubank');
  });
});

describe('detectFormat — generic + unknown fallbacks', () => {
  it('falls back to csv_generic for a delimited but unrecognized header', async () => {
    expect(await detectFormat('foo;bar;baz\n1;2;3')).toBe('csv_generic');
    expect(await detectFormat('a,b,c\n1,2,3')).toBe('csv_generic');
  });

  it('returns unknown for content with no delimiters and no known header', async () => {
    expect(await detectFormat('just some free text with no structure')).toBe('unknown');
    expect(await detectFormat('')).toBe('unknown');
  });
});
