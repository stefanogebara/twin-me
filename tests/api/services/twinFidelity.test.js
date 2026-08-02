/**
 * Twin fidelity eval (R4 / Story Chapters Phase 4a).
 *
 * Implements the Park et al. 2024 measurement: twin accuracy on a fixed
 * battery, normalized by the user's own test-retest consistency across
 * waves. Scoring follows the paper — Likert items get range-normalized
 * partial credit (1 - |diff|/range), categorical items exact match.
 *
 * Battery schema is pinned here too: 20 versioned items (10 Likert 1-5,
 * 10 categorical with 4 options), stable ids — the ids are the join key
 * across waves, so changing them silently would corrupt longitudinal
 * comparisons.
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
});

describe('fidelityBattery — schema contract', () => {
  it('is version 1 with exactly 20 items: 10 likert + 10 categorical', () => {
    expect(BATTERY_VERSION).toBe(1);
    expect(FIDELITY_BATTERY).toHaveLength(20);
    expect(FIDELITY_BATTERY.filter(i => i.type === 'likert')).toHaveLength(10);
    expect(FIDELITY_BATTERY.filter(i => i.type === 'categorical')).toHaveLength(10);
  });

  it('has unique stable ids and emoji-free text', () => {
    const ids = FIDELITY_BATTERY.map(i => i.id);
    expect(new Set(ids).size).toBe(20);
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
    expect(result.overall).toBeCloseTo(0.75, 5);
    expect(result.itemsScored).toBe(20);
  });

  it('excludes missing items from the average instead of zeroing them', () => {
    const a = fullAnswers();
    const b = fullAnswers();
    delete b[FIDELITY_BATTERY[0].id];
    const result = scoreAnswers(FIDELITY_BATTERY, a, b);
    expect(result.itemsScored).toBe(19);
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
  it('answers via one ANALYSIS call grounded in twin summary + memories', async () => {
    complete.mockResolvedValue({
      content: JSON.stringify({
        answers: Object.fromEntries(
          FIDELITY_BATTERY.map(i => [i.id, i.type === 'likert' ? 3 : i.options[0]])
        ),
      }),
    });

    // R4 calibration: contract is now { answers, confidence } — confidence
    // null here because the mocked reply has no confidence block.
    const result = await answerBatteryAsTwin(USER);
    expect(Object.keys(result.answers)).toHaveLength(20);
    expect(result.confidence).toBeNull();
    expect(complete).toHaveBeenCalledTimes(1);
    const call = complete.mock.calls[0][0];
    expect(call.tier).toBe('analysis');
    const prompt = `${call.system || ''}\n${JSON.stringify(call.messages)}`;
    expect(prompt).toContain('A focused builder who recharges alone.'); // twin summary
    expect(prompt).toContain('deep focus over social breadth');          // retrieved memory
    expect(prompt).toContain('Option Interpretation');                   // 4-step CoT scaffold
  });

  it('returns null when the LLM output is unusable', async () => {
    complete.mockResolvedValue({ content: 'I cannot answer this.' });
    expect(await answerBatteryAsTwin(USER)).toBeNull();
  });
});

describe('submitFidelityWave', () => {
  it('rejects incomplete submissions', async () => {
    await expect(submitFidelityWave(USER, { only_one: 3 })).rejects.toThrow(/incomplete/i);
  });

  it('wave 1: stores answers + twin accuracy, no self-consistency yet', async () => {
    dbState.queues['twin_fidelity_checks'] = [
      { data: [], error: null }, // prior waves lookup
      { data: { id: 'check-1' }, error: null }, // insert returning
    ];
    complete.mockResolvedValue({
      content: JSON.stringify({ answers: fullAnswers(3, 0) }),
    });

    const result = await submitFidelityWave(USER, fullAnswers(3, 0));
    expect(result.wave).toBe(1);
    expect(result.twinAccuracy).toBe(1); // twin matched perfectly in this mock
    expect(result.selfConsistency).toBeNull();
    expect(result.normalizedFidelity).toBeNull();

    const insert = dbState.calls.find(c => c.table === 'twin_fidelity_checks' && c.op === 'insert');
    expect(insert.args[0].wave).toBe(1);
    expect(insert.args[0].battery_version).toBe(BATTERY_VERSION);
  });

  it('wave 2: computes self-consistency vs wave 1 and the normalized metric', async () => {
    dbState.queues['twin_fidelity_checks'] = [
      { data: [{ wave: 1, user_answers: fullAnswers(5, 0) }], error: null }, // prior waves
      { data: { id: 'check-2' }, error: null },
    ];
    // Twin answers likert 4 vs user 3 => likert 0.75; categorical all match => overall 0.875
    complete.mockResolvedValue({
      content: JSON.stringify({ answers: fullAnswers(4, 0) }),
    });

    const result = await submitFidelityWave(USER, fullAnswers(3, 0));
    expect(result.wave).toBe(2);
    // Self-consistency: user wave2 likert 3 vs wave1 likert 5 => 0.5; cat match => 0.75
    expect(result.selfConsistency).toBeCloseTo(0.75, 5);
    expect(result.twinAccuracy).toBeCloseTo(0.875, 5);
    expect(result.normalizedFidelity).toBeCloseTo(0.875 / 0.75, 5);
  });

  it('still stores the wave when twin answering fails (twin fields null)', async () => {
    dbState.queues['twin_fidelity_checks'] = [
      { data: [], error: null },
      { data: { id: 'check-1' }, error: null },
    ];
    complete.mockResolvedValue({ content: 'garbage' });

    const result = await submitFidelityWave(USER, fullAnswers(3, 0));
    expect(result.wave).toBe(1);
    expect(result.twinAccuracy).toBeNull();
  });
});
