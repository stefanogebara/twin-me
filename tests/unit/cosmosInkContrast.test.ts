/**
 * Guard: the Cosmos inks must stay readable on every ground they were
 * measured on, and the ramp must keep reading as three steps.
 *
 * On 2026-09-10 the shared muted ink (--c-ink-3, then #9a9796) was found
 * failing WCAG AA on all 111 runs it painted across nine Cosmos surfaces:
 * 2.67:1 on paper. It shipped because nothing checked. It builds, it reads as
 * "quiet on purpose", and the only proof was a browser audit
 * (scripts/audit-cosmos-ink.mjs) that needs a running app and a sign-in.
 *
 * This is the cheap half of that audit. The browser audit found the darkest
 * ground each ink really sits on; those grounds are pinned below with where
 * they came from. This test re-reads the real token values out of the
 * stylesheets and fails if an ink drops under its floor on its ground, or if
 * ink / ink-2 / ink-3 stop being three visible steps.
 *
 * It cannot see a NEW ground — a panel made more transparent, text moved onto
 * a photograph. When a surface changes, re-run the browser audit and add the
 * ground it finds here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

/* COSMOS_STYLES_DIR points the guard at a copy of the stylesheets, so it can
   be shown to fail on a regressed value without editing src. */
const STYLES = process.env.COSMOS_STYLES_DIR ?? resolve(__dirname, '../../src/styles');
const read = (file: string) => readFileSync(resolve(STYLES, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Custom properties declared in the all-widths rules whose selector is exactly
    `selector`, merged in source order the way the cascade does (a later rule
    with the same selector adds to, and overrides, an earlier one). */
function tokens(css: string, selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|\\n)${escaped}\\s*\\{`, 'g');
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  let hits = 0;
  while ((m = re.exec(css))) {
    const open = css.indexOf('{', m.index);
    let depth = 0;
    let close = -1;
    for (let i = open; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}' && --depth === 0) { close = i; break; }
    }
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

/** The darkest grounds the inks sit on: 5th percentile of the pixels under the
    glyphs, page fully rendered — the audit's pass criterion. Measured with
    scripts/audit-cosmos-ink.mjs on 2026-09-10.

    2026-09-11, the register: /presence/home and /presence/onboarding became
    flat app screens, so three grounds went with the room they were measured
    on — the home plate (235,235,233), the onboarding room (214,213,207) and
    the home room (221,223,218). Their tightest ground is now the warm field
    box, a flat fill read straight from --c-field below.

    2026-09-12: the Portrait followed, and its two photo grounds went too
    (see the Portrait block at the end). */
const GROUND: Record<string, RGB> = {
  stageRows: [227, 224, 221],  // demo rows over the photograph (/cosmos/demos, /cosmos/landing)
  stageGlass: [191, 183, 175], // the demo head's caption, bare glass over the photograph
};
const AA = 4.5;
const STEP = 5; // L* between two inks that should read as different steps

const cosmos = read('presence-cosmos.css');
const shared = tokens(cosmos, '.presence-cosmos');
const stage = tokens(cosmos, '.pc-demo-stage');
const paper = parseColor(shared['--c-paper']).rgb;
const white = parseColor(shared['--c-white']).rgb;
const field = parseColor(shared['--c-field']).rgb;

const expectAA = (name: string, ink: string, ground: RGB, where: string) => {
  const ratio = contrast(ink, ground);
  expect(ratio, `${name} ${ink} on ${where}: ${ratio.toFixed(2)}:1, needs ${AA}`).toBeGreaterThanOrEqual(AA);
};

describe('cosmos shared ink ramp', () => {
  it('reads the tokens it guards', () => {
    for (const t of ['--c-paper', '--c-white', '--c-field', '--c-ink', '--c-ink-2', '--c-ink-3', '--c-ink-4']) expect(shared[t], t).toBeTruthy();
  });

  it('ink-2 and ink-3 clear AA on paper and on white cards', () => {
    for (const t of ['--c-ink-2', '--c-ink-3']) {
      expectAA(t, shared[t], paper, 'paper');
      expectAA(t, shared[t], white, 'white');
    }
  });

  it('ink-2 and ink-3 clear AA on the field box, the app screens\' tightest ground', () => {
    expectAA('--c-ink-2', shared['--c-ink-2'], field, 'the field box');
    expectAA('--c-ink-3', shared['--c-ink-3'], field, 'the field box (placeholders)');
  });

  it('danger and live state text clear AA on white and on the page', () => {
    for (const t of ['--c-danger', '--c-live']) {
      expectAA(t, shared[t], white, 'white');
      expectAA(t, shared[t], paper, 'the page');
    }
  });

  it('ink, ink-2 and ink-3 read as three steps, not two', () => {
    const [a, b, c] = ['--c-ink', '--c-ink-2', '--c-ink-3'].map(t => lstar(shared[t]));
    expect(b - a, `ink -> ink-2 is ${(b - a).toFixed(1)} L*`).toBeGreaterThanOrEqual(STEP);
    expect(c - b, `ink-2 -> ink-3 is ${(c - b).toFixed(1)} L*`).toBeGreaterThanOrEqual(STEP);
  });

  it('ink-4 is never used for text (it is for rules and fills)', () => {
    const offenders = readdirSync(STYLES).filter(f => /^presence-.*\.css$/.test(f))
      .filter(f => /(?<![-\w])color\s*:\s*var\(--c-ink-4\)/.test(read(f)));
    expect(offenders, `--c-ink-4 used as a text colour in: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('cosmos demo stage (glass over a photograph)', () => {
  it('scopes its own ink-2 and ink-3', () => {
    expect(stage['--c-ink-2']).toBeTruthy();
    expect(stage['--c-ink-3']).toBeTruthy();
  });

  it('meta lines clear AA on the rows, the caption on the bare glass', () => {
    expectAA('stage --c-ink-3', stage['--c-ink-3'], GROUND.stageRows, 'the demo rows');
    expectAA('stage --c-ink-2', stage['--c-ink-2'], GROUND.stageGlass, 'the bare glass');
    expectAA('stage --c-ink-2', stage['--c-ink-2'], GROUND.stageRows, 'the demo rows');
  });

  it('keeps three steps inside the stage', () => {
    const ink = lstar(shared['--c-ink']), two = lstar(stage['--c-ink-2']), three = lstar(stage['--c-ink-3']);
    expect(two - ink, `ink -> stage ink-2 is ${(two - ink).toFixed(1)} L*`).toBeGreaterThanOrEqual(STEP);
    expect(three - two, `stage ink-2 -> ink-3 is ${(three - two).toFixed(1)} L*`).toBeGreaterThanOrEqual(STEP);
  });
});

/* The on-room inks (--ob-ink-on-room, --dsh-ink-on-room) were retired with
   the rooms on 2026-09-11. What keeps their grounds true now is that the app
   screens paint no photograph and no glass: if one comes back, its text needs
   an audited ink again, and this fails first. */
describe('app screens are flat (home, onboarding)', () => {
  it('paint no photograph, glass or shadow', () => {
    for (const f of ['presence-home.css', 'presence-onboarding.css']) {
      const css = read(f);
      expect(css, `${f} paints an image`).not.toMatch(/url\(/);
      expect(css, `${f} uses glass`).not.toMatch(/backdrop-filter/);
      expect(css, `${f} casts a shadow`).not.toMatch(/box-shadow\s*:\s*(?!none)/);
    }
  });
});

/* ---------------------------------------------------------------------------
 * The Portrait (/demo, /portrait) was white type on glass over a room
 * photograph until 2026-09-12. It pinned two photo grounds here — the
 * saturated window behind its panels (0,127,245) and the lamp under a tile
 * (201,159,92 under the title, 123,112,97 under the detail line) — and
 * checked its white-on-media inks (--pt-on-2, --pt-on-3) and the glass tints
 * of its tiles, cards, nav capsule, pills and ledger stack over them.
 *
 * The register made it a flat app screen: the photograph, the clip, the glass
 * and the card stack were removed on purpose, so those grounds, tints and
 * inks went with them. Its text now sits on the page, white and the field
 * box, which the shared ramp above covers. What keeps that true is that the
 * Portrait stays flat: if a photograph, glass, a gradient or a shadow comes
 * back, its text needs an audited ground again, and this fails first.
 * ------------------------------------------------------------------------- */

/** The declarations of every rule whose selector matches `match`, at any width. */
function rulesFor(css: string, match: RegExp): string {
  const out: string[] = [];
  const walk = (text: string) => {
    let depth = 0, start = 0, open = -1;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '{') { if (depth === 0) open = i; depth++; }
      else if (ch === '}') {
        if (--depth === 0) {
          const sel = text.slice(start, open).trim();
          const body = text.slice(open + 1, i);
          if (/^@(media|supports)/.test(sel)) walk(body);
          else if (match.test(sel)) out.push(body);
          start = i + 1;
        }
      } else if (ch === ';' && depth === 0) start = i + 1;
    }
  };
  walk(css);
  return out.join('\n');
}

const PORTRAIT_PAGES = resolve(__dirname, '../../src/pages/portrait');

describe('the Portrait is flat (/demo, /portrait)', () => {
  const css = rulesFor(cosmos, /pc-portrait|pc-pt-/);

  it('finds its rules', () => {
    expect(css.trim().length).toBeGreaterThan(0);
  });

  it('paints no photograph, glass, gradient or shadow', () => {
    expect(css, 'the Portrait paints an image').not.toMatch(/url\(/);
    expect(css, 'the Portrait uses glass').not.toMatch(/backdrop-filter/);
    expect(css, 'the Portrait paints a gradient').not.toMatch(/gradient\(/);
    expect(css, 'the Portrait casts a shadow').not.toMatch(/box-shadow\s*:\s*(?!none)/);
  });

  it('its pages load no photograph or clip, and put nothing on glass', () => {
    const pages = readdirSync(PORTRAIT_PAGES).filter(f => f.endsWith('.tsx'));
    expect(pages.length).toBeGreaterThan(0);
    for (const f of pages) {
      const src = readFileSync(resolve(PORTRAIT_PAGES, f), 'utf8');
      expect(src, `${f} loads an image`).not.toMatch(/\/images\/|<img\b/);
      expect(src, `${f} plays a clip`).not.toMatch(/<video\b/);
      expect(src, `${f} uses the glass class`).not.toMatch(/liquid-glass/);
    }
  });
});
