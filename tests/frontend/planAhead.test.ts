/** The days ahead on Plan: every coming day's items, soonest first, never today or the past. */
import { describe, expect, it } from 'vitest';
import { daysAhead } from '../../src/pages/money/planAhead';

const cell = (day: string, past: boolean, today: boolean, items: { kind: 'charge' | 'commitment' | 'income' | 'calendar'; label: string; amount: number }[]) => ({ day, dom: Number(day.slice(8)), weekday: 1, past, today, spent: 0, count: 0, received: 0, said: null, hit: null, expected: 0, items, rows: [], note: null });

describe('daysAhead', () => {
  it('lists the coming days\' items in date order and skips today and the past', () => {
    const cells = [
      cell('2026-09-20', true, false, [{ kind: 'charge', label: 'Old', amount: 5 }]),
      cell('2026-09-21', false, true, [{ kind: 'calendar', label: 'Today thing', amount: 0 }]),
      cell('2026-09-28', false, false, [{ kind: 'calendar', label: 'alvaro psicologo', amount: 73.31 }]),
      cell('2026-09-22', false, false, [{ kind: 'charge', label: 'Higgsfield', amount: 53.96 }, { kind: 'calendar', label: 'R Homework', amount: 0 }]),
    ];
    expect(daysAhead(cells).map((r) => `${r.day.slice(8)} ${r.item.label}`)).toEqual(['22 Higgsfield', '22 R Homework', '28 alvaro psicologo']);
    expect(daysAhead(cells, 1)).toHaveLength(1);
    expect(daysAhead([])).toEqual([]);
  });
});
