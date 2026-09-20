/** A row says who saw it, and whether the bank has booked it, in one phrase. */
import { describe, expect, it } from 'vitest';
import { seenWords } from '../../src/pages/money/words';
const t = (s: string) => s;

describe('seenWords', () => {
  it('names the sources and the booking', () => {
    expect(seenWords(t, ['bankfeed', 'phone'], true)).toBe('seen by the bank and your phone');
    expect(seenWords(t, ['bizum', 'statement'], true)).toBe('seen by the bank and your phone');
    expect(seenWords(t, ['bankfeed', 'gmail'], true)).toBe('seen by the bank and a receipt');
    expect(seenWords(t, ['bankfeed'], true)).toBe('bank only');
    expect(seenWords(t, ['phone'], false)).toBe('phone only, not booked yet');
    expect(seenWords(t, ['phone'], true)).toBe('phone, booked by the bank');
    expect(seenWords(t, ['gmail'], false)).toBe('receipt only, not booked yet');
    expect(seenWords(t, undefined, true)).toBe('');
  });
});
