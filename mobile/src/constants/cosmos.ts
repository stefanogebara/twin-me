/**
 * The register, on the phone.
 * ===========================
 * TwinMe is one product now, the money twin, and this is its register. The values are not
 * invented: they were measured out of app.instinct.co, whose calm Stefano chose as the
 * target, by reading their stylesheet and their font binaries rather than guessing from a
 * screenshot. Where a number here looks oddly specific, that is why.
 *
 * The register in one paragraph. A white page. One ink, nearly black, and every quieter
 * voice is that same ink at less opacity rather than a second grey, which is what keeps a
 * screen from drifting into four kinds of grey. Hairlines instead of shadows. Cards are
 * white with a hairline around them and hairlines between their rows. Weight 500 is the
 * ceiling: there is no bold in this app, so emphasis has to come from size and space.
 *
 * Two honest deviations, recorded rather than hidden. Their interface face is GT America,
 * which is licensed; the web uses Geist, its closest free relative; and Geist is not
 * published for Expo, so the phone sets Inter, which is a half-step wider. And their
 * display face, Season Mix, is not used here at all: Stefano looked at a serif prototype
 * and asked for it gone, so figures and headings are the same sans as everything else.
 *
 * No photograph, no gradient behind text, no colour of any kind. Glass is allowed in one
 * role only: the floating chrome, the capsule and the door, that content scrolls beneath
 * the way the system's own bars work.
 */

export const cosmos = {
  color: {
    /* The page. Instinct's ground is white, and their warm off-whites are for panels. */
    canvas: '#ffffff',
    /* A panel: a figure's ground, a recessed area. */
    panel: '#faf9f7',
    /* Deeper still, for the unfilled part of a track behind a bar. */
    panelDeep: '#f6f5f3',
    ink: '#101113',
    /* Secondary text, and quiet text: the same ink, further back. Never a new grey. */
    ink2: 'rgba(16, 17, 19, 0.6)',
    ink3: 'rgba(16, 17, 19, 0.38)',
    white: '#ffffff',
    rule: '#e5e7eb',
    /* Only where a hairline has to hold an edge on its own: a field, a ghost button. */
    ruleStrong: 'rgba(16, 17, 19, 0.2)',
    /* A press is the ink laid over what is beneath, never a tint. */
    press: 'rgba(16, 17, 19, 0.1)',
    hover: 'rgba(16, 17, 19, 0.05)',
    /* Money out is ink; money in is quieter, because an arrival is not an alarm. */
    inflow: 'rgba(16, 17, 19, 0.6)',
  },
  /* One ramp. The four smaller sizes are Instinct's, measured off their pages: body 16 on
     24, secondary 15, fine print 14, all tracked at -0.011em. The two figures above them
     are ours, because they show money and nothing on their site does. */
  size: {
    display: 40,
    title: 34,
    heading: 22,
    label: 15,
    body: 16,
    small: 15,
    micro: 14,
  },
  line: {
    display: 44,
    title: 38,
    heading: 28,
    label: 22,
    body: 24,
    small: 24,
    micro: 23,
  },
  /* Tracking is in points here, not ems: -0.011em of body, -0.022em of a heading. */
  tracking: {
    display: -0.9,
    title: -0.75,
    heading: -0.48,
    label: -0.17,
    body: -0.18,
    small: -0.17,
    micro: -0.15,
  },
  /* md is the air inside a card, lg the page margin, xl the drop under a section label,
     xxl the gap between one section and the next. */
  space: { xs: 4, sm: 8, md: 14, lg: 20, xl: 24, xxl: 40 },
  /* The floating chrome: a glass capsule at the top, a glass door at the bottom. Content
     scrolls beneath both, and comes to rest clear of them, so every scrolling screen leaves
     this much room at each end. */
  chrome: { capsule: 52, door: 96 },
  glass: {
    /* Enough white in the wash that type on the glass stays legible over a moving list. */
    fill: 'rgba(255, 255, 255, 0.72)',
    edge: '#e5e7eb',
  },
  radius: { pill: 999, card: 16, button: 12, field: 4 },
  font: {
    /* Inter, standing in for Geist. See the note at the top of this file. There is no
       semibold on purpose: weight 500 is the ceiling, and a token nobody can reach for is
       a rule that cannot be broken by accident. */
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
  },
} as const;

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

/** March 2027: a consent's end, where the day would be noise. */
export function monthYear(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
