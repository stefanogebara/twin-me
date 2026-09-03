import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The Nocturne bridge must OUTRANK the semantic token blocks it supersedes.
 *
 * This is not theoretical. nocturne-bridge.css is @imported at the top of
 * index.css, which reads like it wins. It does not: Tailwind v3 hoists the
 * `@layer base { :root { ... } }` blocks further down index.css up into the
 * `@tailwind base` position, which lands AFTER that import. Equal specificity,
 * later wins — so for the first days of the flip the bridge silently lost 43
 * of its 50 tokens and every legacy page still rendered Claura: #13121a
 * charcoal instead of obsidian, Instrument Serif instead of Fraunces,
 * translucent glass instead of flat graphite.
 *
 * It went unnoticed because the pages built directly on n-* primitives don't
 * consult the bridge at all, so the surfaces we looked at were correct while
 * everything inheriting through the bridge was not.
 *
 * The fix is specificity, which no hoisting can reorder. This test pins it:
 * for every token defined on BOTH sides, the bridge's selector must be
 * strictly more specific than index.css's.
 */

const SRC = join(__dirname, '..', '..', 'src');

/**
 * Comments must go before anything else looks at this CSS. The first version
 * of this test parsed them, and the bridge's own header comment — which
 * quotes `@layer base { :root { ... } }` while explaining the bug — was read
 * as a selector containing two :root tokens. That scored higher than anything
 * real, so the bridge "won" every comparison and the test passed even with
 * the bug deliberately reintroduced.
 */
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const bridge = stripComments(readFileSync(join(SRC, 'styles/nocturne-bridge.css'), 'utf8'));
const index = stripComments(readFileSync(join(SRC, 'index.css'), 'utf8'));

/** Count (id, class/attr/pseudo-class, element) for a simple selector. */
function specificity(sel: string): [number, number, number] {
  const s = sel.trim();
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const classes =
    (s.match(/\.[\w-]+/g) || []).length +
    (s.match(/\[[^\]]+\]/g) || []).length +
    (s.match(/:(?!:)(?!root\b)[\w-]+/g) || []).length +
    (s.match(/:root/g) || []).length;
  const elements = (s.match(/(?:^|[\s>+~])([a-z][\w-]*)/gi) || []).length;
  return [ids, classes, elements];
}

function gt(a: [number, number, number], b: [number, number, number]) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

/** Highest specificity among the selectors of blocks that define `token`. */
function bestSelectorFor(css: string, token: string): [number, number, number] | null {
  let best: [number, number, number] | null = null;
  const blocks = css.matchAll(/([^{}]+)\{([^{}]*)\}/g);
  for (const b of blocks) {
    const body = b[2];
    if (!new RegExp(`(^|[;\\s])${token}\\s*:`).test(body)) continue;
    for (const sel of b[1].split(',')) {
      if (!sel.trim() || sel.trim().startsWith('@')) continue;
      const sp = specificity(sel);
      if (!best || gt(sp, best)) best = sp;
    }
  }
  return best;
}

const bridgeTokens = [
  ...new Set([...bridge.matchAll(/^\s*(--[a-z0-9-]+):/gim)].map((m) => m[1])),
];

describe('the Nocturne bridge outranks the tokens it supersedes', () => {
  it('defines a meaningful number of tokens (the scan is actually looking at something)', () => {
    expect(bridgeTokens.length).toBeGreaterThan(30);
  });

  it('wins on specificity for every token index.css also defines', () => {
    const losing: Record<string, { bridge: number[]; index: number[] }> = {};

    for (const token of bridgeTokens) {
      const idx = bestSelectorFor(index, token);
      if (!idx) continue; // index.css does not contest this token
      const br = bestSelectorFor(bridge, token);
      if (!br || !gt(br, idx)) {
        losing[token] = { bridge: br ?? [0, 0, 0], index: idx };
      }
    }

    expect(
      losing,
      'index.css defines these tokens at equal-or-higher specificity than the ' +
        'bridge. Tailwind hoists its @layer base blocks after the bridge import, ' +
        'so equal specificity means the bridge LOSES and the page renders Claura.',
    ).toEqual({});
  });

  it('the token block keeps the doubled :root that makes it win', () => {
    expect(bridge).toMatch(/:root:root/);
  });
});
