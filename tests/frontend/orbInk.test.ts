/** The orb reads its ink from the page; when it cannot, it falls back to the register's, never to black. */
import { describe, it, expect } from 'vitest';
import { parseColor, INK, PAGE } from '../../src/lib/orb/ink';

describe('parseColor', () => {
  it('reads the forms a computed style can hand back', () => {
    expect(parseColor('#251f21')).toEqual([37, 31, 33]);
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
    expect(parseColor('rgb(37, 31, 33)')).toEqual([37, 31, 33]);
    expect(parseColor('rgba(251, 250, 249, 0.5)')).toEqual([251, 250, 249]);
    expect(parseColor(' #fbfaf9 ')).toEqual([251, 250, 249]);
  });
  it('refuses what it cannot read, so the register stands in', () => {
    expect(parseColor('')).toBeNull();
    expect(parseColor('var(--ink)')).toBeNull();
    expect(parseColor('transparent')).toBeNull();
    expect(parseColor(undefined)).toBeNull();
    expect(INK).toEqual([37, 31, 33]);
    expect(PAGE).toEqual([251, 250, 249]);
  });
});
