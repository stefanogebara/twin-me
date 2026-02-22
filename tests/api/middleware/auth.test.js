import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Set JWT_SECRET before importing auth (module-level check)
process.env.JWT_SECRET = 'test-secret-key-for-unit-tests-only';

const { authenticateUser } = await import('../../../api/middleware/auth.js');

function makeReq(authHeader) {
  return {
    headers: { authorization: authHeader },
    path: '/test',
  };
}

function makeRes() {
  const res = { statusCode: 200, _json: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res._json = data; return res; };
  return res;
}

function signToken(payload, secret = 'test-secret-key-for-unit-tests-only') {
  return jwt.sign(payload, secret, { expiresIn: '1h' });
}

describe('authenticateUser middleware', () => {
  it('calls next and sets req.user on valid token', async () => {
    const token = signToken({ id: 'user-123', email: 'test@example.com' });
    const req = makeReq(`Bearer ${token}`);
    const next = vi.fn();
    await authenticateUser(req, makeRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe('user-123');
  });

  it('returns 401 when Authorization header is missing', async () => {
    const req = makeReq(undefined);
    const res = makeRes();
    const next = vi.fn();
    await authenticateUser(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token is expired', async () => {
    const token = jwt.sign(
      { id: 'user-123' },
      'test-secret-key-for-unit-tests-only',
      { expiresIn: '-1s' } // already expired
    );
    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();
    const next = vi.fn();
    await authenticateUser(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token is signed with wrong secret', async () => {
    const token = jwt.sign({ id: 'user-123' }, 'wrong-secret', { expiresIn: '1h' });
    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();
    const next = vi.fn();
    await authenticateUser(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when header does not start with Bearer', async () => {
    const req = makeReq('Basic somebase64token');
    const res = makeRes();
    const next = vi.fn();
    await authenticateUser(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for malformed token string', async () => {
    const req = makeReq('Bearer not.a.valid.jwt.at.all');
    const res = makeRes();
    const next = vi.fn();
    await authenticateUser(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
