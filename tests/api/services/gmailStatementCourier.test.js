/**
 * Unit tests for the Gmail OFX statement courier (strategy Phase 2).
 * Gmail REST + Supabase + ingest seam are mocked; the OFX goes through the
 * REAL parserDispatcher (base64url decode included), pinning the whole
 * search -> download -> dedup -> parse -> ingest flow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const axiosGetMock = vi.fn();
vi.mock('axios', () => ({ default: { get: (...a) => axiosGetMock(...a) } }));

const ingestMock = vi.fn();
vi.mock('../../../api/services/transactions/rawIngestion.js', () => ({
  ingestRawTransactions: (...a) => ingestMock(...a),
}));

// supabaseAdmin: only the source_file_hash dedup lookup is used.
const hashLookupResult = { data: [], error: null };
vi.mock('../../../api/services/database.js', () => {
  const chain = {};
  Object.assign(chain, {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    limit: () => Promise.resolve(hashLookupResult),
  });
  return { supabaseAdmin: chain, serverDb: {} };
});

const { runGmailStatementCourier } = await import(
  '../../../api/services/transactions/gmailStatementCourier.js'
);

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
<DTPOSTED>20260510
<TRNAMT>-150.00
<FITID>gmail-test-0001
<MEMO>MERCADO LIVRE
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

// Gmail returns base64url (-/_ alphabet, no padding semantics issues for us).
const toBase64Url = (s) =>
  Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

function mockGmailHappyPath() {
  axiosGetMock.mockImplementation((url) => {
    if (/\/messages$/.test(url)) {
      return Promise.resolve({ data: { messages: [{ id: 'msg-1' }] } });
    }
    if (/\/messages\/msg-1$/.test(url)) {
      return Promise.resolve({
        data: {
          payload: {
            parts: [
              { filename: '', mimeType: 'text/plain', body: {} },
              {
                filename: 'NU_12345_extrato.ofx',
                body: { attachmentId: 'att-1' },
              },
            ],
          },
        },
      });
    }
    if (/attachments\/att-1$/.test(url)) {
      return Promise.resolve({ data: { data: toBase64Url(OFX_SAMPLE) } });
    }
    return Promise.reject(new Error(`unexpected url ${url}`));
  });
}

describe('runGmailStatementCourier', () => {
  beforeEach(() => {
    axiosGetMock.mockReset();
    ingestMock.mockReset();
    hashLookupResult.data = [];
  });

  it('finds an OFX attachment, decodes base64url, parses, and ingests', async () => {
    mockGmailHappyPath();
    ingestMock.mockResolvedValue({ inserted: 1, insertedIds: ['x'], skipped: [] });

    const stats = await runGmailStatementCourier('user-1', 'token-abc');

    expect(stats).toEqual({ filesSeen: 1, filesIngested: 1, inserted: 1 });
    expect(ingestMock).toHaveBeenCalledTimes(1);
    const [userArg, metaArg, txArg] = ingestMock.mock.calls[0];
    expect(userArg).toBe('user-1');
    expect(metaArg.source).toBe('gmail_statement');
    expect(metaArg.fileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(txArg).toHaveLength(1);
    expect(txArg[0].external_id).toContain('gmail-test-0001');
    // The search must target OFX attachments only.
    const searchCall = axiosGetMock.mock.calls.find(([u]) => /\/messages$/.test(u));
    expect(searchCall[1].params.q).toContain('filename:ofx');
  });

  it('skips a statement whose file hash was already ingested (no pipeline re-run)', async () => {
    mockGmailHappyPath();
    hashLookupResult.data = [{ id: 'existing-tx' }];

    const stats = await runGmailStatementCourier('user-1', 'token-abc');

    expect(stats.filesSeen).toBe(1);
    expect(stats.filesIngested).toBe(0);
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it('returns zeroes without throwing when the Gmail search fails', async () => {
    axiosGetMock.mockRejectedValue(new Error('gmail 503'));
    const stats = await runGmailStatementCourier('user-1', 'token-abc');
    expect(stats).toEqual({ filesSeen: 0, filesIngested: 0, inserted: 0 });
    expect(ingestMock).not.toHaveBeenCalled();
  });
});
