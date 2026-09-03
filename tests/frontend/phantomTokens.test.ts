/**
 * Phantom design-token gate (design-drift audit 2026-08-12, tier 1).
 *
 * `var(--button-bg-dark, #252222)` shipped on three surfaces while the
 * token was defined NOWHERE — so the near-black fallback always won and,
 * in light theme, rendered dark-ink text on a near-black button. A CSS
 * variable that exists in no stylesheet fails silently; this scan makes it
 * fail loudly instead.
 *
 * Every `var(--x)` referenced in src/ must be defined in one of the token
 * stylesheets (or be a Tailwind/shadcn runtime var it derives from there).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..', 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(full);
  }
  return out;
}

describe('design tokens referenced in src/ actually exist', () => {
  // Nocturne (2026-09-01) added a token BRIDGE, which is exactly the shape of
  // bug this test was written for: nocturne-bridge.css redefines the legacy
  // Claura names in Nocturne terms, so a name that never made it across the
  // bridge resolves to nothing and the fallback silently wins.
  const tokenSources = [
    'index.css',
    'styles/nocturne.css',
    'styles/nocturne-bridge.css',
    'styles/claura.css',
    'styles/tokens.ts',
    'App.css',
  ]
    .map(f => {
      try { return readFileSync(join(SRC, f), 'utf8'); } catch { return ''; }
    })
    .join('\n');

  it('every var(--*) used in pages/components is defined in a token stylesheet', () => {
    const files = walk(SRC).filter(f => !/[\\/]styles[\\/]|index\.css$|App\.css$/.test(f));
    const missing = new Map<string, string[]>();

    // Components may define custom properties at runtime via inline style
    // objects ('--sidebar-width': ...) — those count as definitions too.
    const inlineDefined = new Set<string>();
    for (const file of files) {
      for (const m of readFileSync(file, 'utf8').matchAll(/["'](--[a-z0-9-]+)["']\s*:/gi)) {
        inlineDefined.add(m[1]);
      }
    }

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      // `var(--n-${sig.tint})` composes the name at runtime. The prefix is
      // not itself a token, and which of the five signature hues it resolves
      // to cannot be known statically — so scanning it would only ever report
      // a phantom that does not exist. Skip the composed ones; the literal
      // ones, which are almost all of them, still get checked.
      for (const match of content.matchAll(/var\((--[a-z0-9-]+)(\$\{)?/gi)) {
        const token = match[1];
        if (match[2]) continue;
        if (inlineDefined.has(token)) continue;
        // Tailwind v4 / shadcn runtime namespaces are derived from the
        // token blocks at build time, not declared literally.
        if (/^--(tw|radix|color|font|radius|shadow|animate|spacing|breakpoint|container|text|leading|tracking|ease|blur)-/.test(token)) continue;
        if (!tokenSources.includes(`${token}:`)) {
          const short = file.slice(SRC.length + 1);
          if (!missing.has(token)) missing.set(token, []);
          const list = missing.get(token)!;
          if (!list.includes(short)) list.push(short);
        }
      }
    }

    expect(
      Object.fromEntries(missing),
      'CSS variables referenced but defined in no token stylesheet — the fallback (or nothing) silently wins in both themes'
    ).toEqual({});
  });

  it('the specific phantom that shipped stays dead', () => {
    const offenders = walk(SRC).filter(f => readFileSync(f, 'utf8').includes('--button-bg-dark'));
    expect(offenders).toEqual([]);
  });
});
