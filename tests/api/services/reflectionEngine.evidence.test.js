/**
 * reflectionEngine — receipts (Portrait spec, 2026-09-03)
 * =======================================================
 * A reading must carry the raw events that support it. Before this change the
 * engine's evidence_memory_ids pointed at other reflections, facts and chat turns
 * (its retrieval context), so the Portrait could not show receipts. Now each expert
 * run also retrieves observations only, stores their ids as metadata.observation_ids
 * with a support summary, and does not write a reading with fewer than two of them.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn(),
  TIER_ANALYSIS: 'analysis',
}));
vi.mock('../../../api/services/redisClient.js', () => ({
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../api/services/memoryStreamService.js', () => ({
  getRecentMemories: vi.fn().mockResolvedValue([]),
  retrieveMemories: vi.fn().mockResolvedValue([]),
  addReflection: vi.fn().mockResolvedValue(null),
  getRecentImportanceSum: vi.fn().mockResolvedValue(0),
  decaySourceMemories: vi.fn().mockResolvedValue(undefined),
  getMemoryStats: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/services/identityContextService.js', () => ({
  inferIdentityContext: vi.fn().mockResolvedValue({ promptFragment: null }),
}));
vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../../api/services/embeddingService.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/services/memoryLinksService.js', () => ({
  autoLinkMemory: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../api/services/featureFlagsService.js', () => ({
  getFeatureFlags: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const { supabaseAdmin } = await import('../../../api/services/database.js');
const { complete } = await import('../../../api/services/llmGateway.js');
const { getRecentMemories, retrieveMemories, addReflection } = await import('../../../api/services/memoryStreamService.js');
const { getFeatureFlags } = await import('../../../api/services/featureFlagsService.js');
const { generateReflections, summarizeSupport } = await import('../../../api/services/reflectionEngine.js');

// The engine keeps an in-memory reflection cooldown per user when Redis has no
// entry, so every run in this file uses a fresh user id.
let runNo = 0;
const freshUser = () => `user-${++runNo}`;

const OBS = [
  { id: 'o1', memory_type: 'platform_data', content: "Listened to 'Pipe Down' by Drake at 9:35 AM", metadata: { platform: 'spotify' }, created_at: '2026-09-01T09:35:00Z' },
  { id: 'o2', memory_type: 'platform_data', content: "Listened to 'Pipe Down' by Drake at 10:10 AM", metadata: { platform: 'spotify' }, created_at: '2026-09-03T10:10:00Z' },
  { id: 'o3', memory_type: 'observation', content: 'Opened PR #22 in roca', metadata: { source: 'github' }, created_at: '2026-09-03T11:00:00Z' },
];
const CONTEXT = [
  { id: 'r-old', memory_type: 'reflection', content: 'You use music like a mood dial.', metadata: { expert: 'personality_psychologist' }, created_at: '2026-08-20T00:00:00Z' },
  { id: 'f-1', memory_type: 'fact', content: 'Driven by technical curiosity', metadata: {}, created_at: '2026-03-19T00:00:00Z' },
];

/** supabaseAdmin.from chain for every query the run makes; each resolves to no rows. */
function mockEmptyTables() {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  supabaseAdmin.from.mockReturnValue(chain);
}

function wireRun(observations) {
  mockEmptyTables();
  // The run needs at least three recent memories to start; context rows keep that
  // true even when the events under test are one or none.
  getRecentMemories.mockResolvedValue([...observations, ...CONTEXT]);
  retrieveMemories.mockImplementation(async (_u, _q, _l, _w, options = {}) => (
    Array.isArray(options.memoryTypes) ? observations : CONTEXT
  ));
  complete.mockImplementation(async ({ serviceName }) => (
    serviceName === 'reflection-salient-questions'
      ? { content: 'no json here' }
      : { content: '1. You put the same songs on repeat when a deadline is close, most nights.' }
  ));
  addReflection.mockResolvedValue({ id: 'refl-1' });
}

beforeEach(() => {
  vi.clearAllMocks();
  getFeatureFlags.mockResolvedValue({});
});

describe('summarizeSupport (pure)', () => {
  it('keeps only raw events, counts distinct sources and the span in days', () => {
    const { observationIds, support } = summarizeSupport([...CONTEXT, ...OBS]);
    expect(observationIds).toEqual(['o1', 'o2', 'o3']);
    expect(support).toEqual({ observations: 3, sources: 2, span_days: 3 });
  });

  it('is empty for no events', () => {
    expect(summarizeSupport(CONTEXT)).toEqual({ observationIds: [], support: { observations: 0, sources: 0, span_days: 0 } });
  });
});

describe('generateReflections records receipts', () => {
  it('retrieves observations only and stores their ids and support on the reading', async () => {
    wireRun(OBS);
    const n = await generateReflections(freshUser());
    expect(n).toBeGreaterThan(0);
    const observationCall = retrieveMemories.mock.calls.find(([, , , , o]) => Array.isArray(o?.memoryTypes));
    expect(observationCall[4].memoryTypes).toEqual(['platform_data', 'observation']);
    const [, , , metadata] = addReflection.mock.calls[0];
    expect(metadata.observation_ids).toEqual(['o1', 'o2', 'o3']);
    expect(metadata.support).toEqual({ observations: 3, sources: 2, span_days: 3 });
  });

  it('shows the expert the raw events, in the evidence block', async () => {
    wireRun(OBS);
    await generateReflections(freshUser());
    const expertPrompt = complete.mock.calls.map(([a]) => a).find((a) => a.serviceName !== 'reflection-salient-questions');
    expect(expertPrompt.messages[0].content).toContain('Opened PR #22 in roca');
  });

  it('asks every expert to write to the person, in plain words', async () => {
    wireRun(OBS);
    await generateReflections(freshUser());
    const expertPrompt = complete.mock.calls.map(([a]) => a).find((a) => a.serviceName !== 'reflection-salient-questions');
    expect(expertPrompt.messages[0].content).toContain('Address the person as "you"');
    expect(expertPrompt.messages[0].content).toContain('No platform or technical vocabulary');
  });

  it('does not write a reading with fewer than two events', async () => {
    wireRun([OBS[0]]);
    const n = await generateReflections(freshUser());
    expect(addReflection).not.toHaveBeenCalled();
    expect(n).toBe(0);
  });

  it('writes anyway when the gate flag is explicitly off', async () => {
    wireRun([OBS[0]]);
    getFeatureFlags.mockResolvedValue({ portrait_evidence_gate: false });
    await generateReflections(freshUser());
    expect(addReflection).toHaveBeenCalled();
    const [, , , metadata] = addReflection.mock.calls[0];
    expect(metadata.support.observations).toBe(1);
  });
});
