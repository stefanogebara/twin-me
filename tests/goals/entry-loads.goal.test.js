/**
 * Goal: everything the product serves can actually be loaded.
 * ==========================================================
 * On 2026-09-24 `sheet.js` imported `listOwnTransactions` from `store.js`, which re-exported
 * everything but that one name. Every unit test mocks `store.js`, so the whole suite passed and
 * production answered FUNCTION_INVOCATION_FAILED for two hours: an ES module's missing export is
 * a load-time error, and one bad import in one file takes the single function down with it.
 *
 * This imports every root the product is reached through (scripts/ci/staying-roots.txt) for
 * real, with no mocks. A router has no listener, so nothing is started; what is proved is that
 * every import in the reachable graph resolves and every named export exists.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { readRoots } from '../../scripts/ci/reach.mjs';

const ROOT = path.resolve(__dirname, '../..');
const roots = readRoots(path.join(ROOT, 'scripts/ci/staying-roots.txt')).filter((f) => f.endsWith('.js'));

describe('the product loads', () => {
  it('has roots to load', () => { expect(roots.length).toBeGreaterThan(20); });

  it.each(roots)('%s and everything it imports', async (file) => {
    const mod = await import(path.join(ROOT, file));
    expect(mod, `${file} exports nothing`).toBeTruthy();
  });
});
