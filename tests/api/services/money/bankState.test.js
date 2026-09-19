/**
 * The state a bank's redirect carries back is the only thing that says whose consent it is.
 *
 * It was signed with 'dev' whenever JWT_SECRET was unset, so in any environment without the
 * secret a forged state could attach a bank consent to an arbitrary person, and the signature
 * was compared with !==, which leaks its length in time. A state is now refused outright
 * without a secret, and compared in constant time (2026-09-19, audit S1).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signState, readState, BACK_PATHS } from '../../../../api/services/money/bankState.js';

const USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
let saved;
beforeEach(() => { saved = process.env.JWT_SECRET; process.env.JWT_SECRET = 'a-real-secret-for-the-test'; });
afterEach(() => { if (saved === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = saved; });

describe('the bank state', () => {
  it('round-trips a user and a way back', () => {
    const state = signState(USER, '/money/plan');
    expect(readState(state)).toEqual({ userId: USER, back: '/money/plan' });
  });
  it('sends an unknown way back to Sources, and a forged signature nowhere', () => {
    expect(readState(signState(USER, 'https://evil.example')).back).toBe('/money/you');
    const state = signState(USER, '/money');
    const forged = state.replace(/\.[^.]+$/, '.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    expect(readState(forged)).toBeNull();
    expect(readState(state.slice(0, -1))).toBeNull();
    expect(readState('')).toBeNull();
    expect(readState(null)).toBeNull();
  });
  it('refuses to sign or read anything without a secret', () => {
    delete process.env.JWT_SECRET;
    expect(() => signState(USER, '/money')).toThrow(/JWT_SECRET/);
    expect(readState(`${USER}.nonce..sig`)).toBeNull();
    process.env.JWT_SECRET = '';
    expect(() => signState(USER, '/money')).toThrow(/JWT_SECRET/);
  });
  it('never signs with the word dev', () => {
    delete process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'dev';
    /* A literal 'dev' secret is the old fallback leaking in through the environment. */
    expect(() => signState(USER, '/money')).toThrow(/JWT_SECRET/);
  });
  it('keeps the allowed ways back short and under /money', () => {
    expect(BACK_PATHS.every((p) => p.startsWith('/money'))).toBe(true);
  });
});

/* The cases the file had before 2026-09-19, kept verbatim. */
describe('bank state', () => {
  it('reads back the user and the page it was signed with', () => {
    const r = readState(signState('u-1', '/money'));
    expect(r).toEqual({ userId: 'u-1', back: '/money' });
    expect(readState(signState('u-1', '/money/plan')).back).toBe('/money/plan');
  });
  it('an unknown or missing way back lands on Sources', () => {
    expect(readState(signState('u-1')).back).toBe('/money/you');
    expect(readState(signState('u-1', 'https://evil.example/x')).back).toBe('/money/you');
    expect(readState(signState('u-1', '/settings')).back).toBe('/money/you');
    expect(BACK_PATHS).toContain('/money/you');
  });
  it('a forged or damaged state is nothing', () => {
    const s = signState('u-1', '/money');
    expect(readState(s.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')))).toBe(null);
    expect(readState(s.replace('u-1', 'u-2'))).toBe(null);
    expect(readState('u-1.nonce.sig')).toBe(null);
    expect(readState('')).toBe(null);
  });
});
