/** The return window on a receipt, one quiet line near its end. */
import { describe, expect, it } from 'vitest';
import { returnsClosingWords } from '../../src/pages/money/words';
const t = (s: string, h: Record<string, string | number> = {}) => s.replace(/\{(\w+)\}/g, (_, k) => String(h[k] ?? `{${k}}`));

describe('returnsClosingWords', () => {
  it('names one window with its day', () => {
    expect(returnsClosingWords(t, [{ merchant: 'zara', amount: 39.95, until: '2026-09-24', days_left: 3 }])).toMatch(/^The return window on Zara, 39,95\s?\u20ac, closes in 3 days\.$/);
    expect(returnsClosingWords(t, [{ merchant: 'zara', amount: 39.95, until: '2026-09-21', days_left: 0 }])).toMatch(/closes today\.$/);
    expect(returnsClosingWords(t, [{ merchant: 'zara', amount: 39.95, until: '2026-09-22', days_left: 1 }])).toMatch(/closes tomorrow\.$/);
  });
  it('joins two, and says nothing when nothing closes', () => {
    expect(returnsClosingWords(t, [{ merchant: 'zara', amount: 39.95, until: '2026-09-22', days_left: 1 }, { merchant: 'fnac', amount: 60, until: '2026-09-24', days_left: 3 }])).toBe('The return windows on Zara and Fnac close in 3 days.');
    expect(returnsClosingWords(t, [])).toBeNull();
    expect(returnsClosingWords(t, undefined)).toBeNull();
  });
});
