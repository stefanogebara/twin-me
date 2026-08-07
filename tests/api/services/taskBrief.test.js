/**
 * Task brief compiler — contract tests.
 *
 * The load-bearing behaviour is provenance handling (issue #237): the twin
 * has stored its own hallucinated replies as memories and later cited them
 * as evidence ("you live in Lugano"). A brief handed to an execution agent
 * must never carry twin-asserted claims, and only user-stated evidence may
 * put a claim in the act_on autonomy tier.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const retrieveDiverseMemoriesMock = vi.fn();
vi.mock('../../../api/services/memoryStreamService.js', () => ({
  retrieveDiverseMemories: (...a) => retrieveDiverseMemoriesMock(...a),
}));

const completeMock = vi.fn();
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: (...a) => completeMock(...a),
  TIER_ANALYSIS: 'analysis',
}));

const { trustTier, deriveAutonomy, parseBriefJson, compileTaskBrief } =
  await import('../../../api/services/taskBriefService.js');

const USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const recent = new Date().toISOString();

const mem = (over = {}) => ({
  id: over.id || `m-${Math.random().toString(36).slice(2, 8)}`,
  content: 'content',
  memory_type: 'fact',
  importance_score: 8,
  confidence: 0.9,
  created_at: recent,
  metadata: {},
  ...over,
});

describe('trustTier', () => {
  it('classifies life-story and user-role conversation as user_stated', () => {
    expect(trustTier(mem({ metadata: { source: 'life_story' } }))).toBe('user_stated');
    expect(trustTier(mem({ memory_type: 'conversation', metadata: { source: 'twin_chat', role: 'user' } }))).toBe('user_stated');
    expect(trustTier(mem({ metadata: { source: 'telegram' } }))).toBe('user_stated');
  });

  it('classifies platform data as observed and reflections as derived', () => {
    expect(trustTier(mem({ memory_type: 'platform_data', metadata: { source: 'spotify' } }))).toBe('observed');
    expect(trustTier(mem({ memory_type: 'reflection', metadata: { source: 'reflection_engine' } }))).toBe('derived');
    expect(trustTier(mem({ metadata: { source: 'query_filing' } }))).toBe('derived');
  });

  it('classifies the twin\'s own replies as twin_asserted — the Lugano case', () => {
    const lugano = mem({
      memory_type: 'conversation',
      content: "You're Stefano, a Brazilian-Swiss entrepreneur living in Lugano.",
      metadata: { source: 'twin_chat', role: 'assistant' },
    });
    expect(trustTier(lugano)).toBe('twin_asserted');
  });

  it('defaults unknown fact sources to derived, never to trusted', () => {
    expect(trustTier(mem({ metadata: { source: 'some_future_pipeline' } }))).toBe('derived');
  });
});

describe('deriveAutonomy', () => {
  const pref = (level, provenance) => ({ claim: `${level}/${provenance}`, confidence: { level }, provenance });

  it('routes hard constraints to never_violate regardless of confidence', () => {
    const a = deriveAutonomy([], [{ claim: 'no alcohol', kind: 'hard' }, { claim: 'prefers window seat', kind: 'soft' }]);
    expect(a.never_violate).toEqual(['no alcohol']);
    expect(a.prefer_but_flexible).toContain('prefers window seat');
  });

  it('requires BOTH high confidence AND user_stated provenance for act_on', () => {
    const a = deriveAutonomy(
      [pref('high', 'user_stated'), pref('high', 'derived'), pref('medium', 'user_stated'), pref('low', 'user_stated')],
      []
    );
    expect(a.act_on).toEqual(['high/user_stated']);
    expect(a.prefer_but_flexible).toEqual(expect.arrayContaining(['high/derived', 'medium/user_stated']));
    expect(a.confirm_first).toEqual(['low/user_stated']);
  });

  it('always sets confirm_before_payment', () => {
    expect(deriveAutonomy([], []).confirm_before_payment).toBe(true);
  });
});

describe('parseBriefJson', () => {
  const valid = '{"preferences":[],"constraints":[],"budget_guidance":null,"tone":null}';

  it('parses plain and code-fenced JSON', () => {
    expect(parseBriefJson(valid).preferences).toEqual([]);
    expect(parseBriefJson('```json\n' + valid + '\n```').constraints).toEqual([]);
  });

  it('recovers JSON wrapped in prose — observed live from the extraction model', () => {
    const wrapped = 'Here is the brief you asked for:\n' + valid + '\nLet me know if you need more.';
    expect(parseBriefJson(wrapped).preferences).toEqual([]);
  });

  it('throws on garbage and on missing arrays — a wrong brief is worse than none', () => {
    expect(() => parseBriefJson('not json at all')).toThrow();
    expect(() => parseBriefJson('{"preferences": []}')).toThrow(/constraints/);
    expect(() => parseBriefJson('')).toThrow();
  });
});

describe('compileTaskBrief', () => {
  beforeEach(() => vi.clearAllMocks());

  const luganoMemory = mem({
    memory_type: 'conversation',
    content: 'You live in Lugano, Brazilian-Swiss, late 20s.',
    metadata: { source: 'twin_chat', role: 'assistant' },
  });
  const lifeStoryMemory = mem({
    metadata: { source: 'life_story' },
    content: 'They cope with difficult periods by working out, playing sports, and talking to family.',
  });
  const platformMemory = mem({
    memory_type: 'platform_data',
    metadata: { source: 'google_calendar' },
    content: 'Tennis booked 2-3 times a week.',
  });

  it('excludes twin-asserted memories from evidence and reports the exclusion', async () => {
    retrieveDiverseMemoriesMock.mockResolvedValue([luganoMemory, lifeStoryMemory, platformMemory]);
    completeMock.mockResolvedValue({
      content: JSON.stringify({
        preferences: [{ claim: 'Prefers active recovery: sports and family time', evidence: [1, 2] }],
        constraints: [],
        budget_guidance: null,
        tone: null,
      }),
    });

    const brief = await compileTaskBrief(USER, 'plan a recovery weekend');

    expect(brief.evidence.excluded_twin_asserted).toBe(1);
    expect(brief.evidence.used).toBe(2);
    // The evidence the LLM saw must not contain the hallucination.
    const promptEvidence = completeMock.mock.calls[0][0].messages[0].content;
    expect(promptEvidence).not.toMatch(/Lugano/);
    expect(promptEvidence).toMatch(/\[user_stated\]/);
    expect(promptEvidence).toMatch(/\[observed\]/);
  });

  it('scores claims from cited evidence and takes the best provenance tier', async () => {
    retrieveDiverseMemoriesMock.mockResolvedValue([lifeStoryMemory, platformMemory]);
    completeMock.mockResolvedValue({
      content: JSON.stringify({
        preferences: [
          { claim: 'Backed by both', evidence: [1, 2] },
          { claim: 'Observed only', evidence: [2] },
        ],
        constraints: [{ claim: 'No late nights', kind: 'hard', evidence: [1] }],
        budget_guidance: null,
        tone: null,
      }),
    });

    const brief = await compileTaskBrief(USER, 'anything');
    expect(brief.preferences[0].provenance).toBe('user_stated');
    expect(brief.preferences[1].provenance).toBe('observed');
    expect(brief.constraints[0].kind).toBe('hard');
    expect(brief.autonomy.never_violate).toEqual(['No late nights']);
    for (const p of brief.preferences) {
      expect(['high', 'medium', 'low']).toContain(p.confidence.level);
      expect(p.evidence_count).toBeGreaterThan(0);
    }
  });

  it('drops claims whose citations resolve to nothing — no evidence, no claim', async () => {
    retrieveDiverseMemoriesMock.mockResolvedValue([lifeStoryMemory]);
    completeMock.mockResolvedValue({
      content: JSON.stringify({
        preferences: [
          { claim: 'Real', evidence: [1] },
          { claim: 'Invented', evidence: [99] },
          { claim: 'Uncited', evidence: [] },
        ],
        constraints: [],
        budget_guidance: null,
        tone: null,
      }),
    });

    const brief = await compileTaskBrief(USER, 'anything');
    expect(brief.preferences.map(p => p.claim)).toEqual(['Real']);
  });

  it('returns an empty low-confidence brief without calling the LLM when all evidence is twin-asserted', async () => {
    retrieveDiverseMemoriesMock.mockResolvedValue([luganoMemory]);

    const brief = await compileTaskBrief(USER, 'anything');
    expect(completeMock).not.toHaveBeenCalled();
    expect(brief.preferences).toEqual([]);
    expect(brief.evidence.excluded_twin_asserted).toBe(1);
    expect(brief.evidence.overall.level).toBe('low');
    expect(brief.autonomy.confirm_before_payment).toBe(true);
  });

  it('propagates malformed LLM output as an error rather than a degraded brief', async () => {
    retrieveDiverseMemoriesMock.mockResolvedValue([lifeStoryMemory]);
    completeMock.mockResolvedValue({ content: 'sorry, here is prose instead of JSON' });
    await expect(compileTaskBrief(USER, 'anything')).rejects.toThrow(/JSON/);
  });
});
