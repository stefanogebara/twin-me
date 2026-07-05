/**
 * Characterization tests for pkce.js — RFC 7636 PKCE for OAuth 2.0/2.1.
 * Pure crypto: verifier generation, S256 challenge derivation, format validation.
 *
 * The S256 derivation is pinned against the canonical RFC 7636 Appendix B
 * test vector, so any change to the hashing/encoding path is caught.
 */
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  isValidCodeVerifier,
  generatePKCEParams,
} from '../../../api/services/pkce.js';

describe('generateCodeVerifier', () => {
  it('produces a 43-char base64url string (32 bytes, no padding)', () => {
    const v = generateCodeVerifier();
    expect(v).toHaveLength(43);
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(v).not.toContain('=');
    expect(v).not.toContain('+');
    expect(v).not.toContain('/');
  });

  it('generates a distinct value on each call (cryptographically random)', () => {
    const values = new Set(Array.from({ length: 20 }, () => generateCodeVerifier()));
    expect(values.size).toBe(20);
  });

  it('always satisfies its own validator', () => {
    for (let i = 0; i < 10; i++) {
      expect(isValidCodeVerifier(generateCodeVerifier())).toBe(true);
    }
  });
});

describe('generateCodeChallenge (S256)', () => {
  it('matches the canonical RFC 7636 Appendix B test vector', () => {
    // RFC 7636 §B: code_verifier and its expected S256 code_challenge.
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const expected = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    expect(generateCodeChallenge(verifier)).toBe(expected);
  });

  it('is deterministic for a given verifier', () => {
    const v = generateCodeVerifier();
    expect(generateCodeChallenge(v)).toBe(generateCodeChallenge(v));
  });

  it('equals SHA256(verifier) base64url-encoded (no padding)', () => {
    const v = 'some-fixed-verifier-string-1234567890abcdefg';
    const manual = crypto.createHash('sha256').update(v).digest('base64url');
    expect(generateCodeChallenge(v)).toBe(manual);
    expect(generateCodeChallenge(v)).not.toContain('=');
  });
});

describe('isValidCodeVerifier', () => {
  it('rejects non-strings and empty values', () => {
    expect(isValidCodeVerifier(null)).toBe(false);
    expect(isValidCodeVerifier(undefined)).toBe(false);
    expect(isValidCodeVerifier('')).toBe(false);
    expect(isValidCodeVerifier(12345)).toBe(false);
    expect(isValidCodeVerifier({})).toBe(false);
  });

  it('enforces the 43-128 character length bounds (RFC 7636)', () => {
    expect(isValidCodeVerifier('a'.repeat(42))).toBe(false); // too short
    expect(isValidCodeVerifier('a'.repeat(43))).toBe(true); // min
    expect(isValidCodeVerifier('a'.repeat(128))).toBe(true); // max
    expect(isValidCodeVerifier('a'.repeat(129))).toBe(false); // too long
  });

  it('rejects characters outside the base64url alphabet', () => {
    // 43 chars but contains a space / plus / slash -> invalid.
    expect(isValidCodeVerifier('a'.repeat(42) + ' ')).toBe(false);
    expect(isValidCodeVerifier('a'.repeat(42) + '+')).toBe(false);
    expect(isValidCodeVerifier('a'.repeat(42) + '/')).toBe(false);
  });

  it('accepts the RFC-permitted -, _ characters', () => {
    // Note: the implementation regex is [A-Za-z0-9_-], so it does NOT accept
    // the "." or "~" characters that RFC 7636's unreserved set allows. We pin
    // the stricter current behavior rather than the RFC superset.
    expect(isValidCodeVerifier('-_'.repeat(22))).toBe(true); // 44 chars of - and _
  });

  it('pins that "." and "~" are rejected despite being RFC-unreserved (current behavior)', () => {
    expect(isValidCodeVerifier('a'.repeat(42) + '.')).toBe(false);
    expect(isValidCodeVerifier('a'.repeat(42) + '~')).toBe(false);
  });
});

describe('generatePKCEParams', () => {
  it('returns a consistent verifier/challenge pair with S256 method', () => {
    const { codeVerifier, codeChallenge, codeChallengeMethod } = generatePKCEParams();
    expect(codeChallengeMethod).toBe('S256');
    expect(isValidCodeVerifier(codeVerifier)).toBe(true);
    // The challenge must be the S256 of the returned verifier.
    expect(codeChallenge).toBe(generateCodeChallenge(codeVerifier));
  });

  it('produces a fresh pair each call', () => {
    const a = generatePKCEParams();
    const b = generatePKCEParams();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(a.codeChallenge).not.toBe(b.codeChallenge);
  });
});
