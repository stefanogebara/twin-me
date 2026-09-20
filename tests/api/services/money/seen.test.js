/** Which sources saw each payment: folded from the sightings, sorted, distinct, nothing guessed. */
import { describe, expect, it } from 'vitest';
import { fold } from '../../../../api/services/money/seen.js';

describe('seen', () => {
  it('folds sightings into a sorted, distinct source list per transaction', () => {
    expect(fold([{ transaction_id: 'a', source: 'phone' }, { transaction_id: 'a', source: 'bankfeed' }, { transaction_id: 'a', source: 'phone' }, { transaction_id: 'b', source: 'statement' }, { transaction_id: null, source: 'phone' }]))
      .toEqual({ a: ['bankfeed', 'phone'], b: ['statement'] });
  });
});
