/**
 * Characterization tests for isUsernameCascadeable — the guard that decides
 * whether a username is distinctive enough to fan out across 600+ platforms.
 * Pure dictionary/length/numeric filter. Pins current behavior, including one
 * dead branch (documented below).
 */
import { describe, it, expect } from 'vitest';
import { isUsernameCascadeable } from '../../../api/services/enrichment/usernameFilter.js';

describe('isUsernameCascadeable', () => {
  it('rejects falsy / non-string input', () => {
    expect(isUsernameCascadeable(undefined)).toBe(false);
    expect(isUsernameCascadeable(null)).toBe(false);
    expect(isUsernameCascadeable('')).toBe(false);
    expect(isUsernameCascadeable(12345)).toBe(false);
    expect(isUsernameCascadeable({})).toBe(false);
  });

  it('rejects usernames shorter than 4 characters', () => {
    expect(isUsernameCascadeable('abc')).toBe(false);
    expect(isUsernameCascadeable('a')).toBe(false);
    // exactly 4 is allowed (if not common/numeric)
    expect(isUsernameCascadeable('zxqw')).toBe(true);
  });

  it('rejects purely numeric usernames', () => {
    expect(isUsernameCascadeable('1234')).toBe(false);
    expect(isUsernameCascadeable('00000000')).toBe(false);
    // alphanumeric mix (contains letters) is NOT purely-numeric, so it passes
    // the numeric guard (see the dedicated 'user2024' case below).
    expect(isUsernameCascadeable('abc123')).toBe(true);
  });

  it('rejects common first names and tech/test handles (case-insensitive, trimmed)', () => {
    expect(isUsernameCascadeable('john')).toBe(false);
    expect(isUsernameCascadeable('JOHN')).toBe(false);
    expect(isUsernameCascadeable('  Michael  ')).toBe(false);
    expect(isUsernameCascadeable('admin')).toBe(false);
    expect(isUsernameCascadeable('test')).toBe(false);
    expect(isUsernameCascadeable('support')).toBe(false);
  });

  it('accepts distinctive compound / uncommon usernames', () => {
    expect(isUsernameCascadeable('stefanogebara')).toBe(true);
    expect(isUsernameCascadeable('john_doe123')).toBe(true); // 'john_doe123' not in common set
    expect(isUsernameCascadeable('zephyrquux')).toBe(true);
  });

  it("clarifies the 'user2024' case: not a common name, so it cascades", () => {
    // 'user2024' !== 'user'; the dictionary check is exact-match on the whole
    // cleaned string, so a suffixed common word passes.
    expect(isUsernameCascadeable('user2024')).toBe(true);
  });

  it('DOCUMENTS a dead branch: line 58 (clean.length<6 && COMMON_NAMES.has) is unreachable', () => {
    // Any string already in COMMON_NAMES returned false at the earlier check
    // (line 54). This re-test can never change an outcome. Pinned so a future
    // refactor that "fixes" it is a conscious decision, not an accident.
    // 'amy' (len 3) is filtered by the <4 length rule before names anyway.
    expect(isUsernameCascadeable('amy')).toBe(false);   // caught by length, not the dead line
    expect(isUsernameCascadeable('anna')).toBe(false);  // common name, caught at line 54
  });
});
