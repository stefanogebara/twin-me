/**
 * The dictionaries hold real words, not mangled bytes.
 *
 * On 2026-09-15 the money dictionaries were generated through a byte-level escape and every
 * accent and ellipsis came out as three Latin-1 characters. Nothing failed: the strings were
 * valid, ASCII-escaped, and wrong. This pins the two tells: no C1 control characters anywhere
 * (the signature of a double-encoded string), and a few words that must read as a Spaniard or
 * a Brazilian would write them.
 */
import { describe, expect, it } from 'vitest';
import { ES } from '../../src/lib/i18n/es';
import { PT_BR } from '../../src/lib/i18n/pt-BR';
import { ES_MONEY } from '../../src/lib/i18n/es.money';
import { PT_BR_MONEY } from '../../src/lib/i18n/pt-BR.money';

const all: [string, Record<string, string>][] = [['es', ES], ['pt-BR', PT_BR], ['es.money', ES_MONEY], ['pt-BR.money', PT_BR_MONEY]];
const C1 = /[\u0080-\u009f]/;

describe('the dictionaries', () => {
  it('carry no C1 control characters', () => {
    for (const [name, dict] of all) {
      for (const [k, v] of Object.entries(dict)) {
        expect(`${name}: ${k}`).not.toMatch(C1);
        expect(`${name}: ${v}`).not.toMatch(C1);
      }
    }
  });
  it('spell the words the way the language does', () => {
    expect(ES_MONEY['Add']).toBe('A\u00f1adir');
    expect(ES_MONEY['Looking up\u2026']).toBe('Buscando\u2026');
    expect(PT_BR_MONEY['Money, the month']).toBe('Dinheiro, o m\u00eas');
    expect(ES['Reading your month.']).toBe('Leyendo tu mes.');
  });
});
