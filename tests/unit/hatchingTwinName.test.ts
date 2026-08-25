import { describe, it, expect } from 'vitest';
import { sanitizeTwinName } from '../../src/pages/onboarding/components/HatchingPhase';

describe('sanitizeTwinName (hatching birth moment)', () => {
  it('trims and collapses whitespace', () => {
    expect(sanitizeTwinName('  Echo   Prime  ')).toBe('Echo Prime');
  });

  it('returns null for empty or whitespace-only input (nameless twin is allowed)', () => {
    expect(sanitizeTwinName('')).toBeNull();
    expect(sanitizeTwinName('    ')).toBeNull();
  });

  it('caps at 40 characters without trailing whitespace', () => {
    const long = 'A'.repeat(39) + ' ' + 'B'.repeat(20);
    const out = sanitizeTwinName(long);
    expect(out).toBe('A'.repeat(39));
    expect(out!.length).toBeLessThanOrEqual(40);
  });

  it('keeps ordinary names intact', () => {
    expect(sanitizeTwinName('Rami')).toBe('Rami');
  });
});
