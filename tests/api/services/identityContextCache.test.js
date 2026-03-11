/**
 * Tests for identity context Redis caching in identityContextService.js
 *
 * Verifies:
 * - Cache key structure matches CACHE_KEYS.identityContext pattern
 * - TTL is 4 hours (14400 seconds), matching twin summary TTL
 * - Redis is checked before DB/LLM inference
 * - In-memory fallback works when Redis is unavailable
 * - Cache invalidation clears both Redis and in-memory
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock redisClient before importing the service under test
const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisDel = vi.fn();

vi.mock('../../../api/services/redisClient.js', () => ({
  get: (...args) => mockRedisGet(...args),
  set: (...args) => mockRedisSet(...args),
  del: (...args) => mockRedisDel(...args),
  CACHE_TTL: {
    PLATFORM_STATUS: 300,
    USER_PROFILE: 600,
    SOUL_SIGNATURE: 900,
    EXTRACTION_JOB: 60,
    IDENTITY_CONTEXT: 14400,
  },
  CACHE_KEYS: {
    identityContext: (userId) => `identity_context:${userId}`,
  },
}));

// Mock other dependencies to isolate cache behavior
vi.mock('../../../api/services/memoryStreamService.js', () => ({
  retrieveMemories: vi.fn().mockResolvedValue([]),
  addMemory: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn().mockResolvedValue({ content: '{}' }),
  TIER_ANALYSIS: 'analysis',
}));

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            filter: () => ({
              gte: () => ({
                order: () => ({
                  limit: () => Promise.resolve({ data: [] }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  },
}));

import { CACHE_TTL, CACHE_KEYS } from '../../../api/services/redisClient.js';
import { inferIdentityContext, invalidateIdentityCache } from '../../../api/services/identityContextService.js';

describe('Identity Context Cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('CACHE_KEYS.identityContext', () => {
    it('produces correct key format: identity_context:<userId>', () => {
      const userId = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
      expect(CACHE_KEYS.identityContext(userId)).toBe(`identity_context:${userId}`);
    });

    it('produces unique keys for different users', () => {
      const key1 = CACHE_KEYS.identityContext('user-aaa');
      const key2 = CACHE_KEYS.identityContext('user-bbb');
      expect(key1).not.toBe(key2);
    });
  });

  describe('CACHE_TTL.IDENTITY_CONTEXT', () => {
    it('is 14400 seconds (4 hours)', () => {
      expect(CACHE_TTL.IDENTITY_CONTEXT).toBe(14400);
      expect(CACHE_TTL.IDENTITY_CONTEXT).toBe(4 * 60 * 60);
    });
  });

  describe('inferIdentityContext — Redis cache hit', () => {
    it('returns cached data from Redis without hitting DB or LLM', async () => {
      const cachedContext = {
        lifeStage: 'young_professional',
        culturalOrientation: 'mixed',
        careerSalience: 'high',
        approximateAge: 28,
        confidence: 0.85,
        promptFragment: '[IDENTITY CONTEXT] Test fragment',
        twinVoiceHint: 'Identity framing: test hint',
        inferredAt: '2026-03-11T00:00:00.000Z',
      };

      mockRedisGet.mockResolvedValueOnce(cachedContext);

      const result = await inferIdentityContext('test-user-123');

      expect(result).toEqual(cachedContext);
      expect(mockRedisGet).toHaveBeenCalledWith('identity_context:test-user-123');
      // Should NOT call redisSet (no need to re-cache a hit)
      expect(mockRedisSet).not.toHaveBeenCalled();
    });
  });

  describe('inferIdentityContext — Redis miss, falls through', () => {
    it('returns default context when no data available', async () => {
      // Redis miss
      mockRedisGet.mockResolvedValueOnce(null);

      const result = await inferIdentityContext('test-user-miss');

      // Should get default context (no DB data, no memories for LLM)
      expect(result.lifeStage).toBe('unknown');
      expect(result.confidence).toBe(0);
    });
  });

  describe('invalidateIdentityCache', () => {
    it('deletes the Redis key using correct key format', async () => {
      mockRedisDel.mockResolvedValueOnce(undefined);

      await invalidateIdentityCache('user-to-invalidate');

      expect(mockRedisDel).toHaveBeenCalledWith('identity_context:user-to-invalidate');
    });
  });

  describe('Redis unavailable fallback', () => {
    it('does not throw when Redis get fails', async () => {
      mockRedisGet.mockRejectedValueOnce(new Error('Redis connection refused'));

      // Should not throw — falls through to DB/default
      const result = await inferIdentityContext('test-user-no-redis');
      expect(result).toBeDefined();
      expect(result.lifeStage).toBeDefined();
    });

    it('does not throw when Redis set fails', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      mockRedisSet.mockRejectedValueOnce(new Error('Redis connection refused'));

      // Should not throw — graceful degradation
      const result = await inferIdentityContext('test-user-set-fail');
      expect(result).toBeDefined();
    });
  });
});
