/**
 * R7 — question-first reflection anchors + self-scaled observation counts
 * (Simile deep-dive .claude/plans/2026-08-01-simile-research R7a/R7c;
 * Generative Agents' question-first reflection, Park et al. 2023, and the
 * 1,000-people paper's "more than 5, fewer than 20 — choose what the
 * evidence depth supports" self-scaling).
 *
 * R7a: each reflection cycle derives ONE salient question per selected
 * expert from the actual recent observations (one ANALYSIS call), and the
 * expert's vector-retrieval anchor becomes static domain query + that
 * question — adaptive focus instead of retrieving the same semantic
 * neighborhood every run. Fail-open: no questions => static anchors,
 * exactly the prior behavior.
 *
 * R7c: expert prompts no longer force "numbered 1., 2., 3." — they scale
 * 1-5 with the evidence and are told not to pad (reflections already
 * dominate the memory stream; honest counts cut both ways).
 *
 * R7b (evidence pointers) already exists: metadata.evidence_memory_ids.
 *
 * Mocks mirror reflectionGuard.test.js so importing reflectionEngine is
 * side-effect free.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn(),
  TIER_ANALYSIS: 'analysis',
}));
vi.mock('../../../api/services/redisClient.js', () => ({ get: vi.fn(), set: vi.fn(), del: vi.fn() }));
vi.mock('../../../api/services/memoryStreamService.js', () => ({
  getRecentMemories: vi.fn(), retrieveMemories: vi.fn(), addReflection: vi.fn(),
  getRecentImportanceSum: vi.fn(), decaySourceMemories: vi.fn(), getMemoryStats: vi.fn(),
}));
vi.mock('../../../api/services/identityContextService.js', () => ({ inferIdentityContext: vi.fn() }));
vi.mock('../../../api/services/database.js', () => ({ supabaseAdmin: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('../../../api/services/embeddingService.js', () => ({
  generateEmbedding: vi.fn(), vectorToString: vi.fn(),
}));
vi.mock('../../../api/services/memoryLinksService.js', () => ({ autoLinkMemory: vi.fn() }));
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const { complete } = await import('../../../api/services/llmGateway.js');
const {
  EXPERT_PERSONAS,
  generateSalientQuestions,
  buildExpertAnchor,
} = await import('../../../api/services/reflectionEngine.js');

const OBSERVATIONS = 'Listened to Radiohead 14 times. Slept 5h twice. Shipped the payments branch.';

beforeEach(() => {
  complete.mockReset();
});

describe('buildExpertAnchor — R7a anchor blending (pure)', () => {
  const expert = EXPERT_PERSONAS[0];

  it('keeps the static domain query when no salient questions exist (fail-open)', () => {
    expect(buildExpertAnchor(expert, null)).toBe(expert.retrievalQuery);
    expect(buildExpertAnchor(expert, {})).toBe(expert.retrievalQuery);
    expect(buildExpertAnchor(expert, { other_expert: 'q?' })).toBe(expert.retrievalQuery);
  });

  it('blends the static query with this expert\'s salient question', () => {
    const anchor = buildExpertAnchor(expert, { [expert.id]: 'Why did their sleep collapse this week?' });
    expect(anchor).toContain(expert.retrievalQuery);
    expect(anchor).toContain('Why did their sleep collapse this week?');
  });

  it('ignores blank or non-string questions', () => {
    expect(buildExpertAnchor(expert, { [expert.id]: '   ' })).toBe(expert.retrievalQuery);
    expect(buildExpertAnchor(expert, { [expert.id]: 42 })).toBe(expert.retrievalQuery);
  });
});

describe('generateSalientQuestions — one call, data-driven focus', () => {
  const experts = EXPERT_PERSONAS.slice(0, 3);

  it('returns per-expert questions from one ANALYSIS call', async () => {
    const payload = Object.fromEntries(experts.map(e => [e.id, `Salient for ${e.id}?`]));
    complete.mockResolvedValue({ content: JSON.stringify(payload) });

    const questions = await generateSalientQuestions('user-1', OBSERVATIONS, experts);
    expect(questions).toEqual(payload);
    expect(complete).toHaveBeenCalledTimes(1);
    const call = complete.mock.calls[0][0];
    expect(call.tier).toBe('analysis');
    const prompt = call.messages[0].content;
    expect(prompt).toContain('Radiohead'); // grounded in the actual observations
    for (const e of experts) expect(prompt).toContain(e.id); // asks per selected expert
  });

  it('drops entries for unknown expert ids and non-string values', async () => {
    complete.mockResolvedValue({
      content: JSON.stringify({
        [experts[0].id]: 'Real question?',
        made_up_expert: 'Should vanish',
        [experts[1].id]: 12,
      }),
    });
    const questions = await generateSalientQuestions('user-1', OBSERVATIONS, experts);
    expect(questions).toEqual({ [experts[0].id]: 'Real question?' });
  });

  it('fails open to null on malformed output', async () => {
    complete.mockResolvedValue({ content: 'no json here at all' });
    expect(await generateSalientQuestions('user-1', OBSERVATIONS, experts)).toBeNull();
  });

  it('fails open to null when the LLM call throws', async () => {
    complete.mockRejectedValue(new Error('gateway down'));
    expect(await generateSalientQuestions('user-1', OBSERVATIONS, experts)).toBeNull();
  });
});

describe('EXPERT_PERSONAS prompts — R7c self-scaled counts', () => {
  it('every expert prompt scales observations 1-5 with the evidence and forbids padding', () => {
    for (const expert of EXPERT_PERSONAS) {
      expect(expert.prompt).toMatch(/between 1 and 5/i);
      expect(expert.prompt.toLowerCase()).toContain('pad');
      // The old fixed-count instruction must be gone
      expect(expert.prompt).not.toContain('numbered 1., 2., 3. on separate lines');
    }
  });
});
