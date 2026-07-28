import { describe, it, expect } from 'vitest';
import { goalProgressPercent } from '../../src/lib/goalProgress';

describe('goalProgressPercent', () => {
  describe('higher-is-better goals (>=, >, =)', () => {
    it('is partial when current is below target', () => {
      expect(goalProgressPercent(3, 10, '>=')).toBe(30);
    });

    it('caps at 100% when current meets target', () => {
      expect(goalProgressPercent(10, 10, '>=')).toBe(100);
    });

    it('caps at 100% when current exceeds target', () => {
      expect(goalProgressPercent(15, 10, '>=')).toBe(100);
    });

    it('defaults to >= behavior when no operator given', () => {
      expect(goalProgressPercent(5, 10)).toBe(50);
    });

    it('treats > and = like >=', () => {
      expect(goalProgressPercent(5, 10, '>')).toBe(50);
      expect(goalProgressPercent(10, 10, '=')).toBe(100);
    });
  });

  describe('lower-is-better goals (<=, <) — caps', () => {
    it('reads as fully on-track when under the cap', () => {
      // 2 meetings against a cap of 5 → within cap → 100%
      expect(goalProgressPercent(2, 5, '<=')).toBe(100);
    });

    it('reads as on-track exactly at the cap', () => {
      expect(goalProgressPercent(5, 5, '<=')).toBe(100);
    });

    it('drops below 100% when over the cap', () => {
      // double the cap → 50%
      expect(goalProgressPercent(10, 5, '<=')).toBe(50);
    });

    it('applies the same logic for strict <', () => {
      expect(goalProgressPercent(8, 4, '<')).toBe(50);
    });

    it('returns 100% for a zero/negative cap rather than dividing by zero', () => {
      expect(goalProgressPercent(3, 0, '<=')).toBe(100);
    });
  });

  it('never returns above 100 or NaN', () => {
    for (const op of ['>=', '<=', '>', '<', '='] as const) {
      const pct = goalProgressPercent(0, 0, op);
      expect(Number.isFinite(pct)).toBe(true);
      expect(pct).toBeLessThanOrEqual(100);
    }
  });
});
