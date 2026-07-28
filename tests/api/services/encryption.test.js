/**
 * Characterization tests for encryption.js — AES-256-GCM token encryption.
 *
 * The key is read lazily from process.env.ENCRYPTION_KEY on first use (not at
 * import), so setting it at module top-scope before any encrypt call is enough.
 * vitest runs with isolate:true, so this env mutation is confined to this file.
 *
 * We pin the roundtrip contract (encrypt->decrypt === original), the
 * iv:authTag:ciphertext wire format, ciphertext non-determinism (random IV),
 * GCM tamper-detection, and the OAuth state prefix helpers.
 */
import { describe, it, expect, beforeAll } from 'vitest';

// 64 hex chars = 32 bytes = a valid AES-256 key. Set BEFORE importing the module
// so the lazy getEncryptionKey() picks it up on first encrypt.
const TEST_KEY = 'a'.repeat(64);
process.env.ENCRYPTION_KEY = TEST_KEY;

let encryptToken, decryptToken, testEncryption, encryptState, decryptState;

beforeAll(async () => {
  const mod = await import('../../../api/services/encryption.js');
  ({ encryptToken, decryptToken, testEncryption, encryptState, decryptState } = mod);
});

describe('encryptToken / decryptToken roundtrip', () => {
  it('decrypts back to the exact original plaintext', () => {
    const original = 'ya29.super-secret-oauth-access-token-12345';
    const encrypted = encryptToken(original);
    expect(decryptToken(encrypted)).toBe(original);
  });

  it('roundtrips unicode and special characters', () => {
    const original = 'tökén-ção-🔒-"quotes"-\n-tab\t-end';
    expect(decryptToken(encryptToken(original))).toBe(original);
  });

  it('produces ciphertext that differs from the plaintext', () => {
    const original = 'plaintext-token';
    const encrypted = encryptToken(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted).not.toContain(original);
  });

  it('emits the iv:authTag:ciphertext hex format (16-byte iv, 16-byte tag)', () => {
    const encrypted = encryptToken('hello');
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);
    const [ivHex, tagHex, cipherHex] = parts;
    expect(ivHex).toMatch(/^[0-9a-f]{32}$/); // 16 bytes
    expect(tagHex).toMatch(/^[0-9a-f]{32}$/); // 16 bytes
    expect(cipherHex).toMatch(/^[0-9a-f]+$/);
  });

  it('uses a random IV: same plaintext encrypts to different ciphertext each time', () => {
    const a = encryptToken('same-token');
    const b = encryptToken('same-token');
    expect(a).not.toBe(b);
    // ...but both decrypt to the same value.
    expect(decryptToken(a)).toBe('same-token');
    expect(decryptToken(b)).toBe('same-token');
  });
});

describe('encryptToken / decryptToken error paths', () => {
  it('throws when encrypting an empty value', () => {
    expect(() => encryptToken('')).toThrow(/empty token/i);
    expect(() => encryptToken(null)).toThrow(/empty token/i);
    expect(() => encryptToken(undefined)).toThrow(/empty token/i);
  });

  it('throws when decrypting an empty value', () => {
    expect(() => decryptToken('')).toThrow(/empty data/i);
    expect(() => decryptToken(null)).toThrow(/empty data/i);
  });

  it('throws on a malformed (non 3-part) payload', () => {
    expect(() => decryptToken('not-a-valid-payload')).toThrow(/Failed to decrypt/i);
    expect(() => decryptToken('only:two')).toThrow(/Failed to decrypt/i);
  });

  it('detects tampering: flipping a ciphertext byte fails GCM auth', () => {
    const encrypted = encryptToken('integrity-check');
    const [iv, tag, cipher] = encrypted.split(':');
    // Corrupt the last hex nibble of the ciphertext.
    const lastChar = cipher.slice(-1);
    const flipped = cipher.slice(0, -1) + (lastChar === '0' ? '1' : '0');
    const tampered = `${iv}:${tag}:${flipped}`;
    expect(() => decryptToken(tampered)).toThrow(/Failed to decrypt/i);
  });

  it('rejects a wrong-length IV', () => {
    const encrypted = encryptToken('x');
    const [, tag, cipher] = encrypted.split(':');
    const shortIv = 'ab'; // 1 byte
    expect(() => decryptToken(`${shortIv}:${tag}:${cipher}`)).toThrow(/Failed to decrypt/i);
  });
});

describe('testEncryption self-check', () => {
  it('returns true when the key is configured', () => {
    expect(testEncryption()).toBe(true);
  });
});

describe('encryptState / decryptState (OAuth flow prefix)', () => {
  it('roundtrips an object through JSON with the default connector prefix', () => {
    const state = { userId: 'abc', platform: 'spotify', nonce: 42 };
    const enc = encryptState(state);
    expect(enc.startsWith('connector.')).toBe(true);
    expect(decryptState(enc)).toEqual(state);
  });

  it('applies a custom flow-type prefix', () => {
    const enc = encryptState('raw-string-state', 'auth');
    expect(enc.startsWith('auth.')).toBe(true);
  });

  it('strips the prefix and returns the raw string when parseJson=false', () => {
    const enc = encryptState('plain-state-value', 'health');
    expect(decryptState(enc, false)).toBe('plain-state-value');
  });

  it('returns the decrypted string unchanged when it is not valid JSON', () => {
    const enc = encryptState('this-is-not-json', 'arctic');
    // parseJson defaults true, but non-JSON falls back to the raw string.
    expect(decryptState(enc)).toBe('this-is-not-json');
  });

  it('decrypts state that has no prefix (dot-index guard)', () => {
    // encryptToken output has colons but the first dot check requires dotIdx<20;
    // a raw encryptToken payload has no dot, so decryptState must handle it.
    const rawEncrypted = encryptToken(JSON.stringify({ a: 1 }));
    expect(decryptState(rawEncrypted)).toEqual({ a: 1 });
  });
});
