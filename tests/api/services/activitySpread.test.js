/**
 * activitySpread — the pure spread calculator kept for future eval arms.
 *
 * Not rendered into the prompt today: a v2 digest printed it per platform
 * and the fidelity score did not move (twin-research/fidelity-eval.js
 * verdict log, 2026-08-12). Kept tested so a re-trial does not have to
 * rebuild and re-verify the logic.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const { activitySpread } = await import('../../../api/services/recentPlatformDigest.js');

const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const at = (iso) => Date.parse(iso);

describe('activitySpread', () => {
  it('distinguishes a one-day cluster from the same volume spread out', () => {
    const clustered = activitySpread(
      ['2026-08-10T09:00:00Z', '2026-08-10T11:00:00Z', '2026-08-10T14:00:00Z', '2026-08-10T16:00:00Z'].map(at),
      fmt,
    );
    const spread = activitySpread(
      ['2026-08-07T09:00:00Z', '2026-08-08T09:00:00Z', '2026-08-09T09:00:00Z', '2026-08-10T09:00:00Z'].map(at),
      fmt,
    );

    expect(clustered.activeDays).toBe(1);
    expect(clustered.perActiveDay).toBe(4);
    expect(spread.activeDays).toBe(4);
    expect(spread.perActiveDay).toBe(1);
  });

  it('reports the busiest day and its count', () => {
    const result = activitySpread(
      ['2026-08-10T09:00:00Z', '2026-08-10T10:00:00Z', '2026-08-11T09:00:00Z'].map(at),
      fmt,
    );
    expect(result.busiestDay).toBe('Aug 10');
    expect(result.busiestCount).toBe(2);
  });
});
