/**
 * Tests for createTwinFunction (api/inngest/twinFunction.js).
 *
 * Every function under api/inngest/functions belongs to the legacy twin, which is
 * parked (decision D1, LEGACY_TWIN_ENABLED=false). The crons that emit these events
 * are already gated, but nothing stops a manual Inngest dashboard invoke, a restored
 * cron, or a new caller from firing one directly. createTwinFunction is the gate that
 * makes that path safe regardless of caller: it must not run the inner handler while
 * the twin is parked.
 *
 * Strategy: mock inngestClient.js so createFunction just hands back the wrapped
 * handler it was given, letting the test invoke that handler directly and assert on
 * its return value and on whether the inner handler ran.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockCreateFunction = vi.fn((config, fn) => ({ config, fn }));

vi.mock('../../../api/services/inngestClient.js', () => ({
  inngest: { createFunction: (...args) => mockCreateFunction(...args) },
  EVENTS: {},
}));

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

describe('createTwinFunction', () => {
  afterEach(() => {
    delete process.env.LEGACY_TWIN_ENABLED;
    vi.clearAllMocks();
  });

  it('does not call the inner handler while the twin is parked (LEGACY_TWIN_ENABLED=false)', async () => {
    process.env.LEGACY_TWIN_ENABLED = 'false';
    const { createTwinFunction } = await import('../../../api/inngest/twinFunction.js');

    const innerHandler = vi.fn(async () => ({ should: 'not run' }));
    const wrapped = createTwinFunction({ id: 'some-fn' }, innerHandler);

    const result = await wrapped.fn({ event: {}, step: {} });

    expect(innerHandler).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      reason: 'legacy_twin_parked',
      message: 'LEGACY_TWIN_ENABLED=false',
    });
  });

  it('calls the inner handler with the same context and passes its return value through when LEGACY_TWIN_ENABLED is unset', async () => {
    const { createTwinFunction } = await import('../../../api/inngest/twinFunction.js');

    const innerReturn = { success: true, ran: true };
    const innerHandler = vi.fn(async () => innerReturn);
    const wrapped = createTwinFunction({ id: 'some-fn' }, innerHandler);

    const ctx = { event: { data: { userId: 'u1' } }, step: { run: vi.fn() } };
    const result = await wrapped.fn(ctx);

    expect(innerHandler).toHaveBeenCalledTimes(1);
    expect(innerHandler).toHaveBeenCalledWith(ctx);
    expect(result).toBe(innerReturn);
  });

  it('calls the inner handler when LEGACY_TWIN_ENABLED=true (only the exact string "false" parks it)', async () => {
    process.env.LEGACY_TWIN_ENABLED = 'true';
    const { createTwinFunction } = await import('../../../api/inngest/twinFunction.js');

    const innerHandler = vi.fn(async () => ({ success: true }));
    const wrapped = createTwinFunction({ id: 'some-fn' }, innerHandler);

    await wrapped.fn({ event: {}, step: {} });

    expect(innerHandler).toHaveBeenCalledTimes(1);
  });
});
