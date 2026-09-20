/** The chat's week figure: one bar per day for the last seven, from the same windows the context quotes. */
import { describe, expect, it } from 'vitest';
import { assemble, buildFigure, FIGURE_KINDS } from '../../../../api/services/money/chat.js';

const now = new Date('2026-09-19T08:00:00Z');
const tx = (id, iso, amount) => ({ id, occurred_at: iso, amount, currency: 'EUR', merchant_raw: id, merchant_key: id });

describe('the week figure', () => {
  it('is a known kind and draws the last seven days, today marked', () => {
    expect(FIGURE_KINDS).toContain('week');
    const ctx = assemble({ transactions: [tx('a', '2026-09-19T06:30:00Z', -2.5), tx('b', '2026-09-15T16:00:00Z', -48.2)], now, language: 'en' });
    const built = buildFigure({ kind: 'week' }, ctx);
    expect(built.figure.kind).toBe('week');
    expect(built.figure.days).toHaveLength(7);
    expect(built.figure.days.at(-1)).toMatchObject({ value: 2.5, today: true });
    expect(built.figure.days[2].value).toBe(48.2);
    expect(built.figure.days.filter((d) => d.today)).toHaveLength(1);
  });
  it('draws nothing for an empty week', () => {
    expect(buildFigure({ kind: 'week' }, assemble({ transactions: [], now, language: 'en' }))).toBeNull();
  });
});
