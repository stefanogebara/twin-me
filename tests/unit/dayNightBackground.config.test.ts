import { describe, it, expect } from 'vitest';
import {
  BG_MAP,
  WARM_VEIL,
  NEUTRAL_VEIL,
  overlayRgba,
  blendOver,
  type RGB,
} from '../../src/components/dayNightBackground.config';

// Representative deep-blue sky sampled from bg-noon.jpg (the noon/afternoon
// photo the 2026-07-03 audit flagged as reading navy behind glass).
const DEEP_BLUE_SKY: RGB = [35, 95, 195];
// The white cumulus clouds in the same photo.
const WHITE_CLOUD: RGB = [238, 240, 245];

// Phases whose stock art is a blue midday sky (off-brand navy) → warm veil.
const BLUE_DAYTIME = ['morning', 'noon', 'afternoon'] as const;
// Already-warm / atmospheric phases whose art must be preserved → neutral veil.
const WARM_PHASES = ['dawn', 'sunrise', 'sunset', 'dusk', 'night'] as const;

// Perceived (Rec. 601) luminance — proxy for how dark a region reads behind
// glass. Lower = better contrast for the light muted text that sits over it.
const luminance = ([r, g, b]: RGB): number => 0.299 * r + 0.587 * g + 0.114 * b;
// The shipped behaviour was a black veil at 0.58 over the cloud region.
const OLD_CLOUD = luminance(
  blendOver(WHITE_CLOUD, { ...BG_MAP.afternoon, overlayColor: NEUTRAL_VEIL, overlayOpacity: 0.58 }),
);

describe('DayNightBackground afternoon navy fix (audit M6)', () => {
  it('reproduction: a plain black veil leaves the midday sky blue-dominant (navy)', () => {
    // Old behaviour: a black readability veil at the afternoon opacity only
    // darkens the blue sky toward navy — blue stays the dominant channel.
    const oldAfternoon = {
      ...BG_MAP.afternoon,
      overlayColor: NEUTRAL_VEIL,
      overlayOpacity: 0.58,
    };
    const [r, , b] = blendOver(DEEP_BLUE_SKY, oldAfternoon);
    expect(b).toBeGreaterThan(r); // still navy — this is the bug being fixed
  });

  it('blue daytime phases use the warm copper veil, not a black veil', () => {
    for (const phase of BLUE_DAYTIME) {
      expect(BG_MAP[phase].overlayColor).toEqual(WARM_VEIL);
    }
  });

  it('warm veil pulls the midday sky out of blue-dominance (no navy behind glass)', () => {
    for (const phase of BLUE_DAYTIME) {
      const [r, , b] = blendOver(DEEP_BLUE_SKY, BG_MAP[phase]);
      expect(r).toBeGreaterThanOrEqual(b);
    }
  });

  it('turns the white clouds warm (amber/copper), not cool', () => {
    const [r, , b] = blendOver(WHITE_CLOUD, BG_MAP.afternoon);
    expect(r).toBeGreaterThan(b);
  });

  it('daytime veil stays opaque enough to keep muted text legible over glass', () => {
    for (const phase of BLUE_DAYTIME) {
      expect(BG_MAP[phase].overlayOpacity).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('does not lighten the bright cloud region vs the shipped state (legibility)', () => {
    // Warming the veil must not trade the navy fix for worse contrast: the
    // brightest region (clouds) must stay at least as dark as the old black
    // veil, or light muted text over glass loses contrast.
    const newCloud = luminance(blendOver(WHITE_CLOUD, BG_MAP.afternoon));
    expect(newCloud).toBeLessThanOrEqual(OLD_CLOUD + 1); // +1 rounding slack
  });

  it('does not over-correct: warm/atmospheric phases keep a neutral veil', () => {
    for (const phase of WARM_PHASES) {
      expect(BG_MAP[phase].overlayColor).toEqual(NEUTRAL_VEIL);
    }
  });

  it('never introduces the "never navy" purple/blue as a veil colour', () => {
    // Every veil is either neutral black or warm (red >= blue). No cool veils.
    for (const cfg of Object.values(BG_MAP)) {
      const [r, , b] = cfg.overlayColor;
      expect(r).toBeGreaterThanOrEqual(b);
    }
  });

  it('overlayRgba emits a valid css rgba string for the afternoon veil', () => {
    expect(overlayRgba(BG_MAP.afternoon)).toBe('rgba(95, 50, 25, 0.78)');
  });
});
