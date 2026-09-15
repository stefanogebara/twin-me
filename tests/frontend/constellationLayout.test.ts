/**
 * The Month constellation's layout: the dots add up to their kind, the same month draws the
 * same, nothing leaves the figure and nothing sits on top of anything else.
 */
import { describe, expect, it } from 'vitest';
import { layout, payeesOf } from '../../src/pages/money/figures/constellationLayout';
import type { MoneyCategoryGroup } from '../../src/services/api/moneyAPI';

const g = (category: string, spent: number, merchants: [string, number][], share: number): MoneyCategoryGroup => ({
  category, known: true, spent, lines: merchants.length, share, merchants: merchants.map(([name, s]) => ({ name, spent: s })),
});
/* The shape of a real September: twelve kinds, the endpoint's top four payees each. */
const MONTH: MoneyCategoryGroup[] = [
  g('transfers', 376, [['Maria', 200], ['Achref', 100], ['Sofia', 70], ['Frederico', 4]], 31),
  g('groceries', 333.38, [['El Corte Ingles', 251.38], ['Simply', 48.88], ['Eleven', 17.5], ['Exp', 15.62]], 28),
  g('taxi', 116.54, [['Cabify', 60], ['Uber', 30], ['Bolt', 8.04], ['FreeNow', 5]], 10),
  g('eating out', 98.88, [['Glovo', 40], ['Lic', 30], ['Bar', 20], ['Cafe', 3.08]], 8),
  g('transport', 77, [['Renfe', 40], ['EMT', 30], ['Mpass', 6], ['Bus', 1]], 6),
  g('not read yet', 57.52, [['M1qbwq9p', 40], ['AB', 17.52]], 5),
  g('software', 50.82, [['Fly', 18.63], ['Twilio', 11.01], ['Zadarma', 14], ['Render', 7.18]], 4),
  g('education', 30, [['IE', 30]], 2),
  g('other', 25.3, [['A', 10], ['B', 8], ['C', 5], ['D', 2.3]], 2),
  g('sport', 18, [['Gym', 12], ['Pool', 6]], 1),
  g('entertainment', 13.99, [['Cine', 8], ['Netflix', 5.99]], 1),
  g('advertising', 6.63, [['Facebook', 6.63]], 1),
];

describe('payeesOf', () => {
  it('folds whoever the endpoint did not name into one dot, so the dots add up to the kind', () => {
    const p = payeesOf(g('taxi', 116.54, [['Cabify', 60], ['Uber', 43.04]], 10));
    expect(p.at(-1)).toEqual({ name: 'Everyone else', spent: 13.5, rest: true });
    expect(p.reduce((s, m) => s + m.spent, 0)).toBeCloseTo(116.54, 2);
  });
  it('adds nothing when the named payees already make the whole', () => {
    expect(payeesOf(g('education', 30, [['IE', 30]], 2))).toHaveLength(1);
  });
});

describe('layout', () => {
  for (const [W, H] of [[820, 440], [354, 380]] as const) {
    it(`at ${W}px: the same month draws the same, inside the figure, with nothing on top of anything`, () => {
      const a = layout(MONTH, W, H), b = layout(MONTH, W, H);
      expect(a.map((n) => [n.x, n.y])).toEqual(b.map((n) => [n.x, n.y]));
      expect(a.filter((n) => n.hub)).toHaveLength(MONTH.length);
      for (const n of a) {
        expect(n.x - n.r).toBeGreaterThanOrEqual(0);
        expect(n.x + n.r).toBeLessThanOrEqual(W);
        expect(n.y - n.r).toBeGreaterThanOrEqual(0);
        expect(n.y + n.r).toBeLessThanOrEqual(H);
      }
      let overlaps = 0;
      for (let i = 0; i < a.length; i += 1) for (let j = i + 1; j < a.length; j += 1) {
        if (Math.hypot(a[i].x - a[j].x, a[i].y - a[j].y) < a[i].r + a[j].r) overlaps += 1;
      }
      expect(overlaps).toBe(0);
    });
  }
  it('puts the biggest kind nearest the middle', () => {
    const hubs = layout(MONTH, 820, 440).filter((n) => n.hub);
    const d = (n: (typeof hubs)[number]) => Math.hypot(n.x - 410, n.y - 214);
    expect(d(hubs[0])).toBeLessThan(d(hubs[hubs.length - 1]));
  });
});
