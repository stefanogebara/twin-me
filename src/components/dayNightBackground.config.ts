import { type SunPhase } from '@/hooks/useSunPosition';

export type RGB = [number, number, number];

export interface BgConfig {
  /** Photographic sky background for this sun phase. */
  src: string;
  /** Readability veil colour composited over the photo (source-over). */
  overlayColor: RGB;
  /** Veil alpha 0..1. Higher = darker (more legible) and more brand tint. */
  overlayOpacity: number;
  /** background-position for the photo layers. */
  position?: string;
}

// ─── Veil colours ───
//
// The stock daytime art (bg-morning.jpg, bg-noon.jpg) is a deep-blue midday
// sky. A plain black readability veil only darkens that blue toward *navy*,
// which (a) still degrades muted text sitting over glass and (b) breaks the
// design-system rule "background must be #13121a or the amber/copper gradient —
// NEVER navy blue" (see CLAUDE.md).
//
// A deep-umber warm veil at higher opacity fixes both: it pulls the blue back
// toward warm charcoal and turns the white clouds copper/tan (on-brand), while
// its low luminance (~35) keeps the composited sky+cloud regions as dark as the
// old black veil did — so muted text over glass stays at least as legible.
// A brighter copper veil was rejected: it neutralised the blue but *lightened*
// the bright cloud regions ~30% vs the shipped state, worsening text contrast.
//
// Warm / atmospheric phases (dawn, sunrise, sunset, dusk, night) are already
// on-brand or intentionally moody, so they keep a neutral black veil at low
// opacity to preserve their art untouched.
export const WARM_VEIL: RGB = [95, 50, 25]; // deep umber / copper
export const NEUTRAL_VEIL: RGB = [0, 0, 0];

export const BG_MAP: Record<SunPhase, BgConfig> = {
  night:     { src: '/backgrounds/bg-night.jpg',   overlayColor: NEUTRAL_VEIL, overlayOpacity: 0.15, position: 'top center' },
  dawn:      { src: '/backgrounds/bg-dawn.jpg',    overlayColor: NEUTRAL_VEIL, overlayOpacity: 0.22, position: 'center' },
  sunrise:   { src: '/backgrounds/bg-sunrise.jpg', overlayColor: NEUTRAL_VEIL, overlayOpacity: 0.38, position: 'top left' },
  morning:   { src: '/backgrounds/bg-morning.jpg', overlayColor: WARM_VEIL,    overlayOpacity: 0.74, position: 'top center' },
  noon:      { src: '/backgrounds/bg-noon.jpg',    overlayColor: WARM_VEIL,    overlayOpacity: 0.78, position: 'bottom center' },
  afternoon: { src: '/backgrounds/bg-noon.jpg',    overlayColor: WARM_VEIL,    overlayOpacity: 0.78, position: 'bottom center' },
  sunset:    { src: '/backgrounds/bg-sunset.jpg',  overlayColor: NEUTRAL_VEIL, overlayOpacity: 0.30, position: 'center' },
  dusk:      { src: '/backgrounds/bg-dusk.jpg',    overlayColor: NEUTRAL_VEIL, overlayOpacity: 0.22, position: 'bottom center' },
};

/** CSS rgba() string for the phase's readability veil. */
export function overlayRgba(cfg: BgConfig): string {
  const [r, g, b] = cfg.overlayColor;
  return `rgba(${r}, ${g}, ${b}, ${cfg.overlayOpacity})`;
}

/**
 * Alpha-composite the veil over a base sky colour (source-over) — the same
 * blend the browser performs when the overlay div sits on the photo. Used to
 * verify the composited daytime sky is no longer blue-dominant.
 */
export function blendOver(base: RGB, cfg: BgConfig): RGB {
  const a = cfg.overlayOpacity;
  const [br, bg, bb] = base;
  const [or, og, ob] = cfg.overlayColor;
  return [
    Math.round(or * a + br * (1 - a)),
    Math.round(og * a + bg * (1 - a)),
    Math.round(ob * a + bb * (1 - a)),
  ];
}
