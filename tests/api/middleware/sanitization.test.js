import { describe, it, expect, vi } from 'vitest';

// sanitizeInput uses isomorphic-dompurify and xss — these are real deps, no mock needed
import { sanitizeInput, endpointRateLimit, validateContentType } from '../../../api/middleware/sanitization.js';

// Helper to create a minimal express req/res/next mock
function makeReq({ body = {}, query = {}, params = {} } = {}) {
  return { body, query, params };
}

function makeRes() {
  const res = {
    statusCode: 200,
    _json: null,
  };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res._json = data; return res; };
  return res;
}

describe('sanitizeInput middleware', () => {
  it('calls next on clean input', () => {
    const req = makeReq({ body: { message: 'Hello world' } });
    const next = vi.fn();
    sanitizeInput(req, makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('strips XSS from body strings', () => {
    const req = makeReq({ body: { comment: '<script>alert(1)</script>hello' } });
    const next = vi.fn();
    sanitizeInput(req, makeRes(), next);
    expect(req.body.comment).not.toContain('<script>');
    expect(req.body.comment).toContain('hello');
  });

  it('strips XSS from query params', () => {
    const req = makeReq({ query: { q: '<img src=x onerror=alert(1)>search' } });
    const next = vi.fn();
    sanitizeInput(req, makeRes(), next);
    expect(req.query.q).not.toContain('<img');
    expect(req.query.q).toContain('search');
  });

  it('removes null bytes', () => {
    const req = makeReq({ body: { name: 'hello\x00world' } });
    const next = vi.fn();
    sanitizeInput(req, makeRes(), next);
    expect(req.body.name).not.toContain('\x00');
  });

  it('truncates values longer than 10000 chars', () => {
    const longString = 'a'.repeat(15000);
    const req = makeReq({ body: { data: longString } });
    const next = vi.fn();
    sanitizeInput(req, makeRes(), next);
    expect(req.body.data.length).toBeLessThanOrEqual(10000);
  });

  it('handles nested objects', () => {
    const req = makeReq({
      body: { user: { name: '<b>Bob</b>', age: 25 } }
    });
    const next = vi.fn();
    sanitizeInput(req, makeRes(), next);
    expect(req.body.user.name).not.toContain('<b>');
    expect(req.body.user.age).toBe(25); // numbers pass through unchanged
  });

  it('handles arrays in body', () => {
    const req = makeReq({ body: { tags: ['<script>bad</script>', 'good'] } });
    const next = vi.fn();
    sanitizeInput(req, makeRes(), next);
    expect(req.body.tags[0]).not.toContain('<script>');
    expect(req.body.tags[1]).toBe('good');
  });
});

describe('endpointRateLimit middleware', () => {
  it('allows requests under the limit', () => {
    const limiter = endpointRateLimit(3, 60000, 'Too many');
    const req = { ip: '1.2.3.4', originalUrl: '/test' };
    const next = vi.fn();

    for (let i = 0; i < 3; i++) {
      limiter(req, makeRes(), next);
    }
    expect(next).toHaveBeenCalledTimes(3);
  });

  it('blocks requests over the limit', () => {
    const limiter = endpointRateLimit(2, 60000, 'Blocked');
    const req = { ip: '5.6.7.8', originalUrl: '/limited' };
    const next = vi.fn();
    const res = makeRes();

    limiter(req, res, next);
    limiter(req, res, next);
    limiter(req, res, next); // 3rd should be blocked

    expect(next).toHaveBeenCalledTimes(2);
    expect(res.statusCode).toBe(429);
    expect(res._json.error).toContain('Too many');
  });
});

describe('validateContentType middleware', () => {
  it('passes GET requests without Content-Type', () => {
    const validator = validateContentType();
    const req = { method: 'GET', headers: {} };
    const next = vi.fn();
    validator(req, makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('passes POST with application/json', () => {
    const validator = validateContentType();
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' }
    };
    const next = vi.fn();
    validator(req, makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('rejects POST with wrong content type', () => {
    const validator = validateContentType();
    const req = {
      method: 'POST',
      headers: { 'content-type': 'text/xml' }
    };
    const res = makeRes();
    const next = vi.fn();
    validator(req, res, next);
    expect(res.statusCode).toBe(415);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects POST with missing Content-Type', () => {
    const validator = validateContentType();
    const req = { method: 'POST', headers: {} };
    const res = makeRes();
    const next = vi.fn();
    validator(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows custom allowed types', () => {
    const validator = validateContentType(['multipart/form-data', 'application/json']);
    const req = {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=xxx' }
    };
    const next = vi.fn();
    validator(req, makeRes(), next);
    expect(next).toHaveBeenCalled();
  });
});
