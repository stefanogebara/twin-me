/**
 * Tests for getRedditActivity totalKarma derivation (lint audit 2026-07-02).
 *
 * Bug: `meResp?.total_karma ?? meResp?.link_karma + meResp?.comment_karma ?? null`
 * parses as `(total_karma ?? (link + comment)) ?? null`. When total_karma is
 * absent and either karma operand is undefined, the sum is NaN — and NaN is
 * not nullish, so the trailing `?? null` never fires. identity.total_karma
 * came back NaN instead of a usable number.
 */
import { describe, it, expect } from 'vitest';
import { getRedditActivity } from '../../../../api/services/reddit/analytics/getRedditActivity.js';

/**
 * Fake reddit client: /api/v1/me returns the given identity payload,
 * every other endpoint (karma, subscriptions, history) fails → the
 * function degrades to empty aggregates, which is all we need here.
 */
function makeClient(meResp) {
  return {
    get: async (path) => {
      if (path === '/api/v1/me') return meResp;
      throw new Error(`unmocked endpoint: ${path}`);
    },
  };
}

describe('getRedditActivity — identity.total_karma', () => {
  it('sums partial karma fields treating missing ones as 0 (link_karma only → 5, not NaN)', async () => {
    const result = await getRedditActivity(makeClient({ name: 'testuser', link_karma: 5 }));
    expect(result.identity.total_karma).toBe(5);
  });

  it('prefers total_karma when present, ignoring link/comment karma', async () => {
    const result = await getRedditActivity(
      makeClient({ name: 'testuser', total_karma: 42, link_karma: 5, comment_karma: 3 }),
    );
    expect(result.identity.total_karma).toBe(42);
  });

  it('falls back to 0 when no karma fields are present at all', async () => {
    const result = await getRedditActivity(makeClient({ name: 'testuser' }));
    expect(result.identity.total_karma).toBe(0);
  });

  it('sums link and comment karma when total_karma is absent', async () => {
    const result = await getRedditActivity(
      makeClient({ name: 'testuser', link_karma: 7, comment_karma: 3 }),
    );
    expect(result.identity.total_karma).toBe(10);
  });

  it('returns null when identity fetch fails (no username)', async () => {
    const client = { get: async () => { throw new Error('401'); } };
    const result = await getRedditActivity(client);
    expect(result).toBeNull();
  });
});
