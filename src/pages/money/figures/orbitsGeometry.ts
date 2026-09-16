/**
 * The Month orbits: which ring a payment sits on, and where on the ring.
 *
 * Pure, so it is tested without a canvas. A ring is a kind of place, the biggest kind
 * outermost; the month runs clockwise around it, and today sits at the front, nearest the
 * viewer, because that is the day a person is actually in. A payment's angle is the hour it
 * left, so a day's payments spread rather than stack.
 */
import type { MoneyCategoryGroup } from '../../../services/api/moneyAPI';

export type Kind = { key: string; name: string; spent: number; lines: number };
export type Ring = { kind: Kind; R: number };

/** The kinds of place, the small ones folded into one, biggest first. */
export function kindsOf(groups: MoneyCategoryGroup[]): Kind[] {
  const live = groups.filter((g) => g.spent > 0);
  const big = live.filter((g) => g.share >= 5);
  const small = live.filter((g) => g.share < 5);
  const kinds: Kind[] = big.map((g) => ({ key: g.category, name: g.category, spent: g.spent, lines: g.lines }));
  if (small.length) {
    kinds.push({ key: 'rest', name: 'The rest', spent: small.reduce((s, g) => s + g.spent, 0), lines: small.reduce((s, g) => s + g.lines, 0) });
  }
  return kinds.sort((a, b) => b.spent - a.spent);
}

/** Which ring a category lands on: its own when it has one, else the ring of the rest. */
export function keyFor(category: string | null | undefined, kinds: Kind[]): string {
  if (category && kinds.some((k) => k.key === category)) return category;
  return kinds.some((k) => k.key === 'rest') ? 'rest' : (kinds[0] ? kinds[0].key : 'rest');
}

/**
 * Which kind of place a shop belongs to, by the name the month's own summary gives it. A
 * ledger row usually carries no category of its own (the summary is what knows the places),
 * so without this every payment landed on the ring of the rest and a ring opened an empty
 * list (2026-09-16).
 */
export function kindsByMerchant(groups: MoneyCategoryGroup[]): Map<string, string> {
  const by = new Map<string, string>();
  for (const g of groups) {
    for (const m of g.merchants) {
      if (m.merchant_key) by.set(m.merchant_key.toLowerCase(), g.category);
      if (m.name) by.set(m.name.toLowerCase(), g.category);
    }
  }
  return by;
}

/** The ring a ledger row belongs on: its own category, else its shop's, else the rest. */
export function ringKeyOf(row: { category?: string | null; merchant_key?: string | null; merchant_name?: string | null; merchant_raw?: string | null }, kinds: Kind[], byMerchant: Map<string, string>): string {
  const named = row.category
    || byMerchant.get((row.merchant_key || '').toLowerCase())
    || byMerchant.get((row.merchant_name || '').toLowerCase())
    || byMerchant.get((row.merchant_raw || '').toLowerCase())
    || null;
  return keyFor(named, kinds);
}

/** The rings, biggest kind outermost, evenly spaced between the middle and the edge. */
export function ringsOf(kinds: Kind[], rMax: number, rInner: number): Ring[] {
  const step = kinds.length > 1 ? (rMax - rInner) / (kinds.length - 1) : 0;
  return kinds.map((kind, i) => ({ kind, R: rMax - i * step }));
}

/**
 * Where a day sits on its ring. Today is at the bottom of the ellipse, the point nearest the
 * viewer; the month runs clockwise from there, so the days just gone are to the right and the
 * days still to come are to the left, and the month's two ends meet at the back.
 */
export function angleOf(day: number, today: number, daysInMonth: number): number {
  return Math.PI / 2 + ((day - today) / daysInMonth) * Math.PI * 2;
}

/** A mark's radius: the amount, softened by a square root, and smaller at the back. */
export function markRadius(amount: number, maxAmount: number, depth: number): number {
  const size = 2 + Math.sqrt(Math.max(0, amount) / Math.max(1, maxAmount)) * 8;
  return size * (0.72 + 0.28 * (1 - depth));
}
