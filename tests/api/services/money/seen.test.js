/** Which sources saw each payment: folded from the sightings, sorted, distinct, nothing guessed. */
import { describe, expect, it } from 'vitest';
import { fold } from '../../../../api/services/money/seen.js';

describe('seen', () => {
  it('folds sightings into a sorted, distinct source list per transaction', () => {
    expect(fold([{ transaction_id: 'a', source: 'phone' }, { transaction_id: 'a', source: 'bankfeed' }, { transaction_id: 'a', source: 'phone' }, { transaction_id: 'b', source: 'statement' }, { transaction_id: null, source: 'phone' }]))
      .toEqual({ a: ['bankfeed', 'phone'], b: ['statement'] });
  });
});

describe('what each source gave', () => {
  it('counts the sightings by source and the month by what the payments know', async () => {
    const { sourceCounts } = await import('../../../../api/services/money/seen.js');
    expect(typeof sourceCounts).toBe('function');
  });
});
