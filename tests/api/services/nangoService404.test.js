/**
 * Tests for the 404 tolerance in extractPlatformData's endpoint loop.
 *
 * Audit 2026-05-22: Outlook's /me/mailFolders returns 404 for personal
 * Microsoft accounts without an Exchange mailbox. The old code pushed
 * that to errors[] and marked the entire sync 'partial' — making the
 * UI show an Outlook error even though calendar + contacts worked fine.
 *
 * Endpoint loop now treats 404 as "account doesn't have this feature"
 * and skips, while keeping 5xx + 401/403 as real errors.
 *
 * Loop body is inline in extractPlatformData; the contract under test
 * is the result-classification logic, re-stated here as a pure function.
 */
import { describe, it, expect } from 'vitest';

/** Mirror of the result-classification branch in nangoService.js. */
function classify(result) {
  if (result.success) return 'data';
  if ((result.statusCode ?? result.status) === 404) return 'skip';
  return 'error';
}

describe('extractPlatformData endpoint-result classification', () => {
  it('200 with data → "data"', () => {
    expect(classify({ success: true, data: { foo: 'bar' } })).toBe('data');
  });

  describe('404 — account does not support this endpoint', () => {
    it('reads statusCode (the field proxyRequest sets on its error path)', () => {
      expect(classify({ success: false, statusCode: 404, error: 'Request failed with status code 404' })).toBe('skip');
    });
    it('falls back to status (the field set when the response was HTML)', () => {
      expect(classify({ success: false, status: 404, error: 'Connection appears invalid' })).toBe('skip');
    });
    it('the EXACT audit-input shape (Outlook mailFolders 404 verbatim)', () => {
      // From platform_connections.last_sync_error on 2026-05-21 17:29
      const result = {
        success: false,
        error: 'Request failed with status code 404',
        statusCode: 404,
      };
      expect(classify(result)).toBe('skip');
    });
  });

  describe('Non-404 failures still register as errors', () => {
    it.each([
      ['401 unauth', 401],
      ['403 forbidden', 403],
      ['429 rate limit', 429],
      ['500 server error', 500],
      ['502 bad gateway', 502],
      ['504 gateway timeout', 504],
      ['undefined status (network failure)', undefined],
    ])('classifies %s as error', (_label, statusCode) => {
      const result = { success: false, error: 'something broke', statusCode };
      expect(classify(result)).toBe('error');
    });
  });

  it('the 424 reconnect signal stays an error (so the sync UI surfaces it)', () => {
    // Nango uses 424 to signal that the upstream connection failed
    // (expired/revoked token). This SHOULD propagate as an error so
    // the UI can prompt for reconnect — not be silently swallowed.
    expect(classify({ success: false, status: 424, error: 'Reconnect required' })).toBe('error');
  });
});
