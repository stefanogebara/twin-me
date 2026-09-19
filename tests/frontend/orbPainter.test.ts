/**
 * The orb is drawn exactly as the library draws it.
 *
 * thinking-orbs paints M = round((dark ? 1 - white : white) * 255) in neutral grey. Until
 * 2026-09-19 the vendored engine lerped the register's warm ink toward the page instead;
 * Stefano asked for the library's exact design, so the warm lerp is kept only for a
 * surface that declares its own ground (a photograph).
 */
import { describe, expect, it } from 'vitest';
import { inkAt } from '../../src/lib/orb/engine.js';

describe('the orb painter', () => {
  it('paints the library grey on a light page', () => {
    expect(inkAt({}, 0, 1)).toBe('rgba(0,0,0,1)');
    expect(inkAt({}, 40, 0.5)).toBe('rgba(40,40,40,0.5)');
    expect(inkAt({ __theme: 'light' }, 200, 1)).toBe('rgba(200,200,200,1)');
  });
  it('inverts on a dark substrate, as the library does', () => {
    expect(inkAt({ __theme: 'dark' }, 40, 1)).toBe('rgba(215,215,215,1)');
    expect(inkAt({ __theme: 'dark' }, 0, 1)).toBe('rgba(255,255,255,1)');
  });
  it('fades toward a declared ground, and only then', () => {
    const photo = { __orb: { ink: [37, 31, 33], page: [9, 17, 27] } };
    expect(inkAt(photo, 0, 1)).toBe('rgba(37,31,33,1)');
    expect(inkAt(photo, 255, 1)).toBe('rgba(9,17,27,1)');
  });
});
