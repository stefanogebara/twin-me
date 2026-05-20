/**
 * Tests for assertProdAppUrl — audit L2 startup gate that prevents Stripe
 * redirects from pointing at localhost in production deployments.
 *
 * This was previously an inline `if (...) log.error(...)` block in
 * billing.js that ran at module load. It was unreachable from any test
 * because:
 *   1. The check ran on the SHARED process.env, not a passed-in snapshot.
 *   2. Re-importing billing.js to re-trigger the check fights vitest's
 *      module cache and the global Stripe singleton.
 *
 * Refactor extracted it into a pure function so the matrix is just inputs.
 */
import { describe, it, expect, vi } from 'vitest';
import { assertProdAppUrl } from '../../../api/utils/prodEnvAssertions.js';

function makeLogger() {
  return { error: vi.fn() };
}

describe('assertProdAppUrl', () => {
  describe('non-production environments', () => {
    it('is silent in development even with no VITE_APP_URL', () => {
      const logger = makeLogger();
      const r = assertProdAppUrl({ NODE_ENV: 'development' }, logger);
      expect(r).toEqual({ ok: true, reason: 'not_production' });
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('is silent in test with localhost VITE_APP_URL', () => {
      const logger = makeLogger();
      const r = assertProdAppUrl(
        { NODE_ENV: 'test', VITE_APP_URL: 'http://localhost:8086' },
        logger,
      );
      expect(r.ok).toBe(true);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('treats undefined NODE_ENV as non-production (lenient)', () => {
      const logger = makeLogger();
      const r = assertProdAppUrl({ VITE_APP_URL: 'http://localhost:8086' }, logger);
      expect(r.ok).toBe(true);
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe('production with missing or bad VITE_APP_URL — the original bug', () => {
    it('logs an error in production when VITE_APP_URL is undefined', () => {
      const logger = makeLogger();
      const r = assertProdAppUrl({ NODE_ENV: 'production' }, logger);
      expect(r).toEqual({ ok: false, reason: 'missing' });
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error.mock.calls[0][0]).toMatch(/VITE_APP_URL not set in production/);
    });

    it('logs an error in production when VITE_APP_URL is an empty string', () => {
      const logger = makeLogger();
      const r = assertProdAppUrl({ NODE_ENV: 'production', VITE_APP_URL: '' }, logger);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('missing');
      expect(logger.error).toHaveBeenCalledTimes(1);
    });

    it('logs an error in production when VITE_APP_URL contains localhost', () => {
      const logger = makeLogger();
      const r = assertProdAppUrl(
        { NODE_ENV: 'production', VITE_APP_URL: 'http://localhost:8086' },
        logger,
      );
      expect(r).toEqual({ ok: false, reason: 'localhost' });
      expect(logger.error).toHaveBeenCalledTimes(1);
      // The log line should include the offending value so an operator
      // can grep for it in the deploy log without re-running the check.
      expect(logger.error.mock.calls[0][0]).toMatch(/http:\/\/localhost:8086/);
    });

    it('logs an error in production when VITE_APP_URL points at 127.0.0.1', () => {
      const logger = makeLogger();
      const r = assertProdAppUrl(
        { NODE_ENV: 'production', VITE_APP_URL: 'http://127.0.0.1:3004' },
        logger,
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('localhost');
      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('production with a real URL — happy path', () => {
    it('is silent with a real https hostname', () => {
      const logger = makeLogger();
      const r = assertProdAppUrl(
        { NODE_ENV: 'production', VITE_APP_URL: 'https://www.twinme.me' },
        logger,
      );
      expect(r).toEqual({ ok: true });
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('is silent with a relative path (the prod login-loop fix value)', () => {
      // Per the Apr 2026 login-loop fix, prod VITE_APP_URL is a relative
      // path so cookies stay first-party. The assertion must not flag
      // this as broken — relative paths don't contain "localhost".
      const logger = makeLogger();
      const r = assertProdAppUrl(
        { NODE_ENV: 'production', VITE_APP_URL: '/' },
        logger,
      );
      expect(r).toEqual({ ok: true });
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  it('does NOT throw — production deploys must not crash on a misconfig', () => {
    // Defensive: this is loud-log-only by design. If a future refactor
    // changes it to throw, every billing.js consumer would crash at module
    // load and the entire API would 500 instead of just losing redirects.
    expect(() => assertProdAppUrl({ NODE_ENV: 'production' }, makeLogger())).not.toThrow();
    expect(() => assertProdAppUrl({}, makeLogger())).not.toThrow();
    expect(() => assertProdAppUrl(null, makeLogger())).not.toThrow();
  });
});
