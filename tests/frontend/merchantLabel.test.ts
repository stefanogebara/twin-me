/** A line without a name is said as one, never as a place called Unknown. */
import { describe, expect, it } from 'vitest';
import { merchantLabel } from '../../src/pages/money/words';
const t = (s: string) => (s === 'A payment without a name' ? 'Um pagamento sem nome' : s);

describe('merchantLabel', () => {
  it('names a payment without a name in the reader\'s language, and keeps a real name', () => {
    expect(merchantLabel({ merchant_key: 'unknown' }, t)).toBe('Um pagamento sem nome');
    expect(merchantLabel({ merchant_key: 'unknown', merchant_raw: 'Unknown' }, t)).toBe('Um pagamento sem nome');
    expect(merchantLabel({ merchant_key: '' }, t)).toBe('Um pagamento sem nome');
    expect(merchantLabel({ merchant_key: 'zara', merchant_raw: 'ZARA' }, t)).toBe('Zara');
    expect(merchantLabel({ merchant_key: 'unknown' })).toBe('A payment without a name');
  });
});
