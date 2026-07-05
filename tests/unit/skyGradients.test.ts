import { describe, it, expect } from 'vitest';
import { computeSkyGradients, type SkyGradientResult } from '../../src/utils/skyGradients';
import type { SunState } from '../../src/hooks/useSunPosition';

/**
 * Characterization tests for the sun-driven background gradient math.
 *
 * Despite living next to "visual" code, computeSkyGradients() is a PURE,
 * deterministic function: (SunState, theme) → four orbs with rgba colors,
 * percentage positions, sizes, and spreads. No DOM, no randomness. These tests
 * PIN the mapping math (audit-2026-07-04): azimuth→X, elevation→Y, palette
 * interpolation between elevation anchors, day/night size scaling, and the
 * fixed ground/atmosphere anchors.
 */

function sunState(partial: Partial<SunState> = {}): SunState {
  return {
    sunPhase: 'noon',
    elevation: 45,
    azimuth: 0,
    progress: 0.5,
    isDay: true,
    sunrise: new Date('2026-07-04T10:00:00Z'),
    sunset: new Date('2026-07-04T23:00:00Z'),
    solarNoon: new Date('2026-07-04T16:30:00Z'),
    location: { latitude: 40.71, longitude: -74.01, source: 'default' },
    ...partial,
  };
}

// rgba parse helper for asserting color channels.
function parseRgba(s: string): { r: number; g: number; b: number; a: number } {
  const m = s.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  if (!m) throw new Error(`not an rgba string: ${s}`);
  return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };
}

describe('computeSkyGradients — structure', () => {
  it('always returns exactly four orbs', () => {
    const result = computeSkyGradients(sunState(), 'dark');
    expect(result.orbs).toHaveLength(4);
  });

  it('each orb has color/position/size/spread strings', () => {
    const result = computeSkyGradients(sunState(), 'dark');
    for (const orb of result.orbs) {
      expect(orb.color).toMatch(/^rgba\(/);
      expect(orb.position).toMatch(/^\d+% \d+%$/);
      expect(orb.size).toMatch(/^\d+% \d+%$/);
      expect(orb.spread).toMatch(/^\d+%$/);
    }
  });

  it('is deterministic for identical inputs', () => {
    const a = computeSkyGradients(sunState(), 'dark');
    const b = computeSkyGradients(sunState(), 'dark');
    expect(a).toEqual(b);
  });

  it('dark vs light themes select different palettes', () => {
    const dark = computeSkyGradients(sunState(), 'dark');
    const light = computeSkyGradients(sunState(), 'light');
    expect(dark.orbs[0].color).not.toBe(light.orbs[0].color);
  });
});

describe('computeSkyGradients — azimuth → X position (orb 0)', () => {
  it('maps south (azimuth 0) to horizontal center (~50%)', () => {
    const result = computeSkyGradients(sunState({ azimuth: 0 }), 'dark');
    const [x] = result.orbs[0].position.split(' ');
    // azimuthToX(0) = clamp(5 + 0.5*90) = 50.
    expect(x).toBe('50%');
  });

  it('maps east (azimuth -90) to the left edge (5%)', () => {
    const result = computeSkyGradients(sunState({ azimuth: -90 }), 'dark');
    const [x] = result.orbs[0].position.split(' ');
    expect(x).toBe('5%');
  });

  it('maps west (azimuth +90) to the right edge (95%)', () => {
    const result = computeSkyGradients(sunState({ azimuth: 90 }), 'dark');
    const [x] = result.orbs[0].position.split(' ');
    expect(x).toBe('95%');
  });

  it('CHARACTERIZATION: azimuth beyond +/-90 is clamped to 5..95', () => {
    const west = computeSkyGradients(sunState({ azimuth: 180 }), 'dark');
    expect(west.orbs[0].position.split(' ')[0]).toBe('95%');
    const east = computeSkyGradients(sunState({ azimuth: -180 }), 'dark');
    expect(east.orbs[0].position.split(' ')[0]).toBe('5%');
  });
});

describe('computeSkyGradients — elevation → Y position (orb 0)', () => {
  it('places the sun at the bottom (85%) when at or below the horizon', () => {
    const result = computeSkyGradients(sunState({ elevation: 0, isDay: false }), 'dark');
    const y = result.orbs[0].position.split(' ')[1];
    expect(y).toBe('85%');
  });

  it('CHARACTERIZATION: negative elevation also pins Y to 85%', () => {
    const result = computeSkyGradients(sunState({ elevation: -20, isDay: false }), 'dark');
    expect(result.orbs[0].position.split(' ')[1]).toBe('85%');
  });

  it('places the sun at the top (0%) at max elevation (>=70)', () => {
    const result = computeSkyGradients(sunState({ elevation: 70 }), 'dark');
    // elevationToY(70) = round(85 - 1*85) = 0.
    expect(result.orbs[0].position.split(' ')[1]).toBe('0%');
  });

  it('CHARACTERIZATION: mid elevation 35 maps to Y = 85 - round(35/70*85) = 43%', () => {
    const result = computeSkyGradients(sunState({ elevation: 35 }), 'dark');
    // normalized = 0.5 → 85 - round(42.5) = 85 - 43 = 42. round happens on the
    // whole expression: round(85 - 0.5*85) = round(42.5) = 43 → 85-... actually
    // implementation: Math.round(85 - normalized*85) = round(42.5)=43 → Y=42?.
    // Pin the actual computed value.
    const y = result.orbs[0].position.split(' ')[1];
    expect(y).toBe('43%');
  });
});

describe('computeSkyGradients — fixed anchors (orbs 2 and 3)', () => {
  it('orb 2 (ground glow) is anchored at 50% 100%', () => {
    const result = computeSkyGradients(sunState(), 'dark');
    expect(result.orbs[2].position).toBe('50% 100%');
  });

  it('CHARACTERIZATION: orb 3 (atmosphere) Y is fixed at 50%, X drifts with progress', () => {
    // fillX = round(lerp(40, 70, progress)). At progress 0 → 40, at 1 → 70.
    const start = computeSkyGradients(sunState({ progress: 0 }), 'dark');
    expect(start.orbs[3].position).toBe('40% 50%');
    const end = computeSkyGradients(sunState({ progress: 1 }), 'dark');
    expect(end.orbs[3].position).toBe('70% 50%');
    const mid = computeSkyGradients(sunState({ progress: 0.5 }), 'dark');
    expect(mid.orbs[3].position).toBe('55% 50%');
  });

  it('CHARACTERIZATION: secondary orb (1) mirrors the sun X (100 - sunX, clamped)', () => {
    // sun at azimuth 0 → sunX 50 → secX = clamp(100-50)=50.
    const result = computeSkyGradients(sunState({ azimuth: 0 }), 'dark');
    expect(result.orbs[1].position.split(' ')[0]).toBe('50%');
    // sun at east (azimuth -90 → sunX 5) → secX = clamp(95) = 95.
    const east = computeSkyGradients(sunState({ azimuth: -90 }), 'dark');
    expect(east.orbs[1].position.split(' ')[0]).toBe('95%');
  });
});

describe('computeSkyGradients — day/night size scaling', () => {
  it('CHARACTERIZATION: night (isDay false) shrinks orbs vs day (dayScale 0.7)', () => {
    const day = computeSkyGradients(sunState({ isDay: true, elevation: 45 }), 'dark');
    const night = computeSkyGradients(sunState({ isDay: false, elevation: 45 }), 'dark');
    // Orb 1 size = round(80 * dayScale). Day: 80, night: 56.
    expect(day.orbs[1].size).toBe('80% 70%');
    expect(night.orbs[1].size).toBe('56% 49%');
  });

  it('CHARACTERIZATION: spread of orb 0 is 55% during day, 45% at night', () => {
    const day = computeSkyGradients(sunState({ isDay: true }), 'dark');
    expect(day.orbs[0].spread).toBe('55%');
    const night = computeSkyGradients(sunState({ isDay: false }), 'dark');
    expect(night.orbs[0].spread).toBe('45%');
  });
});

describe('computeSkyGradients — palette interpolation', () => {
  it('CHARACTERIZATION: dark deep-night (elevation -30) uses the warm amber base color, not blue', () => {
    // Deep-night dark anchor orb0 am/pm = [180,120,50,0.28].
    const result = computeSkyGradients(sunState({ elevation: -30, isDay: false, progress: 0.2 }), 'dark');
    const c = parseRgba(result.orbs[0].color);
    // Warm amber: red channel dominant over blue.
    expect(c.r).toBeGreaterThan(c.b);
    expect(c).toEqual({ r: 180, g: 120, b: 50, a: 0.28 });
  });

  it('CHARACTERIZATION: morning vs evening palettes differ at civil twilight (elevation -6)', () => {
    // isMorning = progress < 0.5. am/pm anchors differ at elevation -6.
    const morning = computeSkyGradients(sunState({ elevation: -6, progress: 0.1, isDay: false }), 'dark');
    const evening = computeSkyGradients(sunState({ elevation: -6, progress: 0.9, isDay: false }), 'dark');
    expect(morning.orbs[0].color).not.toBe(evening.orbs[0].color);
  });

  it('interpolates between anchors for an in-between elevation', () => {
    // elevation 7.5 sits between anchors 0 (elev 0) and 15. The resulting color
    // should be a blend — assert it is a valid rgba with sane channel ranges.
    const result = computeSkyGradients(sunState({ elevation: 7.5, progress: 0.2 }), 'dark');
    const c = parseRgba(result.orbs[0].color);
    expect(c.r).toBeGreaterThanOrEqual(0);
    expect(c.r).toBeLessThanOrEqual(255);
    expect(c.a).toBeGreaterThan(0);
    expect(c.a).toBeLessThan(1);
  });
});
