/**
 * The bridge turns what money knows into something the twin can retrieve, and never invents
 * a number of its own. Four things cross it: the analyst's findings, the patterns it worked
 * out, what the person said, and the conversation on Ask (2026-09-16).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const addMemory = vi.fn();
vi.mock('../../../../api/services/memoryStreamService.js', () => ({ addMemory: (...a) => addMemory(...a) }));
vi.mock('../../../../api/services/logger.js', () => ({ createLogger: () => ({ warn() {}, info() {}, error() {} }) }));

const { memoryFor, memoryForFact, memoryForTurn, tellTwin, tellTwinFacts, tellTwinTurn, IMPORTANCE, FACT_IMPORTANCE } = await import('../../../../api/services/money/twinBridge.js');

const finding = {
  kind: 'subscriptions',
  month: null,
  sentence: '5 charges come back every month, 114,12 € together.',
  detail: 'Higgsfield, Elevenlabs.io, Fly.io and 2 more.',
  numbers: { count: 5, monthly_total: 114.12 },
  receipts: [{ id: 'a', merchant_raw: 'Spotify' }, { id: 'b', merchant_raw: 'Fly.io' }],
  evidence_count: 15,
};

describe('memoryFor', () => {
  it('writes the sentence, the detail and the payments behind it', () => {
    const m = memoryFor(finding);
    expect(m.content).toBe('Money: 5 charges come back every month, 114,12 € together. Higgsfield, Elevenlabs.io, Fly.io and 2 more. The payments behind it: Spotify, Fly.io.');
    expect(m.memoryType).toBe('fact');
    expect(m.importance).toBe(IMPORTANCE.subscriptions);
    expect(m.metadata).toMatchObject({ source: 'money', domain: 'money', finding_kind: 'subscriptions', receipt_ids: ['a', 'b'], evidence_count: 15 });
  });

  it('carries the numbers so a claim can be checked, not re-derived', () => {
    expect(memoryFor(finding).metadata.numbers).toEqual({ count: 5, monthly_total: 114.12 });
  });

  it('holds nothing without a sentence', () => {
    expect(memoryFor({ kind: 'x' })).toBe(null);
    expect(memoryFor(null)).toBe(null);
  });

  it('reads without receipts when a finding has none', () => {
    const m = memoryFor({ ...finding, receipts: [] });
    expect(m.content.endsWith('and 2 more.')).toBe(true);
  });
});

describe('tellTwin', () => {
  beforeEach(() => { addMemory.mockReset(); addMemory.mockResolvedValue({ id: 'm1' }); });

  it('writes one memory per finding, with importance given and never rated', async () => {
    const result = await tellTwin('user-1', [finding, { ...finding, kind: 'month_pace', sentence: 'By the 8th you had spent 414,64 €.' }]);
    expect(result.written).toBe(2);
    expect(addMemory).toHaveBeenCalledTimes(2);
    const [, content, type, metadata, options] = addMemory.mock.calls[0];
    expect(content.startsWith('Money: ')).toBe(true);
    expect(type).toBe('fact');
    expect(metadata.domain).toBe('money');
    expect(options).toEqual({ skipImportance: true, importanceScore: IMPORTANCE.subscriptions });
  });

  it('keeps going when one write fails', async () => {
    addMemory.mockRejectedValueOnce(new Error('embedding down')).mockResolvedValue({ id: 'm2' });
    const result = await tellTwin('user-1', [finding, { ...finding, kind: 'biggest_line' }]);
    expect(result.written).toBe(1);
  });

  it('writes nothing without a user or findings', async () => {
    expect(await tellTwin(null, [finding])).toEqual({ written: 0 });
    expect(await tellTwin('user-1', [])).toEqual({ written: 0 });
    expect(addMemory).not.toHaveBeenCalled();
  });
});


describe('what it learned on its own, ranked', () => {
  it('weighs a price that never moves above one loud evening', () => {
    expect(IMPORTANCE.price_point).toBeGreaterThan(IMPORTANCE.amount_outlier);
    expect(IMPORTANCE.keep_month).toBeGreaterThanOrEqual(8);
    expect(memoryFor({ kind: 'price_point', sentence: 'Bar Pepe is always 1,40 €.', receipts: [] }).importance).toBe(IMPORTANCE.price_point);
  });
});

describe('what the person said, as the twin holds it', () => {
  it('says it was said, never that it was read', () => {
    const m = memoryForFact({ id: 'f1', kind: 'income', subject: 'family', amount: 1750, day: 3 });
    expect(m.content).toBe('Money: they said 1750,00 EUR comes in from family around the 3 of the month.');
    expect(m.memoryType).toBe('fact');
    expect(m.importance).toBe(FACT_IMPORTANCE.income);
    expect(m.metadata).toMatchObject({ claim: 'said', fact_kind: 'income', amount: 1750, day: 3 });
  });

  it('has a sentence for every kind a person can give', () => {
    const kinds = {
      keep: { kind: 'keep', amount: 200 },
      cap: { kind: 'cap', subject_label: 'Eating out', amount: 120 },
      commitment: { kind: 'commitment', subject: 'Habitacion', amount: 600, day: 1 },
      person: { kind: 'person', subject_label: 'Ana', value: 'flatmate', note: 'we split the shop' },
      home_area: { kind: 'home_area', value: 'Recoletos, Madrid' },
      study_place: { kind: 'study_place', value: 'IE University' },
      work_place: { kind: 'work_place', value: 'Innerai' },
      goal: { kind: 'goal', value: 'spending less on taxis' },
      note: { kind: 'note', value: 'I pay my sister back every term' },
      shared_cost: { kind: 'shared_cost', subject: 'Netflix', value: 'with my brother' },
    };
    for (const [name, fact] of Object.entries(kinds)) {
      const m = memoryForFact(fact);
      expect(m, name).not.toBeNull();
      expect(m.content.startsWith('Money'), name).toBe(true);
      expect(m.content.length, name).toBeGreaterThan(12);
    }
  });

  it('never carries the lens own working memory', () => {
    for (const kind of ['event_spend', 'event_spend_meta', 'calendar_feed', 'home_point', 'inbox_address']) {
      expect(memoryForFact({ kind, value: 'x' }), kind).toBeNull();
    }
  });
});

describe('the conversation, as the twin holds it', () => {
  it('keeps who spoke, and weighs the question above the answer', () => {
    const asked = memoryForTurn({ role: 'you', text: 'how much did I spend on taxis this month?' });
    const said = memoryForTurn({ role: 'twin', text: 'Taxis took 41,20 € this month, across 6 rides.' });
    expect(asked.memoryType).toBe('conversation');
    expect(asked.content).toBe('Money, they asked: how much did I spend on taxis this month?');
    expect(said.content).toBe('Money, the twin answered: Taxis took 41,20 € this month, across 6 rides.');
    expect(asked.importance).toBeGreaterThan(said.importance);
    expect(memoryForTurn({ role: 'you', text: '  ' })).toBeNull();
  });
});

describe('tellTwinFacts and tellTwinTurn', () => {
  beforeEach(() => { addMemory.mockReset(); addMemory.mockResolvedValue({ id: 'm1' }); });

  it('writes one memory per fact the person gave, and skips the lens own rows', async () => {
    const result = await tellTwinFacts('user-1', [
      { kind: 'income', subject: 'family', amount: 1750, day: 3 },
      { kind: 'event_spend', subject: 'alvaro', amount: 11.49 },
      { kind: 'keep', amount: 200 },
    ]);
    expect(result.written).toBe(2);
    const kinds = addMemory.mock.calls.map((c) => c[3].fact_kind);
    expect(kinds).toEqual(['income', 'keep']);
    expect(addMemory.mock.calls[0][4]).toEqual({ skipImportance: true, importanceScore: FACT_IMPORTANCE.income });
  });

  it('writes a turn as a conversation, and nothing for an empty one', async () => {
    expect(await tellTwinTurn('user-1', { role: 'you', text: 'what can I spend today?' })).toEqual({ written: 1 });
    expect(addMemory.mock.calls[0][2]).toBe('conversation');
    addMemory.mockReset();
    expect(await tellTwinTurn('user-1', { role: 'you', text: '' })).toEqual({ written: 0 });
    expect(addMemory).not.toHaveBeenCalled();
  });
});

describe('the bridge while the twin is parked', () => {
  const OLD = process.env.LEGACY_TWIN_ENABLED;
  beforeEach(() => { addMemory.mockReset(); addMemory.mockResolvedValue({ id: 'm1' }); });
  afterEach(() => { if (OLD === undefined) delete process.env.LEGACY_TWIN_ENABLED; else process.env.LEGACY_TWIN_ENABLED = OLD; });

  it('writes nothing when LEGACY_TWIN_ENABLED is false', async () => {
    process.env.LEGACY_TWIN_ENABLED = 'false';
    expect(await tellTwinTurn('u1', { role: 'person', text: 'How much did I spend last night?' })).toEqual({ written: 0 });
    expect(await tellTwin('u1', [finding])).toMatchObject({ written: 0 });
    expect(addMemory).not.toHaveBeenCalled();
  });

  it('writes as before when the twin is not parked', async () => {
    delete process.env.LEGACY_TWIN_ENABLED;
    expect(await tellTwinTurn('u1', { role: 'person', text: 'How much did I spend last night?' })).toEqual({ written: 1 });
    expect(addMemory).toHaveBeenCalledTimes(1);
  });
});
