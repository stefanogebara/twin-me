/**
 * The questions are composed on the server, in English, because the model reads them too.
 * The page asks them in the reader's own language: the fixed ones by their own words, the
 * ones with a name or an amount in them by the parts that travel beside them (`say`).
 *
 * A question with no line in a dictionary is asked in English on a Spanish page, under a
 * heading at 32px. That is the loudest kind of mixed language there is, so it is pinned.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { translate, ensureDict } from '../../src/lib/i18n';

/* The dictionaries arrive on demand since 2026-09-19; the tests ask for both first. */
beforeAll(async () => { await ensureDict('es'); await ensureDict('pt-BR'); });

const source = (name: string) => readFileSync(new URL(`../../api/services/money/${name}`, import.meta.url), 'utf8');
const files = ['context.js', 'bizum.js'].map(source).join('\n');

/** Every fixed question string the page prints: the ask, the help and the why. */
function fixedStrings(): string[] {
  const out = new Set<string>();
  for (const m of files.matchAll(/^\s*(ask|help|why): '((?:[^'\\]|\\.)*)',/gm)) out.add(m[2].replace(/\\'/g, "'"));
  return [...out];
}

/** Every key a question hands the page to say itself with. */
function sayKeys(): string[] {
  const out = new Set<string>();
  for (const m of files.matchAll(/key: '((?:[^'\\]|\\.)*)'/g)) out.add(m[1].replace(/\\'/g, "'"));
  return [...out];
}

describe('the questions, in the reader own language', () => {
  it('has a line for every fixed question, help and why, in both languages', () => {
    const strings = fixedStrings();
    expect(strings.length).toBeGreaterThan(20);
    const missing: string[] = [];
    for (const k of strings) {
      if (translate('es', k) === k) missing.push(`es: ${k}`);
      if (translate('pt-BR', k) === k) missing.push(`pt-BR: ${k}`);
    }
    expect(missing).toEqual([]);
  });

  it('has a line for every question that carries a name or an amount', () => {
    const keys = sayKeys();
    /* Six in the ledger's own questions and one for a split. */
    expect(keys.length).toBeGreaterThanOrEqual(7);
    const missing: string[] = [];
    for (const k of keys) {
      if (translate('es', k) === k) missing.push(`es: ${k}`);
      if (translate('pt-BR', k) === k) missing.push(`pt-BR: ${k}`);
    }
    expect(missing).toEqual([]);
  });

  it('fills the holes it is given', () => {
    const said = translate('es', '{name} has sent you {amount}. Who is that?', { name: 'Ana', amount: '25,00 €' });
    expect(said).toBe('Ana te ha enviado 25,00 €. ¿Quién es?');
    expect(said).not.toMatch(/\{[a-z]+\}/);
  });
});
