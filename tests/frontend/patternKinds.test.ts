/** You shows the patterns that would change what a person does, and not the ones that would not. */
import { describe, expect, it } from 'vitest';
import { worthShowing, PATTERN_KINDS_SHOWN } from '../../src/pages/money/patternKinds';

describe('the patterns You shows', () => {
  it('keeps a weekday habit, an outlier, where the card is used and a rhythm; drops pairing, price point and month shape', () => {
    expect([...PATTERN_KINDS_SHOWN]).toEqual(['weekday_habit', 'amount_outlier', 'place_habit', 'category_rhythm']);
    for (const k of ['pairing', 'price_point', 'month_shape']) expect(worthShowing(k)).toBe(false);
    expect(worthShowing('weekday_habit')).toBe(true);
  });
});
