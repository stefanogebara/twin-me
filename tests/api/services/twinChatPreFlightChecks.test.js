/**
 * Tests for runChatPreFlightChecks — focus on the audit fixes shipped on
 * 2026-05-12 (bug C2: max-tier must bypass the per-user rate limiter AND
 * the monthly quota).
 *
 * Strategy: mock every collaborator (subscription, feature flags, usage,
 * rate limiter, freemium paywall) so the function under test is the only
 * branching logic exercised.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUserSubscription = vi.fn();
const mockGetFeatureFlags = vi.fn();
const mockGetMonthlyUsage = vi.fn();
const mockCheckChatRateLimit = vi.fn();

vi.mock('../../../api/services/subscriptionService.js', () => ({
  getUserSubscription: (...args) => mockGetUserSubscription(...args),
  PLAN_DISPLAY_NAMES: { free: 'Free', pro: 'Plus', max: 'Pro' },
}));

vi.mock('../../../api/services/featureFlagsService.js', () => ({
  getFeatureFlags: (...args) => mockGetFeatureFlags(...args),
}));

vi.mock('../../../api/routes/chat-usage.js', () => ({
  getMonthlyUsage: (...args) => mockGetMonthlyUsage(...args),
}));

vi.mock('../../../api/services/chatRateLimiter.js', () => ({
  checkChatRateLimit: (...args) => mockCheckChatRateLimit(...args),
}));

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      // Freemium paywall counts assistant messages; 0 keeps the gate open.
      then: vi.fn(resolve => resolve({ data: [], error: null, count: 0 })),
    })),
  },
}));

const { runChatPreFlightChecks } = await import(
  '../../../api/services/twinChatPreFlightChecks.js'
);

const TEST_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

describe('runChatPreFlightChecks — max-tier bypass (audit bug C2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFeatureFlags.mockResolvedValue({});
  });

  it('max-tier user bypasses the per-user rate limiter even when it would deny', async () => {
    mockGetUserSubscription.mockResolvedValue({ plan: 'max', status: 'active' });
    mockGetMonthlyUsage.mockResolvedValue({ used: 35, limit: Infinity, tier: 'max' });
    // Even if the limiter says deny, max-tier must short-circuit before this.
    mockCheckChatRateLimit.mockResolvedValue({
      allowed: false,
      used: 999,
      limit: 200,
      retryAfterMs: 30000,
    });

    const result = await runChatPreFlightChecks({ userId: TEST_USER });

    expect(result.ok).toBe(true);
    // CRITICAL: the rate limiter must NOT be called for unlimited tiers.
    expect(mockCheckChatRateLimit).not.toHaveBeenCalled();
  });

  it('max-tier user bypasses the monthly quota check', async () => {
    mockGetUserSubscription.mockResolvedValue({ plan: 'max', status: 'active' });
    // Even with a (paradoxical) finite limit returned, max should bypass.
    mockGetMonthlyUsage.mockResolvedValue({ used: 9999, limit: 100, tier: 'max' });
    mockCheckChatRateLimit.mockResolvedValue({ allowed: true, used: 1, limit: 200 });

    const result = await runChatPreFlightChecks({ userId: TEST_USER });

    expect(result.ok).toBe(true);
    // Pre-flight returns 200-OK shape, NOT the 429 monthly_limit_reached body.
    expect(result.status).toBeUndefined();
  });

  it('pro-tier user still runs the rate limiter (regression guard)', async () => {
    mockGetUserSubscription.mockResolvedValue({ plan: 'pro', status: 'active' });
    mockGetMonthlyUsage.mockResolvedValue({ used: 10, limit: 1500, tier: 'pro' });
    mockCheckChatRateLimit.mockResolvedValue({ allowed: true, used: 1, limit: 200 });

    const result = await runChatPreFlightChecks({ userId: TEST_USER });

    expect(result.ok).toBe(true);
    expect(mockCheckChatRateLimit).toHaveBeenCalledTimes(1);
  });

  it('pro-tier user is denied with monthly_limit_reached when quota exhausted', async () => {
    mockGetUserSubscription.mockResolvedValue({ plan: 'pro', status: 'active' });
    mockGetMonthlyUsage.mockResolvedValue({ used: 1500, limit: 1500, tier: 'pro' });
    mockCheckChatRateLimit.mockResolvedValue({ allowed: true, used: 1, limit: 200 });

    const result = await runChatPreFlightChecks({ userId: TEST_USER });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(429);
    expect(result.body.error).toBe('monthly_limit_reached');
  });

  it('pro-tier user is denied with hourly_rate_limit when limiter trips', async () => {
    mockGetUserSubscription.mockResolvedValue({ plan: 'pro', status: 'active' });
    mockGetMonthlyUsage.mockResolvedValue({ used: 10, limit: 1500, tier: 'pro' });
    mockCheckChatRateLimit.mockResolvedValue({
      allowed: false,
      used: 200,
      limit: 200,
      retryAfterMs: 30000,
    });

    const result = await runChatPreFlightChecks({ userId: TEST_USER });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(429);
    expect(result.body.error).toBe('hourly_rate_limit');
  });
});
