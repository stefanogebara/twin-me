/**
 * Unit tests for the native SGML OFX parser.
 *
 * Regression guard for the 2026-06-11 prod bug: parseOfx used the ESM-only
 * `ofx-data-extractor` package via dynamic import, which threw "Unexpected
 * token 'export'" in Vercel's serverless runtime — breaking EVERY OFX upload
 * (and the WhatsApp/Gmail OFX flows) even though it worked in local vitest.
 * The parser is now dependency-free native SGML extraction, so these tests
 * exercise the exact code path that runs in production.
 */

import { describe, it, expect } from 'vitest';
import { parseOfx } from '../../../api/services/transactions/ofxParser.js';

const BANK_OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>0260
<ACCTID>99999999
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260601
<DTEND>20260610
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260603
<TRNAMT>-189.90
<FITID>pwtest-0001
<MEMO>SMART FIT PWTEST
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260608
<TRNAMT>5000.00
<FITID>pwtest-0004
<MEMO>SALARIO PWTEST
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

const CC_OFX = `OFXHEADER:100
DATA:OFXSGML
<OFX>
<CREDITCARDMSGSRSV1>
<CCSTMTTRNRS>
<CCSTMTRS>
<CURDEF>BRL
<CCACCTFROM>
<ACCTID>1234</ACCTID>
</CCACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260605
<TRNAMT>120.00
<FITID>cc-0001
<MEMO>NETFLIX
</STMTTRN>
</BANKTRANLIST>
</CCSTMTRS>
</CCSTMTTRNRS>
</CREDITCARDMSGSRSV1>
</OFX>
`;

describe('parseOfx (native SGML)', () => {
  it('extracts bank-account transactions with correct sign, date, memo', async () => {
    const { accountType, transactions, errors } = await parseOfx(BANK_OFX);
    expect(errors).toHaveLength(0);
    expect(accountType).toBe('checking');
    expect(transactions).toHaveLength(2);

    const debit = transactions.find((t) => t.merchant_raw === 'SMART FIT PWTEST');
    expect(debit.amount).toBe(-189.9);
    expect(debit.transaction_date.slice(0, 10)).toBe('2026-06-03');
    expect(debit.currency).toBe('BRL');
    expect(debit.external_id).toContain('pwtest-0001');

    const credit = transactions.find((t) => t.merchant_raw === 'SALARIO PWTEST');
    expect(credit.amount).toBe(5000);
  });

  it('handles credit-card statements (positive TRNAMT charge -> negative outflow)', async () => {
    const { accountType, transactions } = await parseOfx(CC_OFX);
    expect(accountType).toBe('credit_card');
    expect(transactions).toHaveLength(1);
    expect(transactions[0].merchant_raw).toBe('NETFLIX');
    expect(transactions[0].amount).toBe(-120); // CC charge flips to outflow
  });

  it('accepts a Buffer and returns an empty list (no throw) for junk input', async () => {
    const buf = await parseOfx(Buffer.from(BANK_OFX, 'utf8'));
    expect(buf.transactions).toHaveLength(2);

    const junk = await parseOfx('this is not ofx at all');
    expect(junk.transactions).toHaveLength(0);
    // Must not throw "parse init failed" — native parser degrades gracefully.
    expect(junk.errors.join(' ')).not.toMatch(/parse init failed/i);
  });
});
