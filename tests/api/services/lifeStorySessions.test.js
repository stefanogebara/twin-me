/**
 * Phase 1 persistence tests for the Story Chapters interview
 * (lifeStoryService.js session orchestration).
 *
 * Covers the session lifecycle contract:
 *  - startSession: fresh session opens with intro + verbatim first question;
 *    an active session resumes at the last assistant utterance
 *  - processTurn: appends the answer, runs the engine, persists progress,
 *    merges note updates into life_story_state
 *  - chapter completion: Q&A pairs stored as conversation memories
 *    (importance 8), facts (8) and a chapter summary reflection (9), state
 *    marked completed, reflection hook fired
 *  - runaway-session safety cap forces completion
 *
 * All DB access goes through a queued supabaseAdmin mock keyed by table.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

// ---- queued supabase mock -------------------------------------------------
// Each table has a FIFO queue of results; any chained builder resolves with
// the next queued result for its table. `calls` records {table, op, args}.
const dbState = { queues: {}, calls: [] };

function makeBuilder(table) {
  const record = (op, args) => dbState.calls.push({ table, op, args });
  const next = () => {
    const q = dbState.queues[table] || [];
    return q.length > 0 ? q.shift() : { data: null, error: null };
  };
  const builder = {};
  for (const op of ['select', 'eq', 'order', 'limit', 'update', 'contains']) {
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

const { complete } = await import('../../../api/services/llmGateway.js');
const { addMemory } = await import('../../../api/services/memoryStreamService.js');
const { shouldTriggerReflection, generateReflections } = await import(
  '../../../api/services/reflectionEngine.js'
);
const {
  startSession,
  processTurn,
  getLifeStoryStatus,
  MAX_TRANSCRIPT_ENTRIES,
} = await import('../../../api/services/lifeStoryService.js');
const { LIFE_STORY_CHAPTERS } = await import('../../../api/config/lifeStoryScript.js');

const USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const firstChapter = LIFE_STORY_CHAPTERS[0];

const queue = (table, ...results) => {
  dbState.queues[table] = [...(dbState.queues[table] || []), ...results];
};

beforeEach(() => {
  dbState.queues = {};
  dbState.calls = [];
  vi.clearAllMocks();
  addMemory.mockResolvedValue({ id: 'mem-1' });
  shouldTriggerReflection.mockResolvedValue(false);
});

describe('getLifeStoryStatus', () => {
  it('lists all chapters with completion flags from state', async () => {
    queue('life_story_state', {
      data: { chapters_completed: ['your_story'], reflection_notes: {} },
      error: null,
    });
    const status = await getLifeStoryStatus(USER);
    expect(status.totalChapters).toBe(8);
    expect(status.completedCount).toBe(1);
    expect(status.chapters.find(c => c.id === 'your_story').completed).toBe(true);
    expect(status.suggestedNext).not.toBe('your_story');
  });

  it('treats a missing state row as zero progress', async () => {
    queue('life_story_state', { data: null, error: null });
    const status = await getLifeStoryStatus(USER);
    expect(status.completedCount).toBe(0);
    expect(status.suggestedNext).toBe('your_story');
  });
});

describe('startSession', () => {
  it('rejects unknown chapter ids', async () => {
    await expect(startSession(USER, 'not_a_chapter')).rejects.toThrow(/unknown chapter/i);
  });

  it('creates a fresh session opening with intro + verbatim first question', async () => {
    queue('life_story_sessions', { data: [], error: null }); // no active session
    queue('life_story_sessions', {
      data: { id: 'sess-1', chapter_id: firstChapter.id, transcript: [], question_index: 0 },
      error: null,
    }); // insert returning

    const result = await startSession(USER, firstChapter.id);
    expect(result.resumed).toBe(false);
    expect(result.sessionId).toBe('sess-1');
    expect(result.utterance).toContain(firstChapter.intro);
    expect(result.utterance).toContain(firstChapter.questions[0].text); // verbatim
    // The opening utterance must be persisted in the transcript at insert time
    const insert = dbState.calls.find(c => c.table === 'life_story_sessions' && c.op === 'insert');
    expect(insert.args[0].transcript).toHaveLength(1);
    expect(insert.args[0].transcript[0].role).toBe('assistant');
  });

  it('resumes an active session at the last assistant utterance', async () => {
    queue('life_story_sessions', {
      data: [{
        id: 'sess-9',
        chapter_id: firstChapter.id,
        question_index: 1,
        followups_used: 0,
        transcript: [
          { role: 'assistant', content: 'Opening question?' },
          { role: 'user', content: 'My answer.' },
          { role: 'assistant', content: 'Second question, previously asked?' },
        ],
      }],
      error: null,
    });

    const result = await startSession(USER, firstChapter.id);
    expect(result.resumed).toBe(true);
    expect(result.sessionId).toBe('sess-9');
    expect(result.utterance).toBe('Second question, previously asked?');
  });
});

describe('processTurn', () => {
  const activeSession = (over = {}) => ({
    id: 'sess-1',
    user_id: USER,
    chapter_id: firstChapter.id,
    status: 'active',
    question_index: 0,
    followups_used: 0,
    transcript: [{ role: 'assistant', content: firstChapter.questions[0].text }],
    ...over,
  });

  it('returns null for a missing/foreign session (route maps to 404)', async () => {
    queue('life_story_sessions', { data: null, error: null });
    const result = await processTurn(USER, 'sess-x', 'answer');
    expect(result).toBeNull();
  });

  it('persists the answer + next utterance and merges note updates on a normal turn', async () => {
    queue('life_story_sessions', { data: activeSession(), error: null }); // load
    queue('life_story_state', { data: { reflection_notes: { a: 'x' }, chapters_completed: [] }, error: null });
    complete.mockResolvedValueOnce({
      content: '{"objectiveAchieved": false, "followUp": "Which city was that?", "bridge": "", "notes": {"hometown": "Minas"}}',
    });
    queue('life_story_sessions', { data: null, error: null }); // update session
    queue('life_story_state', { data: null, error: null });    // upsert state

    const result = await processTurn(USER, 'sess-1', 'I grew up moving around.');
    expect(result.kind).toBe('followup');
    expect(result.utterance).toBe('Which city was that?');
    expect(result.done).toBe(false);

    const update = dbState.calls.find(c => c.table === 'life_story_sessions' && c.op === 'update');
    expect(update.args[0].transcript).toHaveLength(3); // q + answer + follow-up
    expect(update.args[0].followups_used).toBe(1);

    const stateUpsert = dbState.calls.find(c => c.table === 'life_story_state' && c.op === 'upsert');
    expect(stateUpsert.args[0].reflection_notes).toEqual({ a: 'x', hometown: 'Minas' });
  });

  it('completes the chapter on the last question: memories, state, reflection hook', async () => {
    const lastIndex = firstChapter.questions.length - 1;
    queue('life_story_sessions', {
      data: activeSession({
        question_index: lastIndex,
        transcript: [
          { role: 'assistant', content: firstChapter.questions[0].text },
          { role: 'user', content: 'Long life story answer.' },
          { role: 'assistant', content: firstChapter.questions[lastIndex].text },
        ],
      }),
      error: null,
    });
    queue('life_story_state', { data: { reflection_notes: {}, chapters_completed: [] }, error: null });
    // Turn assessment: objective achieved on the final question
    complete.mockResolvedValueOnce({
      content: '{"objectiveAchieved": true, "followUp": null, "bridge": "Powerful.", "notes": {}}',
    });
    // Chapter synthesis call
    complete.mockResolvedValueOnce({
      content: '{"facts": ["They moved often as a child"], "summary": "A childhood shaped by movement.", "mirror": "So stability is something you built, not inherited."}',
    });
    queue('life_story_sessions', { data: null, error: null }); // session completed update
    queue('life_story_state', { data: null, error: null });    // state upsert

    const result = await processTurn(USER, 'sess-1', 'Final answer.');
    expect(result.kind).toBe('chapter_done');
    expect(result.done).toBe(true);
    expect(result.utterance).toContain('stability is something you built');

    // Q&A conversation memories (importance 8) + fact (8) + summary reflection (9)
    const memoryTypes = addMemory.mock.calls.map(c => c[2]);
    expect(memoryTypes).toContain('conversation');
    expect(memoryTypes).toContain('fact');
    expect(memoryTypes).toContain('reflection');
    for (const call of addMemory.mock.calls) {
      expect(call[3].source).toBe('life_story');
      expect(call[3].chapter).toBe(firstChapter.id);
    }
    const reflectionCall = addMemory.mock.calls.find(c => c[2] === 'reflection');
    expect(reflectionCall[4].importanceScore).toBe(9);
    const convCall = addMemory.mock.calls.find(c => c[2] === 'conversation');
    expect(convCall[4].importanceScore).toBe(8);
    expect(convCall[4].skipImportance).toBe(true);

    // R5a durability: biographical content outlives its type defaults —
    // answers 8, extracted facts 9, chapter synthesis 10.
    expect(convCall[4].durability).toBe(8);
    const factCall = addMemory.mock.calls.find(c => c[2] === 'fact');
    expect(factCall[4].durability).toBe(9);
    expect(reflectionCall[4].durability).toBe(10);

    // Session closed + chapter recorded
    const update = dbState.calls.find(c => c.table === 'life_story_sessions' && c.op === 'update');
    expect(update.args[0].status).toBe('completed');
    const stateUpsert = dbState.calls.find(c => c.table === 'life_story_state' && c.op === 'upsert');
    expect(stateUpsert.args[0].chapters_completed).toContain(firstChapter.id);

    // Reflection hook consulted
    expect(shouldTriggerReflection).toHaveBeenCalledWith(USER);
  });

  it('fires generateReflections when the reflection threshold is met', async () => {
    shouldTriggerReflection.mockResolvedValue(true);
    const lastIndex = firstChapter.questions.length - 1;
    queue('life_story_sessions', { data: activeSession({ question_index: lastIndex }), error: null });
    queue('life_story_state', { data: { reflection_notes: {}, chapters_completed: [] }, error: null });
    complete.mockResolvedValueOnce({
      content: '{"objectiveAchieved": true, "followUp": null, "bridge": "", "notes": {}}',
    });
    complete.mockResolvedValueOnce({
      content: '{"facts": [], "summary": "s", "mirror": "m"}',
    });
    queue('life_story_sessions', { data: null, error: null });
    queue('life_story_state', { data: null, error: null });

    await processTurn(USER, 'sess-1', 'Final answer.');
    expect(generateReflections).toHaveBeenCalledWith(USER);
  });

  it('force-completes a runaway session at the transcript safety cap', async () => {
    const bloated = Array.from({ length: MAX_TRANSCRIPT_ENTRIES }, (_, i) => ({
      role: i % 2 ? 'user' : 'assistant',
      content: `turn ${i}`,
    }));
    queue('life_story_sessions', { data: activeSession({ transcript: bloated }), error: null });
    queue('life_story_state', { data: { reflection_notes: {}, chapters_completed: [] }, error: null });
    // Synthesis call only — no turn assessment should happen at the cap
    complete.mockResolvedValueOnce({
      content: '{"facts": [], "summary": "s", "mirror": "Thanks for everything you shared."}',
    });
    queue('life_story_sessions', { data: null, error: null });
    queue('life_story_state', { data: null, error: null });

    const result = await processTurn(USER, 'sess-1', 'Another answer.');
    expect(result.kind).toBe('chapter_done');
    expect(complete).toHaveBeenCalledTimes(1); // synthesis only, no assess call
  });
});
