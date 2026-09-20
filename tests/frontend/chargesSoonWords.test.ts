/** The charge before it lands, said once and honestly: it is already off today's number. */
import { describe, expect, it } from 'vitest';
import { chargesSoonWords } from '../../src/pages/money/words';
const t = (s: string, h: Record<string, string | number> = {}) => s.replace(/\{(\w+)\}/g, (_, k) => String(h[k] ?? `{${k}}`));

describe('chargesSoonWords', () => {
  it('names one charge with its day', () => {
    expect(chargesSoonWords(t, [{ name: 'spotify', amount: 9.99, when: 'tomorrow' }])).toMatch(/^Spotify lands tomorrow, 9,99\s?€, already off today's number\.$/);
  });
  it('joins two, sums them, and says today and tomorrow when they differ', () => {
    const line = chargesSoonWords(t, [{ name: 'gym', amount: 30, when: 'today' }, { name: 'Spotify', amount: 9.99, when: 'tomorrow' }]);
    expect(line).toMatch(/^Gym and Spotify land today and tomorrow, 39,99\s?€ together/);
  });
  it('says nothing when nothing lands', () => {
    expect(chargesSoonWords(t, [])).toBeNull();
    expect(chargesSoonWords(t, undefined)).toBeNull();
  });
});
