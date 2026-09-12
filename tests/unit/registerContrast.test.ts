/**
 * Guard: the register's inks and hues must stay readable on the grounds they
 * paint on, and the ink ramp must keep reading as three steps.
 *
 * On 2026-09-12 the whole web app moved from Nocturne (white on obsidian) to
 * the register (warm ink on a warm page). Every colour on main now resolves
 * to src/styles/register.css: nocturne.css maps its --n-* names there and the
 * bridge maps the semantic tokens there. So one file decides whether text is
 * readable on every page, and this test re-reads that file and re-measures.
 *
 * The grounds are the register's own three: the page, white (a secondary
 * button, a transitional card) and the warm field (an input, a pressed choice,
 * a skeleton). It cannot see a NEW ground, a tinted panel or a photograph: when
 * a surface paints one, run scripts/audit-cosmos-ink.mjs (ALL=1) on it.
 *
 * Sibling of cosmosInkContrast.test.ts on the Cosmos branch.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/* REGISTER_STYLES_DIR points the guard at a copy of the stylesheets, so it can
   be shown to fail on a regressed value without editing src. */
const STYLES = process.env.REGISTER_STYLES_DIR ?? resolve(__dirname, '../../src/styles');
const read = (file: string) => readFileSync(resolve(STYLES, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Custom properties declared in the rules whose selector is exactly `selector`. */
function tokens(css: string, selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|\\n)\\s*${escaped}\\s*\\{`, 'g');
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  let hits = 0;
  while ((m = re.exec(css))) {
    const open = css.indexOf('{', m.index);
    const close = css.indexOf('}', open);
    for (const d of css.slice(open + 1, close).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) out[d[1]] = d[2].trim();
    hits++;
  }
  if (!hits) throw new Error(`rule not found: ${selector}`);
  return out;
}

type RGB = [number, number, number];
const parseColor = (v: string): { rgb: RGB; a: number } => {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map(c => c + c).join('') : hex[1];
    return { rgb: [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as RGB, a: 1 };
  }
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/i.exec(v);
  if (!m) throw new Error(`not a colour: ${v}`);
  return { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] };
};
const luminance = ([r, g, b]: number[]) => {
  const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
/** WCAG contrast of `ink` composited over `ground`, the way a browser paints it. */
const contrast = (ink: string, ground: RGB) => {
  const c = parseColor(ink);
  const seen = c.rgb.map((ch, i) => ch * c.a + ground[i] * (1 - c.a));
  const l1 = luminance(seen), l2 = luminance(ground);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
/** CIE L*, for judging whether two inks read as different steps. */
const lstar = (v: string) => { const y = luminance(parseColor(v).rgb); return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y; };

const AA = 4.5;        // text under 24px
const NON_TEXT = 3;    // strokes, icons, control boundaries (WCAG 1.4.11)
const STEP = 5;        // L* between two inks that should read as different steps

const rg = tokens(read('register.css'), ':root');
const page = parseColor(rg['--rg-page']).rgb;
const white = parseColor(rg['--rg-white']).rgb;
const field = parseColor(rg['--rg-field']).rgb;
const GROUNDS: [string, RGB][] = [['the page', page], ['white', white], ['the field', field]];

const expectAtLeast = (floor: number, name: string, ink: string, ground: RGB, where: string) => {
  const ratio = contrast(ink, ground);
  expect(ratio, `${name} ${ink} on ${where}: ${ratio.toFixed(2)}:1, needs ${floor}`).toBeGreaterThanOrEqual(floor);
};

describe('register ink ramp', () => {
  it('reads the tokens it guards', () => {
    for (const t of ['--rg-page', '--rg-white', '--rg-field', '--rg-ink', '--rg-ink-2', '--rg-ink-3', '--rg-danger', '--rg-ok']) {
      expect(rg[t], t).toBeTruthy();
    }
  });

  it('ink, ink-2 and ink-3 clear AA on the page, white and the field', () => {
    for (const t of ['--rg-ink', '--rg-ink-2', '--rg-ink-3']) {
      for (const [where, ground] of GROUNDS) expectAtLeast(AA, t, rg[t], ground, where);
    }
  });

  it('danger and ok text clear AA on the page, white and the field', () => {
    for (const t of ['--rg-danger', '--rg-ok']) {
      for (const [where, ground] of GROUNDS) expectAtLeast(AA, t, rg[t], ground, where);
    }
  });

  it('white text on a danger fill clears AA', () => {
    expectAtLeast(AA, 'white on --rg-danger', rg['--rg-white'], parseColor(rg['--rg-danger']).rgb, 'a danger fill');
  });

  it('the primary button, page-colour text on ink, clears AA', () => {
    expectAtLeast(AA, '--rg-page on --rg-ink', rg['--rg-page'], parseColor(rg['--rg-ink']).rgb, 'the ink fill');
  });

  it('ink, ink-2 and ink-3 read as three steps, not two', () => {
    const [a, b, c] = ['--rg-ink', '--rg-ink-2', '--rg-ink-3'].map(t => lstar(rg[t]));
    expect(b - a, `ink -> ink-2 is ${(b - a).toFixed(1)} L*`).toBeGreaterThanOrEqual(STEP);
    expect(c - b, `ink-2 -> ink-3 is ${(c - b).toFixed(1)} L*`).toBeGreaterThanOrEqual(STEP);
  });

  it('the quiet grey fails as text, which is why it is kept off text', () => {
    // If this ever passes AA, the comment in register.css is wrong: re-read it.
    expect(contrast(rg['--rg-quiet'], page)).toBeLessThan(AA);
  });

  it('the switch off track is seen at 3:1 on the page and the field', () => {
    expectAtLeast(NON_TEXT, '--rg-mark', rg['--rg-mark'], page, 'the page');
    expectAtLeast(NON_TEXT, '--rg-mark', rg['--rg-mark'], field, 'the field');
  });
});

describe('the five signatures and the data signal, re-tuned for the page', () => {
  const HUES = ['--rg-ember', '--rg-iris', '--rg-verdigris', '--rg-orchid', '--rg-periwinkle', '--rg-signal'];

  it('each clears 3:1 as a stroke on the page and on white', () => {
    for (const t of HUES) {
      expectAtLeast(NON_TEXT, t, rg[t], page, 'the page');
      expectAtLeast(NON_TEXT, t, rg[t], white, 'white');
    }
  });

  it('ink text on each signature tile clears AA', () => {
    for (const t of HUES.slice(0, 5)) expectAtLeast(AA, `--rg-ink on ${t}`, rg['--rg-ink'], parseColor(rg[t]).rgb, `a ${t} tile`);
  });

  it('each channel triplet matches its hex', () => {
    for (const t of [...HUES, '--rg-danger', '--rg-ink', '--rg-page']) {
      const triplet = rg[`${t}-rgb`];
      expect(triplet, `${t}-rgb`).toBeTruthy();
      expect(triplet.split(/\s+/).map(Number), `${t}-rgb vs ${rg[t]}`).toEqual(parseColor(rg[t]).rgb);
    }
  });

  it('stay five different colours (no two collapse onto one)', () => {
    const values = HUES.map(t => rg[t].toLowerCase());
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('Nocturne and the bridge resolve to the register', () => {
  const nocturne = tokens(read('nocturne.css'), ':root');
  const bridge = read('nocturne-bridge.css');

  it('every --n-* colour points at a register token, not a value of its own', () => {
    const colours = ['--n-obsidian', '--n-abyss', '--n-graphite', '--n-steel', '--n-silver', '--n-pure', '--n-cloud', '--n-ash', '--n-fog', '--n-void',
      '--n-line', '--n-ember', '--n-iris', '--n-verdigris', '--n-orchid', '--n-periwinkle', '--n-signal', '--n-danger', '--n-danger-ink'];
    for (const t of colours) expect(nocturne[t], t).toMatch(/^var\(--rg-/);
  });

  it('the Nocturne channel triplets follow the register ones', () => {
    for (const hue of ['ember', 'iris', 'verdigris', 'orchid', 'periwinkle', 'danger']) {
      expect(nocturne[`--n-${hue}-rgb`], `--n-${hue}-rgb`).toBe(`var(--rg-${hue}-rgb)`);
    }
  });

  it('the page, the ink, the primary and the muted text resolve to register tokens', () => {
    const block = tokens(bridge, ':root:root, :root:root[data-theme=\'light\']');
    const expected: Record<string, string> = {
      '--background': 'var(--n-obsidian)',
      '--foreground': 'var(--n-cloud)',
      '--primary': 'var(--n-pure)',
      '--primary-foreground': 'var(--n-void)',
      '--muted-foreground': 'var(--n-ash)',
      '--border': 'var(--n-line)',
      '--input': 'var(--rg-field)',
    };
    for (const [t, v] of Object.entries(expected)) expect(block[t], t).toBe(v);
    expect(nocturne['--n-obsidian']).toBe('var(--rg-page)');
    expect(nocturne['--n-cloud']).toBe('var(--rg-ink)');
    expect(nocturne['--n-pure']).toBe('var(--rg-ink)');
    expect(nocturne['--n-void']).toBe('var(--rg-page)');
    expect(nocturne['--n-ash']).toBe('var(--rg-ink-2)');
    expect(nocturne['--n-line']).toBe('var(--rg-rule)');
  });

  it('never a serif: every Nocturne voice is Geist', () => {
    for (const t of ['--n-serif', '--n-sans']) expect(nocturne[t], t).toBe('var(--rg-sans)');
    expect(nocturne['--n-mono']).toBe('var(--rg-mono)');
    expect(read('nocturne.css')).not.toMatch(/Fraunces|Roboto Mono|family=Inter/);
  });
});
