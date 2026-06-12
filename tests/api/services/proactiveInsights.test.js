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

// inSilicoEngine mock removed — the engine was deleted (replan-2026-06-10 cycle 4).

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
let recentInsightRows = [];

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
            // if recentInsightRows populated → isInsightDuplicate fetch
            // if pendingNudges populated → evaluateNudgeOutcomes fetch
            // if nudgeHistoryRows populated → getNudgeHistory fetch
            // else empty
            data: recentInsightRows.length
              ? recentInsightRows
              : (pendingNudges.length ? pendingNudges : nudgeHistoryRows),
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
  isInsightDuplicate,
  _findUngroundedNumbers,
  _stripDigitsForDedup,
  _extractInsightTheme,
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
    recentInsightRows = [];
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

/**
 * Hallucination guard (audit-2026-05-16).
 *
 * Prod audit found stored insights that cited stat-numbers absent from the
 * supplied observations:
 *   - "46% recovery for the third day in a row" with ZERO Whoop rows in window
 *   - "10 emails from github.com" when observation said "github.com (13)"
 *   - "3502 of 42605 inbox messages" when observation said "3506 of 42654"
 *   - "35% work and 30% dev" when observation said "work 20%, dev 65%"
 *
 * Root cause: prompt's HARD REQUIREMENTS demanded 3+ specific data points
 * across 2+ platforms with no abstention path. _findUngroundedNumbers is
 * the post-LLM check that catches fabricated stat-numbers before they hit
 * the DB. These tests use the exact strings from the prod audit so a
 * regression of either the prompt or the regex surfaces immediately.
 */
describe('_findUngroundedNumbers — hallucination guard (audit-2026-05-16)', () => {
  it('returns empty array when every cited number appears in evidence', () => {
    const insight = "you're on a 6-day GitHub streak with 13 emails from github.com — close the laptop tonight";
    const evidence = "Current GitHub contribution streak: 6 consecutive days. Most frequent email senders this week: github.com (13)";
    expect(_findUngroundedNumbers(insight, evidence)).toEqual([]);
  });

  it('flags fabricated Whoop recovery score (prod insight #4 — no Whoop data)', () => {
    const insight = "You're at 46% recovery for the third day in a row while doing 32% of your coding on weekends";
    // Evidence has GitHub but no Whoop at all
    const evidence = "Your GitHub 2026 activity: 5021 contributions. Current GitHub contribution streak: 6 consecutive days.";
    const ungrounded = _findUngroundedNumbers(insight, evidence);
    expect(ungrounded).toContain('46%');
    expect(ungrounded).toContain('32%');
  });

  it('flags fabricated inbox counts (prod insight #12 — 3502/42605 vs real 3506/42654)', () => {
    const insight = "10 emails from github.com and 3 from substack.com this week, read 3502 out of 42605 total";
    const evidence = "Most frequent email senders this week: github.com (13). Reads 8% of incoming email (3506 of 42654 inbox messages read)";
    const ungrounded = _findUngroundedNumbers(insight, evidence);
    expect(ungrounded).toContain('10');
    expect(ungrounded).toContain('3502');
    expect(ungrounded).toContain('42605');
  });

  it('flags swapped percentages (prod insight #15 — work/dev reversed)', () => {
    const insight = "your email mix shifted to 35% work and 30% dev this week";
    // Real observation had different percentages — 35 isn't anywhere in evidence
    const evidence = "Your email mix this week: dev 60%, work 20%, newsletter 10%, social 5%";
    const ungrounded = _findUngroundedNumbers(insight, evidence);
    expect(ungrounded).toContain('35%');
  });

  it('does NOT flag clock times in the action prescription', () => {
    // "11am" and "7 PM" are action-prescription times, not stats — must be ignored.
    const insight = "your recovery dropped to 42% — push tomorrow's standup to 11am or do nothing after 7 PM";
    const evidence = "Whoop recovery score today: 42%";
    expect(_findUngroundedNumbers(insight, evidence)).toEqual([]);
  });

  it('does NOT flag durations in the action prescription', () => {
    // "30 min" and "2 hours" are durations, not stats — must be ignored.
    const insight = "you've had 42% recovery this week — block 30 min for focus and walk 2 hours Sunday";
    const evidence = "Whoop recovery this week: 42%";
    expect(_findUngroundedNumbers(insight, evidence)).toEqual([]);
  });

  it('does NOT flag "by 11am" and "after 7pm" patterns', () => {
    const insight = "13 emails from github.com piling up — reply to top 3 by 11am after 7pm tonight";
    const evidence = "Most frequent email senders this week: github.com (13)";
    expect(_findUngroundedNumbers(insight, evidence)).toEqual([]);
  });

  it('matches percentages with or without %', () => {
    // If evidence says "42% recovery", insight saying "42%" must match
    expect(_findUngroundedNumbers('your recovery is 42%', 'Whoop recovery 42%')).toEqual([]);
    // If evidence says "42 recovery" (bare), insight "42%" must still match (bare 42 in evidence)
    expect(_findUngroundedNumbers('your recovery is 42%', 'Whoop recovery 42 today')).toEqual([]);
  });

  it('skips single-digit numbers (1-9) — too noisy', () => {
    // "3 days", "4 meetings" — single digits aren't grounded against, by design.
    const insight = "3 meetings before 9am and 4 from LinkedIn — push the next 3 to afternoon";
    const evidence = "Calendar event count: 1"; // only "1" in evidence, but singles ignored
    expect(_findUngroundedNumbers(insight, evidence)).toEqual([]);
  });

  it('handles empty and null inputs gracefully', () => {
    expect(_findUngroundedNumbers('', 'evidence')).toEqual([]);
    expect(_findUngroundedNumbers('insight', '')).toBeInstanceOf(Array);
    expect(_findUngroundedNumbers(null, null)).toEqual([]);
    expect(_findUngroundedNumbers(undefined, undefined)).toEqual([]);
  });

  it('flags a multi-digit count that does not appear in evidence', () => {
    // "1500" is a stat, not in evidence — must be flagged.
    const insight = "spent $1500 on coffee this month while your Whoop strain hit 18.5";
    const evidence = "Whoop strain today: 18.5";
    const ungrounded = _findUngroundedNumbers(insight, evidence);
    expect(ungrounded).toContain('1500');
    expect(ungrounded).not.toContain('18'); // 18.5 includes "18" so partial-match grounds it
  });
});

/**
 * Dedup hardening (replan-2026-06-10 Track B).
 *
 * Audit found the 40k-unread email stat delivered 6+ times in 3 days: the
 * lexical dedup layers compare digits, so a daily-incrementing count
 * ("40,381 unread" → "40,448 unread") defeats both the prefix match and the
 * keyword Jaccard every single day. Two fixes under test:
 *   1. Digits are stripped before the lexical comparison.
 *   2. A per-THEME cooldown (keyword-set themes, 7 days) rejects reworded
 *      re-deliveries even when no lexical layer fires.
 */
describe('_stripDigitsForDedup (replan-2026-06-10)', () => {
  it('makes incrementing counts compare equal', () => {
    expect(_stripDigitsForDedup('40,381 unread emails'))
      .toBe(_stripDigitsForDedup('40,448 unread emails'));
  });

  it('removes digit runs including separators and decimals', () => {
    expect(_stripDigitsForDedup('strain hit 18.5 after 3 meetings')).toBe('strain hit after meetings');
  });

  it('preserves digit-free text and collapses whitespace', () => {
    expect(_stripDigitsForDedup('your inbox keeps growing')).toBe('your inbox keeps growing');
  });

  it('handles null / undefined / empty', () => {
    expect(_stripDigitsForDedup(null)).toBe('');
    expect(_stripDigitsForDedup(undefined)).toBe('');
    expect(_stripDigitsForDedup('')).toBe('');
  });
});

describe('_extractInsightTheme (replan-2026-06-10)', () => {
  it('detects the email-backlog theme from unread-count phrasing', () => {
    expect(_extractInsightTheme('Your Gmail inbox has 40,381 unread emails piling up'))
      .toBe('email-backlog');
  });

  it('detects email-backlog from a reworded variant with no shared numbers', () => {
    expect(_extractInsightTheme('that email backlog keeps growing — archive a few senders tonight'))
      .toBe('email-backlog');
  });

  it('detects the github-backlog theme from PR-review phrasing', () => {
    expect(_extractInsightTheme('158 open PRs on GitHub — block 90 minutes tomorrow for review'))
      .toBe('github-backlog');
  });

  it('requires at least 2 theme keywords — a lone mention is not a theme', () => {
    // Only "email" matches; one keyword must not lock the whole theme for a week.
    expect(_extractInsightTheme('reply to Sarah by email tonight')).toBe(null);
    // Only "github" matches; a commits celebration is not the PR-backlog theme.
    expect(_extractInsightTheme('you crossed 5000 GitHub contributions this year')).toBe(null);
  });

  it('returns null for themeless text', () => {
    expect(_extractInsightTheme('you played OK Computer twice yesterday')).toBe(null);
    expect(_extractInsightTheme('')).toBe(null);
  });
});

describe('isInsightDuplicate — digit-strip + theme cooldown (replan-2026-06-10)', () => {
  const daysAgo = (n) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();

  it('rejects the same insight when only the count incremented (digit-strip)', async () => {
    recentInsightRows = [{
      insight: 'Your Gmail inbox has 40,381 unread emails piling up — archive the top 50 senders tonight',
      category: 'concern',
      created_at: daysAgo(3),
    }];
    const dup = await isInsightDuplicate(
      USER_ID,
      'Your Gmail inbox has 40,448 unread emails piling up — archive the top 50 senders tonight',
      'trend'
    );
    expect(dup).toBe(true);
  });

  it('rejects a fully reworded insight on the same theme within 7 days', async () => {
    // No shared prefix, near-zero keyword overlap — only the theme matches.
    recentInsightRows = [{
      insight: 'you ignored your gmail inbox again — 40,448 unread messages and counting',
      category: 'trend',
      created_at: daysAgo(2),
    }];
    const dup = await isInsightDuplicate(
      USER_ID,
      'that email backlog keeps growing; archive a few senders tonight',
      'concern'
    );
    expect(dup).toBe(true);
  });

  it('allows an insight on a different theme', async () => {
    recentInsightRows = [{
      insight: 'you ignored your gmail inbox again — 40,448 unread messages and counting',
      category: 'trend',
      created_at: daysAgo(2),
    }];
    const dup = await isInsightDuplicate(
      USER_ID,
      'your Whoop recovery jumped after two rest days — schedule the long run Saturday',
      'celebration'
    );
    expect(dup).toBe(false);
  });

  it('allows a themeless insight that shares nothing with recent rows', async () => {
    recentInsightRows = [{
      insight: 'Your Gmail inbox has 40,381 unread emails piling up',
      category: 'concern',
      created_at: daysAgo(3),
    }];
    const dup = await isInsightDuplicate(
      USER_ID,
      'you played OK Computer twice yesterday — tonight after 7 your calendar is clear, put it on',
      'nudge'
    );
    expect(dup).toBe(false);
  });
});
