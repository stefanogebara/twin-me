/**
 * Policy Engine Tests — Safety-Critical Guardrails
 * ==================================================
 * Tests action allowlists, blocked actions, and rate limiting.
 * These tests are critical because a policy engine failure could
 * allow the twin to take unauthorized actions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Redis
vi.mock('../../api/services/redisClient.js', () => ({
  getRedisClient: () => null,
  isRedisAvailable: () => false,
}));

// Mock Supabase
vi.mock('../../api/services/database.js', () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ single: () => ({ data: null }) }) }) }) },
}));

const { checkPolicy, getAllowedActions } = await import('../../api/services/policyEngine.js');

describe('Policy Engine', () => {
  describe('getAllowedActions', () => {
    it('level 0 only allows observe', () => {
      expect(getAllowedActions(0)).toEqual(['observe']);
    });

    it('level 1 allows observe + suggest', () => {
      expect(getAllowedActions(1)).toContain('observe');
      expect(getAllowedActions(1)).toContain('suggest');
      expect(getAllowedActions(1)).not.toContain('execute');
    });

    it('level 2 adds draft', () => {
      expect(getAllowedActions(2)).toContain('draft');
      expect(getAllowedActions(2)).not.toContain('execute');
    });

    it('level 3 adds execute + send_message', () => {
      const actions = getAllowedActions(3);
      expect(actions).toContain('execute');
      expect(actions).toContain('send_message');
    });

    it('level 4 allows everything including modify_memory', () => {
      const actions = getAllowedActions(4);
      expect(actions).toContain('modify_memory');
      expect(actions).toContain('call_api');
    });

    it('clamps invalid levels to 0-4', () => {
      expect(getAllowedActions(-1)).toEqual(['observe']);
      expect(getAllowedActions(99)).toContain('call_api');
    });
  });

  describe('checkPolicy — action allowlists', () => {
    it('blocks execute at level 1', async () => {
      const result = await checkPolicy('user1', 1, 'execute', 'test');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('does not permit');
    });

    it('allows suggest at level 1', async () => {
      const result = await checkPolicy('user1', 1, 'suggest', 'test');
      expect(result.allowed).toBe(true);
    });

    it('allows execute at level 3', async () => {
      const result = await checkPolicy('user1', 3, 'execute', 'test');
      expect(result.allowed).toBe(true);
    });
  });

  describe('checkPolicy — blocked actions', () => {
    it('blocks delete_account at any level', async () => {
      const result = await checkPolicy('user1', 4, 'delete_account', 'test');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('globally blocked');
    });

    it('blocks send_money at any level', async () => {
      const result = await checkPolicy('user1', 4, 'send_money', 'test');
      expect(result.allowed).toBe(false);
    });

    it('blocks post_public at any level', async () => {
      const result = await checkPolicy('user1', 4, 'post_public', 'test');
      expect(result.allowed).toBe(false);
    });

    it('blocks modify_auth at any level', async () => {
      const result = await checkPolicy('user1', 4, 'modify_auth', 'test');
      expect(result.allowed).toBe(false);
    });
  });

  describe('checkPolicy — rate limiting', () => {
    it('allows first execution', async () => {
      const result = await checkPolicy('ratelimit-user', 3, 'execute', 'test');
      expect(result.allowed).toBe(true);
    });

    it('allows up to 10 executions per hour', async () => {
      for (let i = 0; i < 9; i++) {
        const result = await checkPolicy('ratelimit-user2', 3, 'execute', 'test');
        expect(result.allowed).toBe(true);
      }
    });

    it('blocks after rate limit exceeded', async () => {
      const userId = 'ratelimit-burst-' + Date.now();
      for (let i = 0; i < 10; i++) {
        await checkPolicy(userId, 3, 'execute', 'test');
      }
      const result = await checkPolicy(userId, 3, 'execute', 'test');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Rate limit');
    });
  });
});
