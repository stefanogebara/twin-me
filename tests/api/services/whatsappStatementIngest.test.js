/**
 * Unit tests for the WhatsApp statement-ingestion service (strategy Phase 1).
 *
 * downloadWhatsAppMedia and ingestRawTransactions are mocked; the OFX goes
 * through the REAL parserDispatcher so the test pins the whole
 * document -> parse -> seam handoff, not just plumbing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const downloadMock = vi.fn();
vi.mock('../../../api/services/whatsappService.js', () => ({
  downloadWhatsAppMedia: (...a) => downloadMock(...a),
  sendWhatsAppMessage: vi.fn(),
}));

const ingestMock = vi.fn();
vi.mock('../../../api/services/transactions/rawIngestion.js', () => ({
  ingestRawTransactions: (...a) => ingestMock(...a),
}));

const { isStatementDocument, handleStatementDocument } = await import(
  '../../../api/services/transactions/whatsappStatementIngest.js'
);

// Minimal valid Brazilian-bank-style OFX (SGML 1.x) with two transactions.
const OFX_SAMPLE = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>0260
<ACCTID>12345678
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260501
<DTEND>20260531
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260503
<TRNAMT>-89.90
<FITID>wa-test-0001
<MEMO>SMART FIT ACADEMIA
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260505
<TRNAMT>1500.00
<FITID>wa-test-0002
<MEMO>TRANSFERENCIA RECEBIDA
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

describe('isStatementDocument', () => {
  it('accepts ofx/csv/xlsx filenames and statement mimes', () => {
    expect(isStatementDocument({ filename: 'extrato-2026-05.ofx' })).toBe(true);
    expect(isStatementDocument({ filename: 'nubank.CSV' })).toBe(true);
    expect(isStatementDocument({ filename: 'santander.xlsx' })).toBe(true);
    expect(isStatementDocument({ filename: 'foo.bin', mimeType: 'text/csv' })).toBe(true);
  });

  it('rejects images, pdfs, and empty docs', () => {
    expect(isStatementDocument({ filename: 'comprovante.pdf' })).toBe(false);
    expect(isStatementDocument({ filename: 'photo.jpg', mimeType: 'image/jpeg' })).toBe(false);
    expect(isStatementDocument(null)).toBe(false);
    expect(isStatementDocument({})).toBe(false);
  });
});

describe('handleStatementDocument', () => {
  beforeEach(() => {
    downloadMock.mockReset();
    ingestMock.mockReset();
  });

  it('parses a real OFX through the dispatcher and ingests via the seam', async () => {
    downloadMock.mockResolvedValue(Buffer.from(OFX_SAMPLE, 'utf8'));
    ingestMock.mockResolvedValue({ inserted: 2, insertedIds: ['a', 'b'], skipped: [] });

    const result = await handleStatementDocument('user-1', {
      id: 'media-123',
      filename: 'extrato.ofx',
    });

    expect(result.ok).toBe(true);
    expect(result.inserted).toBe(2);
    // Confirmation names the count and the spend total from the parsed file.
    expect(result.reply).toContain('2 transactions');
    expect(result.reply).toMatch(/89,90|89\.90/);

    expect(ingestMock).toHaveBeenCalledTimes(1);
    const [userArg, metaArg, txArg] = ingestMock.mock.calls[0];
    expect(userArg).toBe('user-1');
    expect(metaArg.source).toBe('whatsapp_statement');
    expect(metaArg.platform).toBe('bank_statement');
    expect(txArg).toHaveLength(2);
    expect(txArg.map((t) => t.external_id).join(',')).toContain('wa-test-0001');
  });

  it('asks for a resend when the download fails', async () => {
    downloadMock.mockResolvedValue(null);
    const result = await handleStatementDocument('user-1', { id: 'media-404', filename: 'extrato.ofx' });
    expect(result.ok).toBe(false);
    expect(result.reply).toMatch(/download|sending it again/i);
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it('explains supported formats when parsing yields nothing', async () => {
    downloadMock.mockResolvedValue(Buffer.from('this is not a statement at all', 'utf8'));
    const result = await handleStatementDocument('user-1', { id: 'media-1', filename: 'notes.csv' });
    expect(result.ok).toBe(false);
    expect(result.reply).toMatch(/OFX and CSV/);
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it('reports a save problem without throwing when ingest fails', async () => {
    downloadMock.mockResolvedValue(Buffer.from(OFX_SAMPLE, 'utf8'));
    ingestMock.mockRejectedValue(new Error('db down'));
    const result = await handleStatementDocument('user-1', { id: 'media-1', filename: 'extrato.ofx' });
    expect(result.ok).toBe(false);
    expect(result.reply).toMatch(/problem saving/i);
  });
});
