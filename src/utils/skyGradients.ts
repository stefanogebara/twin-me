import type { SunState } from '../hooks/useSunPosition';

// RGBA tuple: [red, green, blue, alpha]
type RGBA = [number, number, number, number];
// 4-orb palette: each orb gets its own color
type Palette = [RGBA, RGBA, RGBA, RGBA];

interface GradientOrb {
  color: string;    // rgba(r, g, b, a)
  position: string; // "x% y%"
  size: string;     // "w% h%"
  spread: string;   // "n%"
}

export interface SkyGradientResult {
  orbs: [GradientOrb, GradientOrb, GradientOrb, GradientOrb];
}

// ─── Color palettes per elevation anchor ───
// Anchors are sampled at specific elevation angles. Between anchors we lerp.

interface Anchor {
  elevation: number;
  am: Palette;  // morning palette (before solar noon)
  pm: Palette;  // evening palette (after solar noon)
}

const DARK_ANCHORS: Anchor[] = [
  {
    // Deep night — indigo/violet with stronger presence
    elevation: -30,
    am: [[55, 45, 140, 0.42], [40, 35, 120, 0.35], [65, 40, 130, 0.38], [35, 50, 110, 0.28]],
    pm: [[55, 45, 140, 0.42], [40, 35, 120, 0.35], [65, 40, 130, 0.38], [35, 50, 110, 0.28]],
  },
  {
    // Astronomical twilight — rose/violet
    elevation: -12,
    am: [[130, 60, 110, 0.40], [90, 50, 130, 0.34], [110, 55, 90, 0.38], [70, 50, 120, 0.28]],
    pm: [[150, 55, 105, 0.40], [110, 45, 120, 0.34], [130, 42, 95, 0.38], [90, 50, 130, 0.28]],
  },
  {
    // Civil twilight — warm amber sunrise/sunset
    elevation: -6,
    am: [[210, 105, 65, 0.44], [190, 85, 75, 0.36], [170, 75, 95, 0.40], [200, 95, 55, 0.30]],
    pm: [[230, 95, 45, 0.46], [210, 75, 55, 0.38], [190, 65, 75, 0.42], [220, 85, 35, 0.32]],
  },
  {
    // Sunrise/sunset — golden hour
    elevation: 0,
    am: [[220, 155, 65, 0.42], [200, 125, 55, 0.34], [180, 115, 60, 0.38], [210, 145, 75, 0.26]],
    pm: [[220, 148, 58, 0.42], [200, 120, 54, 0.34], [185, 105, 60, 0.38], [210, 135, 70, 0.26]],
  },
  {
    // Daytime — warm gold
    elevation: 15,
    am: [[230, 178, 75, 0.38], [210, 158, 65, 0.30], [190, 138, 55, 0.34], [220, 168, 85, 0.22]],
    pm: [[230, 178, 75, 0.38], [210, 158, 65, 0.30], [190, 138, 55, 0.34], [220, 168, 85, 0.22]],
  },
  {
    // High noon — golden amber
    elevation: 60,
    am: [[230, 178, 75, 0.38], [210, 158, 65, 0.30], [190, 138, 55, 0.34], [220, 168, 85, 0.22]],
    pm: [[230, 178, 75, 0.38], [210, 158, 65, 0.30], [190, 138, 55, 0.34], [220, 168, 85, 0.22]],
  },
];

const LIGHT_ANCHORS: Anchor[] = [
  {
    elevation: -30,
    am: [[100, 110, 180, 0.14], [90, 100, 170, 0.12], [110, 95, 170, 0.14], [85, 105, 160, 0.10]],
    pm: [[100, 110, 180, 0.14], [90, 100, 170, 0.12], [110, 95, 170, 0.14], [85, 105, 160, 0.10]],
  },
  {
    elevation: -12,
    am: [[200, 140, 160, 0.14], [170, 130, 180, 0.12], [190, 135, 150, 0.14], [160, 130, 170, 0.10]],
    pm: [[180, 130, 170, 0.14], [160, 120, 175, 0.12], [170, 115, 160, 0.14], [150, 125, 180, 0.10]],
  },
  {
    elevation: -6,
    am: [[230, 170, 120, 0.15], [220, 150, 130, 0.13], [210, 140, 140, 0.14], [225, 160, 110, 0.10]],
    pm: [[240, 150, 100, 0.16], [230, 130, 110, 0.14], [220, 120, 120, 0.15], [235, 140, 90, 0.11]],
  },
  {
    elevation: 0,
    am: [[220, 180, 100, 0.13], [210, 165, 90, 0.11], [200, 155, 95, 0.12], [215, 175, 105, 0.09]],
    pm: [[210, 165, 90, 0.13], [195, 145, 80, 0.11], [185, 135, 85, 0.12], [205, 155, 95, 0.09]],
  },
  {
    elevation: 15,
    am: [[200, 160, 80, 0.12], [180, 140, 70, 0.10], [160, 120, 60, 0.12], [190, 150, 80, 0.08]],
    pm: [[200, 160, 80, 0.12], [180, 140, 70, 0.10], [160, 120, 60, 0.12], [190, 150, 80, 0.08]],
  },
  {
    elevation: 60,
    am: [[200, 160, 80, 0.12], [180, 140, 70, 0.10], [160, 120, 60, 0.12], [190, 150, 80, 0.08]],
    pm: [[200, 160, 80, 0.12], [180, 140, 70, 0.10], [160, 120, 60, 0.12], [190, 150, 80, 0.08]],
  },
];

// ─── Math helpers ───

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerpRGBA(a: RGBA, b: RGBA, t: number): RGBA {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
    parseFloat(lerp(a[3], b[3], t).toFixed(3)),
  ];
}

function rgbaStr([r, g, b, a]: RGBA): string {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Interpolate a full palette between two anchor palettes
function lerpPalette(a: Palette, b: Palette, t: number): Palette {
  return [
    lerpRGBA(a[0], b[0], t),
    lerpRGBA(a[1], b[1], t),
    lerpRGBA(a[2], b[2], t),
    lerpRGBA(a[3], b[3], t),
  ];
}

// Find the two anchors bracketing the given elevation and interpolate
function samplePalette(anchors: Anchor[], elevation: number, isMorning: boolean): Palette {
  const el = clamp(elevation, anchors[0].elevation, anchors[anchors.length - 1].elevation);

  for (let i = 0; i < anchors.length - 1; i++) {
    const lo = anchors[i];
    const hi = anchors[i + 1];
    if (el >= lo.elevation && el <= hi.elevation) {
      const t = (el - lo.elevation) / (hi.elevation - lo.elevation);
      const paletteLo = isMorning ? lo.am : lo.pm;
      const paletteHi = isMorning ? hi.am : hi.pm;
      return lerpPalette(paletteLo, paletteHi, t);
    }
  }

  // Fallback: use last anchor
  const last = anchors[anchors.length - 1];
  return isMorning ? last.am : last.pm;
}

// ─── Position mapping ───

// suncalc azimuth: 0 = south, +π/2 = west, -π/2 = east (radians → degrees here)
// Map to screen X: east (sunrise) → left, south (noon) → center, west (sunset) → right
function azimuthToX(azimuthDeg: number): number {
  // azimuthDeg: -90=east, 0=south, +90=west
  const normalized = (azimuthDeg + 90) / 180; // 0..1
  return clamp(5 + normalized * 90, 5, 95);
}

// Higher elevation → higher on screen (lower Y%)
function elevationToY(elevationDeg: number): number {
  if (elevationDeg <= 0) return 85;
  const normalized = Math.min(elevationDeg / 70, 1);
  return Math.max(0, Math.round(85 - normalized * 85));
}

// ─── Main export ───

export function computeSkyGradients(
  sun: SunState,
  resolvedTheme: 'light' | 'dark',
): SkyGradientResult {
  const anchors = resolvedTheme === 'dark' ? DARK_ANCHORS : LIGHT_ANCHORS;
  const isMorning = sun.progress < 0.5;
  const colors = samplePalette(anchors, sun.elevation, isMorning);

  // Sun orb follows the actual sun
  const sunX = Math.round(azimuthToX(sun.azimuth));
  const sunY = elevationToY(sun.elevation);

  // Secondary orb: opposite side, slightly higher
  const secX = Math.round(clamp(100 - sunX, 5, 95));
  const secY = Math.max(10, sunY - 15);

  // Ground glow: anchored at bottom center
  const groundX = 50;
  const groundY = 100;

  // Atmosphere fill: drifts with day progress
  const fillX = Math.round(lerp(40, 70, sun.progress));
  const fillY = 50;

  // Size scaling: brighter day → larger orbs
  const dayScale = sun.isDay ? 1 : 0.7;
  const elevScale = clamp(1 + sun.elevation / 90, 0.6, 1.3);

  return {
    orbs: [
      {
        color: rgbaStr(colors[0]),
        position: `${sunX}% ${sunY}%`,
        size: `${Math.round(120 * elevScale * dayScale)}% ${Math.round(80 * elevScale * dayScale)}%`,
        spread: sun.isDay ? '55%' : '45%',
      },
      {
        color: rgbaStr(colors[1]),
        position: `${secX}% ${secY}%`,
        size: `${Math.round(80 * dayScale)}% ${Math.round(70 * dayScale)}%`,
        spread: '50%',
      },
      {
        color: rgbaStr(colors[2]),
        position: `${groundX}% ${groundY}%`,
        size: `${Math.round(100 * dayScale)}% ${Math.round(90 * dayScale)}%`,
        spread: '55%',
      },
      {
        color: rgbaStr(colors[3]),
        position: `${fillX}% ${fillY}%`,
        size: `${Math.round(60 * dayScale)}% ${Math.round(60 * dayScale)}%`,
        spread: '45%',
      },
    ],
  };
}
