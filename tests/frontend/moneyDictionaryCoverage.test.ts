/**
 * Every word the money pages ask for has a word in Spanish and in Portuguese.
 *
 * Eighty-five of them did not, including Today, Month, You, Connect and Next: the nav of a
 * Spanish account read in English beside its own translated headings, which is exactly the
 * mixed language Stefano kept seeing (2026-09-16). A key with no line falls back to English
 * silently, so nothing but a test notices.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ES } from '../../src/lib/i18n/es';
import { ES_MONEY } from '../../src/lib/i18n/es.money';
import { PT_BR } from '../../src/lib/i18n/pt-BR';
import { PT_BR_MONEY } from '../../src/lib/i18n/pt-BR.money';

/* The dictionaries themselves, not translate(): a line that reads the same in both
   languages (Menu) is a real line, and translate() cannot tell it from a missing one. */
const WORDS: Record<string, Record<string, string>> = {
  es: { ...ES, ...ES_MONEY },
  'pt-BR': { ...PT_BR, ...PT_BR_MONEY },
};

const ROOT = new URL('../../src/', import.meta.url).pathname;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

/** The files a person reads the money product through. */
const FILES = [
  ...walk(join(ROOT, 'pages/money')),
  join(ROOT, 'components/MoneyOnboarding.tsx'),
  join(ROOT, 'components/Wait.tsx'),
];

/** The text inside every t( ... ) call, with parentheses and quotes balanced. */
function callArgs(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/\bt\(/g)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const from = i;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === '(') depth += 1;
      else if (c === ')') depth -= 1;
      else if (c === "'" || c === '"' || c === '`') {
        const quote = c;
        i += 1;
        while (i < src.length && src[i] !== quote) i += src[i] === '\\' ? 2 : 1;
      }
      i += 1;
    }
    out.push(src.slice(from, i - 1));
  }
  return out;
}

/** Every literal handed to t(), single or double quoted. */
function keysUsed(): string[] {
  const keys = new Set<string>();
  for (const path of FILES) {
    const src = readFileSync(path, 'utf8');
    /* Every t( ... ) call, parentheses balanced, so a key inside a ternary counts too: a plain
       scan of t('...') misses t(cond ? 'a' : 'b') and reports a false all-clear. */
    for (const arg of callArgs(src)) {
      for (const m of arg.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)) {
        const raw = m[1] !== undefined ? m[1] : m[2];
        if (!raw || !/[a-zA-Z]/.test(raw)) continue;
        /* A one-word value with an underscore or a hyphen and no space is an option or a
           status the call is switching on, not a phrase anybody reads: worth_it, 2-digit. */
        if (!/\s/.test(raw) && /[_-]/.test(raw)) continue;
        /* The pages write their accents escaped, so the literal has to be decoded. */
        let key: string;
        try { key = JSON.parse(`"${raw.replace(/"/g, '\\"').replace(/\\'/g, "'")}"`); } catch { key = raw; }
        keys.add(key);
      }
    }
  }
  return [...keys];
}

describe('the money pages have their words in every language', () => {
  const keys = keysUsed();

  it('reads a real set of keys', () => {
    expect(keys.length).toBeGreaterThan(300);
    /* 'Today' left with the retired figures (2026-09-22); the page title is the key every money page hands to t(). */
    expect(keys).toContain('Money');
  });

  for (const lang of ['es', 'pt-BR'] as const) {
    it(`has a line for every one of them in ${lang}`, () => {
      const missing = keys.filter((k) => !(k in WORDS[lang]) && !/^\{[a-z_]+\}$/.test(k) && /[a-zA-Z]{2}/.test(k));
      expect(missing).toEqual([]);
    });
  }

  it('leaves no hole unfilled when it says one', () => {
    /* A translation that dropped a {hole} prints the brace to the person. */
    const holes = (s: string) => (s.match(/\{[a-z_]+\}/g) || []).sort();
    const wrong: string[] = [];
    for (const lang of ['es', 'pt-BR'] as const) {
      for (const [source, said] of Object.entries(WORDS[lang])) {
        if (String(holes(said)) !== String(holes(source))) wrong.push(`${lang}: ${source}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
