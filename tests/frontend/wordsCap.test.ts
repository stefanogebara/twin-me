/** cap() capitalises a phrase's first letter and leaves an empty string unchanged. */
import { describe, expect, it } from 'vitest';
import { cap } from '../../src/pages/money/words';

describe('cap', () => {
  it('capitalises the first letter and leaves the rest', () => {
    expect(cap('every week')).toBe('Every week');
  });

  it('returns an empty string unchanged', () => {
    expect(cap('')).toBe('');
  });
});
