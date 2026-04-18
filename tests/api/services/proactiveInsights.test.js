/**
 * Unit tests for api/services/proactiveInsights.js
 *
 * Coverage:
 *   - generateProactiveInsights filters to recent high-confidence memories
 *     (low-confidence memories below 0.30 are excluded before LLM call)
 *   - evaluateNudgeOutcomes computes keyword overlap and sets nudge_followed
 *   - getNudgeHistory returns only nudges that have been evaluated
 *     (nudge_checked_at is not null)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';

// ── Mocks ────────────────────────────────────────────────────────────────

const getRecentMemoriesMock = vi.fn();
const retrieveMemoriesMock = vi.fn();
vi.mock('../../../api/services/memoryStreamService.js', () => ({
  getRecentMemories: (...a) => getRecentMemoriesMock(...a),
  retrieveMemories: (...a) => retrieveMemoriesMock(...a),
}));

const completeMock = vi.fn();
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: (...a) => completeMock(...a),
  TIER_ANALYSIS: 'analysis',
}));

vi.mock('../../../api/services/pushNotificationService.js', () => ({
  sendPushToUser: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../api/services/inSilicoEngine.js', () => ({
  scoreForInsightSelection: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../twin-research/insight-config.js', () => ({
  INSIGHT_PROMPT_TEMPLATE: 'obs: {observations}\nrefl: {reflections}',
  INSIGHT_TEMPERATURE: 0.65,
  INSIGHT_MAX_TOKENS: 250,
  MEMORIES_TO_SCAN: 300,
  REFLECTIONS_TO_INCLUDE: 15,
  DEDUP_THRESHOLD: 0.7,
}));

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

// Supabase mock with per-call queue
const insertedInsights = [];
const updateCalls = [];
let pendingNudges = [];
let platformDataForEval = [];
let nudgeHistoryRows = [];

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: vi.fn((table) => {
      if (table === 'proactive_insights') {
        // The service chains: .select().eq().gte().order().limit(), or
        //                     .insert(), or
        //                     .update().in('id',...), or
        //                     .delete().eq().eq().lt()/in(), or
        //                     .select().eq().eq().is().gte().lte().limit()
        const chain = {
          select: vi.fn().mockReturnThis(),
          insert: vi.fn((row) => {
            insertedInsights.push(row);
            return Promise.resolve({ error: null });
          }),
          update: vi.fn((patch) => {
            const updateChain = {
              in: vi.fn((col, ids) => {
                updateCalls.push({ patch, ids });
                return Promise.resolve({ error: null });
              }),
              eq: vi.fn((col, val) => {
                updateCalls.push({ patch, eq: { col, val } });
                return Promise.resolve({ error: null });
              }),
            };
            return updateChain;
          }),
          delete: vi.fn(() => ({
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            lt: vi.fn().mockReturnValue({ then: (cb) => Promise.resolve(cb({ error: null })) }),
            then: (cb) => Promise.resolve(cb({ error: null })),
          })),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn(() => Promise.resolve({
            // decide response based on current mode:
            // if pendingNudges populated → evaluateNudgeOutcomes fetch
            // if nudgeHistoryRows populated → getNudgeHistory fetch
            // else empty
            data: pendingNudges.length ? pendingNudges : nudgeHistoryRows,
            error: null,
          })),
        };
        return chain;
      }
      if (table === 'user_memories') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: platformDataForEval, error: null }),
        };
      }
      // default
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }),
  },
}));

const {
  generateProactiveInsights,
  evaluateNudgeOutcomes,
  getNudgeHistory,
} = await import('../../../api/services/proactiveInsights.js');

const USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

describe('proactiveInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertedInsights.length = 0;
    updateCalls.length = 0;
    pendingNudges = [];
    platformDataForEval = [];
    nudgeHistoryRows = [];
  });

  describe('generateProactiveInsights', () => {
    it('filters out low-confidence memories (< 0.30) before LLM call', async () => {
      // 4 memories: 2 high-confidence signals, 2 low-confidence (should be dropped)
      getRecentMemoriesMock.mockResolvedValue([
        { content: 'high-conf signal 1', memory_type: 'platform_data', confidence: 0.8 },
        { content: 'low-conf signal', memory_type: 'platform_data', confidence: 0.1 },
        { content: 'high-conf signal 2', memory_type: 'observation', confidence: 0.9 },
        { content: 'low-conf fact', memory_type: 'fact', confidence: 0.2 },
      ]);
      retrieveMemoriesMock.mockResolvedValue([
        { content: 'reflection 1', memory_type: 'reflection', confidence: 0.8 },
      ]);
      completeMock.mockResolvedValue({
        content: JSON.stringify([
          { insight: 'You seem to focus harder on mondays.', urgency: 'low', category: 'nudge', nudge_action: 'block morning focus time' },
        ]),
      });

      const stored = await generateProactiveInsights(USER_ID);

      expect(completeMock).toHaveBeenCalled();
      const promptArg = completeMock.mock.calls[0][0].messages[0].content;
      expect(promptArg).toContain('high-conf signal 1');
      expect(promptArg).toContain('high-conf signal 2');
      // Low-confidence entries must NOT be in the prompt
      expect(promptArg).not.toContain('low-conf signal');
      expect(promptArg).not.toContain('low-conf fact');
      expect(stored).toBeGreaterThanOrEqual(0);
    });

    it('returns 0 when insufficient memories (< 3)', async () => {
      getRecentMemoriesMock.mockResolvedValue([
        { content: 'only one memory', memory_type: 'platform_data', confidence: 0.8 },
      ]);
      const stored = await generateProactiveInsights(USER_ID);
      expect(stored).toBe(0);
      expect(completeMock).not.toHaveBeenCalled();
    });
  });

  describe('evaluateNudgeOutcomes (keyword overlap)', () => {
    it('marks nudge_followed=true when ≥40% of action keywords match platform data', async () => {
      pendingNudges = [{
        id: '11111111-1111-1111-1111-111111111111',
        nudge_action: 'block thirty minutes focus time tomorrow morning',
        delivered_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        insight: 'test insight',
      }];
      platformDataForEval = [
        // "focus", "morning", "block", "thirty", "minutes", "tomorrow" → most of the action words
        { content: 'Calendar: Focus block scheduled tomorrow morning for thirty minutes' },
      ];

      const evaluated = await evaluateNudgeOutcomes(USER_ID);

      expect(evaluated).toBe(1);
      // At least one update call should set nudge_followed: true
      const followedUpdate = updateCalls.find(c => c.patch?.nudge_followed === true);
      expect(followedUpdate).toBeTruthy();
    });

    it('marks nudge_followed=false when keyword overlap is below threshold', async () => {
      pendingNudges = [{
        id: '22222222-2222-2222-2222-222222222222',
        nudge_action: 'meditation breathing exercise mindfulness practice',
        delivered_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        insight: 'test insight',
      }];
      platformDataForEval = [
        { content: 'Spotify: played rock music, watched videos about cars' },
      ];

      const evaluated = await evaluateNudgeOutcomes(USER_ID);

      expect(evaluated).toBe(1);
      const falseUpdate = updateCalls.find(c => c.patch?.nudge_followed === false);
      expect(falseUpdate).toBeTruthy();
    });

    it('returns 0 when no pending nudges', async () => {
      pendingNudges = [];
      const evaluated = await evaluateNudgeOutcomes(USER_ID);
      expect(evaluated).toBe(0);
    });
  });

  describe('getNudgeHistory', () => {
    it('returns rows with nudge_checked_at populated', async () => {
      nudgeHistoryRows = [
        {
          insight: 'x', nudge_action: 'block focus', nudge_followed: true,
          nudge_outcome: 'followed', delivered_at: '2026-01-01',
        },
        {
          insight: 'y', nudge_action: 'meditate', nudge_followed: false,
          nudge_outcome: 'not followed', delivered_at: '2026-01-02',
        },
      ];
      const result = await getNudgeHistory(USER_ID, 5);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      // Each row should have the expected eval fields present
      expect(result[0]).toHaveProperty('nudge_followed');
      expect(result[0]).toHaveProperty('nudge_outcome');
    });

    it('returns empty array when no evaluated nudges exist', async () => {
      nudgeHistoryRows = [];
      const result = await getNudgeHistory(USER_ID, 5);
      expect(result).toEqual([]);
    });
  });
});
