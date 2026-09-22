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
    /* "R Homework" costs nothing, so it is not on a list about money (2026-09-22). */
    expect(daysAhead(cells).map((r) => `${r.day.slice(8)} ${r.item.label}`)).toEqual(['22 Higgsfield', '28 alvaro psicologo']);
    expect(daysAhead(cells, 1)).toHaveLength(1);
    expect(daysAhead([])).toEqual([]);
  });
});

describe('a day in the diary that costs nothing', () => {
  it('is not on the money list, however many of them there are', () => {
    /* A real term put twenty-two of these on the page, none with a figure (2026-09-22). */
    const classes = ['STRATEGIES FOR COMPETING IN INDUSTRIES AND MARKETS (Ses. 8) Live in-person', 'HUMAN CAPITAL MANAGEMENT (Ses. 5) Asynchronous', 'IE-CHALLENGE (Ses. 6-7) Live in-person']
      .map((label) => ({ kind: 'calendar' as const, label, amount: 0 }));
    const cells = [
      cell('2026-09-28', false, false, [...classes, { kind: 'charge' as const, label: 'Elevenlabs.io', amount: 23.45 }]),
      cell('2026-09-29', false, false, classes),
    ];
    const rows = daysAhead(cells);
    expect(rows).toHaveLength(1);
    expect(rows[0].item.label).toBe('Elevenlabs.io');
  });

  it('keeps a day in the diary that does carry a figure', () => {
    const cells = [cell('2026-09-28', false, false, [{ kind: 'calendar' as const, label: 'Álvaro psicólogo', amount: 17.47 }])];
    expect(daysAhead(cells)).toHaveLength(1);
  });
});
