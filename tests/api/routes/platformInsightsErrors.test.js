/**
 * Unit tests for api/routes/platform-insights.js — isTransientInsightsError.
 *
 * audit-2026-06-10 (insights-truth): the GET /:platform catch-all used to
 * report EVERY failure as `generating: true`, forcing the client to poll for
 * 90s before rendering a fake "Connect <platform>" state. The route now only
 * keeps the `generating` contract for transient `withTimeout` deadlines and
 * flags everything else with { error: true, message }. This classifier is the
 * pivot of that decision — pin it.
 */
import { describe, it, expect } from 'vitest';
import { isTransientInsightsError } from '../../../api/routes/platform-insights.js';

describe('isTransientInsightsError', () => {
  it('classifies withTimeout deadline errors as transient', () => {
    // Exact message shape produced by withTimeout() in the route.
    expect(isTransientInsightsError(new Error('Insights request timed out after 12000ms'))).toBe(true);
    expect(isTransientInsightsError(new Error('Insights request timed out after 20000ms'))).toBe(true);
  });

  it('is case-insensitive on the timeout marker', () => {
    expect(isTransientInsightsError(new Error('Request Timed Out'))).toBe(true);
  });

  it('classifies ordinary failures as persistent', () => {
    expect(isTransientInsightsError(new Error('relation "user_platform_data" does not exist'))).toBe(false);
    expect(isTransientInsightsError(new Error('LLM provider returned 401'))).toBe(false);
    expect(isTransientInsightsError(new TypeError("Cannot read properties of undefined (reading 'success')"))).toBe(false);
  });

  it('never throws on degenerate inputs (catch-all must stay alive)', () => {
    expect(isTransientInsightsError(null)).toBe(false);
    expect(isTransientInsightsError(undefined)).toBe(false);
    expect(isTransientInsightsError({})).toBe(false);
    expect(isTransientInsightsError({ message: 42 })).toBe(false);
    expect(isTransientInsightsError('timed out')).toBe(false); // string, not Error — no .message
  });
});
