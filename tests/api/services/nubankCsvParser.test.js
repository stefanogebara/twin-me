/**
 * Characterization tests for nubankCsvParser — pure Nubank CSV parser
 * (3 variants: card app, card legacy, bank account). No DB, no network.
 *
 * Pins the load-bearing money logic: Brazilian-locale amount parsing (comma vs
 * dot decimal, thousands separators), variant sniffing, the card-row sign flip
 * (expenses -> negative, refunds -> positive), external_id derivation, and
 * graceful handling of malformed rows.
 */
import { describe, it, expect } from 'vitest';
import {
  parseBrlAmount,
  detectNubankVariant,
  parseNubankCsv,
} from '../../../api/services/transactions/nubankCsvParser.js';

describe('parseBrlAmount', () => {
  it('parses comma-decimal (BR locale): "50,00" -> 50', () => {
    expect(parseBrlAmount('50,00')).toBe(50);
  });

  it('parses dot-decimal: "-150.00" -> -150', () => {
    expect(parseBrlAmount('-150.00')).toBe(-150);
  });

  it('parses dot-thousands + comma-decimal: "1.234,56" -> 1234.56', () => {
    expect(parseBrlAmount('1.234,56')).toBe(1234.56);
  });

  it('parses comma-thousands + dot-decimal: "1,234.56" -> 1234.56', () => {
    expect(parseBrlAmount('1,234.56')).toBe(1234.56);
  });

  it('strips R$ and whitespace', () => {
    expect(parseBrlAmount('R$ 1.999,90')).toBe(1999.9);
    expect(parseBrlAmount('  42,50  ')).toBe(42.5);
  });

  it('handles an integer with no separator', () => {
    expect(parseBrlAmount('200')).toBe(200);
    expect(parseBrlAmount('-75')).toBe(-75);
  });

  it('treats a lone comma as the decimal separator', () => {
    expect(parseBrlAmount('7,5')).toBe(7.5);
  });

  it('returns NaN for null / undefined / empty / non-numeric', () => {
    expect(parseBrlAmount(null)).toBeNaN();
    expect(parseBrlAmount(undefined)).toBeNaN();
    expect(parseBrlAmount('')).toBeNaN();
    expect(parseBrlAmount('   ')).toBeNaN();
    expect(parseBrlAmount('abc')).toBeNaN();
  });
});

describe('detectNubankVariant', () => {
  it('detects the current app card export header', () => {
    expect(detectNubankVariant('date;title;amount\n2026-01-01;Coffee;10,00')).toBe('card_app');
  });

  it('detects the legacy web card export header', () => {
    expect(detectNubankVariant('DATA;DESCRICAO;VALOR\n01/01/2026;X;10,00')).toBe('card_legacy');
  });

  it('detects the bank-account header (with accented Descrição)', () => {
    expect(detectNubankVariant('Data,Valor,Identificador,Descrição\n')).toBe('account');
  });

  it('tolerates surrounding whitespace in the header', () => {
    expect(detectNubankVariant('  date ; title ; amount  \n')).toBe('card_app');
  });

  it('skips leading blank lines to find the header', () => {
    expect(detectNubankVariant('\n\n   \ndate;title;amount\n')).toBe('card_app');
  });

  it('returns null for an unrecognized or empty header', () => {
    expect(detectNubankVariant('foo,bar,baz')).toBeNull();
    expect(detectNubankVariant('')).toBeNull();
    expect(detectNubankVariant(null)).toBeNull();
  });
});

describe('parseNubankCsv — card_app variant', () => {
  const CSV = `date;title;amount
2026-01-15;Uber Trip;25,90
2026-01-16;Refund Store;-40,00`;

  it('flips card expenses to negative and refunds to positive', async () => {
    const { variant, accountType, transactions, errors } = await parseNubankCsv(CSV);
    expect(variant).toBe('card_app');
    expect(accountType).toBe('credit_card');
    expect(errors).toHaveLength(0);
    expect(transactions).toHaveLength(2);

    const uber = transactions.find((t) => t.merchant_raw === 'Uber Trip');
    expect(uber.amount).toBe(-25.9); // expense -> negative

    const refund = transactions.find((t) => t.merchant_raw === 'Refund Store');
    expect(refund.amount).toBe(40); // CSV -40,00 -> flipped to +40
  });

  it('sets currency BRL and a stable hashed external_id (nu_ prefix)', async () => {
    const { transactions } = await parseNubankCsv(CSV);
    expect(transactions[0].currency).toBe('BRL');
    expect(transactions[0].external_id).toMatch(/^nu_[0-9a-f]{24}$/);
    // Re-parsing the same file yields the same id (dedupe guarantee).
    const again = await parseNubankCsv(CSV);
    expect(again.transactions[0].external_id).toBe(transactions[0].external_id);
  });

  it('parses the date into a noon-BRT ISO string on the same calendar day', async () => {
    const { transactions } = await parseNubankCsv(CSV);
    // 2026-01-15 + T12:00:00-03:00 -> 15:00Z, still Jan 15.
    expect(transactions[0].transaction_date.slice(0, 10)).toBe('2026-01-15');
  });
});

describe('parseNubankCsv — card_legacy variant', () => {
  it('reads DATA/DESCRICAO/VALOR columns and flips sign', async () => {
    const CSV = `DATA;DESCRICAO;VALOR
2026-02-01;Padaria;12,50`;
    const { variant, accountType, transactions } = await parseNubankCsv(CSV);
    expect(variant).toBe('card_legacy');
    expect(accountType).toBe('credit_card');
    expect(transactions[0].merchant_raw).toBe('Padaria');
    expect(transactions[0].amount).toBe(-12.5);
  });
});

describe('parseNubankCsv — account variant', () => {
  const CSV = `Data,Valor,Identificador,Descrição
2026-03-01,-100.00,txn-abc,Compra no débito
2026-03-02,3000.00,txn-def,Salário`;

  it('keeps bank-account signs as-is (no flip) and uses provided identifiers', async () => {
    const { variant, accountType, transactions, errors } = await parseNubankCsv(CSV);
    expect(variant).toBe('account');
    expect(accountType).toBe('checking');
    expect(errors).toHaveLength(0);

    const debit = transactions.find((t) => t.merchant_raw === 'Compra no débito');
    expect(debit.amount).toBe(-100); // debit stays negative
    expect(debit.external_id).toBe('nu_acc_txn-abc'); // provided id, prefixed

    const credit = transactions.find((t) => t.merchant_raw === 'Salário');
    expect(credit.amount).toBe(3000); // credit stays positive
    expect(credit.external_id).toBe('nu_acc_txn-def');
  });
});

describe('parseNubankCsv — error handling', () => {
  it('returns an error and no transactions for an unrecognized header', async () => {
    const res = await parseNubankCsv('foo,bar\n1,2');
    expect(res.variant).toBeNull();
    expect(res.transactions).toHaveLength(0);
    expect(res.errors[0]).toMatch(/Unrecognized Nubank CSV header/);
  });

  it('skips rows with a missing amount but keeps valid rows', async () => {
    const CSV = `date;title;amount
2026-01-15;Valid;10,00
2026-01-16;NoAmount;`;
    const { transactions, errors } = await parseNubankCsv(CSV);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].merchant_raw).toBe('Valid');
    expect(errors.some((e) => /missing date\/amount/.test(e))).toBe(true);
  });

  it('skips rows with an invalid (unparseable) date', async () => {
    const CSV = `date;title;amount
not-a-date;Bad;10,00`;
    const { transactions, errors } = await parseNubankCsv(CSV);
    expect(transactions).toHaveLength(0);
    expect(errors.some((e) => /Invalid date/.test(e))).toBe(true);
  });

  it('skips rows with an invalid amount', async () => {
    const CSV = `date;title;amount
2026-01-15;BadAmount;notmoney`;
    const { transactions, errors } = await parseNubankCsv(CSV);
    expect(transactions).toHaveLength(0);
    expect(errors.some((e) => /Invalid amount/.test(e))).toBe(true);
  });

  it('always reports sourceBank nubank', async () => {
    const res = await parseNubankCsv('garbage');
    expect(res.sourceBank).toBe('nubank');
  });
});
