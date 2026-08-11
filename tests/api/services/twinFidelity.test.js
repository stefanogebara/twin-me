/**
 * Twin fidelity eval (R4 / Story Chapters Phase 4a).
 *
 * Implements the Park et al. 2024 measurement: twin accuracy on a fixed
 * battery, normalized by the user's own test-retest consistency across
 * waves. Scoring follows the paper — Likert items get range-normalized
 * partial credit (1 - |diff|/range), categorical items exact match.
 *
 * Battery schema is pinned here too: 25 versioned items (10 Likert 1-5,
 * 15 categorical with 4 options, 5 of them temporal-recall), stable ids —
 * the ids are the join key across waves, so changing them silently would
 * corrupt longitudinal comparisons.
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
}));
vi.mock('../../../api/services/memoryStreamService.js', () => ({
  retrieveDiverseMemories: vi.fn().mockResolvedValue([
    { content: 'They value deep focus over social breadth.' },
  ]),
}));
vi.mock('../../../api/services/twinSummaryService.js', () => ({
  getTwinSummary: vi.fn().mockResolvedValue('A focused builder who recharges alone.'),
}));

const { complete } = await import('../../../api/services/llmGateway.js');
const { retrieveDiverseMemories } = await import('../../../api/services/memoryStreamService.js');
const { getTwinSummary } = await import('../../../api/services/twinSummaryService.js');
const { FIDELITY_BATTERY, BATTERY_VERSION } = await import(
  '../../../api/config/fidelityBattery.js'
);
const {
  scoreItem,
  scoreAnswers,
  normalizedFidelity,
  parseTwinAnswers,
  answerBatteryAsTwin,
  submitFidelityWave,
  completeFidelityWave,
} = await import('../../../api/services/fidelityBatteryService.js');

const USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

/** A full valid answer set: 3 for likert, first option for categorical. */
const fullAnswers = (likertVal = 3, catIndex = 0) => {
  const answers = {};
  for (const item of FIDELITY_BATTERY) {
    answers[item.id] = item.type === 'likert' ? likertVal : item.options[catIndex];
  }
  return answers;
};

beforeEach(() => {
  dbState.queues = {};
  dbState.calls = [];
  complete.mockReset();
  // Restore fast context defaults — individual tests override to simulate
  // the pathological cold path (synchronous twin-summary regeneration).
  getTwinSummary.mockResolvedValue('A focused builder who recharges alone.');
  retrieveDiverseMemories.mockResolvedValue([
    { content: 'They value deep focus over social breadth.' },
  ]);
});

describe('fidelityBattery — schema contract', () => {
  it('is version 2 with exactly 25 items: 10 likert + 15 categorical (5 temporal)', () => {
    expect(BATTERY_VERSION).toBe(2);
    expect(FIDELITY_BATTERY).toHaveLength(25);
    expect(FIDELITY_BATTERY.filter(i => i.type === 'likert')).toHaveLength(10);
    expect(FIDELITY_BATTERY.filter(i => i.type === 'categorical')).toHaveLength(15);
    // Temporal-recall items are the reason v2 exists (spine adjudication);
    // all categorical, all asking about the last two weeks.
    const temporal = FIDELITY_BATTERY.filter(i => i.temporal);
    expect(temporal).toHaveLength(5);
    for (const item of temporal) {
      expect(item.type).toBe('categorical');
      expect(item.text.toLowerCase()).toContain('last two weeks');
    }
  });

  it('keeps every v1 item id unchanged (longitudinal join key)', () => {
    // Ids are the join key across waves — v2 may only ADD items. Renaming
    // or dropping any of these breaks scoring against stored v1 waves.
    const V1_IDS = [
      'bfi_reserved', 'bfi_trusting', 'bfi_lazy', 'bfi_relaxed', 'bfi_few_artistic',
      'bfi_outgoing', 'bfi_fault_finding', 'bfi_thorough', 'bfi_nervous', 'bfi_imagination',
      'sat_morning', 'stress_response', 'decision_style', 'social_battery', 'planning_style',
      'music_function', 'risk_appetite', 'work_motivator', 'conflict_style', 'evening_default',
    ];
    const ids = new Set(FIDELITY_BATTERY.map(i => i.id));
    for (const id of V1_IDS) expect(ids.has(id)).toBe(true);
  });

  it('has unique stable ids and emoji-free text', () => {
    const ids = FIDELITY_BATTERY.map(i => i.id);
    expect(new Set(ids).size).toBe(25);
    for (const item of FIDELITY_BATTERY) {
      expect(item.id).toMatch(/^[a-z0-9_]+$/);
      expect(item.text.length).toBeGreaterThan(10);
      expect(/\p{Extended_Pictographic}/u.test(item.text)).toBe(false);
    }
  });

  it('likert items use a 1-5 scale; categorical items have exactly 4 options', () => {
    for (const item of FIDELITY_BATTERY) {
      if (item.type === 'likert') {
        expect(item.scale).toEqual({ min: 1, max: 5 });
      } else {
        expect(item.options).toHaveLength(4);
        expect(new Set(item.options).size).toBe(4);
      }
    }
  });
});

describe('scoreItem — paper-style normalized accuracy', () => {
  const likert = { id: 'l1', type: 'likert', scale: { min: 1, max: 5 } };
  const cat = { id: 'c1', type: 'categorical', options: ['a', 'b', 'c', 'd'] };

  it('gives full credit for exact likert match, partial by distance', () => {
    expect(scoreItem(likert, 4, 4)).toBe(1);
    expect(scoreItem(likert, 2, 4)).toBe(0.5); // |2-4|/4 = 0.5
    expect(scoreItem(likert, 1, 5)).toBe(0);   // max distance
  });

  it('scores categorical exact-match only', () => {
    expect(scoreItem(cat, 'a', 'a')).toBe(1);
    expect(scoreItem(cat, 'a', 'b')).toBe(0);
  });

  it('returns null for missing answers (excluded, not zero)', () => {
    expect(scoreItem(likert, undefined, 3)).toBeNull();
    expect(scoreItem(cat, 'a', undefined)).toBeNull();
  });
});

describe('scoreAnswers', () => {
  it('averages across items and reports per-type breakdown', () => {
    const a = fullAnswers(3, 0);
    const b = fullAnswers(5, 0); // likert off by 2 (0.5 credit), categorical all match
    const result = scoreAnswers(FIDELITY_BATTERY, a, b);
    expect(result.likert).toBeCloseTo(0.5, 5);
    expect(result.categorical).toBe(1);
    // (10 likert * 0.5 + 15 categorical * 1) / 25
    expect(result.overall).toBeCloseTo(0.8, 5);
    expect(result.itemsScored).toBe(25);
  });

  it('excludes missing items from the average instead of zeroing them', () => {
    const a = fullAnswers();
    const b = fullAnswers();
    delete b[FIDELITY_BATTERY[0].id];
    const result = scoreAnswers(FIDELITY_BATTERY, a, b);
    expect(result.itemsScored).toBe(24);
    expect(result.overall).toBe(1);
  });

  it('scores a v1 wave (20 answers) against the v2 battery without zeroing new items', () => {
    // Back-compat pin: old stored waves lack the 5 temporal items; they
    // must be excluded from the average, not counted as misses.
    const v2 = fullAnswers();
    const v1 = { ...v2 };
    for (const item of FIDELITY_BATTERY.filter(i => i.temporal)) delete v1[item.id];
    const result = scoreAnswers(FIDELITY_BATTERY, v2, v1);
    expect(result.itemsScored).toBe(20);
    expect(result.overall).toBe(1);
  });
});

describe('normalizedFidelity', () => {
  it('divides twin accuracy by self-consistency (the paper metric)', () => {
    expect(normalizedFidelity(0.68, 0.8)).toBeCloseTo(0.85, 5);
  });

  it('guards degenerate ceilings', () => {
    expect(normalizedFidelity(0.7, 0)).toBeNull();
    expect(normalizedFidelity(0.7, null)).toBeNull();
  });
});

describe('parseTwinAnswers', () => {
  // R4 calibration: the contract deliberately changed from a flat answer
  // map to { answers, confidence } — confidence null on legacy replies.
  it('parses a clean JSON answers object', () => {
    const parsed = parseTwinAnswers('{"answers": {"bfi_reserved": 4, "sat_morning": "Sleep in"}}');
    expect(parsed.answers.bfi_reserved).toBe(4);
    expect(parsed.answers.sat_morning).toBe('Sleep in');
    expect(parsed.confidence).toBeNull();
  });

  it('handles markdown fencing and returns null on garbage', () => {
    expect(parseTwinAnswers('```json\n{"answers": {"x": 1}}\n```').answers).toEqual({ x: 1 });
    expect(parseTwinAnswers('no json here')).toBeNull();
  });
});

describe('answerBatteryAsTwin', () => {
  /** Answer only the items actually present in a call's battery text. */
  const halfAwareMock = () => (args) => {
    const text = JSON.stringify(args.messages);
    const mine = FIDELITY_BATTERY.filter(i => text.includes(i.id));
    return Promise.resolve({
      content: JSON.stringify({
        answers: Object.fromEntries(mine.map(i => [i.id, i.type === 'likert' ? 3 : i.options[0]])),
        confidence: Object.fromEntries(mine.map(i => [i.id, 0.8])),
      }),
    });
  };

  it('splits the battery across TWO parallel ANALYSIS calls and merges the halves', async () => {
    complete.mockImplementation(halfAwareMock());

    const result = await answerBatteryAsTwin(USER);

    // Latency fix: 2 calls, each carrying part of the battery (was 1x20).
    expect(complete).toHaveBeenCalledTimes(2);
    const [a, b] = complete.mock.calls.map(c => c[0]);
    const idsIn = (call) => FIDELITY_BATTERY.filter(i => JSON.stringify(call.messages).includes(i.id)).map(i => i.id);
    const idsA = idsIn(a);
    const idsB = idsIn(b);

    // Disjoint halves whose union is the whole battery
    expect(idsA.length).toBeGreaterThan(0);
    expect(idsB.length).toBeGreaterThan(0);
    expect(idsA.filter(id => idsB.includes(id))).toEqual([]);
    expect([...idsA, ...idsB].sort()).toEqual(FIDELITY_BATTERY.map(i => i.id).sort());

    // Both halves keep the full grounding + CoT scaffold
    for (const call of [a, b]) {
      expect(call.tier).toBe('analysis');
      const prompt = `${call.system || ''}\n${JSON.stringify(call.messages)}`;
      expect(prompt).toContain('A focused builder who recharges alone.'); // twin summary
      expect(prompt).toContain('deep focus over social breadth');          // retrieved memory
      expect(prompt).toContain('Option Interpretation');                   // 4-step CoT scaffold
    }

    // Merged result covers the whole battery
    expect(Object.keys(result.answers)).toHaveLength(25);
    expect(Object.keys(result.confidence)).toHaveLength(25);
  });

  it('issues both calls before either resolves (parallel, not sequential)', async () => {
    let started = 0;
    let resolveFirst;
    const gate = new Promise(r => { resolveFirst = r; });
    complete.mockImplementation(async (args) => {
      started += 1;
      await gate; // nothing resolves until both have started
      return halfAwareMock()(args);
    });

    const pending = answerBatteryAsTwin(USER);
    await new Promise(r => setImmediate(r));
    expect(started).toBe(2); // sequential code would sit at 1 here

    resolveFirst();
    const result = await pending;
    expect(Object.keys(result.answers)).toHaveLength(25);
  });

  it('keeps the surviving half when the other fails (partial > nothing)', async () => {
    let call = 0;
    complete.mockImplementation((args) => {
      call += 1;
      if (call === 1) return Promise.reject(new Error('provider 500'));
      return halfAwareMock()(args);
    });

    const result = await answerBatteryAsTwin(USER);
    const count = Object.keys(result.answers).length;
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(25); // only the surviving half
  });

  it('returns null when BOTH halves are unusable', async () => {
    complete.mockResolvedValue({ content: 'I cannot answer this.' });
    expect(await answerBatteryAsTwin(USER)).toBeNull();
  });

  // Cold-path guard: getTwinSummary does a SYNCHRONOUS full regeneration
  // (5 retrieval queries + an LLM call) once the cached summary ages past
  // the stale-serve window — that was the 79s / 504 on wave 1. Neither
  // context fetch may hold the battery hostage; the prompt already
  // degrades to its "Limited ..." fallbacks.
  describe('cold-path context budget', () => {
    const hangs = () => new Promise(() => {});

    it('proceeds with the summary fallback when getTwinSummary blows the budget', async () => {
      getTwinSummary.mockImplementation(hangs);
      complete.mockImplementation(halfAwareMock());

      const started = Date.now();
      const result = await answerBatteryAsTwin(USER, { contextBudgetMs: 25 });

      expect(Date.now() - started).toBeLessThan(3000); // did not hang
      expect(Object.keys(result.answers)).toHaveLength(25);
      const prompt = complete.mock.calls[0][0].system;
      expect(prompt).toContain('Limited summary available.');
      // Retrieval still resolved, so its evidence must survive
      expect(prompt).toContain('deep focus over social breadth');
    });

    it('proceeds with the evidence fallback when retrieval blows the budget', async () => {
      retrieveDiverseMemories.mockImplementation(hangs);
      complete.mockImplementation(halfAwareMock());

      const result = await answerBatteryAsTwin(USER, { contextBudgetMs: 25 });

      expect(Object.keys(result.answers)).toHaveLength(25);
      const prompt = complete.mock.calls[0][0].system;
      expect(prompt).toContain('Limited evidence available.');
      expect(prompt).toContain('A focused builder who recharges alone.'); // summary survived
    });

    it('still answers when BOTH context fetches blow the budget', async () => {
      getTwinSummary.mockImplementation(hangs);
      retrieveDiverseMemories.mockImplementation(hangs);
      complete.mockImplementation(halfAwareMock());

      const result = await answerBatteryAsTwin(USER, { contextBudgetMs: 25 });
      expect(Object.keys(result.answers)).toHaveLength(25);
    });

    it('uses the full context when it arrives within budget (no false trips)', async () => {
      complete.mockImplementation(halfAwareMock());
      await answerBatteryAsTwin(USER);
      const prompt = complete.mock.calls[0][0].system;
      expect(prompt).toContain('A focused builder who recharges alone.');
      expect(prompt).toContain('deep focus over social breadth');
      expect(prompt).not.toContain('Limited summary available.');
    });
  });

  it('returns null confidence when neither half supplied one (back-compat)', async () => {
    complete.mockImplementation((args) => {
      const text = JSON.stringify(args.messages);
      const mine = FIDELITY_BATTERY.filter(i => text.includes(i.id));
      return Promise.resolve({
        content: JSON.stringify({
          answers: Object.fromEntries(mine.map(i => [i.id, i.type === 'likert' ? 3 : i.options[0]])),
        }),
      });
    });
    const result = await answerBatteryAsTwin(USER);
    expect(Object.keys(result.answers)).toHaveLength(25);
    expect(result.confidence).toBeNull();
  });
});

// Two-phase submission. Phase 1 must NEVER call the LLM: the user's 20
// answers are the scarce, irreplaceable input and were previously lost
// whole when twin answering blew the function ceiling. Phase 2 does the
// slow work and is retryable against the stored row.
describe('submitFidelityWave — phase 1 (store the user, no LLM)', () => {
  it('rejects incomplete submissions', async () => {
    await expect(submitFidelityWave(USER, { only_one: 3 })).rejects.toThrow(/incomplete/i);
  });

  it('wave 1: persists answers immediately without any LLM call', async () => {
    dbState.queues['twin_fidelity_checks'] = [
      { data: [], error: null },                // prior waves lookup
      { data: { id: 'check-1' }, error: null }, // insert returning
    ];

    const result = await submitFidelityWave(USER, fullAnswers(3, 0));

    expect(complete).not.toHaveBeenCalled(); // the whole point
    expect(result.wave).toBe(1);
    expect(result.id).toBe('check-1');
    expect(result.twinStatus).toBe('pending');
    expect(result.selfConsistency).toBeNull();

    const insert = dbState.calls.find(c => c.table === 'twin_fidelity_checks' && c.op === 'insert');
    expect(insert.args[0].wave).toBe(1);
    expect(insert.args[0].battery_version).toBe(BATTERY_VERSION);
    expect(insert.args[0].user_answers).toBeTruthy();
    expect(insert.args[0].twin_answers ?? null).toBeNull();
  });

  it('wave 2: computes the self-consistency ceiling at store time', async () => {
    dbState.queues['twin_fidelity_checks'] = [
      { data: [{ wave: 1, user_answers: fullAnswers(5, 0) }], error: null },
      { data: { id: 'check-2' }, error: null },
    ];

    const result = await submitFidelityWave(USER, fullAnswers(3, 0));
    expect(result.wave).toBe(2);
    // user wave2 likert 3 vs wave1 likert 5 => 0.5; categorical match
    // => (10 * 0.5 + 15 * 1) / 25 = 0.8
    expect(result.selfConsistency).toBeCloseTo(0.8, 5);
    expect(complete).not.toHaveBeenCalled();

    const insert = dbState.calls.find(c => c.table === 'twin_fidelity_checks' && c.op === 'insert');
    expect(insert.args[0].self_consistency).toBeCloseTo(0.8, 5);
  });
});

describe('completeFidelityWave — phase 2 (twin answers, retryable)', () => {
  const storedWave = (over = {}) => ({
    id: 'check-1', user_id: USER, wave: 1, battery_version: BATTERY_VERSION,
    user_answers: fullAnswers(3, 0), twin_answers: null, self_consistency: null, ...over,
  });

  it('returns null for a missing or foreign wave (route maps to 404)', async () => {
    dbState.queues['twin_fidelity_checks'] = [{ data: null, error: null }];
    expect(await completeFidelityWave(USER, 'nope')).toBeNull();
  });

  it('answers, scores and updates the stored row', async () => {
    dbState.queues['twin_fidelity_checks'] = [
      { data: storedWave(), error: null }, // load
      { data: null, error: null },         // update
    ];
    complete.mockResolvedValue({ content: JSON.stringify({ answers: fullAnswers(3, 0) }) });

    const result = await completeFidelityWave(USER, 'check-1');
    expect(result.twinAccuracy).toBe(1);
    expect(result.twinStatus).toBe('complete');

    const update = dbState.calls.find(c => c.table === 'twin_fidelity_checks' && c.op === 'update');
    expect(update.args[0].twin_answers).toBeTruthy();
    expect(update.args[0].twin_accuracy).toBe(1);
  });

  it('computes the normalized metric from the stored ceiling', async () => {
    dbState.queues['twin_fidelity_checks'] = [
      { data: storedWave({ wave: 2, self_consistency: 0.75 }), error: null },
      { data: null, error: null },
    ];
    // twin likert 4 vs stored user likert 3 => 0.75 likert, categorical
    // match => (10 * 0.75 + 15 * 1) / 25 = 0.9
    complete.mockResolvedValue({ content: JSON.stringify({ answers: fullAnswers(4, 0) }) });

    const result = await completeFidelityWave(USER, 'check-1');
    expect(result.twinAccuracy).toBeCloseTo(0.9, 5);
    expect(result.normalizedFidelity).toBeCloseTo(0.9 / 0.75, 5);
  });

  it('is idempotent — an already-answered wave is not re-answered', async () => {
    dbState.queues['twin_fidelity_checks'] = [
      { data: storedWave({ twin_answers: fullAnswers(3, 0), twin_accuracy: 1 }), error: null },
    ];

    const result = await completeFidelityWave(USER, 'check-1');
    expect(complete).not.toHaveBeenCalled();
    expect(result.twinStatus).toBe('complete');
    expect(result.twinAccuracy).toBe(1);
  });

  it('leaves the wave retryable when twin answering fails', async () => {
    dbState.queues['twin_fidelity_checks'] = [{ data: storedWave(), error: null }];
    complete.mockResolvedValue({ content: 'garbage' });

    const result = await completeFidelityWave(USER, 'check-1');
    expect(result.twinStatus).toBe('pending');
    expect(result.twinAccuracy).toBeNull();
    // Nothing written — the user's answers stay intact and phase 2 can retry
    expect(dbState.calls.find(c => c.table === 'twin_fidelity_checks' && c.op === 'update')).toBeUndefined();
  });
});
