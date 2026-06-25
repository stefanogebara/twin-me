/**
 * Regression for the createConnectSession error mapping (2026-06-15).
 *
 * Nango returns structured errors as { error: { code, message } }. The old
 * code passed responseData.error (an OBJECT) straight through, so the connect
 * toast rendered "[object Object]" and hid the real cause — e.g. resource_capped
 * ("Reached maximum number of allowed connections"), which is what actually
 * blocked a Whoop reconnect. The catch block must always resolve to a STRING
 * message + a separate code. Mirrors nangoService.js createConnectSession catch
 * (same convention as nangoService404.test.js).
 */
import { describe, it, expect } from 'vitest';

function mapError(error) {
  const responseData = error.response?.data;
  const rawErr = responseData?.error;
  const upstreamMessage =
    (typeof responseData === 'string' && responseData) ||
    (typeof rawErr === 'string' && rawErr) ||
    rawErr?.message ||
    responseData?.message ||
    responseData?.details ||
    error.message ||
    'Connect session failed';
  const upstreamCode = responseData?.code || rawErr?.code;
  return {
    error: typeof upstreamMessage === 'string' ? upstreamMessage : JSON.stringify(upstreamMessage),
    code: upstreamCode,
  };
}

describe('createConnectSession error mapping', () => {
  it('the EXACT prod payload: Nango resource_capped object -> real message + code (not [object Object])', () => {
    const err = { response: { status: 400, data: { error: { code: 'resource_capped', message: 'Reached maximum number of allowed connections. Upgrade your plan to get rid of connection limits.' } } } };
    const out = mapError(err);
    expect(out.error).toBe('Reached maximum number of allowed connections. Upgrade your plan to get rid of connection limits.');
    expect(out.code).toBe('resource_capped');
    expect(out.error).not.toBe('[object Object]');
  });

  it('output error is ALWAYS a string', () => {
    expect(typeof mapError({ response: { data: { error: { code: 'x', message: 'm' } } } }).error).toBe('string');
    expect(typeof mapError({ message: 'network down' }).error).toBe('string');
    expect(typeof mapError({ response: { data: 'plain string error' } }).error).toBe('string');
    expect(typeof mapError({}).error).toBe('string');
  });

  it('string error passes through', () => {
    expect(mapError({ response: { data: { error: 'bad request' } } }).error).toBe('bad request');
  });

  it('falls back to error.message when no response body', () => {
    expect(mapError({ message: 'socket hang up' }).error).toBe('socket hang up');
  });

  it('never returns the literal [object Object] even for a weird nested object', () => {
    const out = mapError({ response: { data: { error: { weird: { nested: true } } } } });
    expect(out.error).not.toBe('[object Object]');
    expect(typeof out.error).toBe('string');
  });
});
