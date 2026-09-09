/**
 * Cosmos, on the phone.
 * =====================
 * TwinMe is being rebuilt around one product, the money twin, and this is that product's
 * register carried onto the phone. It is the same contract as `src/styles/money-v2.css` on
 * the web, and where the two disagree the web is right: a person who opens the app after
 * using the site must not feel they have arrived somewhere else.
 *
 * The register: a paper canvas, ink that is nearly black, one card tone, hairlines instead
 * of shadows, generous rounding, a black pill for the one thing worth pressing. Display
 * type set tight with negative tracking. Monospace only for counters, dates and provenance,
 * so mono still means a machine wrote it.
 *
 * One honest deviation. The web sets Geist, which is not published for Expo; Inter is, it
 * is already installed here, and set tight it is the closest thing available. This is
 * recorded rather than hidden, because somebody will otherwise spend an afternoon wondering
 * why the phone looks a half-step off the site.
 *
 * No photograph, no gradient behind text. Glass is allowed in one role only: the floating
 * chrome (the capsule and the door) that content scrolls beneath, the way the system's own
 * bars are made. The money surface earns its calm by having almost nothing on it.
 */

export const cosmos = {
  color: {
    canvas: '#fbfaf8',
    ink: '#111111',
    ink2: '#55534f',
    ink3: '#8a8783',
    card: '#f2f0eb',
    white: '#ffffff',
    rule: 'rgba(17, 17, 17, 0.10)',
    ruleStrong: 'rgba(17, 17, 17, 0.20)',
    /* Money out is ink; money in is quieter, because an arrival is not an alarm. */
    inflow: '#55534f',
  },
  /* One scale, and nothing off it. The sizes are Apple's text styles (Large Title, Title 1,
     Title 2, Body, Subheadline, Caption 2) so the app sits on the same rhythm as the system
     around it; the line heights are Apple's too. Tracking stays Inter's, set tight. */
  size: {
    display: 34,
    title: 28,
    heading: 22,
    body: 17,
    small: 15,
    micro: 11,
  },
  line: {
    display: 41,
    title: 34,
    heading: 28,
    body: 22,
    small: 20,
    micro: 13,
  },
  tracking: {
    display: -0.8,
    title: -0.6,
    heading: -0.4,
    body: -0.2,
    mono: 0.6,
  },
  /* The 8-point grid. lg is the layout margin Apple uses on phones of this width. */
  space: { xs: 4, sm: 8, md: 16, lg: 20, xl: 32, xxl: 48 },
  /* The floating chrome: a glass capsule at the top, a glass door at the bottom. Content
     scrolls beneath both, so every scrolling screen leaves this much room at each end. */
  chrome: { capsule: 52, door: 76 },
  glass: {
    /* Enough paper in the wash that type on the glass stays fully legible, and an ink edge
       so the capsule reads as an object on paper, not as a smudge. */
    fill: 'rgba(251, 250, 248, 0.72)',
    edge: 'rgba(255, 255, 255, 0.9)',
    shade: 'rgba(17, 17, 17, 0.16)',
  },
  radius: { pill: 999, panel: 28, card: 20, field: 14 },
  font: {
    /* Inter, standing in for Geist. See the note at the top of this file. */
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    /* No monospace is installed, so counters use the platform's own, which is a real
       monospace on both and keeps digits in line. */
    mono: undefined as string | undefined,
  },
} as const;

/** A counter, a date, a piece of provenance. Never a sentence. */
export const monoStyle = {
  fontVariant: ['tabular-nums'] as const,
  letterSpacing: cosmos.tracking.mono,
  fontSize: cosmos.size.micro,
  textTransform: 'uppercase' as const,
  color: cosmos.color.ink3,
};

/** Euros, in the Spanish way, always two decimals so a column of them lines up. */
export function euro(n: number | string | null | undefined): string {
  const v = Math.abs(Number(n) || 0);
  return new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(v);
}

/** The 8th of September, not 08/09. */
export function dayMonth(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** The same, with the year, for a date that is not in the current one. */
export function dayMonthYear(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
