import { expect, it, vi } from 'vitest';
vi.mock('../../../../api/services/database.js', () => ({ supabaseAdmin: {} }));
import { groupCards } from '../../../../api/services/money/instruments.js';

it('keeps identical suffixes separate across accounts and never guesses credit from an inflow', () => {
  const accounts = [{ id: 'A' }, { id: 'B' }];
  const rows = [
    { account_id: 'A', channel: 'card', card_last4: '1234', amount: 20 },
    { account_id: 'A', channel: 'card', card_last4: null, amount: -10 },
    { account_id: 'B', channel: 'card', card_last4: '1234', amount: -10 },
    { account_id: null, channel: 'card', card_last4: '9999', amount: -10 },
  ];
  const result = groupCards(accounts, rows, [{ kind: 'card_type', subject: 'A:1234', value: 'debit' }]);
  expect(result[0].cards).toEqual([{ last4: '1234', type: 'debit', source: 'user' }]);
  expect(result[1].cards).toEqual([{ last4: '1234', type: 'unknown', source: null }]);
  expect(result[0].unidentified_card_payments).toBe(1);
});
