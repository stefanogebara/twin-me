/** One orb per kind of work, and never the reading globe for a page on its way. */
import { describe, expect, it } from 'vitest';
import { ORB_FOR, orbFor } from '../../src/pages/money/orbFor';

describe('orbFor', () => {
  it('gives a page, the model and a bank read three different shapes', () => {
    expect(new Set([orbFor('page'), orbFor('thinking'), orbFor('bank'), orbFor('writing'), orbFor('trace')]).size).toBe(5);
    expect(orbFor('page')).toBe('breathing');
    expect(Object.keys(ORB_FOR).length).toBeGreaterThanOrEqual(8);
  });
});
