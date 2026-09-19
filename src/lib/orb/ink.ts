/**
 * The orb's ink, read from the page rather than written in code.
 *
 * Canvas cannot resolve var(), so the component reads the computed `color` of its own
 * canvas (which the stylesheet sets to the register's ink) and the page ground from the
 * `--page` custom property, and hands both to the engine as RGB triplets. If either cannot
 * be read (a test, a browser that hides computed custom properties), the register's own
 * values stand in, so the orb is never drawn in a colour the page does not have.
 */
export type Rgb = [number, number, number];

/** The register's ink #251f21 and page #fbfaf9, as the fallback only. */
export const INK: Rgb = [37, 31, 33];
export const PAGE: Rgb = [251, 250, 249];

/** "#rgb", "#rrggbb", "rgb(r, g, b)" or "rgba(r, g, b, a)" to a triplet; null for anything else. Pure. */
export function parseColor(value: string | null | undefined): Rgb | null {
  const s = String(value || '').trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/i.exec(s);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])].map((n) => Math.min(255, n)) as Rgb;
  return null;
}

/** The ink and page for an element, from its computed style; the register's when unreadable. */
export function inkOf(el: Element): { ink: Rgb; page: Rgb } {
  try {
    const cs = getComputedStyle(el);
    return {
      ink: parseColor(cs.color) || INK,
      /* On a photograph the ground is not the page: a surface may name its own with --orb-ground. */
      page: parseColor(cs.getPropertyValue('--orb-ground')) || parseColor(cs.getPropertyValue('--page')) || parseColor(cs.getPropertyValue('--rg-page')) || PAGE,
    };
  } catch {
    return { ink: INK, page: PAGE };
  }
}

/**
 * A ground a surface declared for itself with --orb-ground (a photograph, where dots fading
 * to white would look wrong). Null on the page, where the library's own grey is the design.
 */
export function groundOf(el: Element): { ink: Rgb; page: Rgb } | null {
  try {
    const cs = getComputedStyle(el);
    const page = parseColor(cs.getPropertyValue('--orb-ground'));
    if (!page) return null;
    return { ink: parseColor(cs.color) || INK, page };
  } catch {
    return null;
  }
}
