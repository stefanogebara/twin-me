/**
 * The colours the canvas figures draw with, read from the register at mount, never written
 * into the drawings. Canvas cannot resolve var(), so each is read once from the computed
 * style of the canvas's own element; the hex fallbacks are the register's values
 * (register.css: --rg-ink #251f21, --rg-ink-2 #585254, --rg-page #fbfaf9, --rg-ink-3 #6c6867, --rg-ember #c47833,
 * --rg-danger #c42533, and the five signatures) for a test or a browser that hides them.
 */
export type Rgb = [number, number, number];

const FALLBACK: Record<string, Rgb> = {
  ink: [37, 31, 33], ink2: [88, 82, 84], page: [251, 250, 249], quiet: [108, 104, 103], ember: [196, 120, 51], danger: [196, 37, 51],
  iris: [129, 121, 251], verdigris: [76, 151, 134], orchid: [186, 112, 182], periwinkle: [102, 140, 194], mark: [140, 136, 137],
};
const VAR: Record<string, string> = {
  ink: '--rg-ink', ink2: '--rg-ink-2', page: '--rg-page', quiet: '--rg-ink-3', ember: '--rg-ember', danger: '--rg-danger',
  iris: '--rg-iris', verdigris: '--rg-verdigris', orchid: '--rg-orchid', periwinkle: '--rg-periwinkle', mark: '--rg-mark',
};

function parse(value: string): Rgb | null {
  const s = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex) { const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1]; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  const rgb = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/i.exec(s);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

/** Every named colour, read from the element's computed style; the register's when unreadable. */
export function paletteOf(el: Element | null): Record<string, Rgb> {
  const out: Record<string, Rgb> = { ...FALLBACK };
  if (!el) return out;
  try {
    const cs = getComputedStyle(el);
    for (const [name, v] of Object.entries(VAR)) { const got = parse(cs.getPropertyValue(v)); if (got) out[name] = got; }
  } catch { /* the fallbacks stand */ }
  return out;
}

export const rgba = (c: Rgb, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
/** A colour between two, k from 0 (a) to 1 (b). */
export const lerp = (a: Rgb, b: Rgb, k: number): Rgb => [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
/** The signature a kind of place draws in (carvedKinds' grounds), or null for ink. */
export function signatureFor(category: string | null | undefined, grounds: Record<string, string>): string | null {
  const g = category ? grounds[category] : null;
  return g && g !== 'none' ? g : null;
}
