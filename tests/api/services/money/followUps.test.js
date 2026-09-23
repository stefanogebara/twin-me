/**
 * The questions that follow what a person already said.
 *
 * Two numbers on the screen are wrong without them (2026-09-16): an income with no day
 * leaves today's money spread to the end of the month rather than to the day it arrives,
 * and a savings account nobody has ruled out is counted as money to spend today. Rent is
 * the third, and it is asked only once the ledger has looked for it and found nothing,
 * because a charge that size usually announces itself.
 */
import { describe, it, expect } from 'vitest';
import { followUpQuestions, STANDING_AFTER_DAYS } from '../../../../api/_app/services/money/context.js';

const account = (id, over = {}) => ({ id, bank_name: 'Santander', iban_mask: `ES** **** 12${id}`, ...over });

describe('an income with no day', () => {
  it('asks for the day, by name, and only for the ones missing it', () => {
    const asked = followUpQuestions({ facts: [
      { id: 'f1', kind: 'income', subject: 'family', subject_label: 'Family', amount: 900 },
      { id: 'f2', kind: 'income', subject: 'beca', amount: 400, day: 3 },
      { id: 'f3', kind: 'income', subject: 'nothing', amount: 0 },
    ] });
    expect(asked.map((q) => q.id)).toEqual(['income_day:family']);
    expect(asked[0].ask).toBe('Around which day of the month does Family arrive?');
    expect(asked[0].kind).toBe('income');
    expect(asked[0].subject).toBe('family');
  });
});

describe('more than one account', () => {
  it('asks which ones the person spends from, once each', () => {
    const asked = followUpQuestions({ accounts: [account('a1'), account('a2', { bank_name: 'Revolut' })] });
    expect(asked.map((q) => q.id)).toEqual(['spend_account:a1', 'spend_account:a2']);
    expect(asked[0].input).toBe('choice:yes,no');
    expect(asked[1].ask).toContain('Revolut');
  });

  it('says nothing with one account, or once an account has been answered', () => {
    expect(followUpQuestions({ accounts: [account('a1')] })).toEqual([]);
    const asked = followUpQuestions({
      accounts: [account('a1'), account('a2')],
      facts: [{ kind: 'spend_account', subject: 'a1', value: 'yes' }],
    });
    expect(asked.map((q) => q.id)).toEqual(['spend_account:a2']);
  });
});

describe('a standing charge the ledger never saw', () => {
  it('waits two months, and asks only when nothing that size repeats', () => {
    const none = followUpQuestions({ daysOfLedger: STANDING_AFTER_DAYS, standingCharge: false });
    expect(none.map((q) => q.id)).toEqual(['commitment:none-seen']);
    expect(none[0].input).toBe('list:what,amount,day');

    expect(followUpQuestions({ daysOfLedger: 30, standingCharge: false })).toEqual([]);
    expect(followUpQuestions({ daysOfLedger: 90, standingCharge: true })).toEqual([]);
    expect(followUpQuestions({ daysOfLedger: 90, standingCharge: false, facts: [{ kind: 'commitment', subject: 'rent', amount: 600 }] })).toEqual([]);
  });
});
