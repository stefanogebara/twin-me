/**
 * Unit tests for requireBridgeAuth in api/routes/voice-bridge.js
 * Covers: audit-2026-07-03 timing-safe secret comparison (was a plain `===`).
 */
import { describe, it, expect, vi } from 'vitest';

process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
process.env.NODE_ENV = 'test';
process.env.BRIDGE_SHARED_SECRET = 'correct-horse-battery-staple';

const { requireBridgeAuth } = await import('../../../api/routes/voice-bridge.js');

function makeReq(headerValue) {
  return {
    header: (name) => (name === 'X-Twinme-Bridge-Secret' ? headerValue : undefined),
  };
}

function makeRes() {
  const res = { statusCode: 200, _json: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res._json = data; return res; };
  return res;
}

describe('requireBridgeAuth', () => {
  it('calls next when the secret matches exactly', () => {
    const req = makeReq('correct-horse-battery-staple');
    const res = makeRes();
    const next = vi.fn();
    requireBridgeAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it('returns 401 for a wrong secret of the SAME length (no throw)', () => {
    // Same length as 'correct-horse-battery-staple' (29 chars) so this
    // exercises the crypto.timingSafeEqual() call path, not the length guard.
    const wrongSameLength = 'wrong-donkey-battery-staple!';
    expect(wrongSameLength.length).toBe('correct-horse-battery-staple'.length);
    const req = makeReq(wrongSameLength);
    const res = makeRes();
    const next = vi.fn();
    expect(() => requireBridgeAuth(req, res, next)).not.toThrow();
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res._json).toEqual({ error: 'unauthorized' });
  });

  it('returns 401 for a wrong-length secret (no throw)', () => {
    // crypto.timingSafeEqual throws on a Buffer length mismatch — the guard
    // in timingSafeEqual() must catch this before it ever reaches crypto.
    const req = makeReq('short');
    const res = makeRes();
    const next = vi.fn();
    expect(() => requireBridgeAuth(req, res, next)).not.toThrow();
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res._json).toEqual({ error: 'unauthorized' });
  });

  it('returns 401 when the header is missing entirely', () => {
    const req = makeReq(undefined);
    const res = makeRes();
    const next = vi.fn();
    expect(() => requireBridgeAuth(req, res, next)).not.toThrow();
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
