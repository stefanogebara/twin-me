/** ordinalDay() writes a day number with its English suffix: 1st, 2nd, 3rd, 4th, with the 11th-13th exception. */
import { describe, expect, it } from 'vitest';
import { ordinalDay, type T } from '../../src/pages/money/words';

const t: T = (s, holes) => s.replace(/\{(\w+)\}/g, (_, k) => String(holes?.[k] ?? k));

describe('ordinalDay', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [23, '23rd'],
    [30, '30th'],
    [31, '31st'],
  ])('writes %i as %s', (n, expected) => {
    expect(ordinalDay(t, n)).toBe(expected);
  });
});
