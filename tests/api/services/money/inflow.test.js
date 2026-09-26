/**
 * Money in, beside money out (the owner, 2026-09-26: "we need to account for the money that
 * comes in into the account, not all money is only spent"). One rule for what came in, next
 * to the one for what was spent, and the month read from both sides with it.
 */
import { describe, it, expect } from 'vitest';
import { isInflow, isMoneyOut, isOutflow, markCounted, ownTransferIds, markOwnTransfers } from '../../../../api/_app/services/money/spending.js';
import { monthFlows, describeFlows, moneyInRows, FLOW_SOURCES } from '../../../../api/_app/services/money/inflow.js';
import { incomeRule } from '../../../../api/_app/services/money/income.js';

const t = (id, occurred_at, amount, merchant_key, extra = {}) => ({ id, occurred_at, amount, merchant_key, merchant_raw: merchant_key, channel: 'card', currency: 'EUR', ...extra });

describe('isInflow: what counts as money in', () => {
  it('counts a salary, a Bizum from a person and a refund from a shop', () => {
    expect(isInflow(t('salary', '2026-09-01T09:00:00Z', 1200, 'acme sl', { channel: 'transfer' }))).toBe(true);
    expect(isInflow(t('bizum', '2026-09-03T20:00:00Z', 15.15, 'ana lopez', { channel: 'bizum' }))).toBe(true);
    expect(isInflow(t('refund', '2026-09-05T12:00:00Z', 39.95, 'zara'))).toBe(true);
  });

  it('never nets a refund out of spending: the purchase is still spent, the refund is money in', () => {
    const [purchase, refund] = markCounted([t('p', '2026-09-02T12:00:00Z', -39.95, 'zara'), t('r', '2026-09-05T12:00:00Z', 39.95, 'zara')], []);
    expect(isOutflow(purchase)).toBe(true);
    expect(isOutflow(refund)).toBe(false);
    expect(isInflow(refund)).toBe(true);
    expect(isInflow(purchase)).toBe(false);
  });

  it('leaves out another currency, a row marked not mine, money going out and nothing at all', () => {
    expect(isInflow(t('usd', '2026-09-04T10:00:00Z', 100, 'vercel', { channel: 'transfer', currency: 'USD' }))).toBe(false);
    expect(isInflow(t('nm', '2026-09-04T10:00:00Z', 20, 'somebody', { channel: 'bizum', verdict: 'not_me' }))).toBe(false);
    expect(isInflow(t('out', '2026-09-04T10:00:00Z', -20, 'lidl'))).toBe(false);
    expect(isInflow(t('zero', '2026-09-04T10:00:00Z', 0, 'bank fee'))).toBe(false);
    expect(isInflow(null)).toBe(false);
  });

  it('counts a row written before there was a currency column, as the ledger always has', () => {
    expect(isInflow({ id: 'old', occurred_at: '2026-09-04T10:00:00Z', amount: 5, merchant_key: 'ana' })).toBe(true);
  });

  it('leaves out both legs of a move between the person\'s own accounts, once the ledger has told them apart', () => {
    const rows = [
      t('leaves', '2026-09-10T10:00:00Z', -300, 'stefano gebara ruiz', { channel: 'transfer', account_id: 'santander' }),
      t('arrives', '2026-09-11T10:00:00Z', 300, 'stefano gebara', { channel: 'transfer', account_id: 'revolut' }),
    ];
    const marked = markOwnTransfers(rows);
    expect(marked.map((r) => r.own_transfer === true)).toEqual([true, true]);
    expect(marked.filter(isInflow)).toEqual([]);
    expect(marked.filter(isMoneyOut)).toEqual([]);
    /* A row nobody marked is what it looks like: without both legs the ledger cannot tell. */
    expect(isInflow(rows[1])).toBe(true);
    expect(rows.every((r) => r.own_transfer === undefined)).toBe(true);
  });
});

describe('isMoneyOut: every euro that left, spending or not', () => {
  it('counts a Bizum to a flatmate, which is not spending, because it left all the same', () => {
    const facts = [{ kind: 'person', subject: 'marta ruiz', value: 'flatmate' }];
    const [bizum] = markCounted([t('b', '2026-09-05T18:00:00Z', -20, 'marta ruiz', { channel: 'bizum' })], facts);
    expect(isOutflow(bizum)).toBe(false);
    expect(isMoneyOut(bizum)).toBe(true);
  });
  it('leaves out another currency, a row marked not mine, and money coming in', () => {
    expect(isMoneyOut(t('usd', '2026-09-04T10:00:00Z', -10, 'aws', { currency: 'USD' }))).toBe(false);
    expect(isMoneyOut(t('nm', '2026-09-04T10:00:00Z', -10, 'lidl', { verdict: 'not_me' }))).toBe(false);
    expect(isMoneyOut(t('in', '2026-09-04T10:00:00Z', 10, 'ana'))).toBe(false);
    expect(isMoneyOut(undefined)).toBe(false);
  });
});

describe('ownTransferIds: only what the ledger can tell', () => {
  const leaves = (extra = {}) => t('o', '2026-09-10T10:00:00Z', -300, 'stefano gebara', { channel: 'transfer', account_id: 'a', ...extra });
  const arrives = (extra = {}) => t('i', '2026-09-11T10:00:00Z', 300, 'stefano gebara', { channel: 'transfer', account_id: 'b', ...extra });

  it('pairs the same amount leaving one account and reaching another, in the window, under the same name', () => {
    expect([...ownTransferIds([leaves(), arrives()])].sort()).toEqual(['i', 'o']);
    /* The bank's short form of the holder's name on one leg is still the holder. */
    expect(ownTransferIds([leaves({ merchant_key: 'stefano gebara ruiz' }), arrives({ merchant_key: 'stefano g.' })]).size).toBe(2);
  });

  it.each([
    ['on the same account', {}, { account_id: 'a' }],
    ['of a different amount', {}, { amount: 299.99 }],
    ['five days apart', {}, { occurred_at: '2026-09-15T12:00:00Z' }],
    ['paid by card (a top-up reads as a purchase)', { channel: 'card' }, {}],
    ['from somebody else: a father\'s 300 is not the rent the person paid', {}, { merchant_key: 'ruiz martin carlos' }],
    ['with no account on one leg', {}, { account_id: null }],
    ['in another currency', {}, { currency: 'USD' }],
    ['with one leg marked not mine', {}, { verdict: 'not_me' }],
    ['under a one-letter short form', { merchant_key: 's' }, { merchant_key: 's gebara' }],
  ])('does not pair two legs %s', (_why, o, i) => {
    expect(ownTransferIds([leaves(o), arrives(i)]).size).toBe(0);
  });

  it('pairs each leg once, the nearest first', () => {
    const rows = [leaves(), arrives({ id: 'far', occurred_at: '2026-09-13T10:00:00Z' }), arrives({ id: 'near', occurred_at: '2026-09-10T18:00:00Z' })];
    expect([...ownTransferIds(rows)].sort()).toEqual(['near', 'o']);
    expect(ownTransferIds([]).size).toBe(0);
    expect(ownTransferIds(undefined).size).toBe(0);
  });
});

describe('monthFlows: the month read from both sides', () => {
  const now = new Date('2026-09-20T12:00:00Z');
  const ledger = [
    t('salary', '2026-09-01T09:00:00Z', 1200, 'acme sl', { channel: 'transfer', merchant_raw: 'ACME SL' }),
    t('ana', '2026-09-03T20:00:00Z', 15, 'ana lopez', { channel: 'bizum', merchant_raw: 'Ana Lopez' }),
    t('refund', '2026-09-06T12:00:00Z', 39.95, 'zara', { merchant_raw: 'Zara' }),
    t('purchase', '2026-09-02T12:00:00Z', -39.95, 'zara', { merchant_raw: 'Zara' }),
    t('groceries', '2026-09-04T18:00:00Z', -60, 'mercadona'),
    t('flatmate', '2026-09-05T18:00:00Z', -20, 'marta ruiz', { channel: 'bizum' }),
    t('own-out', '2026-09-10T10:00:00Z', -300, 'stefano gebara', { channel: 'transfer', account_id: 'a' }),
    t('own-in', '2026-09-10T11:00:00Z', 300, 'stefano gebara', { channel: 'transfer', account_id: 'b' }),
    t('not-mine', '2026-09-07T10:00:00Z', 50, 'somebody', { channel: 'bizum', verdict: 'not_me' }),
    t('dollars', '2026-09-08T10:00:00Z', 100, 'vercel', { channel: 'transfer', currency: 'USD' }),
    /* 00:30 on the 1st in Madrid: September's, though UTC still says August. */
    t('past-midnight', '2026-08-31T22:30:00Z', 25, 'ana lopez', { channel: 'bizum', merchant_raw: 'Ana Lopez' }),
    t('dad', '2026-08-01T09:00:00Z', 1750, 'ruiz martin carlos', { channel: 'transfer', merchant_raw: 'Ruiz Martin Carlos' }),
    t('rent', '2026-08-15T12:00:00Z', -1600, 'landlord sl', { channel: 'transfer' }),
    /* A transfer dated after today has not come in yet. */
    t('scheduled', '2026-09-25T12:00:00Z', 500, 'acme sl', { channel: 'transfer' }),
  ];

  it('adds up this month: what came in, what went out, the difference, and who paid, largest first', () => {
    const f = monthFlows(ledger, { now });
    expect(f.month).toBe('2026-09-01');
    expect(f.money_in).toBe(1279.95);
    expect(f.money_out).toBe(119.95);
    expect(f.net).toBe(1160);
    expect(f.sources.map((s) => [s.key, s.name, s.amount, s.count])).toEqual([
      ['acme sl', 'ACME SL', 1200, 1],
      ['ana lopez', 'Ana Lopez', 40, 2],
      ['zara', 'Zara', 39.95, 1],
    ]);
    expect(f.sources[1].last_at).toBe('2026-09-03T20:00:00Z');
    expect(f.more_sources).toBe(0);
    expect(f.more_amount).toBe(0);
  });

  it('reads every month the ledger holds the same way, newest first', () => {
    const f = monthFlows(ledger, { now });
    expect(f.months.map((m) => [m.month, m.money_in, m.money_out, m.net])).toEqual([
      ['2026-09-01', 1279.95, 119.95, 1160],
      ['2026-08-01', 1750, 1600, 150],
    ]);
    expect(f.months[1].sources.map((s) => s.name)).toEqual(['Ruiz Martin Carlos']);
    expect(monthFlows(ledger, { now, months: 1 }).months).toHaveLength(1);
  });

  it('keeps the difference exact to the cent the figures show', () => {
    const f = monthFlows([t('a', '2026-09-02T10:00:00Z', 0.1, 'x', { channel: 'transfer' }), t('b', '2026-09-02T11:00:00Z', 0.2, 'y', { channel: 'transfer' }), t('c', '2026-09-03T10:00:00Z', -0.3, 'z')], { now });
    expect([f.money_in, f.money_out, f.net]).toEqual([0.3, 0.3, 0]);
  });

  it('names five payers at most and says how many more, and how much they sent together', () => {
    const many = [1, 2, 3, 4, 5, 6, 7].map((n) => t(`p${n}`, `2026-09-0${n}T10:00:00Z`, n * 10, `payer ${n}`, { channel: 'transfer' }));
    const f = monthFlows(many, { now });
    expect(FLOW_SOURCES).toBe(5);
    expect(f.sources.map((s) => s.key)).toEqual(['payer 7', 'payer 6', 'payer 5', 'payer 4', 'payer 3']);
    expect(f.more_sources).toBe(2);
    expect(f.more_amount).toBe(30);
    expect(f.money_in).toBe(280);
  });

  it('is silent about money in for a month with none: no payers, and the month still has its own figures', () => {
    const f = monthFlows([t('lidl', '2026-09-04T18:00:00Z', -45.5, 'lidl')], { now });
    expect(f).toMatchObject({ month: '2026-09-01', money_in: 0, money_out: 45.5, net: -45.5, sources: [], more_sources: 0 });
    expect(monthFlows([], { now })).toEqual({ month: '2026-09-01', money_in: 0, money_out: 0, net: 0, sources: [], more_sources: 0, more_amount: 0, months: [] });
    expect(monthFlows(undefined, { now }).months).toEqual([]);
  });

  it('hands the chat the month\'s money in rows, largest first, without the moves between own accounts', () => {
    expect(moneyInRows(ledger, { now }).map((r) => r.id)).toEqual(['salary', 'refund', 'past-midnight', 'ana']);
  });
});

describe('describeFlows: the lines the chat quotes', () => {
  const now = new Date('2026-09-20T12:00:00Z');
  it('says this month in and out, the difference and who paid, and each month side by side', () => {
    const rows = [
      t('dad', '2026-09-01T09:00:00Z', 1750, 'ruiz martin carlos', { channel: 'transfer', merchant_raw: 'Ruiz Martin Carlos' }),
      t('ana', '2026-09-03T20:00:00Z', 15.15, 'ana lopez', { channel: 'bizum', merchant_raw: 'Ana Lopez' }),
      t('rent', '2026-09-02T09:00:00Z', -600, 'landlord sl', { channel: 'transfer' }),
      t('aug-in', '2026-08-01T09:00:00Z', 1750, 'ruiz martin carlos', { channel: 'transfer', merchant_raw: 'Ruiz Martin Carlos' }),
      t('aug-out', '2026-08-02T09:00:00Z', -1800, 'landlord sl', { channel: 'transfer' }),
    ];
    expect(describeFlows(monthFlows(rows, { now }))).toEqual([
      'Money in this month (Sep): 1765,15 EUR came in and 600,00 EUR went out, so 1165,15 EUR more came in than went out. Went out is every payment and transfer that left, spending or not; a move between their own accounts is neither, and a refund from a shop is money in.',
      'Money in this month by who paid, largest first (payments): Ruiz Martin Carlos 1750,00 EUR (1); Ana Lopez 15,15 EUR (1).',
      'Money in and out per month, came in / went out: Aug 1750,00 EUR / 1800,00 EUR; Sep 1765,15 EUR / 600,00 EUR so far.',
    ]);
  });
  it('says more went out than came in when it did, and nothing came in when nothing did', () => {
    const out = describeFlows(monthFlows([t('a', '2026-09-02T09:00:00Z', 10, 'ana', { channel: 'bizum', merchant_raw: 'Ana' }), t('b', '2026-09-03T09:00:00Z', -30, 'lidl')], { now }));
    expect(out[0]).toMatch(/^Money in this month \(Sep\): 10,00 EUR came in and 30,00 EUR went out, so 20,00 EUR more went out than came in\./);
    expect(describeFlows(monthFlows([t('b', '2026-09-03T09:00:00Z', -30, 'lidl')], { now }))).toEqual(['Money in this month (Sep): nothing has come in yet; 30,00 EUR went out.']);
    expect(describeFlows(monthFlows([], { now }))).toEqual(['Money in this month (Sep): nothing has come in yet.']);
    expect(describeFlows(null)).toEqual([]);
  });
  it('names the rest of the payers as a count and a sum', () => {
    const many = [1, 2, 3, 4, 5, 6, 7].map((n) => t(`p${n}`, `2026-09-0${n}T10:00:00Z`, n * 10, `payer ${n}`, { channel: 'transfer' }));
    expect(describeFlows(monthFlows(many, { now }))[1]).toBe('Money in this month by who paid, largest first (payments): payer 7 70,00 EUR (1); payer 6 60,00 EUR (1); payer 5 50,00 EUR (1); payer 4 40,00 EUR (1); payer 3 30,00 EUR (1); and 2 more, 30,00 EUR together.');
  });
});

describe('incomeRule: money in, less what settles a split', () => {
  it('is the one rule for money in with the Bizums back for a confirmed split set aside', () => {
    const now = new Date('2026-09-14T12:00:00Z');
    const rows = [
      { id: 'dinner', occurred_at: '2026-09-10T21:00:00Z', amount: -60, merchant_key: 'la tasca', channel: 'card', currency: 'EUR' },
      { id: 'ana', occurred_at: '2026-09-11T09:00:00Z', amount: 15, merchant_key: 'ana', channel: 'bizum', currency: 'EUR' },
      { id: 'home', occurred_at: '2026-09-12T09:00:00Z', amount: 100, merchant_key: 'family', channel: 'transfer', currency: 'EUR' },
      { id: 'usd', occurred_at: '2026-09-12T10:00:00Z', amount: 40, merchant_key: 'vercel', channel: 'transfer', currency: 'USD' },
    ];
    const facts = [{ kind: 'split', subject: 'dinner', value: '4' }];
    expect(rows.filter(isInflow).map((r) => r.id)).toEqual(['ana', 'home']);
    expect(rows.filter(incomeRule(facts, rows, { now })).map((r) => r.id)).toEqual(['home']);
    expect(rows.filter(incomeRule([], rows, { now })).map((r) => r.id)).toEqual(['ana', 'home']);
  });
});
