/**
 * platformExperts — the person's language (Portrait spec, 2026-09-03)
 * ===================================================================
 * Two generators write the readings the Portrait shows: reflectionEngine's five
 * core experts, and these nine per-platform specialists. Only the first was told
 * to speak plainly, so most receipt-backed readings in production came out in
 * the third person and full of PRs, branches and merges — the exact vocabulary
 * the product forbids. The rule belongs to both.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn(),
  TIER_ANALYSIS: 'analysis',
}));
vi.mock('../../../api/services/memoryStreamService.js', () => ({
  retrieveMemories: vi.fn().mockResolvedValue([]),
  addReflection: vi.fn().mockResolvedValue({ id: 'r1' }),
}));
vi.mock('../../../api/services/database.js', () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock('../../../api/services/embeddingService.js', () => ({ generateEmbedding: vi.fn().mockResolvedValue(null) }));
vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { complete } = await import('../../../api/services/llmGateway.js');
const { supabaseAdmin } = await import('../../../api/services/database.js');
const { runPlatformExpert, PLATFORM_EXPERTS } = await import('../../../api/services/platformExperts.js');
const { PLAIN_LANGUAGE_RULE } = await import('../../../api/services/reflectionEngine.js');

beforeEach(() => {
  vi.clearAllMocks();
  supabaseAdmin.from.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({
      data: [{ id: 'o1', content: 'Opened PR #22 in roca from branch "claude/cards-v2"' }],
      error: null,
    }),
  });
  complete.mockResolvedValue({ content: '1. You finish a change the same day you start it.' });
});

describe('the plain-language rule', () => {
  it('names the jargon the readings must not use', () => {
    expect(PLAIN_LANGUAGE_RULE).toContain('Address the person as "you"');
    for (const word of ['PRs', 'commits', 'branches', 'repos', 'HRV']) {
      expect(PLAIN_LANGUAGE_RULE).toContain(word);
    }
  });
});

describe('a platform expert speaks the person\'s language', () => {
  it('sends the rule with the prompt', async () => {
    await runPlatformExpert('user-1', 'github');
    expect(complete).toHaveBeenCalled();
    const [{ messages }] = complete.mock.calls[0];
    expect(messages[0].content).toContain(PLAIN_LANGUAGE_RULE.trim());
  });

  it('sends it for every platform that has an expert', async () => {
    for (const expert of PLATFORM_EXPERTS) {
      complete.mockClear();
      await runPlatformExpert('user-1', expert.platform);
      const call = complete.mock.calls[0];
      expect(call, `no model call for ${expert.id}`).toBeTruthy();
      expect(call[0].messages[0].content, `rule missing for ${expert.id}`).toContain('Address the person as "you"');
    }
  });
});
