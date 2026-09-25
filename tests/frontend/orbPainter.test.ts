/**
 * The orb is drawn exactly as the library draws it.
 *
 * thinking-orbs paints M = round((dark ? 1 - white : white) * 255) in neutral grey. Until
 * 2026-09-19 the vendored engine lerped the register's warm ink toward the page instead;
 * Stefano asked for the library's exact design, so the warm lerp is kept only for a
 * surface that declares its own ground (a photograph).
 */
import { describe, expect, it } from 'vitest';
import { inkAt, paintFrame } from '../../src/lib/orb/engine.js';

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

// Exercise the real painter, not just the colour helper. The package migration
// must preserve line-before-dot order and the photograph-specific ink ramp.
describe('the package-backed painter', () => {
  const frame = {
    lines: [{ x1: 0, y1: 1, x2: 2, y2: 3, w: 1, white: 0.5 }],
    dots: [{ x: 4, y: 5, z: 0, r: 2, white: 0, a: 0.5 }, { x: 6, y: 7, z: 1, r: 1, white: 1 }],
  };
  function canvas(theme?: 'light' | 'dark', ground?: { ink: number[]; page: number[] }) {
    const marks: string[] = [];
    const ctx = {
      __theme: theme, __orb: ground, fillStyle: '', strokeStyle: '', lineWidth: 0,
      beginPath() {}, moveTo() {}, lineTo() {}, arc() {},
      stroke() { marks.push(`line:${this.strokeStyle}`); },
      fill() { marks.push(`dot:${this.fillStyle}`); },
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, marks };
  }
  it('paints monochrome lines before dots on the light register', () => {
    const { ctx, marks } = canvas('light');
    paintFrame(ctx, frame, false);
    expect(marks).toEqual(['line:rgba(128,128,128,1)', 'dot:rgba(0,0,0,0.5)', 'dot:rgba(255,255,255,1)']);
  });
  it('honours the explicit dark substrate without double inversion', () => {
    const { ctx, marks } = canvas('dark');
    paintFrame(ctx, frame, false);
    expect(marks).toEqual(['line:rgba(128,128,128,1)', 'dot:rgba(255,255,255,0.5)', 'dot:rgba(0,0,0,1)']);
  });
  it('keeps the photograph ground for both lines and dots', () => {
    const { ctx, marks } = canvas('light', { ink: [37, 31, 33], page: [9, 17, 27] });
    paintFrame(ctx, frame, false);
    expect(marks).toEqual(['line:rgba(23,24,30,1)', 'dot:rgba(37,31,33,0.5)', 'dot:rgba(9,17,27,1)']);
  });
});
