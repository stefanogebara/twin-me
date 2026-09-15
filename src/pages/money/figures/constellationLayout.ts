/**
 * Where the constellation's hubs and dots sit. Pure, so it is tested without a canvas.
 *
 * Hubs go on a golden-angle spiral with the biggest kind nearest the middle; each payee
 * sits around its hub; then everything is pushed apart until nothing touches and pulled
 * back towards its place, inside the figure. Deterministic: the same month draws the same.
 */
import type { MoneyCategoryGroup } from '../../../services/api/moneyAPI';

export type Payee = { name: string; merchant_key?: string; spent: number; rest?: boolean };
export type StarNode = {
  hub: boolean; g: MoneyCategoryGroup; m: Payee | null; parent: StarNode | null;
  r: number; x: number; y: number; tx: number; ty: number; ox: number; oy: number; rank: number;
};

const GOLDEN = 2.39996;

/** A kind's payees as the categories endpoint names them (its top few), and everyone else
 *  it paid folded into one, so the dots always add up to the kind. Pure. */
export function payeesOf(g: MoneyCategoryGroup): Payee[] {
  const list: Payee[] = g.merchants.map((m) => ({ ...m }));
  const rest = Math.round((g.spent - list.reduce((s, m) => s + m.spent, 0)) * 100) / 100;
  if (rest > 0.5) list.push({ name: 'Everyone else', spent: rest, rest: true });
  return list;
}

/** Where every hub and dot sits: hubs on a golden-angle spiral, the biggest nearest the
 *  middle; payees around their hub; then everything pushed apart until nothing touches
 *  and pulled back towards its place. Deterministic, so the same month draws the same. */
export function layout(groups: MoneyCategoryGroup[], W: number, H: number): StarNode[] {
  const cx = W / 2, cy = H / 2 - 6, k = Math.max(0.7, Math.min(1, W / 820));
  const gs = groups.filter((g) => g.spent > 0).sort((a, b) => b.spent - a.spent);
  const maxG = Math.max(1, ...gs.map((g) => g.spent));
  const maxM = Math.max(1, ...gs.flatMap((g) => payeesOf(g).map((m) => m.spent)));
  const nodes: StarNode[] = [];
  gs.forEach((g, i) => {
    const a = i * GOLDEN - Math.PI / 2, rf = Math.sqrt((i + 0.5) / gs.length);
    const tx = cx + Math.cos(a) * rf * (W / 2 - 70 * k), ty = cy + Math.sin(a) * rf * (H / 2 - 50);
    const hub: StarNode = { hub: true, g, m: null, parent: null, r: (4 + Math.sqrt(g.spent / maxG) * 13) * k, x: tx, y: ty, tx, ty, ox: 0, oy: 0, rank: i };
    nodes.push(hub);
    payeesOf(g).forEach((m, j) => {
      const b = a + (j + 1) * GOLDEN, d = hub.r + (12 + 13 * Math.sqrt(j + 1)) * k, ox = Math.cos(b) * d, oy = Math.sin(b) * d;
      nodes.push({ hub: false, g, m, parent: hub, r: (2 + Math.sqrt(m.spent / maxM) * 9) * k, x: tx + ox, y: ty + oy, tx: tx + ox, ty: ty + oy, ox, oy, rank: i + 0.5 });
    });
  });
  for (let it = 0; it < 140; it += 1) {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i], b = nodes[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
        const min = a.r + b.r + (a.hub || b.hub ? 18 : 5);
        if (d < min) { const push = (min - d) / 2, ux = dx / d, uy = dy / d; a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push; }
      }
    }
    for (const n of nodes) {
      const tx = n.parent ? n.parent.x + n.ox : n.tx, ty = n.parent ? n.parent.y + n.oy : n.ty;
      n.x += (tx - n.x) * 0.05; n.y += (ty - n.y) * 0.05;
      n.x = Math.min(W - n.r - 8, Math.max(n.r + 8, n.x)); n.y = Math.min(H - n.r - 24, Math.max(n.r + 8, n.y));
    }
  }
  return nodes;
}
