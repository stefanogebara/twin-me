/**
 * Chapter-nudge tests for the Story Chapters interview (Phase 3).
 *
 * maybeGenerateChapterNudge is the twin-initiated entry point: at most one
 * nudge per week, deterministic text (zero LLM cost — the cost rule for
 * ingestion-path hooks), stored through the proactive_insights channel
 * (category 'nudge', deliberately WITHOUT nudge_action so
 * evaluateNudgeOutcomes marks it checked-but-unknown instead of "not
 * followed"). Ignore tracking: a nudged chapter still incomplete 7 days
 * later counts as ignored; two ignores retire that chapter's nudges (GUM
 * feedback principle — respect revealed preference).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const dbState = { queues: {}, calls: [] };

function makeBuilder(table) {
  const record = (op, args) => dbState.calls.push({ table, op, args });
  const next = () => {
    const q = dbState.queues[table] || [];
    return q.length > 0 ? q.shift() : { data: null, error: null };
  };
  const builder = {};
  for (const op of ['select', 'eq', 'order', 'limit', 'update']) {
    builder[op] = vi.fn((...args) => { record(op, args); return builder; });
  }
  builder.insert = vi.fn((...args) => { record('insert', args); return builder; });
  builder.upsert = vi.fn((...args) => { record('upsert', args); return builder; });
  builder.single = vi.fn(() => Promise.resolve(next()));
  builder.maybeSingle = vi.fn(() => Promise.resolve(next()));
  builder.then = (resolve, reject) => Promise.resolve(next()).then(resolve, reject);
  return builder;
}

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: { from: vi.fn((table) => makeBuilder(table)) },
}));
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn(),
  TIER_ANALYSIS: 'analysis',
  TIER_EXTRACTION: 'extraction',
}));
vi.mock('../../../api/services/memoryStreamService.js', () => ({
  addMemory: vi.fn().mockResolvedValue({ id: 'mem-1' }),
}));
vi.mock('../../../api/services/reflectionEngine.js', () => ({
  shouldTriggerReflection: vi.fn().mockResolvedValue(false),
  generateReflections: vi.fn().mockResolvedValue([]),
}));

const { maybeGenerateChapterNudge, NUDGE_COOLDOWN_MS } = await import(
  '../../../api/services/lifeStoryService.js'
);
const { LIFE_STORY_CHAPTERS } = await import('../../../api/config/lifeStoryScript.js');

const USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const ALL_IDS = LIFE_STORY_CHAPTERS.map(c => c.id);
const DAY_MS = 24 * 60 * 60 * 1000;

const queueState = (over = {}) => {
  dbState.queues['life_story_state'] = [
    { data: { reflection_notes: {}, chapters_completed: [], nudges: {}, ...over }, error: null },
  ];
};

beforeEach(() => {
  dbState.queues = {};
  dbState.calls = [];
  vi.clearAllMocks();
});

describe('maybeGenerateChapterNudge', () => {
  it('exports a 7-day cooldown', () => {
    expect(NUDGE_COOLDOWN_MS).toBe(7 * DAY_MS);
  });

  it('returns null when every chapter is complete', async () => {
    queueState({ chapters_completed: ALL_IDS });
    const result = await maybeGenerateChapterNudge(USER);
    expect(result).toBeNull();
    expect(dbState.calls.some(c => c.table === 'proactive_insights')).toBe(false);
  });

  it('respects the weekly cooldown', async () => {
    queueState({
      nudges: { last_nudge_at: new Date(Date.now() - 2 * DAY_MS).toISOString() },
    });
    const result = await maybeGenerateChapterNudge(USER);
    expect(result).toBeNull();
    expect(dbState.calls.some(c => c.table === 'proactive_insights')).toBe(false);
  });

  it('nudges the first incomplete chapter and records it in state', async () => {
    queueState();
    const result = await maybeGenerateChapterNudge(USER);

    expect(result).toMatchObject({ chapterId: 'your_story' });

    const insert = dbState.calls.find(c => c.table === 'proactive_insights' && c.op === 'insert');
    expect(insert).toBeTruthy();
    expect(insert.args[0].category).toBe('nudge');
    expect(insert.args[0].urgency).toBe('low');
    expect(insert.args[0].nudge_action).toBeUndefined(); // no false "not followed" outcomes
    expect(insert.args[0].insight.length).toBeGreaterThan(20);
    expect(/\p{Extended_Pictographic}/u.test(insert.args[0].insight)).toBe(false);

    const upsert = dbState.calls.find(c => c.table === 'life_story_state' && c.op === 'upsert');
    expect(upsert.args[0].nudges.your_story.sent).toBe(1);
    expect(upsert.args[0].nudges.last_nudge_at).toBeTruthy();
  });

  it('skips chapters ignored twice and nudges the next incomplete one', async () => {
    queueState({
      nudges: {
        your_story: { sent: 2, ignored: 2, evaluated: true },
      },
    });
    const result = await maybeGenerateChapterNudge(USER);
    expect(result).toMatchObject({ chapterId: 'work_purpose' });
  });

  it('counts a stale unanswered nudge as an ignore before generating', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * DAY_MS).toISOString();
    queueState({
      nudges: {
        your_story: { sent: 1, ignored: 0, last_sent_at: eightDaysAgo, evaluated: false },
        last_nudge_at: eightDaysAgo,
      },
    });
    const result = await maybeGenerateChapterNudge(USER);
    // your_story only has 1 ignore now — still eligible, gets re-nudged
    expect(result).toMatchObject({ chapterId: 'your_story' });
    const upsert = dbState.calls.find(c => c.table === 'life_story_state' && c.op === 'upsert');
    expect(upsert.args[0].nudges.your_story.ignored).toBe(1);
    expect(upsert.args[0].nudges.your_story.sent).toBe(2);
  });

  it('does NOT count a nudge as ignored when the chapter was completed', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * DAY_MS).toISOString();
    queueState({
      chapters_completed: ['your_story'],
      nudges: {
        your_story: { sent: 1, ignored: 0, last_sent_at: eightDaysAgo, evaluated: false },
        last_nudge_at: eightDaysAgo,
      },
    });
    const result = await maybeGenerateChapterNudge(USER);
    expect(result).toMatchObject({ chapterId: 'work_purpose' });
    const upsert = dbState.calls.find(c => c.table === 'life_story_state' && c.op === 'upsert');
    expect(upsert.args[0].nudges.your_story.ignored).toBe(0);
    expect(upsert.args[0].nudges.your_story.evaluated).toBe(true);
  });

  it('returns null when every remaining chapter is nudge-retired', async () => {
    const retired = {};
    for (const id of ALL_IDS) retired[id] = { sent: 2, ignored: 2, evaluated: true };
    queueState({ nudges: retired });
    const result = await maybeGenerateChapterNudge(USER);
    expect(result).toBeNull();
  });
});
