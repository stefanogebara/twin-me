/** The bank's redirect carries the user and the page to come back to, and nothing a forger can shape. */
import { describe, it, expect } from 'vitest';
import { signState, readState, BACK_PATHS } from '../../../../api/services/money/bankState.js';

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
