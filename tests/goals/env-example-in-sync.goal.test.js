/**
 * Goal: .env.example is what the code reads (audit M3-4, 2026-09-19). It had 109 keys read
 * and undocumented and 16 documented and never read; scripts/env-example.mjs writes it from
 * api/ and src/, and this holds the committed file to that.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generate, notesInFile, render, requiredKeys } from '../../scripts/env-example.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;

describe('.env.example follows the code', () => {
  it('is exactly what the generator writes', () => {
    expect(readFileSync(`${ROOT}.env.example`, 'utf8')).toBe(generate(ROOT));
  });
  it('lists the keys the server refuses to start without, uncommented and first', () => {
    const text = readFileSync(`${ROOT}.env.example`, 'utf8');
    const core = text.split('# --- ')[1];
    for (const key of requiredKeys(ROOT)) expect(core).toMatch(new RegExp(`^${key}=`, 'm'));
  });
  it('keeps a note a person wrote above a key, and comments out what is optional', () => {
    const notes = notesInFile('# --- Area ---\n# costs money\n# OPTIONAL_KEY=abc\nREQUIRED_KEY=xyz\n');
    expect(notes.get('OPTIONAL_KEY')).toEqual({ comment: ['# costs money'], value: 'abc', commented: true });
    const out = render({ keys: new Map([['OPTIONAL_KEY', new Set(['api/services/x.js'])], ['REQUIRED_KEY', new Set(['api/server.js'])], ['NEW_KEY', new Set(['api/routes/money.js'])]]), required: new Set(['REQUIRED_KEY']), notes });
    expect(out).toMatch(/# costs money\n# OPTIONAL_KEY=abc/);
    expect(out).toMatch(/^REQUIRED_KEY=xyz$/m);
    expect(out).toMatch(/# read by routes\/money.js\n# NEW_KEY=$/m);
  });
});
