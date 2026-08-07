/**
 * Guard: light-theme text tokens must stay readable on the light canvas.
 *
 * The light block in index.css overrides a subset of the dark :root tokens.
 * Any text token it forgets silently inherits the DARK value — near-white ink
 * — which then renders on #f6f3ee paper. That is not a subtle regression: the
 * narrative tokens measured 1.01:1, i.e. invisible, across 10 components
 * including SoulSummaryCard and TwinSeesSection.
 *
 * Nothing catches this. It builds, it type-checks, no console error, and in
 * dark mode (the default) everything looks correct. Only opening the app in
 * light mode reveals it, which is why it survived.
 *
 * So: parse the real token blocks out of index.css and assert every
 * light-theme foreground token clears WCAG AA (4.5:1) against the light
 * canvas, compositing alpha over the canvas the way a browser would.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const CSS = readFileSync(resolve(__dirname, '../../src/index.css'), 'utf8');

/** Extract the declarations of the first block matching a selector. */
function block(selector: string): Record<string, string> {
  const start = CSS.indexOf(selector);
  if (start === -1) throw new Error(`selector not found: ${selector}`);
  const open = CSS.indexOf('{', start);
  const close = CSS.indexOf('\n  }', open);
  const body = CSS.slice(open + 1, close);
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    out[m[1].trim()] = m[2].trim();
  }
  return out;
}

const hexToRgb = (h: string): [number, number, number] | null => {
  const m = /^#([0-9a-f]{6})$/i.exec(h.trim());
  return m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)] : null;
};
const parseColor = (v: string): { rgb: [number, number, number]; a: number } | null => {
  const hex = hexToRgb(v);
  if (hex) return { rgb: hex, a: 1 };
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/i.exec(v);
  if (!m) return null;
  return { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] };
};
const luminance = ([r, g, b]: number[]) => {
  const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (fg: string, canvas: [number, number, number]): number | null => {
  const c = parseColor(fg);
  if (!c) return null;
  const composited = c.rgb.map((ch, i) => ch * c.a + canvas[i] * (1 - c.a));
  const L1 = luminance(composited), L2 = luminance(canvas);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
};

/** Foreground tokens that carry readable text and must meet AA. */
const TEXT_TOKENS = [
  '--foreground', '--text-primary', '--text-secondary', '--text-muted',
  '--text-narrative', '--text-narrative-secondary', '--text-narrative-muted',
];

describe('light theme contrast', () => {
  const light = block('[data-theme="light"]');
  const canvas = hexToRgb(light['--background'])!;

  it('parses the light block and its canvas', () => {
    expect(Object.keys(light).length).toBeGreaterThan(20);
    expect(canvas).not.toBeNull();
    expect(light['--background']).toBe('#f6f3ee');
  });

  it('defines every text token rather than inheriting near-white from dark', () => {
    const missing = TEXT_TOKENS.filter(t => !light[t]);
    expect(missing, `light theme must override: ${missing.join(', ')}`).toEqual([]);
  });

  it.each(TEXT_TOKENS)('%s meets WCAG AA on the light canvas', token => {
    const value = light[token];
    expect(value, `${token} undefined in light block`).toBeTruthy();
    const ratio = contrast(value, canvas);
    expect(ratio, `${token} = ${value} is unparseable`).not.toBeNull();
    expect(ratio!, `${token} = ${value} -> ${ratio?.toFixed(2)}:1 on ${light['--background']}`).toBeGreaterThanOrEqual(4.5);
  });

  it('preserves the muted < secondary < narrative hierarchy', () => {
    const r = (t: string) => contrast(light[t], canvas)!;
    expect(r('--text-narrative-muted')).toBeLessThan(r('--text-narrative-secondary'));
    expect(r('--text-narrative-secondary')).toBeLessThan(r('--text-narrative'));
  });
});
